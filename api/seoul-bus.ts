import type { VercelRequest, VercelResponse } from '@vercel/node';

const BASE = 'http://ws.bus.go.kr/api/rest';
const KEY = process.env.SEOUL_BUS_API_KEY || '';
const ROUTE_KEY = process.env.SEOUL_BUS_ROUTE_API_KEY || KEY;

const toItems = (data: any): any[] => {
  const items = data?.msgBody?.itemList ?? data?.ServiceResult?.msgBody?.itemList;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { stationName, routeNo } = req.query as Record<string, string>;

  try {
    // 1. 정류소명 → stId(9자리 고유ID) + arsId(5자리 안내번호)
    const stationUrl = `${BASE}/stationinfo/getStationByName?serviceKey=${KEY}&stSrch=${encodeURIComponent(stationName)}&resultType=json`;
    const stationData = await (await fetch(stationUrl)).json();
    const stations = toItems(stationData);

    if (stations.length === 0) {
      return res.json({ stationName, arsId: '', arrivals: [], ...(req.query.debug ? { _debug: stationData } : {}) });
    }

    // 가이드 기준: stId = 정류소 고유 ID (9자리), arsId = 정류소 안내번호 (5자리)
    // 이전 버그: arsId(5자리)를 stId 파라미터 자리에 넘겨 도착 정보 조회 실패했음
    const stId = stations[0].stId;
    const arsId = stations[0].arsId;
    const foundStationName = stations[0].stNm || stationName;

    // 2. routeNo가 있으면 getArrInfoByRouteAllList로 전체버스 조회 (인천·경기 포함)
    let _routeDebug: any = null;
    let _allStopsDebug: any = null;
    if (routeNo) {
      try {
        // BusRouteInfoService.getBusRouteList → busRouteId 획득 (노선정보조회 서비스 전용 키 사용)
        const routeUrl = `${BASE}/busRouteInfo/getBusRouteList?serviceKey=${ROUTE_KEY}&strSrch=${encodeURIComponent(routeNo)}&resultType=json`;
        const routeRaw = await fetch(routeUrl);
        const routeText = await routeRaw.text();
        // HTML 응답이면 인증 실패 — 그대로 에러로 노출
        if (routeText.trimStart().startsWith('<') && routeText.includes('DOCTYPE')) {
          throw new Error(`busRouteInfo HTML 오류: ROUTE_KEY 길이=${ROUTE_KEY.length}, 앞4자=${ROUTE_KEY.slice(0,4)}`);
        }
        const routeData = JSON.parse(routeText);
        const routes = toItems(routeData);
        _routeDebug = { raw: routeData, routes, keyLen: ROUTE_KEY.length, keyPrefix: ROUTE_KEY.slice(0,4) };

        // busRouteAbrv = 안내용 노선명(예: "1200"), busRouteNm = DB관리용 노선명
        const matched = routes.find((r: any) => r.busRouteAbrv === routeNo || r.busRouteNm === routeNo) ?? routes[0];

        if (matched?.busRouteId) {
          // getArrInfoByRouteAllList: 해당 노선 전 정류소 도착예정 — 인천(routeType=7), 경기(routeType=8) 포함
          const allUrl = `${BASE}/arrive/getArrInfoByRouteAllList?serviceKey=${KEY}&busRouteId=${matched.busRouteId}&resultType=json`;
          const allData = await (await fetch(allUrl)).json();
          const allStops = toItems(allData);
          _allStopsDebug = { busRouteId: matched.busRouteId, totalStops: allStops.length, sampleStop: allStops[0] };

          // stId 또는 arsId 기준으로 우리 정류소 항목만 필터
          const myStops = allStops.filter((item: any) =>
            item.stId === stId || item.arsId === arsId
          );

          if (myStops.length > 0) {
            const arrivals = myStops.map((item: any) => ({
              routeNo: item.rtNm || routeNo,
              arrMsg: item.arrmsg1 || '',
              arrMsg2: item.arrmsg2 || '',
              remainStop: parseInt(item.traTime1 ?? '0') || 0,
              arrtime: 0,
              routeType: item.routeType || '',
            }));
            if (req.query.debug) return res.json({ stationName: foundStationName, arsId, stId, arrivals, _source: 'getArrInfoByRouteAllList', _routeDebug, _allStopsDebug });
            return res.json({ stationName: foundStationName, arsId, arrivals });
          }
        }
      } catch (e: any) {
        _routeDebug = { error: e.message };
      }
    }

    // 3. fallback: getLowArrInfoByStId (저상버스 전체 — stId 파라미터 버그 수정)
    const arrUrl = `${BASE}/arrive/getLowArrInfoByStId?serviceKey=${KEY}&stId=${stId}&resultType=json`;
    const arrData = await (await fetch(arrUrl)).json();
    let arrivals = toItems(arrData).map((item: any) => ({
      routeNo: item.rtNm || '',
      arrMsg: item.arrmsg1 || '',
      arrMsg2: item.arrmsg2 || '',
      remainStop: parseInt(item.traTime1 ?? '0') || 0,
      arrtime: 0,
    }));

    if (routeNo) {
      arrivals = arrivals.filter((a: any) => a.routeNo.includes(routeNo));
    }

    if (req.query.debug) return res.json({ stationName: foundStationName, arsId, stId, arrivals: arrivals.slice(0, 6), _source: 'getLowArrInfoByStId', _debug: arrData, _routeDebug, _allStopsDebug });
    res.json({ stationName: foundStationName, arsId, arrivals: arrivals.slice(0, 6) });
  } catch (e: any) {
    res.json({ error: e.message, arrivals: [] });
  }
}
