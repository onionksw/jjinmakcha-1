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
  Sentry.init({ dsn: sentryDsn }, SentryReact.init);
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const isAdmin = window.location.pathname === '/admin';
const isEmbedMap = window.location.pathname === '/embed-map';

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    {isEmbedMap ? <EmbedMap /> : isAdmin ? <Admin /> : <App />}
  </React.StrictMode>
);
