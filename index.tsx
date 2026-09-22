import React from 'react';
import ReactDOM from 'react-dom/client';
import * as Sentry from '@sentry/capacitor';
import * as SentryReact from '@sentry/react';
import App from './App';
import Admin from './components/Admin';
import EmbedMap from './components/EmbedMap';

// DSN 없으면(로컬 개발 등) 조용히 비활성 — Mac 없이 iOS 에러를 원격으로 확인하기 위한 용도.
// @sentry/capacitor가 @sentry/react의 init을 감싸서 웹/iOS/안드로이드 JS 에러를 동일하게 잡음
const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;
if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: import.meta.env.PROD ? 'production' : 'development',
    // Vercel/GitHub Actions가 빌드 시점에 자동으로 채워주는 커밋 해시 — 어느 배포에서
    // 난 에러인지 구분하려는 목적이라 별도 환경변수 설정 없이 씀(vite.config.ts define 참고)
    release: __APP_RELEASE__,
    beforeSend(event, hint) {
      // 실제 버그와 무관한 브라우저/네트워크 잡음 — 무료 할당량(월 5천 건)을 이런 걸로 채우지 않기 위함
      const message = String(hint.originalException instanceof Error ? hint.originalException.message : event.message ?? '');
      if (/ResizeObserver loop/.test(message)) return null;
      if (hint.originalException instanceof DOMException && hint.originalException.name === 'AbortError') return null;
      return event;
    },
  }, SentryReact.init);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const isAdmin = window.location.pathname === '/admin';
const isEmbedMap = window.location.pathname === '/embed-map';

const Screen = isEmbedMap ? <EmbedMap /> : isAdmin ? <Admin /> : <App />;

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {sentryDsn ? (
      <SentryReact.ErrorBoundary
        fallback={
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: 16, padding: 24, textAlign: 'center', fontFamily: 'sans-serif' }}>
            <p>일시적인 문제가 발생했어요.</p>
            <button onClick={() => window.location.reload()} style={{ padding: '10px 20px', borderRadius: 12, background: '#4CC9F0', color: 'white', border: 'none', fontWeight: 700 }}>
              다시 시작하기
            </button>
          </div>
        }
      >
        {Screen}
      </SentryReact.ErrorBoundary>
    ) : Screen}
  </React.StrictMode>
);
