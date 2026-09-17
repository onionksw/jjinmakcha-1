import type { VercelRequest, VercelResponse } from '@vercel/node';

const API_KEY = process.env.ODSAY_API_KEY || '';
const BASE = 'https://api.odsay.com/v1/api';
// Vercel이 자동 제공하는 URL 또는 직접 설정한 URL
const SITE_URL = process.env.ODSAY_REFERER
  || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

const TMAP_KEY = process.env.TMAP_APP_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { type, SX, SY, EX, EY, SearchType, SearchDate, SearchTime } = req.query as Record<string, string>;

  // TMAP 대중교통(시각 지정 검색용, searchDttm) — ODsay와는 별개 제공사라 파일
  // 하나 더 만드는 대신 이 파일에 type 파라미터로 얹음 (Vercel Hobby 12개 파일 제한)
  if (type === 'tmap-transit') {
    if (!TMAP_KEY) {
      return res.status(500).json({ error: 'TMAP_APP_KEY 환경변수가 설정되지 않았습니다' });
    }
    const { startX, startY, endX, endY, searchDttm, count } = req.query as Record<string, string>;
    const body = JSON.stringify({
      startX, startY, endX, endY,
      count: count ? Number(count) : 10,
      ...(searchDttm ? { searchDttm } : {}),
    });
    try {
      const r = await fetch('https://apis.openapi.sk.com/transit/routes', {
        method: 'POST',
        headers: { accept: 'application/json', appKey: TMAP_KEY, 'content-type': 'application/json' },
        body,
      });
      const data = await r.json();
      if (data?.error) {
        return res.status(500).json({ error: data.error, _debugSentBody: body, _debugKeyLen: TMAP_KEY.length, _debugStatus: r.status });
      }
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  }

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
