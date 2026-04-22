import type { VercelRequest, VercelResponse } from '@vercel/node';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'onion!@34';

async function kvGet(key: string): Promise<number> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) return 0;
  try {
    const res = await fetch(`${url}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    return parseInt(data.result || '0', 10) || 0;
  } catch {
    return 0;
  }
}

// 최근 N일 일별 데이터 조회
async function kvGetDailyStats(event: string, days: number): Promise<{ date: string; count: number }[]> {
  const result: { date: string; count: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const date = d.toISOString().split('T')[0];
    const count = await kvGet(`stat:${event}:${date}`);
    result.push({ date, count });
  }
  return result;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const password = (req.query.password || req.body?.password) as string;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: '비밀번호가 틀렸습니다' });
  }

  const [visit, search, signup, taxi] = await Promise.all([
    kvGet('stat:visit'),
    kvGet('stat:search'),
    kvGet('stat:signup'),
    kvGet('stat:taxi'),
  ]);

  const daily = await Promise.all([
    kvGetDailyStats('visit', 7),
    kvGetDailyStats('search', 7),
  ]);

  res.json({
    totals: { visit, search, signup, taxi },
    daily: { visit: daily[0], search: daily[1] },
  });
}
