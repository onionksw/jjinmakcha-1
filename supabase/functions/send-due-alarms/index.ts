// 1분마다 pg_cron이 호출 — 지금 시각이 지난 미발송 알림을 찾아서 FCM으로 실제 발송.
// api/track.ts(구글 서비스 계정 JWT 인증)와 동일한 패턴, Deno용으로 옮김.
import { SignJWT, importPKCS8 } from 'npm:jose@5';
import { createClient } from 'npm:@supabase/supabase-js@2';

const FIREBASE_PROJECT_ID = Deno.env.get('FIREBASE_PROJECT_ID') ?? '';
const FIREBASE_CLIENT_EMAIL = Deno.env.get('FIREBASE_CLIENT_EMAIL') ?? '';
const FIREBASE_PRIVATE_KEY = (Deno.env.get('FIREBASE_PRIVATE_KEY') ?? '').replace(/\\n/g, '\n');

async function getAccessToken(): Promise<string> {
  const privateKey = await importPKCS8(FIREBASE_PRIVATE_KEY, 'RS256');
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
  })
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuer(FIREBASE_CLIENT_EMAIL)
    .setAudience('https://oauth2.googleapis.com/token')
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
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

Deno.serve(async () => {
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: due, error } = await supabase
      .from('push_alarms')
      .select('id, device_token, title, body')
      .lte('fire_at', new Date().toISOString())
      .is('sent_at', null);

    if (error) throw error;
    if (!due || due.length === 0) {
      return new Response(JSON.stringify({ sent: 0 }), { headers: { 'Content-Type': 'application/json' } });
    }

    const accessToken = await getAccessToken();
    let sentCount = 0;

    for (const alarm of due) {
      try {
        const res = await fetch(
          `https://fcm.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/messages:send`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              message: {
                token: alarm.device_token,
                notification: { title: alarm.title, body: alarm.body },
              },
            }),
          },
        );
        if (res.ok) {
          await supabase.from('push_alarms').update({ sent_at: new Date().toISOString() }).eq('id', alarm.id);
          sentCount++;
        } else {
          console.error('FCM 발송 실패:', alarm.id, await res.text());
        }
      } catch (e) {
        console.error('발송 오류:', alarm.id, e);
      }
    }

    return new Response(
      JSON.stringify({ sent: sentCount, total: due.length }),
      { headers: { 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), { status: 500 });
  }
});
