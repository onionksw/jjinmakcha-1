import { HybridRoute, RouteSegment } from '../types';
import { getCoordinates, getDrivingDistance, getWalkingRoute, isOutsideSeoul } from './tmapService';
import { isPathRunnable } from './transitScheduleService';

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
): number | null {
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
        score: (isLast(c.i) ? 3.0 : 1.5) / calcWalkTaxiCost(c.s.durationMinutes) * 10000,
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
            calcWalkTaxiCost(c.s.durationMinutes),
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
        calcWalkTaxiCost(c.s.durationMinutes),
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
): TransferTaxiPoint | null {
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

    const taxiCost = calcDistanceTaxiCost(distKm);
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

  // 도보 구간은 Tmap 보행자 길찾기로 실제 소요시간 보정 (좌표 있을 때만, 실패 시 ODsay 추정치 유지)
  await Promise.all(rawSegs.map(async (seg) => {
    if (seg.type !== 'walk') return;
    const sLat = Number(seg.sub.startY), sLng = Number(seg.sub.startX);
    const eLat = Number(seg.sub.endY),   eLng = Number(seg.sub.endX);
    if (!sLat || !sLng || !eLat || !eLng) return;
    const walking = await getWalkingRoute(sLat, sLng, eLat, eLng);
    if (walking) seg.duration = Math.max(1, Math.round(walking.durationSec / 60));
  }));

  return rawSegs.map(({ type, duration, lineName, busNos, startName, endName, sub }) => {
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
    stations.forEach((s: any) => {
      if (s.x && s.y) segPath.push({ lat: Number(s.y), lng: Number(s.x) });
    });
    if (segPath.length === 0 && sub.startX && sub.startY) {
      segPath.push({ lat: Number(sub.startY), lng: Number(sub.startX) });
      segPath.push({ lat: Number(sub.endY),   lng: Number(sub.endX) });
    }

    // 진행 방향 다음 역: passStopList[0]=승차역, [1]=바로 다음 역
    // 반대 방향 열차는 arvlMsg3에 이 역 이름이 들어있으므로 실시간 필터에 사용
    if (type === 'subway' && stations.length > 0) {
      console.log('[ODsay passStopList] stations[0..2]:', JSON.stringify(stations.slice(0, 3)));
    }
    const nextStationName = stations.length >= 2
      ? (stations[1].stationName || stations[1].stationNm || stations[1].name || '').replace(/역$/, '').trim()
      : '';
    if (type === 'subway') {
      console.log('[방향필터] startName:', startName, '→ nextStationName:', nextStationName, '| wayCode:', sub.wayCode);
    }

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
  endLat: number,
  endLng: number,
  endLocName: string,
): Promise<HybridRoute> {
  const info          = path.info;
  const totalCost     = info.payment || info.totalFare || 0;
  const totalDuration = info.totalTime || 0;
  const toHHMM        = makeToHHMM(baseMs);
  const label         = ROUTE_LABELS[timeMode][strategy];

  const baseSegments = await buildSegments(path, baseMs);

  // ── 경로당 택시 1회: 도보 대체 or 환승 지점 택시 ────────────────────────
  const walkTaxiIdx = selectWalkTaxiIndex(baseSegments, strategy, walkThreshold, timeMode);

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
    const tp = selectTransferPoint(path, endLat, endLng, strategy, timeMode);

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
  const hybridDuration  = Math.max(1, totalDuration - timeSavedTotal);
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
  };
}

// ─── 순수 대중교통 경로 빌더 (택시 제외 모드) ────────────────────────────
async function buildPureRoute(path: any, pathIdx: number, baseMs: number, fullTaxiCost: number): Promise<HybridRoute> {
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
  };
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

  let url = `/api/odsay?SX=${startCoords.lon}&SY=${startCoords.lat}&EX=${endCoords.lon}&EY=${endCoords.lat}`;
  if (departureDate) {
    const sDate = `${departureDate.getFullYear()}${pad2(departureDate.getMonth() + 1)}${pad2(departureDate.getDate())}`;
    const sTime = `${pad2(departureDate.getHours())}${pad2(departureDate.getMinutes())}`;
    url += `&SearchDate=${sDate}&SearchTime=${sTime}`;
  }

  const res  = await fetch(url);
  const data = await res.json();
  console.log('ODsay 경로 탐색 응답:', JSON.stringify(data).slice(0, 300));

  if (data.error) {
    throw new Error(`ODsay 오류: ${data.error.message || data.error.msg || JSON.stringify(data.error)}`);
  }

  const allPaths = data.result?.path;
  if (!allPaths || allPaths.length === 0) {
    throw new Error(`경로를 찾을 수 없습니다. (status: ${JSON.stringify(data.result?.status ?? data.result)})`);
  }

  let paths: any[];
  if (departureDate) {
    const validPaths: any[] = [];
    for (const p of allPaths) {
      const totalTime: number = p.info?.totalTime ?? 9999;
      if (totalTime > 240) continue;
      const sectionTime: number = (p.subPath || []).reduce((s: number, sp: any) => s + (sp.sectionTime || 0), 0);
      if ((totalTime - sectionTime) > 30) continue;
      if (!(await isPathRunnable(p, departureDate))) continue;
      validPaths.push(p);
    }
    paths = validPaths;
  } else {
    paths = allPaths;
  }

  if (paths.length === 0) {
    throw new Error('해당 시각에 운행 중인 대중교통 경로가 없습니다.\n심야버스(N버스)를 확인하거나 택시를 이용해보세요.');
  }

  // 같은 경로(같은 구간 시퀀스)는 중복 제거
  const pathKey = (p: any): string =>
    (p.subPath || []).map((sp: any) => `${sp.trafficType}:${sp.startName ?? ''}>${sp.endName ?? ''}`).join('|');
  const uniquePaths: any[] = [];
  const seenKeys = new Set<string>();
  for (const p of paths) {
    const k = pathKey(p);
    if (seenKeys.has(k)) continue;
    seenKeys.add(k);
    uniquePaths.push(p);
  }
  paths = uniquePaths;

  const baseMs = departureDate ? departureDate.getTime() : Date.now();

  // 전액 택시 비용: 실제 도로 주행거리 기반 (Tmap 실패 시 직선거리 추정 폴백)
  const straightKm = haversineKm(startCoords.lat, startCoords.lon, endCoords.lat, endCoords.lon);
  const fullTaxiFare = await getRefinedTaxiFare(
    startCoords.lat, startCoords.lon, endCoords.lat, endCoords.lon, baseMs, straightKm,
  );
  const fullTaxiCost = fullTaxiFare.cost;

  if (excludeTaxi) {
    return {
      routes: await Promise.all(paths.slice(0, 3).map((p, i) => buildPureRoute(p, i, baseMs, fullTaxiCost))),
      fullTaxiCost,
    };
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
        endCoords.lat, endCoords.lon,
        endLoc,
      ),
    ),
  );

  return { routes, fullTaxiCost };
};
