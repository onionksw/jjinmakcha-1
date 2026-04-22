import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getGoogleAccessToken } from './_sheetsAuth';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'onion!@34';
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '';

type EventKey = 'visit' | 'search' | 'signup' | 'taxi';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const password = (req.query.password || req.body?.password) as string;
  if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: '비밀번호가 틀렸습니다' });

  if (!SHEET_ID) return res.status(500).json({ error: 'GOOGLE_SHEET_ID 환경변수 미설정' });

  try {
    const token = await getGoogleAccessToken();

    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Log!A:B`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await r.json();
    const rows: string[][] = data.values || [];

    // 첫 행은 헤더(timestamp, event) → 제외
    const logs = rows.slice(1).filter(row => row.length >= 2);

    const totals: Record<EventKey, number> = { visit: 0, search: 0, signup: 0, taxi: 0 };
    const dailyMap: Record<string, Record<EventKey, number>> = {};

    for (const [ts, ev] of logs) {
      if (!ev || !(ev in totals)) continue;
      totals[ev as EventKey]++;
      const date = ts.slice(0, 10); // "YYYY-MM-DD"
      if (!dailyMap[date]) dailyMap[date] = { visit: 0, search: 0, signup: 0, taxi: 0 };
      dailyMap[date][ev as EventKey]++;
    }

    // 최근 7일 집계
    const visitDaily: { date: string; count: number }[] = [];
    const searchDaily: { date: string; count: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);
      const day = dailyMap[date] ?? { visit: 0, search: 0, signup: 0, taxi: 0 };
      visitDaily.push({ date, count: day.visit });
      searchDaily.push({ date, count: day.search });
    }

    res.json({
      totals,
      daily: { visit: visitDaily, search: searchDaily },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
