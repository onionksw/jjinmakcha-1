import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';

// 네이티브 앱에서만 동작 — 웹(PWA)에서는 조용히 스킵.
// 권한 요청 → FCM 토큰 발급. 실패/미지원 시 null 반환.
export async function registerForPush(): Promise<string | null> {
  if (!Capacitor.isNativePlatform()) return null;

  try {
    const { receive } = await FirebaseMessaging.checkPermissions();
    if (receive !== 'granted') {
      const { receive: requested } = await FirebaseMessaging.requestPermissions();
      if (requested !== 'granted') return null;
    }
    const { token } = await FirebaseMessaging.getToken();
    return token || null;
  } catch (e) {
    console.error('[push] 등록 실패:', e);
    return null;
  }
}

// 앱이 켜져있는(포그라운드) 상태에서 푸시가 도착하면 시스템 알림이 자동으로 안 뜨고
// 이 이벤트만 발생함 — 리스너 없으면 아무 반응 없이 조용히 무시됨. 앱이 꺼져있거나
// 백그라운드일 땐 OS가 알아서 시스템 알림을 띄워주므로 이 리스너와 무관하게 잘 옴.
export function addForegroundNotificationListener(onReceive: (title: string, body: string) => void): void {
  if (!Capacitor.isNativePlatform()) return;
  FirebaseMessaging.addListener('notificationReceived', (event) => {
    onReceive(event.notification.title || '찐막차 알림 🚌', event.notification.body || '');
  });
}
