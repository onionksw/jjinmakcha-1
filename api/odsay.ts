import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_KEY = process.env.ODSAY_API_KEY || '';
const BASE = 'https://api.odsay.com/v1/api';
// Vercel이 자동 제공하는 URL 또는 직접 설정한 URL
const SITE_URL = process.env.ODSAY_REFERER
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const { SX, SY, EX, EY, SearchType, SearchDate, SearchTime } = req.query as Record<string, string>;

  if (!API_KEY) {
    return res.status(500).json({ error: [{ code: 'NO_KEY', message: 'ODSAY_API_KEY 환경변수가 설정되지 않았습니다' }] });
  }
  try {
    let url = `${BASE}/searchPubTransPathT?SX=${SX}&SY=${SY}&EX=${EX}&EY=${EY}&apiKey=${API_KEY}`;
    if (SearchType) url += `&SearchType=${SearchType}`;
    if (SearchDate) url += `&SearchDate=${SearchDate}`;
    if (SearchTime) url += `&SearchTime=${SearchTime}`;
    console.log('ODsay 호출 Referer:', SITE_URL);
    const r = await fetch(url, {
      headers: {
        'Referer': SITE_URL,
        'Origin': SITE_URL,
        'User-Agent': 'Mozilla/5.0',
      },
    });
    const data = await r.json();
    res.setHeader('X-Proxy', 'odsay-vercel');
    res.json(data);
  } catch (e: any) {
    res.status(500).json({ error: [{ code: '500', message: e.message }] });
  }
}
