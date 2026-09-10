import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 미설정 — 즐겨찾기 기능 비활성화됩니다.');
}

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// StrictMode에서 useEffect가 2번 실행돼도 익명 로그인이 중복 호출되지 않도록 모듈 레벨에서 캐싱
let anonAuthPromise: Promise<string | null> | null = null;

export function ensureAnonymousSession(): Promise<string | null> {
  if (!supabase) return Promise.resolve(null);
  if (anonAuthPromise) return anonAuthPromise;

  anonAuthPromise = (async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) return session.user.id;

    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) {
      console.error('[supabase] 익명 로그인 실패:', error.message);
      anonAuthPromise = null; // 실패 시 재시도 가능하도록 캐시 해제
      return null;
    }
    return data.user?.id ?? null;
  })();

  return anonAuthPromise;
}

// 이미 있는 익명 세션(즐겨찾기 등 데이터)을 그대로 이어받아 카카오 계정으로 승격.
// 세션이 없거나 이미 실계정이면 일반 로그인으로 폴백.
export async function signInWithKakao(): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase 설정이 없습니다.' };

  const { data: { user } } = await supabase.auth.getUser();

  if (user?.is_anonymous) {
    const { error } = await supabase.auth.linkIdentity({ provider: 'kakao' });
    if (error) return { error: error.message };
    return { error: null };
  }

  const { error } = await supabase.auth.signInWithOAuth({ provider: 'kakao' });
  return { error: error ? error.message : null };
}

export async function signOutSupabase(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
  // 캐시된 익명 세션도 함께 무효화 — 안 그러면 로그아웃 후 재호출 시 이미 끊긴
  // 세션의 uid를 그대로 돌려줘서 이후 요청이 전부 실패함
  anonAuthPromise = null;
}
