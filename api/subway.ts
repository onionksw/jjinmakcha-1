import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { station } = req.query;
  if (!station || typeof station !== 'string') {
    return res.status(400).json({ error: 'station 파라미터 필요' });
  }

  const key = process.env.SEOUL_SUBWAY_API_KEY || 'sample';
  const url = `http://swopenAPI.seoul.go.kr/api/subway/${key}/json/realtimeStationArrival/0/5/${encodeURIComponent(station)}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.json(data);
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
