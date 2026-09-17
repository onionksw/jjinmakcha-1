import { HybridRoute, RouteSegment } from '../types';
import { getCoordinates, getDrivingDistance, getDrivingRoutePath, getWalkingRoute, getWalkingRoutePath, isOutsideSeoul } from './tmapService';
import { isSubPathRunnable } from './transitScheduleService';
import { API_BASE } from './apiBase';

type HybridStrategy = 'time-saving' | 'cost-saving' | 'balanced';
type TimeMode = 'day' | 'night';

// ─── 시간대 감지 ───────────────────────────────────────────────────────────
function detectTimeMode(ms: number): TimeMode {
  const h = new Date(ms).getHours();
  return h >= 6 && h < 20 ? 'day' : 'night';
}

// ─── 경로 레이블 (시간대 × 전략) ──────────────────────────────────────────
const ROUTE_LABELS: Record<TimeMode, Record<HybridStrategy, string>> = {
  day:   { 'time-saving': '⚡ 빠른 귀가형', 'cost-saving': '💰 알뜰 귀가형', 'balanced': '⚖️ 밸런스형' },
  night: { 'time-saving': '🌙 최대 체류형', 'cost-saving': '💰 알뜰 막차형', 'balanced': '⚖️ 스마트 막차형' },
};

const toSegmentType = (t: number): 'subway' | 'bus' | 'walk' => {
  if (t === 1) return 'subway';
  if (t === 2) return 'bus';
  return 'walk';
};

// ─── 요금·시간 계산 ────────────────────────────────────────────────────────

// 도보 N분 → 택시 요금 (4km/h 보행 → 거리 추정)
function calcWalkTaxiCost(walkMin: number): number {
  const distM = (walkMin / 60) * 4000;
  if (distM <= 1600) return 4800;
  return 4800 + Math.ceil((distM - 1600) / 131) * 100;
}

// 직선 거리(km) → 택시 요금
function calcDistanceTaxiCost(distKm: number): number {
  const distM = distKm * 1000;
  if (distM <= 1600) return 4800;
  return 4800 + Math.ceil((distM - 1600) / 131) * 100;
}

// 직선 거리(km) → 택시 소요 시간 (25km/h 평균)
function calcDistanceTaxiMinutes(distKm: number): number {
  return Math.max(2, Math.round(distKm / 25 * 60));
}

// ─── 서울시 중형택시 공식 요금 (2023.02 개편 기준) ────────────────────────
const TAXI_BASE_FARE     = 4800; // 기본요금 (1.6km)
const TAXI_BASE_DIST_M   = 1600;
const TAXI_DIST_UNIT_M   = 131;  // 131m당 100원
const TAXI_DIST_UNIT_FARE = 100;

// 심야할증 2단계: 22~23시·02~04시 20%, 23~02시(가장 심야) 40%
function getNightSurchargeRate(ms: number): number {
  const h = new Date(ms).getHours();
  if (h >= 23 || h < 2) return 0.4;          // 23:00~02:00
  if ((h >= 22 && h < 23) || (h >= 2 && h < 4)) return 0.2; // 22:00~23:00, 02:00~04:00
  return 0;
}

// 시계외 할증: 출발 또는 도착이 서울시 경계 밖이면 20% (심야할증과 중복 적용 시 가산)
const OUT_OF_CITY_SURCHARGE_RATE = 0.2;

// 실제 도로 거리(m) → 공식 요금표 + 심야할증/시계외할증 반영 택시비
function calcTaxiFareByDistance(distanceM: number, departureMs: number, outsideSeoul: boolean = false): number {
  let fare = TAXI_BASE_FARE;
  if (distanceM > TAXI_BASE_DIST_M) {
    fare += Math.ceil((distanceM - TAXI_BASE_DIST_M) / TAXI_DIST_UNIT_M) * TAXI_DIST_UNIT_FARE;
  }
  const surchargeRate = getNightSurchargeRate(departureMs) + (outsideSeoul ? OUT_OF_CITY_SURCHARGE_RATE : 0);
  fare = fare * (1 + surchargeRate);
  return Math.ceil(fare / 100) * 100; // 100원 단위 올림
}

// 두 좌표 간 택시비/소요시간을 Tmap 실주행 거리로 보정 (실패 시 직선거리 폴백)
async function getRefinedTaxiFare(
  startLat: number, startLng: number,
  endLat: number, endLng: number,
  departureMs: number,
  fallbackDistKm: number,
): Promise<{ cost: number; minutes: number }> {
  const outsideSeoul = isOutsideSeoul(startLat, startLng) || isOutsideSeoul(endLat, endLng);
  const driving = await getDrivingDistance(startLat, startLng, endLat, endLng);
  if (driving) {
    return {
      cost: calcTaxiFareByDistance(driving.distanceM, departureMs, outsideSeoul),
      minutes: Math.max(1, Math.round(driving.durationSec / 60)),
    };
  }
  return {
    cost: calcTaxiFareByDistance(fallbackDistKm * 1000, departureMs, outsideSeoul),
    minutes: calcDistanceTaxiMinutes(fallbackDistKm),
  };
}

// 4km/h 도보 vs 25km/h 택시 → 약 84% 시간 단축
function calcTimeSavedByTaxi(walkMin: number): number {
  return Math.round(walkMin * (1 - 4 / 25));
}

// 가성비 점수: 분절약 / 천원
function calcTimeValueScore(timeSaved: number, taxiCost: number): number {
  if (taxiCost === 0) return 0;
  return (timeSaved / taxiCost) * 1000;
}

// Haversine 직선 거리 (km)
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const pad2 = (n: number) => n.toString().padStart(2, '0');
const makeToHHMM = (baseMs: number) => (offsetMinutes: number): string => {
  const d = new Date(baseMs + offsetMinutes * 60000);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

// ─── 카카오 대중교통 길찾기 → ODsay path 형식 변환 (ODsay 쿼터 초과 폴백용) ──
// 아래 buildSegments 등 기존 로직이 ODsay의 path.info / path.subPath 형태를
// 그대로 기대하므로, 데이터 출처만 카카오로 바꾸고 형태는 동일하게 맞춰줌.
// 카카오는 정류장 좌표를 안 주는 대신 구간 전체 폴리라인을 줘서, 실제 도로/
// 선로를 따라가는 더 정밀한 경로를 그릴 수 있음 → sub._fullPath로 별도 전달.
// 접근 도보 최소 거리 — 이보다 가까우면 이미 승강장 앞이라 도보 구간 생략
const MIN_ACCESS_WALK_KM = 0.015;

// 카카오는 정류장 좌표를 안 주는 대신 구간 전체 폴리라인을 줘서, 실제 도로/
// 선로를 따라가는 더 정밀한 경로를 그릴 수 있음 → sub._fullPath로 별도 전달.
// 단, ODsay와 달리 "출발지→첫 승차 정류장"/"마지막 하차 정류장→도착지" 도보는
// 응답에 포함되지 않으므로 origin/dest 좌표로 직접 보정해서 끼워 넣어야 함.
function kakaoRouteToOdsayPath(
  route: any, originLat: number, originLon: number, destLat: number, destLon: number,
): any {
  const props = route.properties || {};
  const subPath = (route.steps || []).map((step: any) => {
    const p = step.properties || {};
    const trafficType = p.type === 'SUBWAY' ? 1 : p.type === 'BUS' ? 2 : 3; // 1=지하철 2=버스 그외=도보
    const points: number[][] = step.path?.points || [];
    const first = points[0] || [];
    const last = points[points.length - 1] || [];
    const vehicles = p.vehicles || [];
    const stops = p.stops || [];
    return {
      trafficType,
      sectionTime: Math.round((p.time || 0) / 60),
      lane: vehicles.map((v: any) => ({ name: v.name, busNo: v.name })),
      startName: stops[0]?.name || '',
      endName: stops[stops.length - 1]?.name || '',
      startX: first[0], startY: first[1],
      endX: last[0], endY: last[1],
      // 이름만(좌표 없음) — nextStationName 방향 판별용
      passStopList: { stations: stops.map((s: any) => ({ stationName: s.name })) },
      // 실제 폴리라인 — buildSegments에서 정류장 좌표보다 우선 사용
      _fullPath: points.map(([lon, lat]) => ({ lat, lng: lon })),
    };
  });

  // 출발지 → 첫 승차 지점 도보 보정
  const firstSub = subPath[0];
  if (firstSub && haversineKm(originLat, originLon, firstSub.startY, firstSub.startX) >= MIN_ACCESS_WALK_KM) {
    subPath.unshift({
      trafficType: 3,
      sectionTime: 0,
      lane: [],
      startName: '',
      endName: firstSub.startName,
      startX: originLon, startY: originLat,
      endX: firstSub.startX, endY: firstSub.startY,
      passStopList: { stations: [] },
    });
  }

  // 마지막 하차 지점 → 도착지 도보 보정
  const lastSub = subPath[subPath.length - 1];
  if (lastSub && haversineKm(lastSub.endY, lastSub.endX, destLat, destLon) >= MIN_ACCESS_WALK_KM) {
    subPath.push({
      trafficType: 3,
      sectionTime: 0,
      lane: [],
      startName: lastSub.endName,
      endName: '',
      startX: lastSub.endX, startY: lastSub.endY,
      endX: destLon, endY: destLat,
      passStopList: { stations: [] },
    });
  }

  return {
    info: { totalTime: Math.round((props.totalTime || 0) / 60), payment: props.fare?.value || 0, totalFare: props.fare?.value || 0 },
    subPath,
  };
}

// 카카오 대중교통 길찾기 호출 → ODsay data.result.path와 동일한 배열 형태로 반환
async function fetchKakaoTransitPaths(
  startLat: number, startLon: number, endLat: number, endLon: number,
): Promise<any[]> {
  const url = `${API_BASE}/api/kakao-local?type=transit&start_x=${startLon}&start_y=${startLat}&end_x=${endLon}&end_y=${endLat}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.routes?.length) {
    throw new Error(`카카오 대중교통 오류: ${JSON.stringify(data)}`);
  }
  return data.routes.map((route: any) => kakaoRouteToOdsayPath(route, startLat, startLon, endLat, endLon));
}

// 사용자 미설정 기본 도보 임계값
const DEFAULT_WALK_THRESHOLD = 20;
// 택시 탑승 최소 도보 시간 (이하면 절대 택시 대체 안 함)
const MIN_WALK_FOR_TAXI = 10;

// ─── MCDM: 도보 대체 택시 인덱스 선택 ─────────────────────────────────────
// 후보: 도보 > max(walkThreshold, MIN_WALK_FOR_TAXI) 인 구간만
// 없으면 null 반환 → 환승 지점 택시로 전환
function selectWalkTaxiIndex(
  segments: RouteSegment[],
  strategy: HybridStrategy,
  walkThreshold: number,
  timeMode: TimeMode,
  departureMs: number,
): number | null {
  const surcharge = 1 + getNightSurchargeRate(departureMs);
  const taxiCostOf = (walkMin: number) => calcWalkTaxiCost(walkMin) * surcharge;
  const threshold = Math.max(walkThreshold, MIN_WALK_FOR_TAXI);
  const candidates = segments
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.type === 'walk' && s.durationMinutes > threshold);

  if (candidates.length === 0) return null;

  const lastI = candidates[candidates.length - 1].i;
  const walkList = segments.map((s, i) => ({ s, i })).filter(({ s }) => s.type === 'walk');
  const isFirst = (i: number) => i === walkList[0]?.i;
  const isLast  = (i: number) => i === walkList.at(-1)?.i;

  if (timeMode === 'night') {
    if (strategy === 'time-saving') return lastI; // 막차 의존 제거
    if (strategy === 'cost-saving') {
      return candidates.sort((a, b) => a.s.durationMinutes - b.s.durationMinutes)[0].i;
    }
    // 스마트 막차: (포지션 가중 / 택시비) 최대
    return candidates
      .map(c => ({
        i: c.i,
        score: (isLast(c.i) ? 3.0 : 1.5) / taxiCostOf(c.s.durationMinutes) * 10000,
      }))
      .sort((a, b) => b.score - a.score)[0].i;
  }

  // Day mode
  if (strategy === 'time-saving') {
    return candidates
      .map(c => {
        const posW = isFirst(c.i) ? 1.3 : isLast(c.i) ? 1.2 : 1.0;
        return {
          i: c.i,
          score: calcTimeValueScore(
            calcTimeSavedByTaxi(c.s.durationMinutes),
            taxiCostOf(c.s.durationMinutes),
          ) * posW,
        };
      })
      .sort((a, b) => b.score - a.score)[0].i;
  }
  if (strategy === 'cost-saving') return lastI;
  return candidates
    .map(c => ({
      i: c.i,
      score: calcTimeValueScore(
        calcTimeSavedByTaxi(c.s.durationMinutes),
        taxiCostOf(c.s.durationMinutes),
      ),
    }))
    .sort((a, b) => b.score - a.score)[0].i;
}

// ─── MCDM: 환승 지점 택시 탑승 지점 선택 ──────────────────────────────────
// 도보 대체 후보가 없을 때 가장 효율적인 대중교통 종점에서 택시 타도록
interface TransferTaxiPoint {
  subPathIdx: number;   // 이 transit 구간까지 타고 여기서 하차 + 택시
  boardingName: string;
  boardingLat: number;
  boardingLng: number;
  distKm: number;
  taxiCost: number;
  taxiMin: number;
  timeSaved: number;    // 남은 경로 시간 - 택시 시간
  score: number;        // timeSaved / taxiCost * 1000
}

function selectTransferPoint(
  path: any,
  endLat: number,
  endLng: number,
  strategy: HybridStrategy,
  timeMode: TimeMode,
  departureMs: number,
): TransferTaxiPoint | null {
  const surcharge = 1 + getNightSurchargeRate(departureMs);
  const subPaths: any[] = path.subPath || [];

  const candidates: TransferTaxiPoint[] = [];

  subPaths.forEach((sub: any, i: number) => {
    const type = toSegmentType(sub.trafficType);
    if (type === 'walk') return; // 도보 구간은 택시 탑승 지점이 아님

    const lat = Number(sub.endY || 0);
    const lng = Number(sub.endX || 0);
    if (!lat || !lng) return;

    const distKm  = haversineKm(lat, lng, endLat, endLng);
    if (distKm < 1.5) return; // 1.5km 미만은 걷는 게 나으므로 택시 제외

    const taxiCost = calcDistanceTaxiCost(distKm) * surcharge;
    const taxiMin  = calcDistanceTaxiMinutes(distKm);
    const remainingTime = subPaths.slice(i + 1).reduce((s: number, sp: any) => s + (sp.sectionTime || 0), 0);
    const timeSaved = remainingTime - taxiMin;
    const score = timeSaved > 0 ? calcTimeValueScore(timeSaved, taxiCost) : -distKm; // 절약 없으면 거리로 정렬

    candidates.push({
      subPathIdx: i,
      boardingName: sub.endName || '',
      boardingLat: lat,
      boardingLng: lng,
      distKm,
      taxiCost,
      taxiMin,
      timeSaved,
      score,
    });
  });

  if (candidates.length === 0) return null;

  if (timeMode === 'night') {
    // 야간: 최후 환승 지점에서 택시 (막차 의존 최소화)
    if (strategy === 'time-saving') return candidates[candidates.length - 1];
    // 알뜰: 가장 저렴한 지점 (목적지와 가장 가까운 환승)
    if (strategy === 'cost-saving') {
      return candidates.sort((a, b) => a.distKm - b.distKm)[0];
    }
    return candidates.sort((a, b) => b.score - a.score)[0];
  }

  // 주간: 효율 최고 지점
  if (strategy === 'time-saving') {
    return candidates.sort((a, b) => b.score - a.score)[0];
  }
  if (strategy === 'cost-saving') {
    return candidates.sort((a, b) => a.distKm - b.distKm)[0];
  }
  return candidates.sort((a, b) => b.score - a.score)[0];
}

// ─── 택시 탑승 명분 메시지 ────────────────────────────────────────────────
function generateTaxiJustification(
  boarding: string,
  dest: string,
  walkMin: number,
  timeSaved: number,
  taxiCost: number,
  strategy: HybridStrategy,
  timeMode: TimeMode,
  isTransferMode: boolean,
): string {
  const taxiMin = Math.max(1, walkMin - timeSaved);
  const costStr = taxiCost.toLocaleString();
  const tvScore = calcTimeValueScore(timeSaved, taxiCost).toFixed(1);

  if (isTransferMode) {
    // 환승 지점 택시 모드
    if (timeMode === 'night') {
      if (strategy === 'time-saving')
        return `🌙 ${boarding}에서 택시를 타면 이후 대중교통 없이 ${timeSaved > 0 ? `${timeSaved}분 빠르게` : '바로'} 귀가! 막차 눈치 없이 더 즐길 수 있어요.`;
      if (strategy === 'cost-saving')
        return `💰 ${boarding}→집 구간을 ${costStr}원으로 해결. 야간 최소 비용 귀가!`;
      return `⚖️ ${boarding}에서 택시로 갈아타면 ${timeSaved > 0 ? `${timeSaved}분 단축, ` : ''}${costStr}원 — 늦은 밤 스마트한 귀가예요!`;
    }
    if (strategy === 'time-saving')
      return `⚡ ${boarding}에서 택시로 환승하면 남은 구간을 ${timeSaved > 0 ? `${timeSaved}분 단축, ` : ''}${costStr}원에 해결해요!`;
    if (strategy === 'cost-saving')
      return `💰 ${boarding}에서 택시 탑승 시 ${costStr}원으로 문 앞 귀가. 이 구간이 가장 저렴해요!`;
    return `⚖️ ${boarding}→${dest} 택시 ${costStr}원, 가성비 ${tvScore}분/천원 — 최적의 환승 포인트예요!`;
  }

  // 도보 대체 모드
  if (timeMode === 'night') {
    if (strategy === 'time-saving')
      return `🌙 ${boarding}에서 택시를 타면 막차 눈치 없이 ${timeSaved}분 더 즐기고 귀가할 수 있어요!`;
    if (strategy === 'cost-saving')
      return `💰 ${boarding}→${dest} 구간만 ${costStr}원으로 해결! 마지막 ${walkMin}분 도보 없이 귀가해요.`;
    return `⚖️ ${boarding}→${dest} 택시 ${costStr}원 — 늦은 밤 최고 가성비 귀가 플랜이에요!`;
  }
  if (strategy === 'time-saving')
    return `⚡ ${boarding}에서 택시를 타면 도보 ${walkMin}분 구간을 ${taxiMin}분으로 단축! ${timeSaved}분 빨리 귀가해요.`;
  if (strategy === 'cost-saving')
    return `💰 마지막 ${walkMin}분 도보만 택시로! ${costStr}원으로 ${dest}까지 문 앞 귀가.`;
  return `⚖️ ${boarding}→${dest} 도보 ${walkMin}분 → 택시 ${taxiMin}분, ${timeSaved}분 단축! 가성비 ${tvScore}분/천원.`;
}

// ─── 세그먼트 빌더 (공통) ─────────────────────────────────────────────────
async function buildSegments(path: any, baseMs: number): Promise<RouteSegment[]> {
  const toHHMM = makeToHHMM(baseMs);
  let elapsed = 0;

  const rawSegs: any[] = (path.subPath || []).map((sub: any) => ({
    type:      toSegmentType(sub.trafficType),
    duration:  sub.sectionTime || 0,
    lineName:  sub.lane?.[0]?.name || sub.lane?.[0]?.busNo || '',
    busNos:    (sub.lane || []).map((l: any) => l.busNo).filter(Boolean).join(', '),
    startName: sub.startName || '',
    endName:   sub.endName   || '',
    sub,
  }));

  rawSegs.forEach((seg, i) => {
    if (seg.type === 'walk') {
      if (!seg.startName && i > 0)
        seg.startName = rawSegs[i - 1].endName || rawSegs[i - 1].startName;
      if (!seg.endName && i < rawSegs.length - 1)
        seg.endName = rawSegs[i + 1].startName || rawSegs[i + 1].endName;
    }
  });

  // 도보 구간: Tmap 보행자 길찾기로 실제 소요시간 + 경로 좌표 보정
  await Promise.all(rawSegs.map(async (seg) => {
    if (seg.type !== 'walk') return;
    const sLat = Number(seg.sub.startY), sLng = Number(seg.sub.startX);
    const eLat = Number(seg.sub.endY),   eLng = Number(seg.sub.endX);
    if (!sLat || !sLng || !eLat || !eLng) return;
    const walking = await getWalkingRoute(sLat, sLng, eLat, eLng);
    if (walking) {
      seg.duration = Math.max(1, Math.round(walking.durationSec / 60));
      // getWalkingRoutePath 는 캐시 히트이므로 추가 API 호출 없음
      const walkPath = await getWalkingRoutePath(sLat, sLng, eLat, eLng);
      if (walkPath.length >= 2) seg.walkPath = walkPath;
    }
  }));

  return rawSegs.map(({ type, duration, lineName, busNos, startName, endName, sub, walkPath }: any) => {
    let instruction = '';
    let alightInstruction: string | undefined;

    if (type === 'walk') {
      if (startName && endName) instruction = `${startName}에서 ${endName}까지 도보 이동`;
      else if (endName)         instruction = `${endName}까지 도보 이동`;
      else if (startName)       instruction = `${startName}에서 도보 이동`;
      else                      instruction = '도보 이동';
    } else if (type === 'subway') {
      instruction       = startName ? `${startName}역 ${lineName} 승차` : `${lineName} 승차`;
      alightInstruction = endName   ? `${endName}역 하차` : undefined;
    } else {
      const nos = busNos || lineName;
      instruction       = startName ? `${startName} 정류장 승차 ${nos}` : `${nos} 버스 승차`;
      alightInstruction = endName   ? `${endName} 정류장 하차` : undefined;
    }

    const stations: any[] = sub.passStopList?.stations || [];
    const segPath: { lat: number; lng: number }[] = [];

    // 도보 구간: Tmap 실제 경로 우선, 카카오 폴리라인 차선, 없으면 직선 fallback
    if (type === 'walk' && walkPath?.length >= 2) {
      segPath.push(...walkPath);
    } else if (sub._fullPath?.length >= 2) {
      segPath.push(...sub._fullPath);
    } else {
      stations.forEach((s: any) => {
        if (s.x && s.y) segPath.push({ lat: Number(s.y), lng: Number(s.x) });
      });
      if (segPath.length === 0 && sub.startX && sub.startY) {
        segPath.push({ lat: Number(sub.startY), lng: Number(sub.startX) });
        segPath.push({ lat: Number(sub.endY),   lng: Number(sub.endX) });
      }
    }

    // 진행 방향 다음 역: passStopList[0]=승차역, [1]=바로 다음 역
    // 반대 방향 열차는 arvlMsg3에 이 역 이름이 들어있으므로 실시간 필터에 사용
    const nextStationName = stations.length >= 2
      ? (stations[1].stationName || stations[1].stationNm || stations[1].name || '').replace(/역$/, '').trim()
      : '';

    const dep = toHHMM(elapsed);
    elapsed += duration;

    return {
      type, instruction, alightInstruction,
      durationMinutes: duration, cost: 0,
      lineName, startName, endName,
      path: segPath,
      departureTime: dep,
      arrivalTime: toHHMM(elapsed),
      wayCode: sub.wayCode ?? null,
      wayName: sub.way ?? '',
      nextStationName,
    };
  });
}

// ─── 하이브리드 경로 빌더 ─────────────────────────────────────────────────
async function buildTypedRoute(
  path: any,
  strategy: HybridStrategy,
  slotIdx: number,
  baseMs: number,
  fullTaxiCost: number,
  walkThreshold: number,
  timeMode: TimeMode,
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  endLocName: string,
  fullTaxiMinutes?: number,
): Promise<HybridRoute> {
  const info          = path.info;
  const totalCost     = info.payment || info.totalFare || 0;
  const totalDuration = info.totalTime || 0;
  const toHHMM        = makeToHHMM(baseMs);
  const label         = ROUTE_LABELS[timeMode][strategy];

  const baseSegments = await buildSegments(path, baseMs);

  // ── 경로당 택시 1회: 도보 대체 or 환승 지점 택시 ────────────────────────
  // 시각 지정 검색에서 막차 끊김으로 잘려나간 경로(_scheduleTruncated)는 뒷부분에
  // 목적지로 이어지는 구간이 아예 없으므로, 중간 도보만 택시로 바꾸는 Case A를 타면
  // 목적지에 도달 못 한 채 경로가 끝남 — 반드시 Case B(환승 지점→목적지 택시)로 보냄
  const walkTaxiIdx = path._scheduleTruncated ? null : selectWalkTaxiIndex(baseSegments, strategy, walkThreshold, timeMode, baseMs);

  let hybridSegments: RouteSegment[];
  let taxiCostTotal  = 0;
  let timeSavedTotal = 0;
  let taxiSeg: RouteSegment | null = null;
  let taxiBoardingPoint = '';
  let isTransferMode = false;

  if (walkTaxiIdx !== null) {
    // ── Case A: 도보 구간을 택시로 대체 ──────────────────────────────────
    const orig = baseSegments[walkTaxiIdx];
    const origSub = (path.subPath || [])[walkTaxiIdx] || {};
    const fallbackDistKm = (orig.durationMinutes / 60) * 4; // 도보 4km/h 추정
    const sLat = Number(origSub.startY), sLng = Number(origSub.startX);
    const eLat = Number(origSub.endY),   eLng = Number(origSub.endX);

    let refinedFare: { cost: number; minutes: number };
    if (sLat && sLng && eLat && eLng) {
      refinedFare = await getRefinedTaxiFare(sLat, sLng, eLat, eLng, baseMs, fallbackDistKm);
    } else {
      refinedFare = {
        cost: calcTaxiFareByDistance(fallbackDistKm * 1000, baseMs),
        minutes: calcDistanceTaxiMinutes(fallbackDistKm),
      };
    }
    taxiCostTotal  = refinedFare.cost;
    timeSavedTotal = Math.max(0, orig.durationMinutes - refinedFare.minutes);
    taxiBoardingPoint = orig.startName || orig.endName || '환승 지점';

    hybridSegments = baseSegments.map((s, i) => {
      if (i !== walkTaxiIdx) return s;
      const taxiInstruction = s.startName && s.endName
        ? `${s.startName}에서 ${s.endName}까지 택시 이동`
        : s.endName   ? `${s.endName}까지 택시 이동`
        : s.startName ? `${s.startName}에서 택시 이동`
        : '택시 이동';
      return {
        ...s,
        type: 'taxi' as const,
        cost: taxiCostTotal,
        durationMinutes: refinedFare.minutes,
        instruction: taxiInstruction,
        alightInstruction: undefined,
      };
    });

    taxiSeg = baseSegments[walkTaxiIdx];

  } else {
    // ── Case B: 도보 대체 후보 없음 → 환승 지점에서 목적지까지 택시 ───────
    isTransferMode = true;
    let tp = selectTransferPoint(path, endLat, endLng, strategy, timeMode, baseMs);

    // 시각 지정 검색에서 막차 끊김으로 잘린 경로는 목적지까지 반드시 택시로 이어야
    // 하므로, "1.5km 미만이면 그냥 걷는 게 낫다"는 selectTransferPoint의 일반 기준으로
    // 후보가 하나도 안 나오더라도(마지막 하차 지점이 목적지와 아주 가까운 경우) 예외적으로
    // 마지막 대중교통 구간에서 택시로 강제 연결 — 그래야 경로가 목적지에 실제로 도달함
    if (!tp && path._scheduleTruncated) {
      const subPaths: any[] = path.subPath || [];
      for (let i = subPaths.length - 1; i >= 0; i--) {
        const sub = subPaths[i];
        if (toSegmentType(sub.trafficType) === 'walk') continue;
        const lat = Number(sub.endY || 0), lng = Number(sub.endX || 0);
        if (!lat || !lng) continue;
        tp = {
          subPathIdx: i,
          boardingName: sub.endName || '',
          boardingLat: lat,
          boardingLng: lng,
          distKm: haversineKm(lat, lng, endLat, endLng),
          taxiCost: 0,
          taxiMin: 0,
          timeSaved: 0,
          score: 0,
        };
        break;
      }
    }

    if (tp) {
      // Tmap 실주행 거리로 택시비/시간 보정 (실패 시 직선거리 추정값 유지)
      const refinedFare = await getRefinedTaxiFare(
        tp.boardingLat, tp.boardingLng, endLat, endLng, baseMs, tp.distKm,
      );
      const remainingTime = (path.subPath || [])
        .slice(tp.subPathIdx + 1)
        .reduce((s: number, sp: any) => s + (sp.sectionTime || 0), 0);

      taxiCostTotal  = refinedFare.cost;
      timeSavedTotal = Math.max(0, remainingTime - refinedFare.minutes);
      taxiBoardingPoint = tp.boardingName || '환승 지점';

      // 해당 transit 구간까지만 유지하고 이후는 택시 1개로 대체
      const keptSegs = baseSegments.slice(0, tp.subPathIdx + 1);
      const lastKept = keptSegs[keptSegs.length - 1];
      const taxiInstruction = tp.boardingName
        ? `${tp.boardingName}에서 ${endLocName}까지 택시 이동`
        : `${endLocName}까지 택시 이동`;

      const taxiSegment: RouteSegment = {
        type: 'taxi',
        instruction: taxiInstruction,
        durationMinutes: refinedFare.minutes,
        cost: refinedFare.cost,
        startName: tp.boardingName,
        endName: endLocName,
        departureTime: lastKept?.arrivalTime ?? toHHMM(0),
        arrivalTime: toHHMM(
          (lastKept ? baseSegments.slice(0, tp.subPathIdx + 1).reduce((s, seg) => s + seg.durationMinutes, 0) : 0)
          + refinedFare.minutes,
        ),
        path: await getDrivingRoutePath(tp.boardingLat, tp.boardingLng, endLat, endLng)
              .then(p => p.length >= 2 ? p : [{ lat: tp.boardingLat, lng: tp.boardingLng }, { lat: endLat, lng: endLng }]),
      };

      hybridSegments = [...keptSegs, taxiSegment];

      taxiSeg = {
        type: 'walk',
        instruction: '',
        durationMinutes: refinedFare.minutes,
        cost: 0,
        startName: tp.boardingName,
        endName: endLocName,
      };

    } else {
      // 환승 지점도 없으면 순수 경로 그대로
      hybridSegments = baseSegments;
    }
  }

  const hybridTotalCost = totalCost + taxiCostTotal;
  // 막차 끊김으로 잘린 경로는 "원래 전체 경로 시간 - 절약된 시간" 공식의 기준이 되는
  // info.totalTime 자체가 (버려진 뒷부분 때문에) 더 이상 의미가 없으므로, 실제로
  // 화면에 보여줄 hybridSegments의 소요시간을 그대로 합산해 정확한 총 소요시간을 구함
  const hybridDuration  = path._scheduleTruncated
    ? Math.max(1, hybridSegments.reduce((s, seg) => s + seg.durationMinutes, 0))
    : Math.max(1, totalDuration - timeSavedTotal);
  const timeValueScore  = calcTimeValueScore(timeSavedTotal, taxiCostTotal);

  const taxiJustification = (taxiCostTotal > 0 && taxiSeg)
    ? generateTaxiJustification(
        taxiBoardingPoint,
        taxiSeg.endName || endLocName,
        taxiSeg.durationMinutes + timeSavedTotal,
        timeSavedTotal,
        taxiCostTotal,
        strategy,
        timeMode,
        isTransferMode,
      )
    : undefined;

  const lastTransit   = [...hybridSegments].reverse().find(s => s.type !== 'walk' && s.type !== 'taxi');
  const transferPoint = lastTransit?.endName || '도착지 인근';
  const walkSegs      = hybridSegments.filter(s => s.type === 'walk');
  const walkMinutes   = walkSegs.reduce((sum, s) => sum + s.durationMinutes, 0);
  const transitSegs   = hybridSegments.filter(s => s.type !== 'walk');
  const transferCount = Math.max(0, transitSegs.length - 1);

  return {
    id: `odsay-${slotIdx}-${strategy}`,
    name: label,
    totalCost,
    totalDuration: hybridDuration,
    savedAmount: Math.max(0, fullTaxiCost - hybridTotalCost),
    segments: hybridSegments,
    departureTime: toHHMM(0), // 모든 추천 경로는 동일하게 "지금" 기준 출발
    transferPoint,
    taxiCostOnly: fullTaxiCost,
    transferCount,
    walkMinutes,
    taxiWalkCost: taxiCostTotal,
    hybridTotalCost,
    hasTaxi: taxiCostTotal > 0,
    routeType: strategy,
    routeLabel: label,
    timeValueScore,
    timeSavedByTaxi: timeSavedTotal,
    timeMode,
    taxiBoardingPoint,
    taxiJustification,
    fullTaxiMinutes,
    destLat: endLat,
    destLng: endLng,
    origLat: startLat,
    origLng: startLng,
  };
}

// ─── 순수 대중교통 경로 빌더 (택시 제외 모드) ────────────────────────────
async function buildPureRoute(path: any, pathIdx: number, baseMs: number, fullTaxiCost: number, fullTaxiMinutes?: number, endLat?: number, endLng?: number, startLat?: number, startLng?: number): Promise<HybridRoute> {
  const info          = path.info;
  const totalCost     = info.payment || info.totalFare || 0;
  const totalDuration = info.totalTime || 0;
  const toHHMM        = makeToHHMM(baseMs);
  const segments      = await buildSegments(path, baseMs);

  const lastTransit   = [...segments].reverse().find(s => s.type !== 'walk');
  const transferPoint = lastTransit?.endName || '도착지 인근';
  const walkMinutes   = segments.filter(s => s.type === 'walk').reduce((sum, s) => sum + s.durationMinutes, 0);
  const transferCount = Math.max(0, segments.filter(s => s.type !== 'walk').length - 1);

  return {
    id: `odsay-${pathIdx}-pure`,
    name: `경로 ${pathIdx + 1}`,
    totalCost, totalDuration,
    savedAmount: Math.max(0, fullTaxiCost - totalCost),
    segments,
    departureTime: toHHMM(0), // 모든 추천 경로는 동일하게 "지금" 기준 출발
    transferPoint,
    taxiCostOnly: fullTaxiCost,
    transferCount, walkMinutes,
    taxiWalkCost: 0,
    hybridTotalCost: totalCost,
    hasTaxi: false,
    fullTaxiMinutes,
    destLat: endLat,
    destLng: endLng,
    origLat: startLat,
    origLng: startLng,
  };
}

// ─── 경로 후처리: 실제 값 기준 레이블 재배정 + 유사 경로 중복 제거 ──────────
function postProcessRoutes(routes: HybridRoute[]): HybridRoute[] {
  if (routes.length === 0) return routes;

  // 1. 유사 경로 중복 제거: 시간 5분 이내 + 비용 500원 이내면 동일 경로로 간주
  const unique: HybridRoute[] = [];
  for (const r of routes) {
    if (!unique.some(u =>
      Math.abs(r.totalDuration - u.totalDuration) <= 5 &&
      Math.abs(r.hybridTotalCost - u.hybridTotalCost) <= 500,
    )) unique.push(r);
  }
  if (unique.length === 0) return routes;

  // 카드가 최소 2개는 뜨도록 보장 — 원래 후보가 2개 이상이었는데 전부 비슷해서
  // 1개로 합쳐졌다면, 그나마 가장 다른(구분되는) 후보를 하나 더 채워 넣음
  const minCount = Math.min(2, routes.length);
  if (unique.length < minCount) {
    const remaining = routes.filter(r => !unique.includes(r));
    remaining.sort((a, b) => Math.abs(b.hybridTotalCost - unique[0].hybridTotalCost) - Math.abs(a.hybridTotalCost - unique[0].hybridTotalCost));
    unique.push(...remaining.slice(0, minCount - unique.length));
  }

  // 2. 실제 값 기준 최고 순위 경로 결정
  const byTime = [...unique].sort((a, b) => a.totalDuration - b.totalDuration);
  const byCost = [...unique].sort((a, b) => a.hybridTotalCost - b.hybridTotalCost);
  const fastest  = byTime[0];
  const cheapest = byCost[0];

  // timeMode 계승 (배열 안에서 첫 번째 경로 기준)
  const timeMode = (unique[0].timeMode ?? 'day') as 'day' | 'night';
  const labels = {
    fast:      timeMode === 'night' ? '🌙 최대 체류형'        : '⚡ 빠른 귀가형',
    cheap:     timeMode === 'night' ? '💰 알뜰 막차형'        : '💰 알뜰 귀가형',
    balanced:  timeMode === 'night' ? '⚖️ 스마트 막차형'     : '⚖️ 밸런스형',
    optimal:   timeMode === 'night' ? '✨ 최적 막차형'        : '✨ 최적 귀가형',
  };

  const isSame = fastest.id === cheapest.id;

  const result = unique.map(route => {
    const isFastest  = route.id === fastest.id;
    const isCheapest = route.id === cheapest.id;

    if (isFastest && isCheapest) {
      // 가장 빠르고 동시에 가장 저렴 → 최적 경로 단일 레이블
      return {
        ...route,
        name: labels.optimal,
        routeType: 'time-saving' as const,
        routeLabel: labels.optimal,
        comparisonNote: '시간·비용 모두 최적',
      };
    }

    if (isFastest && !isSame) {
      const timeDiff = cheapest.totalDuration - route.totalDuration;
      const costDiff = route.hybridTotalCost - cheapest.hybridTotalCost;
      const parts: string[] = [];
      if (timeDiff > 0) parts.push(`알뜰형보다 ${timeDiff}분 빠름`);
      if (costDiff > 0) parts.push(`${costDiff.toLocaleString()}원 더 비쌈`);
      return {
        ...route,
        name: labels.fast,
        routeType: 'time-saving' as const,
        routeLabel: labels.fast,
        comparisonNote: parts.length > 0 ? parts.join(' · ') : undefined,
      };
    }

    if (isCheapest && !isSame) {
      const timeDiff = route.totalDuration - fastest.totalDuration;
      const costDiff = fastest.hybridTotalCost - route.hybridTotalCost;
      const parts: string[] = [];
      if (timeDiff > 0) parts.push(`빠른형보다 ${timeDiff}분 더 걸림`);
      if (costDiff > 0) parts.push(`${costDiff.toLocaleString()}원 절약`);
      return {
        ...route,
        name: labels.cheap,
        routeType: 'cost-saving' as const,
        routeLabel: labels.cheap,
        comparisonNote: parts.length > 0 ? parts.join(' · ') : undefined,
      };
    }

    // 밸런스형 (fastest도 cheapest도 아닌 나머지)
    const timeDiff = route.totalDuration - fastest.totalDuration;
    const costDiff = route.hybridTotalCost - cheapest.hybridTotalCost;
    const parts: string[] = [];
    if (timeDiff > 0) parts.push(`빠른형보다 ${timeDiff}분`);
    if (costDiff > 0) parts.push(`${costDiff.toLocaleString()}원 더 비쌈`);
    return {
      ...route,
      name: labels.balanced,
      routeType: 'balanced' as const,
      routeLabel: labels.balanced,
      comparisonNote: parts.length > 0 ? parts.join(' · ') : undefined,
    };
  });

  // 3. 정렬: 빠른형 → 알뜰형 → 밸런스형 (최적형은 맨 앞)
  const typeOrder: Record<string, number> = {
    'time-saving': 0,
    'cost-saving': 1,
    'balanced':    2,
  };
  return result.sort((a, b) =>
    (typeOrder[a.routeType ?? 'balanced'] ?? 2) - (typeOrder[b.routeType ?? 'balanced'] ?? 2),
  );
}

// 전액 택시 대비 절약률이 이 미만이면 추천에서 제외 — 시간 손해 대비 절약이
// 너무 작으면(예: 15분 더 걸려서 6,650원만 아낌) 그냥 택시가 나은 선택이라고 판단
const MIN_TAXI_SAVINGS_RATIO = 0.3;
function filterBySavingsRatio(routes: HybridRoute[]): HybridRoute[] {
  const qualifying = routes.filter(r => r.taxiCostOnly <= 0 || r.savedAmount / r.taxiCostOnly >= MIN_TAXI_SAVINGS_RATIO);
  // 카드가 최소 2개는 뜨도록 보장 — 30% 기준을 넘는 경로가 부족하면 절약률 높은
  // 순으로 모자란 만큼 채움 (완전히 빈 결과 대신 가장 저렴한 것 하나만 주던 기존
  // 폴백보다 한 단계 더 관대하게)
  const minCount = Math.min(2, routes.length);
  if (qualifying.length >= minCount) return qualifying;
  const bySavingsRatio = [...routes].sort((a, b) =>
    (b.savedAmount / (b.taxiCostOnly || 1)) - (a.savedAmount / (a.taxiCostOnly || 1)),
  );
  const result = [...qualifying];
  for (const r of bySavingsRatio) {
    if (result.length >= minCount) break;
    if (!result.includes(r)) result.push(r);
  }
  return result;
}

// ─── 공개 API ─────────────────────────────────────────────────────────────
export const getOdsayTransitRoutes = async (
  startLoc: string,
  endLoc: string,
  departureDate?: Date,
  walkThreshold?: number,
  excludeTaxi?: boolean,
): Promise<{ routes: HybridRoute[]; fullTaxiCost: number }> => {
  const effectiveWalkThreshold = walkThreshold ?? DEFAULT_WALK_THRESHOLD;

  const [startCoords, endCoords] = await Promise.all([
    getCoordinates(startLoc),
    getCoordinates(endLoc),
  ]);
  if (!startCoords || !endCoords) {
    throw new Error('출발지 또는 도착지 좌표를 찾을 수 없습니다.');
  }

  const baseMs = departureDate ? departureDate.getTime() : Date.now();
  // 전액 택시 비용 조회는 대중교통 경로 조회·검증과 서로 의존관계가 없는데도
  // 지금까지 그 뒤에서 순차로 기다리고 있었음 — 미리 병렬로 시작해서 기다리는
  // 시간을 겹치게 함 (Tmap driving 경로 API 응답 시간만큼 검색이 그냥 느려지던 부분)
  const straightKm = haversineKm(startCoords.lat, startCoords.lon, endCoords.lat, endCoords.lon);
  const fullTaxiFarePromise = getRefinedTaxiFare(
    startCoords.lat, startCoords.lon, endCoords.lat, endCoords.lon, baseMs, straightKm,
  );

  // ODsay 폴백용 URL — 시각 지정(SearchDate/SearchTime)이 필요할 때만 사용
  let odsayUrl = `${API_BASE}/api/odsay?SX=${startCoords.lon}&SY=${startCoords.lat}&EX=${endCoords.lon}&EY=${endCoords.lat}`;
  if (departureDate) {
    const sDate = `${departureDate.getFullYear()}${pad2(departureDate.getMonth() + 1)}${pad2(departureDate.getDate())}`;
    const sTime = `${pad2(departureDate.getHours())}${pad2(departureDate.getMinutes())}`;
    odsayUrl += `&SearchDate=${sDate}&SearchTime=${sTime}`;
  }

  const fetchFromOdsay = async (): Promise<any[]> => {
    const res  = await fetch(odsayUrl);
    const data = await res.json();
    if (data.error) {
      throw new Error(`ODsay 오류: ${data.error.message || data.error.msg || JSON.stringify(data.error)}`);
    }
    const p = data.result?.path;
    if (!p || p.length === 0) {
      throw new Error(`경로를 찾을 수 없습니다. (status: ${JSON.stringify(data.result?.status ?? data.result)})`);
    }
    return p;
  };

  // 카카오 대중교통 길찾기를 메인으로 사용 — 시각 지정은 아래 isPathRunnable()
  // 기반 스케줄 필터로 보정. 카카오 실패/무결과 시에만 ODsay로 폴백.
  let allPaths: any[] | undefined;
  try {
    allPaths = await fetchKakaoTransitPaths(startCoords.lat, startCoords.lon, endCoords.lat, endCoords.lon);
  } catch (kakaoErr) {
    try {
      allPaths = await fetchFromOdsay();
    } catch {
      throw kakaoErr;
    }
  }

  // 같은 경로(같은 구간 시퀀스)는 중복 제거 — 시간표 검증 전에 먼저 걸러서
  // 똑같은 경로를 여러 번 검증하느라 외부 API를 낭비 호출하지 않게 함
  const pathKey = (p: any): string =>
    (p.subPath || []).map((sp: any) => `${sp.trafficType}:${sp.startName ?? ''}>${sp.endName ?? ''}`).join('|');
  {
    const seenKeys = new Set<string>();
    allPaths = allPaths.filter(p => {
      const k = pathKey(p);
      if (seenKeys.has(k)) return false;
      seenKeys.add(k);
      return true;
    });
  }

  let paths: any[];
  if (departureDate) {
    const eligible = allPaths.filter(p => {
      const totalTime: number = p.info?.totalTime ?? 9999;
      if (totalTime > 240) return false;
      const sectionTime: number = (p.subPath || []).reduce((s: number, sp: any) => s + (sp.sectionTime || 0), 0);
      return (totalTime - sectionTime) <= 30;
    });

    // 시간표 검증(isPathRunnable)이 실제 외부 API를 호출하므로, 카카오가 후보를 아무리
    // 많이 줘도 검증 대상을 "가장 빠른 후보 + 가장 저렴한 후보" 상위 몇 개로만 제한해서
    // 검색 속도가 후보 개수에 비례해 느려지지 않게 함 (최종적으로도 3개만 쓰므로 충분)
    const MAX_PER_DIMENSION = 6;
    const byTimeTop = [...eligible].sort((a, b) => (a.info?.totalTime ?? 9999) - (b.info?.totalTime ?? 9999)).slice(0, MAX_PER_DIMENSION);
    const byCostTop = [...eligible].sort((a, b) => (a.info?.payment ?? a.info?.totalFare ?? 9999) - (b.info?.payment ?? b.info?.totalFare ?? 9999)).slice(0, MAX_PER_DIMENSION);
    const candidateKeys = new Set<string>();
    const candidates: any[] = [];
    for (const p of [...byTimeTop, ...byCostTop]) {
      const k = pathKey(p);
      if (candidateKeys.has(k)) continue;
      candidateKeys.add(k);
      candidates.push(p);
    }

    // 지정 시각에 완주 가능한지 구간별로 확인. 막차가 끊긴 지점이 있으면 그 경로
    // 전체를 버리지 않고, 운행 가능한 구간까지만 남긴 뒤 나머지는 택시로 이어붙임
    // (buildTypedRoute의 환승 지점 택시 로직(selectTransferPoint)이 그대로 재사용됨)
    // — "완주 불가능하면 아무 경로도 안 보여줌"은 찐막차의 핵심 가치(하이브리드 귀가)에
    // 어긋나므로, 대중교통으로 갈 수 있는 데까지 + 택시로 반드시 경로를 만들어낸다.
    const truncated = await Promise.all(candidates.map(async (p) => {
      const subPaths: any[] = p.subPath || [];
      const flags = await Promise.all(subPaths.map(sp => isSubPathRunnable(sp, departureDate)));
      const firstBad = flags.findIndex(f => !f);
      if (firstBad === -1) return p; // 전 구간 운행 — 그대로 사용

      let cut = firstBad;
      while (cut > 0 && toSegmentType(subPaths[cut - 1].trafficType) === 'walk') cut--;
      if (cut === 0) return null; // 첫 대중교통 구간부터 운행 안 함 — 이 후보는 포기

      const keptSubPath = subPaths.slice(0, cut);
      const keptTime = keptSubPath.reduce((s: number, sp: any) => s + (sp.sectionTime || 0), 0);
      return {
        ...p,
        subPath: keptSubPath,
        info: { ...p.info, totalTime: keptTime },
        // 잘려나간 구간을 도보 대체(Case A)가 아니라 반드시 택시로 목적지까지
        // 이어붙이도록(Case B) buildTypedRoute에 알려주는 표식 — 잘린 경로는 이미
        // 목적지 도달용 뒷부분이 없으므로, 중간 환승 도보만 택시로 바꾸는 Case A가
        // 걸리면 목적지에 닿지 못한 채로 경로가 끝나버림
        _scheduleTruncated: true,
      };
    }));
    paths = truncated.filter((p): p is any => p !== null);
  } else {
    paths = allPaths;
  }

  if (paths.length === 0) {
    throw new Error('해당 시각에 운행 중인 대중교통 경로가 없습니다.\n심야버스(N버스)를 확인하거나 택시를 이용해보세요.');
  }

  // 전액 택시 비용: 위에서 미리 시작해둔 조회 결과를 여기서 받음 (실제 도로 주행거리 기반,
  // Tmap 실패 시 직선거리 추정 폴백)
  const fullTaxiFare = await fullTaxiFarePromise;
  const fullTaxiCost = fullTaxiFare.cost;
  const fullTaxiMinutes = fullTaxiFare.minutes;

  if (excludeTaxi) {
    const pureRoutes = await Promise.all(paths.slice(0, 3).map((p, i) => buildPureRoute(p, i, baseMs, fullTaxiCost, fullTaxiMinutes, endCoords.lat, endCoords.lon, startCoords.lat, startCoords.lon)));
    return { routes: postProcessRoutes(filterBySavingsRatio(pureRoutes)), fullTaxiCost };
  }

  const timeMode = detectTimeMode(baseMs);
  const strategies: HybridStrategy[] = ['time-saving', 'cost-saving', 'balanced'];

  // 전략별로 서로 다른 ODsay 경로를 배정 (가능한 만큼 다양하게)
  const byTime = [...paths].sort((a, b) => (a.info?.totalTime ?? 9999) - (b.info?.totalTime ?? 9999));
  const byCost = [...paths].sort((a, b) =>
    (a.info?.payment ?? 9999) - (b.info?.payment ?? 9999) || (a.info?.totalTime ?? 9999) - (b.info?.totalTime ?? 9999)
  );

  const chosen: any[] = [];
  const usedKeys = new Set<string>();
  const tryAdd = (p: any) => {
    const k = pathKey(p);
    if (!p || usedKeys.has(k)) return false;
    usedKeys.add(k);
    chosen.push(p);
    return true;
  };

  tryAdd(byTime[0]); // 1순위: 가장 빠른 경로
  for (const p of byCost) { if (tryAdd(p)) break; } // 2순위: 겹치지 않는 가장 저렴한 경로

  // 3순위: 위 둘과 겹치지 않는 경로 중 소요시간 중간값 (없으면 어쩔 수 없이 재사용)
  const remaining = byTime.filter(p => !usedKeys.has(pathKey(p)));
  if (remaining.length > 0) {
    tryAdd(remaining[Math.floor(remaining.length / 2)]);
  }
  while (chosen.length < 3) chosen.push(byTime[chosen.length % byTime.length]);

  const routes = await Promise.all(
    strategies.map((strategy, si) =>
      buildTypedRoute(
        chosen[si],
        strategy, si, baseMs, fullTaxiCost,
        effectiveWalkThreshold, timeMode,
        startCoords.lat, startCoords.lon,
        endCoords.lat, endCoords.lon,
        endLoc, fullTaxiMinutes,
      ),
    ),
  );

  return { routes: postProcessRoutes(filterBySavingsRatio(routes)), fullTaxiCost };
};
