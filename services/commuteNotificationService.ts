import { registerPlugin, Capacitor } from '@capacitor/core';

// 귀가 중 카운트다운을 앱이 백그라운드/잠금화면에 있어도 상단 알림 카드로 보여주는 안드로이드
// 전용 커스텀 플러그인(android/.../CommuteNotificationPlugin.java) — iOS/웹 구현은 없음.
// 라이브 액티비티가 필요한 iOS는 Xcode 위젯 익스텐션이 있어야 해서 별도로 진행하기 전까지는
// 안드로이드만 지원. 필드는 android/.../notification_commute_*.xml이 그대로 보여주는 값.
export interface CommuteNotifyPayload {
  routeName: string;
  urgent: boolean;
  leaveLabel: string;     // "출발까지 4분 남음" / "지금 출발!"
  comment: string;        // "편의점도 못 들려! 서둘러! 💦"
  transitValue: string;   // "🚇 2호선"
  departureClock: string; // "15:12" / "--:--"
  walkText: string;       // "1분" / "바로"
  countdownText: string;  // "2분 58초" / "지금 출발!"
}

interface CommuteNotificationPlugin {
  start(options: CommuteNotifyPayload): Promise<void>;
  update(options: CommuteNotifyPayload): Promise<void>;
  stop(): Promise<void>;
}

const CommuteNotification = registerPlugin<CommuteNotificationPlugin>('CommuteNotification');

const isSupported = () => Capacitor.getPlatform() === 'android';

export async function startCommuteNotification(payload: CommuteNotifyPayload): Promise<void> {
  if (!isSupported()) return;
  try { await CommuteNotification.start(payload); } catch { /* 알림 실패는 핵심 기능이 아니라 조용히 무시 */ }
}

export async function updateCommuteNotification(payload: CommuteNotifyPayload): Promise<void> {
  if (!isSupported()) return;
  try { await CommuteNotification.update(payload); } catch { /* noop */ }
}

export async function stopCommuteNotification(): Promise<void> {
  if (!isSupported()) return;
  try { await CommuteNotification.stop(); } catch { /* noop */ }
}
