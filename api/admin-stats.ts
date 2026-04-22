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

  const emptyDaily = () => Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return { date: d.toISOString().slice(0, 10), count: 0 };
  });

  if (!SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
    return res.json({
      totals: { visit: 0, search: 0, signup: 0, taxi: 0 },
      daily: { visit: emptyDaily(), search: emptyDaily() },
      notice: 'Google Sheets 환경변수 미설정 — 데이터 없음',
    });
  }

  try {
    const token = await getGoogleAccessToken();

    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/Log!A:B`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await r.json();
    const rows: string[][] = data.values || [];

    const logs = rows.slice(1).filter(row => row.length >= 2);

    const totals: Record<EventKey, number> = { visit: 0, search: 0, signup: 0, taxi: 0 };
    const dailyMap: Record<string, Record<EventKey, number>> = {};

    for (const [ts, ev] of logs) {
      if (!ev || !(ev in totals)) continue;
      totals[ev as EventKey]++;
      const date = ts.slice(0, 10);
      if (!dailyMap[date]) dailyMap[date] = { visit: 0, search: 0, signup: 0, taxi: 0 };
      dailyMap[date][ev as EventKey]++;
    }

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
    // Sheets API 호출 실패 시에도 빈 데이터로 응답
    res.json({
      totals: { visit: 0, search: 0, signup: 0, taxi: 0 },
      daily: { visit: emptyDaily(), search: emptyDaily() },
      notice: `Sheets 오류: ${e.message}`,
    });
  }
}
