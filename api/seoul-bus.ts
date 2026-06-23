import type { VercelRequest, VercelResponse } from '@vercel/node';

const BASE = 'http://ws.bus.go.kr/api/rest';
const KEY = process.env.SEOUL_BUS_API_KEY || '';

const toItems = (data: any): any[] => {
  const items = data?.ServiceResult?.msgBody?.itemList;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { stationName, routeNo } = req.query as Record<string, string>;

  try {
    // 1. 정류소명 → arsId
    const stationUrl = `${BASE}/stationinfo/getStationByName?serviceKey=${KEY}&stSrch=${encodeURIComponent(stationName)}&resultType=json`;
    const stationRes = await fetch(stationUrl);
    const stationData = await stationRes.json();
    const stations = toItems(stationData);

    if (stations.length === 0) {
      return res.json({ stationName, arsId: '', arrivals: [] });
    }

    const arsId = stations[0].arsId;
    const foundStationName = stations[0].stNm || stationName;

    // 2. arsId → 도착 정보 (전체 버스 — getLowArrInfoByStId는 저상버스만 조회되어 제외)
    const arrUrl = `${BASE}/arrive/getArrInfoByStId?serviceKey=${KEY}&arsId=${arsId}&resultType=json`;
    const arrRes = await fetch(arrUrl);
    const arrData = await arrRes.json();
    let arrivals = toItems(arrData).map((item: any) => ({
      routeNo: item.rtNm || '',
      arrMsg: item.arrmsg1 || '',
      arrMsg2: item.arrmsg2 || '',
      remainStop: 0,
      arrtime: 0,
    }));

    if (routeNo) {
      arrivals = arrivals.filter((a: any) => a.routeNo.includes(routeNo));
    }

    res.json({ stationName: foundStationName, arsId, arrivals: arrivals.slice(0, 6) });
  } catch (e: any) {
    res.json({ error: e.message, arrivals: [] });
  }
}
