import type { VercelRequest, VercelResponse } from '@vercel/node';

const BASE = 'http://ws.bus.go.kr/api/rest';
const KEY = process.env.SEOUL_BUS_API_KEY || '';
const ROUTE_KEY = process.env.SEOUL_BUS_ROUTE_API_KEY || KEY;

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
  if (routeOnly && routeNo) {
    try {
      const routeData = await fetchJson(
        `${BASE}/busRouteInfo/getBusRouteList?serviceKey=${ROUTE_KEY}&strSrch=${encodeURIComponent(routeNo)}&resultType=json`
      );
      const routes = toItems(routeData);
      const candidates = routes.filter((r: any) => r.busRouteAbrv === routeNo || r.busRouteNm === routeNo);
      const route = candidates[0] || routes[0];
      if (!route) return res.json({ found: false });
      return res.json({
        found: true,
        busRouteId: route.busRouteId,
        firstBusTm: route.firstBusTm || '',
        lastBusTm: route.lastBusTm || '',
        routeType: route.routeType || '',
      });
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
