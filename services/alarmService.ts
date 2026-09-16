import { supabase, ensureAnonymousSession } from './supabaseClient';

// "막차 알림"이 실제로 발송되도록 서버에 예약 요청을 저장 — 발송 자체는
// Supabase Edge Function(send-due-alarms)이 1분마다 확인해서 처리함.
export async function createPushAlarm(
  deviceToken: string,
  fireAt: Date,
  title: string,
  body: string,
): Promise<boolean> {
  if (!supabase) return false;
  const uid = await ensureAnonymousSession();
  if (!uid) return false;

  try {
    const { error } = await supabase.from('push_alarms').insert({
      user_id: uid,
      device_token: deviceToken,
      fire_at: fireAt.toISOString(),
      title,
      body,
    });
    if (error) throw error;
    return true;
  } catch (e) {
    console.error('[push] 알림 예약 오류:', e);
    return false;
  }
}
