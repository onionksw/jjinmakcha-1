import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { stationName, routeName } = req.query;
  if (!stationName || typeof stationName !== 'string') {
    return res.status(400).json({ error: 'stationName 파라미터 필요' });
  }

  const TMAP_KEY = process.env.VITE_TMAP_APP_KEY || '';

  try {
    // 1. 정류소 검색으로 stationId 획득
    const searchUrl = `https://apis.openapi.sk.com/tmap/transit/pois/busStations?version=1&searchKeyword=${encodeURIComponent(stationName)}&count=3`;
    const searchRes = await fetch(searchUrl, {
      headers: { appKey: TMAP_KEY, accept: 'application/json' }
    });
    const searchData = await searchRes.json();

    const stations = searchData?.result?.station || [];
    if (stations.length === 0) {
      return res.json({ arrivals: [] });
    }

    // 첫 번째 정류소의 도착 정보 조회
    const stationId = stations[0].stationId;
    const arrivalUrl = `https://apis.openapi.sk.com/tmap/transit/realtimeBusArrival?version=1&stationId=${stationId}`;
    const arrivalRes = await fetch(arrivalUrl, {
      headers: { appKey: TMAP_KEY, accept: 'application/json' }
    });
    const arrivalData = await arrivalRes.json();

    const arrivals = (arrivalData?.result?.bus || []).map((b: any) => ({
      routeName: b.routeName || '',
      arrivalTime: b.arrivalTime || '',
      remainStop: b.remainStop || 0,
      remainSeat: b.remainSeat,
    }));

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.json({ stationName: stations[0].stationName, arrivals });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
