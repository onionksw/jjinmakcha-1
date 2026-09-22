declare module '*.png' {
  const src: string;
  export default src;
}
declare module '*.jpg' {
  const src: string;
  export default src;
}
declare module '*.svg' {
  const src: string;
  export default src;
}

// vite.config.ts의 define에서 빌드 시점에 문자열로 치환됨 (Sentry release 태그용)
declare const __APP_RELEASE__: string;
