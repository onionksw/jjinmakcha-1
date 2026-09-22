import { next } from '@vercel/functions';

// 짧은 공유 링크(/s/xxxxxxxxxx)를 카카오톡 등 메신저 봇이 미리보기용으로 크롤링할 때만,
// 그 경로의 실제 절약 금액/시간을 담은 og 태그를 즉석에서 만들어 돌려줌. 이 앱은 클라이언트
// 렌더링 SPA라 일반 사용자는 그대로 index.html(App.tsx가 id로 서버에서 데이터를 다시 불러옴)을
// 받게 두고, 봇 UA일 때만 여기서 가로채서 커스텀 HTML을 직접 반환함.
const BOT_UA = /bot|crawl|spider|facebookexternalhit|kakaotalk-scrap|kakaotalk|slackbot|discordbot|telegrambot|twitterbot|whatsapp|line\/|vercel-screenshot|embedly|linkedinbot/i;

export const config = {
  matcher: ['/s/:id'],
};

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default async function middleware(request: Request) {
  const ua = request.headers.get('user-agent') || '';
  if (!BOT_UA.test(ua)) return next();

  const url = new URL(request.url);
  const id = url.pathname.split('/').filter(Boolean).pop();
  if (!id) return next();

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return next();

  try {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/shared_routes?id=eq.${encodeURIComponent(id)}&select=snapshot`,
      { headers: { apikey: anonKey, Authorization: `Bearer ${anonKey}` } },
    );
    const rows: { snapshot?: Record<string, unknown> }[] = await res.json();
    const snap = rows?.[0]?.snapshot;
    if (!snap) return next();

    const saved = Number(snap.saved ?? 0).toLocaleString();
    const cost = Number(snap.cost ?? 0).toLocaleString();
    const title = `${snap.s} → ${snap.e}, 찐막차로 ${saved}원 절약!`;
    const description = `${snap.dur}분 · ${cost}원 — 택시비 아껴서 3차 가자 🍻`;

    const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="찐막차" />
<meta property="og:title" content="${escapeHtml(title)}" />
<meta property="og:description" content="${escapeHtml(description)}" />
<meta property="og:image" content="https://jjinmakcha.com/icons/icon-512.png" />
<meta property="og:url" content="${escapeHtml(url.toString())}" />
<meta name="twitter:card" content="summary_large_image" />
<title>${escapeHtml(title)}</title>
</head>
<body></body>
</html>`;

    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
  } catch {
    return next();
  }
}
