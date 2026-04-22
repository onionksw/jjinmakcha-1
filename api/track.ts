import type { VercelRequest, VercelResponse } from '@vercel/node';

const VALID_EVENTS = ['visit', 'search', 'signup', 'taxi'] as const;
type EventType = typeof VALID_EVENTS[number];

// Upstash REST API (Vercel KV에서 자동 주입되는 환경변수 사용)
async function kvIncr(key: string): Promise<void> {
  const url = process.env.KV_REST_API_URL;
  const token = process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error('KV not configured');
  await fetch(`${url}/incr/${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const event = req.body?.event as string;
  if (!VALID_EVENTS.includes(event as EventType)) {
    return res.status(400).json({ error: 'Invalid event' });
  }

  try {
    const today = new Date().toISOString().split('T')[0];
    await Promise.all([
      kvIncr(`stat:${event}`),
      kvIncr(`stat:${event}:${today}`),
    ]);
  } catch {
    // KV 미설정 시 무시 (404 말고 200 반환)
  }

  res.status(200).json({ ok: true });
}
