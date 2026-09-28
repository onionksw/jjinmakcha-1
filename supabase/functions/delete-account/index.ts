// 회원탈퇴 — 로그인한 본인의 데이터와 Supabase 계정 자체를 삭제.
// 계정 삭제는 service role 키가 필요해서 앱(anon 키)에서 직접 못 하고 이 함수가 대신 처리함.
// 호출자 본인 확인은 요청의 JWT(Authorization 헤더)로만 하고, 삭제 대상 id는 클라이언트에서 받지 않음.
import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

// user_id 컬럼으로 사용자에 묶인 테이블들
const USER_TABLES = ['favorites', 'savings_log', 'push_alarms'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json(405, { error: 'POST만 지원해요' });

  try {
    const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!token) return json(401, { error: '로그인이 필요해요' });

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) return json(401, { error: '로그인 정보를 확인할 수 없어요' });

    for (const table of USER_TABLES) {
      const { error } = await admin.from(table).delete().eq('user_id', user.id);
      if (error) throw new Error(`${table} 삭제 실패: ${error.message}`);
    }

    const { error: deleteErr } = await admin.auth.admin.deleteUser(user.id);
    if (deleteErr) throw new Error(`계정 삭제 실패: ${deleteErr.message}`);

    return json(200, { ok: true });
  } catch (e) {
    console.error('회원탈퇴 오류:', e);
    return json(500, { error: (e as Error).message });
  }
});
