import type { VercelRequest, VercelResponse } from '@vercel/node';

const BASE = 'http://ws.bus.go.kr/api/rest';
const KEY = process.env.SEOUL_BUS_API_KEY || '';

const toItems = (data: any): any[] => {
  // JSON 응답은 XML과 달리 ServiceResult 래퍼가 없음
  const items = data?.msgBody?.itemList ?? data?.ServiceResult?.msgBody?.itemList;
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

    // 2. arsId → 도착 정보
    // 공식 활용가이드 기준 "버스도착정보조회 서비스"에는 stId만으로 조회 가능한
    // 전체버스용 함수가 없고, getLowArrInfoByStIdList(저상버스 한정)만 존재함
    const arrUrl = `${BASE}/arrive/getLowArrInfoByStId?serviceKey=${KEY}&arsId=${arsId}&resultType=json`;
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
