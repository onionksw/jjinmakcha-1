import type { VercelRequest, VercelResponse } from '@vercel/node';
import { SignJWT, importPKCS8 } from 'jose';

const VALID_EVENTS = ['visit', 'search', 'signup', 'taxi'];
const SHEET_ID = process.env.GOOGLE_SHEET_ID || '';

async function getToken(): Promise<string> {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!;
  const rawKey = (process.env.GOOGLE_PRIVATE_KEY!).replace(/\\n/g, '\n');
  const privateKey = await importPKCS8(rawKey, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })
    .setProtectedHeader({ alg: 'RS256' })
    .sign(privateKey);

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await r.json();
  if (!data.access_token) throw new Error('토큰 발급 실패: ' + JSON.stringify(data));
  return data.access_token as string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const event = req.body?.event;
  const isDebug = req.body?.debug === true;
  if (!VALID_EVENTS.includes(event)) return res.status(400).json({ error: 'Invalid event', received: event });

  const log: string[] = [];
  try {
    if (!SHEET_ID || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
      throw new Error('환경변수 미설정');
    }
    log.push('인증 시도 중...');
    const token = await getToken();
    log.push('인증 성공');

    const timestamp = new Date().toISOString();
    const range = encodeURIComponent('Log!A:B');
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    log.push(`쓰기 시도...`);
    const r = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [[timestamp, event]] }),
    });
    const body = await r.text();
    log.push(`응답 ${r.status}: ${body.slice(0, 300)}`);
    if (!r.ok) throw new Error(`Sheets 오류 ${r.status}: ${body.slice(0, 200)}`);

    return res.status(200).json({ ok: true, ...(isDebug ? { log } : {}) });
  } catch (e: any) {
    log.push(`예외: ${e.message}`);
    console.error('track error:', e.message);
    if (isDebug) return res.status(200).json({ ok: false, error: e.message, log });
    return res.status(200).json({ ok: false });
  }
}
