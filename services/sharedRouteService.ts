import { supabase } from './supabaseClient';
import { SharedRouteSnapshot } from '../types';

// 짧은 공유 링크(jjinmakcha.com/s/xxxxxxxxxx) — 예전엔 경로 정보 전체를 base64로 URL에
// 욱여넣어서 링크가 300자 넘게 길어졌는데, 서버(Supabase)에 저장하고 짧은 id만 URL에 실음.
// 카카오톡 등 메신저가 이 id로 만든 링크를 크롤링할 때 미리보기 카드를 그 경로의 실제
// 절약 금액으로 보여줄 수 있게 하는 목적도 겸함(middleware.ts가 이 테이블을 직접 조회함)
function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export async function createSharedRoute(snapshot: SharedRouteSnapshot): Promise<string | null> {
  if (!supabase) return null;
  const id = randomId();
  const { error } = await supabase.from('shared_routes').insert({ id, snapshot });
  if (error) {
    console.error('[sharedRoute] 생성 실패:', error.message);
    return null;
  }
  return id;
}

export async function getSharedRoute(id: string): Promise<SharedRouteSnapshot | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from('shared_routes').select('snapshot').eq('id', id).maybeSingle();
  if (error || !data) return null;
  return data.snapshot as SharedRouteSnapshot;
}
