import { Capacitor } from '@capacitor/core';

// 웹(Vercel 배포)에서는 상대경로 그대로, 네이티브 앱에서 번들된 정적 파일로
// 실행될 때만 실제 서버로 절대경로 지정 (capacitor://localhost 등 앱 자체
// origin에는 우리 /api 서버리스 함수가 없기 때문)
export const API_BASE = Capacitor.isNativePlatform() ? 'https://jjinmakcha.com' : '';
