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

const PENDING_LINK_KEY = 'pendingSocialLink';

// 이미 있는 익명 세션(즐겨찾기 등 데이터)을 그대로 이어받아 실계정으로 승격.
// 세션이 없거나 이미 실계정이면 일반 로그인으로 폴백.
// provider: 기본 제공 프로바이더는 'kakao' 등 그대로, 커스텀 OIDC는 'custom:naver' 형식.
async function signInWithSocialProvider(provider: string): Promise<{ error: string | null }> {
  if (!supabase) return { error: 'Supabase 설정이 없습니다.' };

  const { data: { user } } = await supabase.auth.getUser();

  if (user?.is_anonymous) {
    // linkIdentity는 브라우저를 프로바이더로 리다이렉트했다가 돌아오는 방식이라, 이 시점의
    // error는 "링크 자체가 시작조차 안 됨" 같은 즉시 실패만 잡음. "이미 다른 계정에 연결된
    // 프로바이더" 같은 실패는 리다이렉트 왕복 후 서버에서 발생해서 여기로 안 돌아오므로,
    // 돌아온 뒤 세션이 여전히 익명인지로 판단해서 resolvePendingSocialLink()에서 재시도함.
    sessionStorage.setItem(PENDING_LINK_KEY, provider);
    const { error } = await supabase.auth.linkIdentity({ provider: provider as any });
    if (error) {
      sessionStorage.removeItem(PENDING_LINK_KEY);
      return { error: error.message };
    }
    return { error: null };
  }

  const { error } = await supabase.auth.signInWithOAuth({ provider: provider as any });
  return { error: error ? error.message : null };
}

// linkIdentity 리다이렉트에서 돌아온 직후 앱 시작 시 한 번 호출.
// 링크 시도가 있었는데도 세션이 여전히 익명이면 "이미 다른 계정에 연결된 프로바이더"로 실패한
// 것 — 그 계정에 로그인하도록 일반 로그인(signInWithOAuth)으로 재시도한다.
export async function resolvePendingSocialLink(): Promise<void> {
  if (!supabase) return;
  const provider = sessionStorage.getItem(PENDING_LINK_KEY);
  if (!provider) return;
  sessionStorage.removeItem(PENDING_LINK_KEY);

  const { data: { user } } = await supabase.auth.getUser();
  if (user?.is_anonymous) {
    await supabase.auth.signInWithOAuth({ provider: provider as any });
  }
}

export const signInWithKakao = (): Promise<{ error: string | null }> => signInWithSocialProvider('kakao');
export const signInWithNaver = (): Promise<{ error: string | null }> => signInWithSocialProvider('custom:naver');
export const signInWithGoogle = (): Promise<{ error: string | null }> => signInWithSocialProvider('google');
export const signInWithApple = (): Promise<{ error: string | null }> => signInWithSocialProvider('apple');

export async function signOutSupabase(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
  // 캐시된 익명 세션도 함께 무효화 — 안 그러면 로그아웃 후 재호출 시 이미 끊긴
  // 세션의 uid를 그대로 돌려줘서 이후 요청이 전부 실패함
  anonAuthPromise = null;
}
