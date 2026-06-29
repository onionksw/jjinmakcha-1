import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SignJWT, importPKCS8 } from 'jose';

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'onion!@34';
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '';

type EventKey = 'visit' | 'search' | 'signup' | 'taxi';
const WEEKDAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// 로그 타임스탬프(UTC ISO)를 KST로 보정 — 새벽 막차 시간대가 전날로 잘못 집계되는 것 방지
function kstDate(ts: string): Date {
  return new Date(new Date(ts).getTime() + KST_OFFSET_MS);
}
function kstDateStr(ts: string): string {
  return kstDate(ts).toISOString().slice(0, 10);
}
function kstHour(ts: string): number {
  return kstDate(ts).getUTCHours();
}
function kstWeekday(ts: string): number {
  return kstDate(ts).getUTCDay();
}

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
  return {
    totals: { visit: 0, search: 0, signup: 0, taxi: 0 },
    daily: { visit: emptyDaily(days), search: emptyDaily(days) },
    hourly: Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 })),
    weekday: WEEKDAY_NAMES.map(day => ({ day, count: 0 })),
    funnel: { visitToSignup: 0, signupToSearch: 0, searchToTaxi: 0 },
    growth: { visit: { current: 0, previous: 0, pct: 0 } },
    notice,
  };
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
    const rawLogs = rows.slice(1).filter(row => row.length >= 2);

    const totals: Record<EventKey, number> = { visit: 0, search: 0, signup: 0, taxi: 0 };
    const dailyMap: Record<string, Record<EventKey, number>> = {};

    const logs = rawLogs
      .filter(([ts, ev]) => ts && ev && ev in totals)
      .map(([ts, ev]) => ({ ts, ev: ev as EventKey, dateStr: kstDateStr(ts) }));

    for (const { ev, dateStr } of logs) {
      totals[ev]++;
      if (!dailyMap[dateStr]) dailyMap[dateStr] = { visit: 0, search: 0, signup: 0, taxi: 0 };
      dailyMap[dateStr][ev]++;
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

    const todayKST = kstDateStr(new Date().toISOString());
    const buildDateRange = (offsetStart: number, count: number): string[] => {
      const result: string[] = [];
      for (let i = count - 1; i >= 0; i--) {
        const d = new Date(todayKST);
        d.setUTCDate(d.getUTCDate() - (offsetStart + i));
        result.push(d.toISOString().slice(0, 10));
      }
      return result;
    };

    const rangeDates = buildDateRange(0, rangeDays);
    const visitDaily = rangeDates.map(date => ({ date, count: dailyMap[date]?.visit ?? 0 }));
    const searchDaily = rangeDates.map(date => ({ date, count: dailyMap[date]?.search ?? 0 }));

    // 시간대별 / 요일별 사용 패턴 (검색 이벤트, 선택된 기간 내, KST 기준) — 막차 서비스 특성상 새벽 시간대 집중도 확인용
    const rangeSet = new Set(rangeDates);
    const hourlyCounts = Array(24).fill(0);
    const weekdayCounts = Array(7).fill(0);
    for (const { ts, ev, dateStr } of logs) {
      if (ev !== 'search' || !rangeSet.has(dateStr)) continue;
      hourlyCounts[kstHour(ts)]++;
      weekdayCounts[kstWeekday(ts)]++;
    }
    const hourly = hourlyCounts.map((count, hour) => ({ hour, count }));
    const weekday = weekdayCounts.map((count, i) => ({ day: WEEKDAY_NAMES[i], count }));

    // 전환율 (전체 누적 기준): 방문 → 가입 → 경로검색 → 택시호출
    const pct = (num: number, den: number) => den > 0 ? Math.round((num / den) * 1000) / 10 : 0;
    const funnel = {
      visitToSignup: pct(totals.signup, totals.visit),
      signupToSearch: pct(totals.search, totals.signup),
      searchToTaxi: pct(totals.taxi, totals.search),
    };

    // 직전 동일 기간 대비 방문자 성장률
    const prevRangeDates = buildDateRange(rangeDays, rangeDays);
    const currentVisitTotal = visitDaily.reduce((s, d) => s + d.count, 0);
    const previousVisitTotal = prevRangeDates.reduce((s, date) => s + (dailyMap[date]?.visit ?? 0), 0);
    const growthPct = previousVisitTotal > 0
      ? Math.round(((currentVisitTotal - previousVisitTotal) / previousVisitTotal) * 1000) / 10
      : (currentVisitTotal > 0 ? 100 : 0);

    res.json({
      totals,
      daily: { visit: visitDaily, search: searchDaily },
      hourly,
      weekday,
      funnel,
      growth: { visit: { current: currentVisitTotal, previous: previousVisitTotal, pct: growthPct } },
    });
  } catch (e: any) {
    res.json(emptyResponse(`오류: ${e?.message ?? String(e)}`));
  }
}
