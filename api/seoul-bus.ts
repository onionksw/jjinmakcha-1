import type { VercelRequest, VercelResponse } from '@vercel/node';

const BASE = 'http://ws.bus.go.kr/api/rest';
const KEY = process.env.SEOUL_BUS_API_KEY || '';
const ROUTE_KEY = process.env.SEOUL_BUS_ROUTE_API_KEY || KEY;
// GBIS(경기)·인천버스는 data.go.kr 계정 단위 일반 인증키를 그대로 씀(TAGO와 동일 계정)
const DATA_GO_KR_KEY = process.env.TAGO_API_KEY || '';

interface RouteSchedule { found: true; busRouteId: string; firstBusTm: string; lastBusTm: string; routeType: string }

// 서울 버스인지 노선번호로 조회 — 있으면 첫차/막차를 "HH:MM"으로 변환해 반환
async function tryScheduleSeoul(routeNo: string): Promise<RouteSchedule | null> {
  const data = await fetchJson(
    `${BASE}/busRouteInfo/getBusRouteList?serviceKey=${ROUTE_KEY}&strSrch=${encodeURIComponent(routeNo)}&resultType=json`
  ).catch(() => null);
  if (!data) return null;
  const routes = toItems(data);
  const candidates = routes.filter((r: any) => r.busRouteAbrv === routeNo || r.busRouteNm === routeNo);
  const route = candidates[0] || routes[0];
  if (!route) return null;
  // 서울 API는 "yyyyMMddHHmmss" 형식으로 줌 — HH:MM만 추출
  const toHHMM = (t: string) => (t && t.length >= 12) ? `${t.slice(8, 10)}:${t.slice(10, 12)}` : '';
  return {
    found: true,
    busRouteId: route.busRouteId,
    firstBusTm: toHHMM(route.firstBusTm || ''),
    lastBusTm: toHHMM(route.lastBusTm || ''),
    routeType: route.routeType || '',
  };
}

// 경기도(GBIS) — 노선번호로 검색 후 상세 조회, 상/하행 중 더 이른 첫차·더 늦은 막차 사용
async function tryScheduleGyeonggi(routeNo: string): Promise<RouteSchedule | null> {
  try {
    const listRes = await fetch(
      `https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteListv2?serviceKey=${DATA_GO_KR_KEY}&keyword=${encodeURIComponent(routeNo)}&format=json&numOfRows=20&pageNo=1`
    );
    const listData = await listRes.json();
    const rawList = listData?.response?.msgBody?.busRouteList;
    const list = Array.isArray(rawList) ? rawList : (rawList ? [rawList] : []);
    const match = list.find((r: any) => String(r.routeName) === routeNo) || list[0];
    if (!match) return null;

    const infoRes = await fetch(
      `https://apis.data.go.kr/6410000/busrouteservice/v2/getBusRouteInfoItemv2?serviceKey=${DATA_GO_KR_KEY}&routeId=${match.routeId}&format=json`
    );
    const infoData = await infoRes.json();
    const item = infoData?.response?.msgBody?.busRouteInfoItem;
    if (!item) return null;

    const firsts = [item.upFirstTime, item.downFirstTime].filter(Boolean).sort();
    const lasts = [item.upLastTime, item.downLastTime].filter(Boolean).sort();
    return {
      found: true,
      busRouteId: String(match.routeId),
      firstBusTm: firsts[0] || '',
      lastBusTm: lasts[lasts.length - 1] || '',
      routeType: String(item.routeTypeCd ?? ''),
    };
  } catch {
    return null;
  }
}

// 인천 — 노선번호로 직접 첫차/막차 조회(routeId 없이 바로 됨)
async function tryScheduleIncheon(routeNo: string): Promise<RouteSchedule | null> {
  try {
    const r = await fetch(
      `https://apis.data.go.kr/6280000/busRouteService/getBusRouteNo?routeNo=${encodeURIComponent(routeNo)}&numOfRows=10&pageNo=1&serviceKey=${DATA_GO_KR_KEY}`
    );
    const text = await r.text();
    if (text.trimStart().startsWith('<')) return null; // XML 에러 응답
    const data = JSON.parse(text);
    const rawList = data?.ServiceResult?.msgBody?.itemList;
    const list = Array.isArray(rawList) ? rawList : (rawList ? [rawList] : []);
    const match = list.find((r: any) => r.ROUTENO === routeNo) || list[0];
    if (!match) return null;
    const toHHMM = (t: string) => (t && t.length === 4) ? `${t.slice(0, 2)}:${t.slice(2, 4)}` : '';
    return {
      found: true,
      busRouteId: String(match.ROUTEID ?? ''),
      firstBusTm: toHHMM(match.FBUS_DEPHMS || ''),
      lastBusTm: toHHMM(match.LBUS_DEPHMS || ''),
      routeType: String(match.ROUTETPCD ?? ''),
    };
  } catch {
    return null;
  }
}

// arrmsg1/2는 "2분31초후[1번째 전]" 형태 — 대괄호 안 숫자가 실제 남은 정류장 수.
// traTime1/2는 도착까지 남은 '초' 단위 시간이라 정류장 수가 아님.
const extractStopCount = (msg: string): number => {
  const m = (msg || '').match(/\[(\d+)번째\s*전\]/);
  return m ? Number(m[1]) : 0;
};

const toItems = (data: any): any[] => {
  const items = data?.msgBody?.itemList ?? data?.ServiceResult?.msgBody?.itemList;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
};

const fetchJson = async (url: string) => {
  const res = await fetch(url);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error(`XML응답: ${text.slice(0, 120)}`);
  return JSON.parse(text);
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { stationName, routeNo, routeOnly } = req.query as Record<string, string>;

  // 정류소 없이 노선 자체의 첫차/막차 시각만 필요할 때 (시각 지정 경로 검증용)
  // 서울 → 경기(GBIS) → 인천 순으로 시도, 먼저 찾은 결과 사용 (셋 다 같은 노선번호
  // 체계를 공유하지 않아 지역을 미리 알 수 없으므로 순차 조회로 해결)
  if (routeOnly && routeNo) {
    try {
      const found = await tryScheduleSeoul(routeNo)
        ?? await tryScheduleGyeonggi(routeNo)
        ?? await tryScheduleIncheon(routeNo);
      return res.json(found ?? { found: false });
    } catch (e: any) {
      return res.json({ found: false, error: e.message });
    }
  }

  try {
    // 1. 정류소명 → stId(9자리 고유ID) + arsId(5자리 안내번호)
    const stationData = await fetchJson(
      `${BASE}/stationinfo/getStationByName?serviceKey=${KEY}&stSrch=${encodeURIComponent(stationName)}&resultType=json`
    );
    const stations = toItems(stationData);

    if (stations.length === 0) {
      return res.json({ stationName, arsId: '', arrivals: [], ...(req.query.debug ? { _debug: stationData } : {}) });
    }

    // stId = 정류소 고유 ID (9자리), arsId = 정류소 안내번호 (5자리)
    // stations[0]만 쓰지 않고 검색된 전체 목록 유지 (이름 검색은 다른 정류소를 첫 결과로 줄 수 있음)
    const allStIds = new Set(stations.map((s: any) => s.stId));
    const allArsIds = new Set(stations.map((s: any) => s.arsId));
    const stId = stations[0].stId;
    const arsId = stations[0].arsId;
    const foundStationName = stations[0].stNm || stationName;
    // 이름 매칭용 — "서교동 정류장" → "서교동"
    const nameKey = stationName.replace(/정류장$|정류소$/, '').trim();

    // 2. routeNo가 있으면 getBusRouteList로 busRouteId 획득 후 getArrInfoByRouteAllList 조회
    let _routeDebug: any = null;
    let _allStopsDebug: any[] = [];
    if (routeNo) {
      try {
        const routeData = await fetchJson(
          `${BASE}/busRouteInfo/getBusRouteList?serviceKey=${ROUTE_KEY}&strSrch=${encodeURIComponent(routeNo)}&resultType=json`
        );
        const routes = toItems(routeData);
        _routeDebug = { routeCount: routes.length, routes };

        // busRouteAbrv가 일치하는 노선 전부 시도 (같은 번호여도 인천·경기 등 여러 운영사 있음)
        const candidates = routes.filter((r: any) => r.busRouteAbrv === routeNo || r.busRouteNm === routeNo);
        if (candidates.length === 0 && routes.length > 0) candidates.push(routes[0]);

        let foundArrivals: any[] | null = null;

        for (const route of candidates) {
          if (!route.busRouteId) continue;
          let stopCount = 0;
          let myCount = 0;
          try {
            const allData = await fetchJson(
              `${BASE}/arrive/getArrInfoByRouteAllList?serviceKey=${KEY}&busRouteId=${route.busRouteId}&resultType=json`
            );
            const allStops = toItems(allData);
            stopCount = allStops.length;
            // stId/arsId 집합 매칭 OR 정류소 이름 매칭 (이름 검색 첫결과가 틀렸을 때 대비)
            const myStops = allStops.filter((item: any) =>
              allStIds.has(item.stId) || allArsIds.has(item.arsId) ||
              (nameKey && item.stNm && item.stNm.replace(/정류장$|정류소$/, '').includes(nameKey))
            );
            myCount = myStops.length;
            if (myStops.length > 0 && !foundArrivals) {
              foundArrivals = myStops.map((item: any) => ({
                routeNo: item.rtNm || routeNo,
                arrMsg: item.arrmsg1 || '',
                arrMsg2: item.arrmsg2 || '',
                remainStop: extractStopCount(item.arrmsg1),
                arrtime: 0,
                routeType: item.routeType || '',
              }));
            }
          } catch (e: any) {
            _allStopsDebug.push({ busRouteId: route.busRouteId, routeNm: route.busRouteNm, error: e.message });
            continue;
          }
          _allStopsDebug.push({ busRouteId: route.busRouteId, routeNm: route.busRouteNm, stopCount, myCount });
        }

        if (foundArrivals && foundArrivals.length > 0) {
          if (req.query.debug) return res.json({ stationName: foundStationName, arsId, stId, arrivals: foundArrivals, _source: 'getArrInfoByRouteAllList', _routeDebug, _allStopsDebug });
          return res.json({ stationName: foundStationName, arsId, arrivals: foundArrivals });
        }
      } catch (e: any) {
        if (!_routeDebug) _routeDebug = { error: e.message };
      }
    }

    // 3. fallback: getLowArrInfoByStId — 검색된 정류소 전부 시도해서 routeNo 있는 첫 결과 사용
    let arrivals: any[] = [];
    for (const st of stations.slice(0, 5)) {
      const arrData = await fetchJson(
        `${BASE}/arrive/getLowArrInfoByStId?serviceKey=${KEY}&stId=${st.stId}&resultType=json`
      ).catch(() => null);
      if (!arrData) continue;
      let cands = toItems(arrData).map((item: any) => ({
        routeNo: item.rtNm || '',
        arrMsg: item.arrmsg1 || '',
        arrMsg2: item.arrmsg2 || '',
        remainStop: extractStopCount(item.arrmsg1),
        arrtime: 0,
      }));
      if (routeNo) cands = cands.filter((a: any) => a.routeNo.includes(routeNo));
      if (cands.length > 0) { arrivals = cands; break; }
    }

    if (req.query.debug) return res.json({ stationName: foundStationName, arsId, stId, arrivals: arrivals.slice(0, 6), _source: 'getLowArrInfoByStId', _routeDebug, _allStopsDebug });
    res.json({ stationName: foundStationName, arsId, arrivals: arrivals.slice(0, 6) });
  } catch (e: any) {
    res.json({ error: e.message, arrivals: [] });
  }
}
