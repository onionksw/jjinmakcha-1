// Node.js 18+ 전역 crypto.subtle 사용 (import 불필요)

let cachedToken: { value: string; exp: number } | null = null;

function base64url(buf: ArrayBuffer | Buffer): string {
  return Buffer.from(buf).toString('base64url');
}

async function signRS256(data: string, pemKey: string): Promise<string> {
  const keyContent = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');

  const keyBuffer = Buffer.from(keyContent, 'base64');

  const cryptoKey = await globalThis.crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const encoded = new TextEncoder().encode(data);
  const signature = await globalThis.crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, encoded);
  return base64url(signature);
}

export async function getGoogleAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.exp) return cachedToken.value;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '';
  const rawKey = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!email || !rawKey) throw new Error('GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_PRIVATE_KEY 환경변수 미설정');

  const now = Math.floor(Date.now() / 1000);
  const header  = base64url(Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })));
  const payload = base64url(Buffer.from(JSON.stringify({
    iss: email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  })));

  const toSign = `${header}.${payload}`;
  const signature = await signRS256(toSign, rawKey);
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
