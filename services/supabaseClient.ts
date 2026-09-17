import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Browser } from '@capacitor/browser';

// 네이티브 앱에서 소셜 로그인 후 돌아올 콜백 주소. 웹에서 쓰는 기본값
// (window.location.origin, 예: https://jjinmakcha.com)은 네이티브 앱 안에서는
// capacitor://localhost 같은 내부 전용 주소라 카카오/구글이 실제로 못 찾아가고,
// 그렇다고 지정 안 하면 Supabase가 안전하게 실제 웹사이트로 돌려보내서 로그인이
// 브라우저에만 남고 앱에는 반영이 안 되던 문제 — 앱 전용 커스텀 스킴으로 해결
const NATIVE_AUTH_REDIRECT = 'com.jjinmakcha.app://login-callback';

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
// resolvePendingSocialLink()는 앱이 뜰 때마다(웹 새로고침/네이티브 콜드 스타트 포함) 무조건
// 호출되는데, linkIdentity가 리다이렉트 왕복 도중 끊기면(브라우저 뒤로가기, 앱 전환 등) 이
// 값이 지워지지 않고 남아있다가 로그인 시도와 전혀 무관한 다음 앱 실행 때 갑자기 실제
// signInWithOAuth가 자동으로 실행돼 브라우저가 뜨는 사고가 남 — 사용자가 방금 누른
// 로그인 시도와 겹쳐서 두 흐름이 동시에 브라우저/딥링크를 다투는 게 "로그인 선택창으로
// 돌아오고 실제 로그인은 안 되는" 증상의 원인이었음. 값에 타임스탬프를 같이 저장해서
// 일정 시간 지난 건 무시하도록 함(정상 흐름은 리다이렉트 왕복이 보통 몇 초~1분 내로 끝남).
const PENDING_LINK_STALE_MS = 3 * 60 * 1000;

// 네이티브 앱에서는 OAuth 페이지를 자체 웹뷰가 아니라 인앱 브라우저(안드로이드 Custom
// Tabs / iOS SFSafariViewController)로 열어야 함 — 구글은 정책상 일반 웹뷰 안에서의
// 로그인 자체를 차단하기 때문. skipBrowserRedirect로 자동 이동을 막고 URL만 받아서
// 직접 Browser.open으로 연다.
const nativeAuthOptions = Capacitor.isNativePlatform()
  ? { redirectTo: NATIVE_AUTH_REDIRECT, skipBrowserRedirect: true }
  : undefined;

async function openIfNative(url: string | null | undefined): Promise<void> {
  if (Capacitor.isNativePlatform() && url) {
    await Browser.open({ url });
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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
    sessionStorage.setItem(PENDING_LINK_KEY, JSON.stringify({ provider, ts: Date.now() }));
    const { data, error } = await supabase.auth.linkIdentity({ provider: provider as any, options: nativeAuthOptions });
    if (error) {
      sessionStorage.removeItem(PENDING_LINK_KEY);
      return { error: error.message };
    }
    await openIfNative(data?.url);
    return { error: null };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({ provider: provider as any, options: nativeAuthOptions });
  if (error) return { error: error.message };
  await openIfNative(data?.url);
  return { error: null };
}

// linkIdentity 리다이렉트에서 돌아온 직후 앱 시작 시 한 번 호출.
// 링크 시도가 있었는데도 세션이 여전히 익명이면 "이미 다른 계정에 연결된 프로바이더"로 실패한
// 것 — 그 계정에 로그인하도록 일반 로그인(signInWithOAuth)으로 재시도한다.
export async function resolvePendingSocialLink(): Promise<void> {
  if (!supabase) return;
  const raw = sessionStorage.getItem(PENDING_LINK_KEY);
  if (!raw) return;
  sessionStorage.removeItem(PENDING_LINK_KEY);

  let provider: string | undefined;
  try {
    const parsed = JSON.parse(raw) as { provider: string; ts: number };
    if (Date.now() - parsed.ts > PENDING_LINK_STALE_MS) return; // 오래 방치된 값 — 무관한 앱 실행일 가능성이 높아 무시
    provider = parsed.provider;
  } catch {
    return; // 이전 버전이 남긴 형식(문자열만 저장)이면 안전하게 무시
  }
  if (!provider) return;

  const { data: { user } } = await supabase.auth.getUser();
  if (user?.is_anonymous) {
    const { data, error } = await supabase.auth.signInWithOAuth({ provider: provider as any, options: nativeAuthOptions });
    if (!error) await openIfNative(data?.url);
  }
}

// 네이티브 앱 전용 — OAuth 로그인 완료 후 커스텀 스킴(NATIVE_AUTH_REDIRECT)으로
// 돌아왔을 때 URL의 access_token/refresh_token을 세션으로 반영. 앱 시작 시 한 번만
// 등록하면 됨(App.tsx). supabase-js 기본 flowType(implicit)은 토큰을 URL # 뒤에
// 실어서 주므로 setSession으로 직접 반영 — PKCE(exchangeCodeForSession)는 아님.
export function setupNativeAuthDeepLink(): void {
  if (!supabase || !Capacitor.isNativePlatform()) return;

  CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
    if (!url.startsWith(NATIVE_AUTH_REDIRECT.split('://')[0] + '://')) return;

    const hashIndex = url.indexOf('#');
    const query = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
    const hash = hashIndex !== -1 ? url.slice(hashIndex + 1) : '';
    const errorCode = new URLSearchParams(query).get('error_code') || new URLSearchParams(hash).get('error_code');

    // linkIdentity가 "이미 다른 계정에 연결된 프로바이더"로 실패한 경우 — 웹에서는
    // 페이지가 새로고침되면서 resolvePendingSocialLink()가 자동으로 다시 실행돼
    // 그 기존 계정으로 로그인 재시도가 되는데, 네이티브 앱은 리로드가 없어서 여기서
    // 직접 호출해줘야 함 (실측으로 이 케이스가 실제 발생함을 확인). 이 실패한
    // 브라우저는 여기서 닫되, resolvePendingSocialLink가 새로 여는 브라우저까지
    // 같이 닫아버리면 재시도가 시작하자마자 끊겨버리므로 finally로 묶지 않음.
    // Browser.close() 직후 곧바로 다음 Browser.open()을 연달아 호출하면 우리 앱
    // 화면(MainActivity)이 전면에 다시 뜰 틈도 없이 새 탭이 열려서, 안드로이드가
    // "화면에 아무것도 안 보여주는 방치된 태스크"로 오판해 앱 프로세스를 통째로
    // 강제 종료시키는 게 실기기 로그로 확인됨(ActivityManager: ... remove task).
    // 짧게 텀을 줘서 우리 앱 화면이 확실히 전면으로 올라올 시간을 준다.
    if (errorCode === 'identity_already_exists') {
      await Browser.close().catch(() => {});
      await sleep(400);
      await resolvePendingSocialLink();
      return;
    }
    if (errorCode) {
      await Browser.close().catch(() => {});
      return;
    }

    const params = new URLSearchParams(hash);
    const access_token = params.get('access_token');
    const refresh_token = params.get('refresh_token');
    if (access_token && refresh_token) {
      await supabase!.auth.setSession({ access_token, refresh_token });
    }
    await Browser.close().catch(() => {});
  });
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
