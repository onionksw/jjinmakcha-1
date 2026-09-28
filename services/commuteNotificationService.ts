import { registerPlugin, Capacitor } from '@capacitor/core';

// 귀가 중 카운트다운을 앱이 백그라운드/잠금화면에 있어도 보여주는 커스텀 플러그인.
// 안드로이드: 상단 알림 카드(android/.../CommuteNotificationPlugin.java)
// iOS: 잠금화면/다이나믹 아일랜드 라이브 액티비티(ios/App/App/CommuteLiveActivityPlugin.swift)
// 웹은 미지원. 필드는 두 플랫폼 모두 그대로 화면에 보여주는 값.
export interface CommuteNotifyPayload {
  routeName: string;
  urgent: boolean;
  leaveLabel: string;     // "출발까지 4분 남음" / "지금 출발!"
  comment: string;        // "편의점도 못 들려! 서둘러! 💦"
  transitValue: string;   // "🚇 2호선"
  departureClock: string; // "15:12" / "--:--"
  walkText: string;       // "1분" / "바로"
  countdownText: string;  // "2분 58초" / "지금 출발!"
  // iOS 전용: 출발 시각(epoch ms). iOS는 백그라운드에서 JS가 멈춰 텍스트 갱신이 안 되므로
  // 이 값으로 OS가 직접 카운트다운을 그림. 0/생략이면 countdownText를 그대로 표시.
  targetEpochMs?: number;
}

interface CommuteNotificationPlugin {
  start(options: CommuteNotifyPayload): Promise<void>;
  update(options: CommuteNotifyPayload): Promise<void>;
  stop(): Promise<void>;
}

const CommuteNotification = registerPlugin<CommuteNotificationPlugin>('CommuteNotification');

const isSupported = () => {
  const platform = Capacitor.getPlatform();
  return platform === 'android' || platform === 'ios';
};

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
