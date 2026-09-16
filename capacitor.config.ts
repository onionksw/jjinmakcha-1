import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.jjinmakcha.app',
  appName: '찐막차',
  webDir: 'dist',
  // @capacitor-firebase/messaging 문서 권장 설정 — SwiftPM 패키지 identity 충돌 방지
  experimental: {
    ios: {
      spm: {
        packageOptions: {
          '@capacitor-firebase/messaging': {
            symlink: true,
          },
        },
      },
    },
  },
};

export default config;
