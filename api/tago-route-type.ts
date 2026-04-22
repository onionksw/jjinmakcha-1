import type { VercelRequest, VercelResponse } from '@vercel/node';

const KEY = process.env.TAGO_API_KEY || '';
const BASE = 'https://apis.data.go.kr/1613000';

const toItems = (data: any): any[] => {
  const item = data?.response?.body?.items?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { cityCode = '11', routeNo } = req.query;

  if (!KEY) return res.json({ routetp: null, error: 'NO_KEY' });
  if (!routeNo) return res.json({ routetp: null });

  try {
    const url = `${BASE}/BusRouteInfoInqireService/getRouteNoList`
      + `?serviceKey=${KEY}&cityCode=${cityCode}`
      + `&routeNo=${encodeURIComponent(String(routeNo))}`
      + `&_type=json&numOfRows=5`;

    const r = await fetch(url);
    const data = await r.json();
    const items = toItems(data);

    // 정확히 일치하는 노선 우선, 없으면 첫 번째
    const match = items.find((i: any) => i.routeno === String(routeNo)) || items[0];

    return res.json(match
      ? { routetp: match.routetp ?? null, routeid: match.routeid ?? null }
      : { routetp: null }
    );
  } catch (e: any) {
    return res.status(500).json({ error: e.message, routetp: null });
  }
}
