import { API_BASE } from './apiBase';

/**
 * 대중교통 운행 스케줄 검증 서비스
 *
 * 시각 지정 경로 검색(카카오 대중교통 API는 "지금" 기준으로만 경로를 계산하므로,
 * 실제 요청 시각에 운행 가능한지는 별도로 검증해야 함) 시, 서울 버스는 노선별
 * 실제 첫차/막차 시각(getBusRouteList)으로, 지하철은 역별 실제 시간표
 * (SearchSTNTimeTableByIDService)로 정밀 검증한다. 둘 다 조회 실패 시에만
 * TAGO 노선 유형 기반 대분류 규칙으로 폴백한다.
 *
 * 운행일 기준: 04:00 ~ 다음날 04:00 (00~03시대는 전날 심야의 연장으로 취급)
 *
 * TAGO routetp 값(서울 기준):
 *  1: 공항버스  2: 마을버스  3: 간선버스  4: 지선버스
 *  5: 순환버스  6: 광역버스  10: 외곽버스  11: 직행좌석  16: 심야버스
 */

// 새벽(01:00~05:59)에 운행하지 않는 것이 확실한 routetp 값 (폴백 규칙용)
// 마을(2)·간선(3)·지선(4)·순환(5)만 차단
// 광역(6)·외곽(10)·직행좌석(11)은 새벽 첫차 노선이 있어 제외
const DAY_ONLY_TYPES = new Set(['2', '3', '4', '5']);

// 24h 캐시 (노선 유형/시각표는 자주 바뀌지 않음)
const CACHE_TTL = 24 * 60 * 60 * 1000;
const routeTypeCache = new Map<string, { routetp: string | null; ts: number }>();

/** TAGO API로 버스 노선 유형 조회 (정밀 검증 실패 시 폴백용) */
async function fetchRouteType(busNo: string): Promise<string | null> {
  const key = busNo.toUpperCase();
  const cached = routeTypeCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.routetp;

  try {
    const res = await fetch(
      `${API_BASE}/api/tago-route-type?cityCode=11&routeNo=${encodeURIComponent(busNo)}`
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const routetp: string | null = data.routetp ?? null;
    routeTypeCache.set(key, { routetp, ts: Date.now() });
    return routetp;
  } catch {
    // 조회 실패 시 패턴 기반 추정으로 폴백
    const fallback = /^N\d/i.test(busNo) ? '16' : null;
    routeTypeCache.set(key, { routetp: fallback, ts: Date.now() });
    return fallback;
  }
}

/** 이 버스가 심야버스(N버스, routetp=16)인지 확인 */
export async function isNightBus(busNo: string): Promise<boolean> {
  if (!busNo) return false;
  if (/^N\d/i.test(busNo)) return true; // 패턴으로 즉시 판단

  const routetp = await fetchRouteType(busNo);
  return routetp === '16';
}

// 운행일 기준(04:00~다음날 04:00) 분으로 변환 — 00~03시대는 전날 심야의 연장
const toServiceMin = (hh: number, mm: number): number => (hh < 4 ? hh + 24 : hh) * 60 + mm;
const dateToServiceMin = (d: Date): number => toServiceMin(d.getHours(), d.getMinutes());
// "HH:MM" 문자열 → 운행일 기준 분
const hhmmToServiceMin = (t: string): number | null => {
  const [h, m] = t.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return toServiceMin(h, m);
};
// ─── 버스: 노선별 실제 첫차/막차 시각 (서울 → 경기 → 인천 순으로 서버에서 조회) ──
const busScheduleCache = new Map<string, { firstMin: number | null; lastMin: number | null; ts: number }>();

async function fetchBusSchedule(busNo: string): Promise<{ firstMin: number | null; lastMin: number | null } | null> {
  const key = busNo.toUpperCase();
  const cached = busScheduleCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached;

  try {
    const res = await fetch(`${API_BASE}/api/seoul-bus?routeNo=${encodeURIComponent(busNo)}&routeOnly=1`);
    const data = await res.json();
    if (!data.found) {
      const result = { firstMin: null, lastMin: null };
      busScheduleCache.set(key, { ...result, ts: Date.now() });
      return result;
    }
    const result = {
      firstMin: hhmmToServiceMin(data.firstBusTm),
      lastMin: hhmmToServiceMin(data.lastBusTm),
    };
    busScheduleCache.set(key, { ...result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}

/** 이 버스 노선이 주어진 시각에 실제로 운행 중인지 — 데이터 없으면 null(불명) */
async function isBusRunnableAt(busNo: string, date: Date): Promise<boolean | null> {
  const sched = await fetchBusSchedule(busNo);
  if (!sched || sched.firstMin === null || sched.lastMin === null) return null;
  const target = dateToServiceMin(date);
  return target >= sched.firstMin && target <= sched.lastMin;
}

// ─── 지하철: 역별 실제 첫차/막차 시각 ──────────────────────────────────────
const subwayScheduleCache = new Map<string, { firstMin: number | null; lastMin: number | null; ts: number }>();

async function fetchSubwayEdgeTimes(stationName: string, lineName: string): Promise<{ firstMin: number | null; lastMin: number | null } | null> {
  const key = `${lineName}:${stationName}`;
  const cached = subwayScheduleCache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached;

  try {
    const clean = stationName.replace(/역$/, '').replace(/\(.*\)/, '').trim();
    const res = await fetch(`${API_BASE}/api/subway-timetable?station=${encodeURIComponent(clean)}&lineName=${encodeURIComponent(lineName)}`);
    const data = await res.json();
    // 방향(상/하행)을 구분하지 않고, 둘 중 하나라도 다니면 운행으로 간주 (허용적 폴백)
    const firsts = [data.firstTrain?.U, data.firstTrain?.D].filter(Boolean).map(hhmmToServiceMin).filter((v: number | null): v is number => v !== null);
    const lasts = [data.lastTrain?.U, data.lastTrain?.D].filter(Boolean).map(hhmmToServiceMin).filter((v: number | null): v is number => v !== null);
    const result = {
      firstMin: firsts.length ? Math.min(...firsts) : null,
      lastMin: lasts.length ? Math.max(...lasts) : null,
    };
    subwayScheduleCache.set(key, { ...result, ts: Date.now() });
    return result;
  } catch {
    return null;
  }
}

/** 이 지하철 구간이 주어진 시각에 실제로 운행 중인지 — 데이터 없으면 null(불명) */
async function isSubwayRunnableAt(sp: any, date: Date): Promise<boolean | null> {
  const lineName: string = sp.lane?.[0]?.name || '';
  const stationName: string = sp.startName || '';
  if (!lineName || !stationName) return null;

  const sched = await fetchSubwayEdgeTimes(stationName, lineName);
  if (!sched || sched.firstMin === null || sched.lastMin === null) return null;
  const target = dateToServiceMin(date);
  return target >= sched.firstMin && target <= sched.lastMin;
}

/**
 * ODsay/카카오 응답의 subPath 하나가 주어진 시각에 운행 가능한지 확인.
 *  - trafficType 1(지하철): 역별 실제 시간표로 정밀 검증, 실패 시 서울 운행시간 대분류 폴백
 *  - trafficType 2(버스): 노선별 실제 첫차/막차로 정밀 검증, 실패 시 TAGO 노선 유형 대분류 폴백
 *  - 그 외(도보): 항상 true
 */
export async function isSubPathRunnable(sp: any, date: Date): Promise<boolean> {
  const hour = date.getHours();

  // 도보
  if (sp.trafficType !== 1 && sp.trafficType !== 2) return true;

  // 지하철
  if (sp.trafficType === 1) {
    const precise = await isSubwayRunnableAt(sp, date);
    if (precise !== null) return precise;
    // 폴백: 서울 운행 시간 기준 (01:00~05:29 운행 없음)
    return !(hour >= 1 && hour < 6);
  }

  // 버스
  const lanes: any[] = sp.lane || [];
  const busNos = lanes.map((l: any) => l.busNo || l.name || '').filter(Boolean);
  if (busNos.length === 0) return hour >= 6 || hour === 0;

  const preciseResults = await Promise.all(busNos.map(no => isBusRunnableAt(no, date)));
  const known = preciseResults.filter((r): r is boolean => r !== null);
  if (known.length > 0) return known.some(Boolean);

  // 정밀 시간표를 못 가져온 경우(경기 광역 심야버스 등 서울 API 밖 노선)의 대분류 폴백
  const routeTypes = await Promise.all(busNos.map(no => fetchRouteType(no)));

  // 낮 시간(06:00~00:59): 대안 노선(lane) 중 심야버스가 아닌 게 하나라도 있으면 운행으로 간주.
  // 패턴상 심야버스로 보이는데 routetp 조회까지 실패한 경우도 심야로 취급(N버스 번호 패턴, isNightBus와 동일 기준)
  if (hour >= 6 || hour === 0) {
    return busNos.some((no, i) => routeTypes[i] !== '16' && !/^N\d/i.test(no));
  }

  // 01:00~05:59: 확실한 낮 전용 노선 유형만 차단, 나머지는 신뢰
  return routeTypes.some(rt => !DAY_ONLY_TYPES.has(rt ?? ''));
}

/** 하나의 경로(path)가 주어진 시각에 완주 가능한지 확인 */
export async function isPathRunnable(path: any, departureDate: Date): Promise<boolean> {
  // 구간별 검증이 외부 API를 호출하므로 순차 대기 대신 병렬로 처리
  const flags = await Promise.all(
    (path.subPath || []).map((sp: any) => isSubPathRunnable(sp, departureDate))
  );
  return flags.every(Boolean);
}
