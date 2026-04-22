import { createSign } from 'crypto';

let cachedToken: { value: string; exp: number } | null = null;

export async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.exp) return cachedToken.value;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
  const rawKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!email || !rawKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY 환경변수 미설정');

  const now = Math.floor(Date.now() / 1000);
  const header  = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })).toString('base64url');

  const toSign = `${header}.${payload}`;
  const sign = createSign('RSA-SHA256');
  sign.update(toSign);
  const signature = sign.sign(rawKey, 'base64url');
  const jwt = `${toSign}.${signature}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await res.json();
  if (!data.access_token) throw new Error('access_token 발급 실패: ' + JSON.stringify(data));

  cachedToken = { value: data.access_token, exp: (now + 3500) * 1000 };
  return data.access_token;
}
