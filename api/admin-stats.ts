import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SignJWT, importPKCS8 } from 'jose';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'onion!@34';
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '';

type EventKey = 'visit' | 'search' | 'signup' | 'taxi';

async function getToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const rawKey = (process.env.GOOGLE_PRIVATE_KEY!).replace(/\\n/g, '\n');
  const privateKey = await importPKCS8(rawKey, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .sign(privateKey)
    .then(async (jwt) => {
      const r = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
      });
      const data = await r.json();
      if (!data.access_token) throw new Error('토큰 발급 실패: ' + JSON.stringify(data));
      return data.access_token as string;
    });
}

function emptyDaily(days: number) {
  return Array.from({ length: days }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    return { date: d.toISOString().slice(0, 10), count: 0 };
  });
}

function emptyResponse(notice: string, days: number = 7) {
  return { totals: { visit: 0, search: 0, signup: 0, taxi: 0 }, daily: { visit: emptyDaily(days), search: emptyDaily(days) }, notice };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const password = (req.query.password || req.body?.password) as string;
    if (password !== ADMIN_PASSWORD) return res.status(401).json({ error: '비밀번호가 틀렸습니다' });

    const daysParam = (req.query.days as string) || '7';

    if (!SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
      return res.json(emptyResponse('Google Sheets 환경변수 미설정', daysParam === 'all' ? 7 : Math.min(Math.max(parseInt(daysParam, 10) || 7, 1), 365)));
    }

    const token = await getToken();
    const range = encodeURIComponent('Log!A:B');
    const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
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

    // days=all이면 가장 오래된 로그 날짜까지, 아니면 요청한 일수만큼 (최대 365일)
    let rangeDays: number;
    if (daysParam === 'all') {
      const allDates = Object.keys(dailyMap).sort();
      if (allDates.length === 0) {
        rangeDays = 7;
      } else {
        const earliest = new Date(allDates[0]);
        const todayMidnight = new Date();
        todayMidnight.setHours(0, 0, 0, 0);
        rangeDays = Math.max(1, Math.round((todayMidnight.getTime() - earliest.getTime()) / 86400000) + 1);
      }
    } else {
      rangeDays = Math.min(Math.max(parseInt(daysParam, 10) || 7, 1), 365);
    }

    const visitDaily: { date: string; count: number }[] = [];
    const searchDaily: { date: string; count: number }[] = [];
    for (let i = rangeDays - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const date = d.toISOString().slice(0, 10);
      const day = dailyMap[date] ?? { visit: 0, search: 0, signup: 0, taxi: 0 };
      visitDaily.push({ date, count: day.visit });
      searchDaily.push({ date, count: day.search });
    }

    res.json({ totals, daily: { visit: visitDaily, search: searchDaily } });
  } catch (e: any) {
    res.json(emptyResponse(`오류: ${e?.message ?? String(e)}`));
  }
}
