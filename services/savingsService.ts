import { supabase, ensureAnonymousSession } from './supabaseClient';

const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DUPLICATE_WINDOW_MS = 30 * 60 * 1000; // 같은 경로 30분 내 재기록 방지

// 이번 달 1일 0시(KST)를 UTC ISO 문자열로 — Supabase에 UTC로 저장되므로 여기서 변환
function monthStartUtcIso(): string {
  const nowKst = new Date(Date.now() + KST_OFFSET_MS);
  const monthStartKst = new Date(Date.UTC(nowKst.getUTCFullYear(), nowKst.getUTCMonth(), 1, 0, 0, 0));
  return new Date(monthStartKst.getTime() - KST_OFFSET_MS).toISOString();
}

export interface LogSavingsResult {
  logged: boolean; // true=새로 기록됨, false=중복이라 스킵됨(또는 실패)
}

export async function logSavings(startLoc: string, endLoc: string, savedAmount: number): Promise<LogSavingsResult> {
  if (!supabase || savedAmount <= 0) return { logged: false };
  const uid = await ensureAnonymousSession();
  if (!uid) return { logged: false };

  try {
    const sinceIso = new Date(Date.now() - DUPLICATE_WINDOW_MS).toISOString();
    const { data: recent, error: checkErr } = await supabase
      .from('savings_log')
      .select('id')
      .eq('start_loc', startLoc)
      .eq('end_loc', endLoc)
      .gte('created_at', sinceIso)
      .limit(1);
    if (checkErr) throw checkErr;
    if (recent && recent.length > 0) return { logged: false };

    const { error: insertErr } = await supabase
      .from('savings_log')
      .insert({ user_id: uid, start_loc: startLoc, end_loc: endLoc, saved_amount: savedAmount });
    if (insertErr) throw insertErr;
    return { logged: true };
  } catch (e) {
    console.error('절약금액 기록 오류:', e);
    return { logged: false };
  }
}

async function sumSince(sinceIso: string | null): Promise<number> {
  if (!supabase) return 0;
  await ensureAnonymousSession();
  try {
    let query = supabase.from('savings_log').select('saved_amount');
    if (sinceIso) query = query.gte('created_at', sinceIso);
    const { data, error } = await query;
    if (error) throw error;
    return (data || []).reduce((sum, row: any) => sum + (row.saved_amount || 0), 0);
  } catch (e) {
    console.error('절약금액 합계 조회 오류:', e);
    return 0;
  }
}

export const getMonthlySavings = (): Promise<number> => sumSince(monthStartUtcIso());
export const getTotalSavings = (): Promise<number> => sumSince(null);

export interface LevelInfo {
  level: number;
  label: string;
  currentThreshold: number;
  nextThreshold: number | null; // null = 최고 레벨
  goalFlavor: string;
}

const LEVEL_TABLE: { threshold: number; label: string; goalFlavor: string }[] = [
  { threshold: 0, label: '새내기 막차러', goalFlavor: '치킨 한 마리 🍗' },
  { threshold: 50_000, label: '알뜰 막차러', goalFlavor: '삼겹살 회식 🥩' },
  { threshold: 150_000, label: '프로 막차러', goalFlavor: '호캉스 1박 🏨' },
  { threshold: 400_000, label: '찐막차 마스터', goalFlavor: '이미 최고 레벨! 👑' },
];

export function getLevel(total: number): LevelInfo {
  let idx = 0;
  for (let i = 0; i < LEVEL_TABLE.length; i++) {
    if (total >= LEVEL_TABLE[i].threshold) idx = i;
  }
  const current = LEVEL_TABLE[idx];
  const next = LEVEL_TABLE[idx + 1] ?? null;
  return {
    level: idx + 1,
    label: current.label,
    currentThreshold: current.threshold,
    nextThreshold: next ? next.threshold : null,
    goalFlavor: current.goalFlavor,
  };
}
