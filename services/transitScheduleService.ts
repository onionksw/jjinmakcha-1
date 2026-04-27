/**
 * 대중교통 운행 스케줄 검증 서비스
 *
 * TAGO BusRouteInfoInqireService API를 이용해 버스 노선 유형을 조회하고,
 * 요청 시각에 실제로 운행 중인 경로인지 판별한다.
 *
 * 서울 운행 시간 기준:
 *  - 지하철: 05:30~00:30 (01:00~05:29 = 운행 없음)
 *  - 일반버스(간선·지선·광역·마을): 04:30~24:00 (01:00~04:29 = 운행 없음)
 *  - 심야버스(N버스): 23:30~05:30 (유일하게 01:00~05:00 운행)
 *  - 공항버스 등 기타: 노선마다 상이 → 알 수 없으면 ODsay를 신뢰
 *
 * TAGO routetp 값(서울 기준):
 *  1: 공항버스  2: 마을버스  3: 간선버스  4: 지선버스
 *  5: 순환버스  6: 광역버스  10: 외곽버스  11: 직행좌석  16: 심야버스
 *
 * 새벽(01:00~05:59) 판단 전략:
 *  "야간 운행 불가"가 확실한 유형(간선·지선·마을·순환·광역·외곽·직행좌석)만 차단.
 *  유형 불명(null) · 공항버스(1) · 심야버스(16) 등은 ODsay 결과를 신뢰해 통과.
 */

// 새벽에 운행하지 않는 것이 확실한 routetp 값
const DAY_ONLY_TYPES = new Set(['2', '3', '4', '5', '6', '10', '11']);

// 24h 캐시 (노선 유형은 자주 바뀌지 않음)
const CACHE_TTL = 24 * 60 * 60 * 1000;
const cache = new Map<string, { routetp: string | null; ts: number }>();

/** TAGO API로 버스 노선 유형 조회 */
async function fetchRouteType(busNo: string): Promise<string | null> {
  const key = busNo.toUpperCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.routetp;

  try {
    const res = await fetch(
      `/api/tago-route-type?cityCode=11&routeNo=${encodeURIComponent(busNo)}`
    );
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    const routetp: string | null = data.routetp ?? null;
    cache.set(key, { routetp, ts: Date.now() });
    return routetp;
  } catch {
    // 조회 실패 시 패턴 기반 추정으로 폴백
    const fallback = /^N\d/i.test(busNo) ? '16' : null;
    cache.set(key, { routetp: fallback, ts: Date.now() });
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

/**
 * ODsay 응답의 subPath 하나가 주어진 시각에 운행 가능한지 확인.
 *  - trafficType 1(지하철): 서울 운행 시간 기준
 *  - trafficType 2(버스): TAGO 노선 유형으로 확인
 *  - 그 외(도보): 항상 true
 */
export async function isSubPathRunnable(sp: any, hour: number): Promise<boolean> {
  // 도보
  if (sp.trafficType !== 1 && sp.trafficType !== 2) return true;

  // 지하철 (01:00~05:29 운행 없음)
  if (sp.trafficType === 1) {
    return !(hour >= 1 && hour < 6);
  }

  // 버스
  if (sp.trafficType === 2) {
    // 낮 시간(06:00~00:59)은 일반버스 운행 → pass
    if (hour >= 6 || hour === 0) return true;

    // 01:00~05:59: 확실한 낮 전용 노선 유형만 차단, 나머지는 ODsay를 신뢰
    const lanes: any[] = sp.lane || [];
    const busNos = lanes.map((l: any) => l.busNo || l.name || '').filter(Boolean);
    if (busNos.length === 0) return false;

    const routeTypes = await Promise.all(busNos.map(no => fetchRouteType(no)));
    // 하나라도 낮 전용이 아닌 버스가 있으면 통과 (null = 불명 → 신뢰)
    return routeTypes.some(rt => !DAY_ONLY_TYPES.has(rt ?? ''));
  }

  return true;
}

/** 하나의 경로(path)가 주어진 시각에 완주 가능한지 확인 */
export async function isPathRunnable(path: any, departureDate: Date): Promise<boolean> {
  const hour = departureDate.getHours();

  for (const sp of (path.subPath || [])) {
    const runnable = await isSubPathRunnable(sp, hour);
    if (!runnable) return false;
  }
  return true;
}
