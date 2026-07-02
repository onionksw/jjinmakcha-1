import React, { useState, useEffect, useCallback } from 'react';
import { Clock } from 'lucide-react';
import { getSubwayArrivals } from '../services/realtimeService';
import { RouteSegment } from '../types';

interface Props {
  firstTransitSeg: RouteSegment | undefined;
  walkMinutes: number;
  routeIndex: number;
}

function getComment(leaveInMins: number, routeIndex: number): string {
  if (routeIndex === 1) return '막병 시키자~ 🍾';
  if (routeIndex === 2) return '빠르게 2차 고? 🥂';
  if (leaveInMins <= 0) return '놓치겠다! 뛰어!! 🏃‍♂️';
  if (leaveInMins < 20) return '편의점도 못 들려! 서둘러! 💦';
  if (leaveInMins < 40) return '아쉬운데 한 잔만 더? 🍺';
  if (leaveInMins < 60) return '노래방 막곡 가능! 🎤';
  if (leaveInMins < 90) return '천천히 마셔도 됨 🐢';
  return '해장국 먹고 가도 되겠는데? 🍲';
}

const RouteCardCountdown: React.FC<Props> = ({ firstTransitSeg, walkMinutes, routeIndex }) => {
  // 다음 열차 도착 예정 epoch ms (실시간 API 기반)
  const [nextTransitMs, setNextTransitMs] = useState<number | null>(null);
  const [loading, setLoading] = useState(firstTransitSeg?.type === 'subway');
  // 매 5초 tick → 카운트다운 재계산
  const [, setTick] = useState(0);

  const fetchRealtime = useCallback(async () => {
    if (firstTransitSeg?.type !== 'subway' || !firstTransitSeg.startName) return;
    const clean = firstTransitSeg.startName.replace(/역$/, '').trim();
    // wayCode로 상행/하행 방향 필터 (updnLine 기반 — 급행 포함 정확한 방향 필터)
    const dir = firstTransitSeg.wayCode === 1 ? '상행' : firstTransitSeg.wayCode === 2 ? '하행' : undefined;
    const arrivals = await getSubwayArrivals(clean, dir);
    if (arrivals.length > 0) {
      setNextTransitMs(Date.now() + arrivals[0].minutesLeft * 60000);
    }
    setLoading(false);
  }, [firstTransitSeg?.type, firstTransitSeg?.startName, firstTransitSeg?.nextStationName]);

  // 실시간 API 30초마다 갱신
  useEffect(() => {
    fetchRealtime();
    const id = setInterval(fetchRealtime, 30000);
    return () => clearInterval(id);
  }, [fetchRealtime]);

  // 5초마다 tick → 카운트다운 숫자 갱신
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  // 현재 남은 시간 계산 (tick에 의해 재계산)
  const leaveInMs = nextTransitMs !== null
    ? nextTransitMs - Date.now() - walkMinutes * 60000
    : null;

  const leaveInMins = leaveInMs !== null ? Math.round(leaveInMs / 60000) : null;
  const leaveInSecs = leaveInMs !== null ? Math.max(0, Math.floor(leaveInMs / 1000)) : null;

  const isSubway = firstTransitSeg?.type === 'subway';

  // ─── 지하철 아닌 경우 (버스·택시·도보) ──────────────────────────────
  if (!isSubway) {
    return (
      <div className="space-y-2">
        <div className="rounded-2xl px-4 py-3 flex items-center gap-3 bg-blue-50">
          <Clock className="w-4 h-4 shrink-0 text-brandBlue" />
          <div className="min-w-0">
            <p className="text-[11px] text-gray-500 font-bold">
              {walkMinutes > 0
                ? <>도보 <span className="font-black text-gray-800">{walkMinutes}분</span> 후 탑승</>
                : <span className="font-black text-gray-800">바로 탑승 가능</span>}
            </p>
            <p className="text-sm font-black text-brandBlue truncate">"{getComment(999, routeIndex)}"</p>
          </div>
        </div>
      </div>
    );
  }

  // ─── 실시간 조회 중 ──────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="space-y-2">
        <div className="rounded-2xl px-4 py-3 flex items-center gap-3 bg-gray-50">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-brandBlue rounded-full animate-spin shrink-0" />
          <p className="text-xs text-gray-400 font-bold">실시간 열차 조회 중...</p>
        </div>
        <div className="border-t border-gray-100 pt-4">
          <p className="text-[10px] text-gray-400 font-bold mb-1">
            첫 탑승까지{walkMinutes > 0 ? ` (도보 ${walkMinutes}분 소요)` : ''}
          </p>
          <div className="flex items-center gap-2 text-gray-300 font-mono font-bold text-xl">
            <Clock className="w-5 h-5" />
            <span>--분 --초</span>
          </div>
        </div>
      </div>
    );
  }

  // ─── 실시간 데이터 없음 (폴백) ───────────────────────────────────────
  if (leaveInMins === null) {
    return (
      <div className="space-y-2">
        <div className="rounded-2xl px-4 py-3 flex items-center gap-3 bg-gray-50">
          <Clock className="w-4 h-4 shrink-0 text-gray-400" />
          <p className="text-xs text-gray-400 font-bold">실시간 정보 없음 · 도보 {walkMinutes}분 소요</p>
        </div>
      </div>
    );
  }

  const urgent = leaveInMins <= 1;
  const comment = getComment(leaveInMins, routeIndex);
  const mins = leaveInSecs !== null ? Math.floor(leaveInSecs / 60) : 0;
  const secs = leaveInSecs !== null ? leaveInSecs % 60 : 0;

  return (
    <div className="space-y-0">
      {/* 긴박도 배너 */}
      <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 mb-4 ${urgent ? 'bg-red-50' : 'bg-blue-50'}`}>
        <Clock className={`w-4 h-4 shrink-0 ${urgent ? 'text-red-500 animate-pulse' : 'text-brandBlue'}`} />
        <div className="min-w-0">
          <p className="text-[11px] text-gray-500 font-bold">
            {urgent
              ? <span className="font-black text-red-500">지금 출발!</span>
              : <>출발까지 <span className="font-black text-gray-800">{leaveInMins}분</span> 남음</>}
          </p>
          <p className={`text-sm font-black truncate ${urgent ? 'text-red-500' : 'text-brandBlue'}`}>
            "{comment}"
          </p>
        </div>
      </div>

      {/* 초 단위 카운트다운 */}
      <div className="border-t border-gray-100 pt-4">
        <p className="text-[10px] text-gray-400 font-bold mb-1">
          출발까지{walkMinutes > 0 ? ` (도보 ${walkMinutes}분 포함)` : ''}
        </p>
        <div className={`flex items-center gap-2 font-mono font-bold text-xl ${urgent ? 'text-red-500 animate-pulse' : 'text-brandBlue'}`}>
          <Clock className="w-5 h-5" />
          {leaveInMins <= 0
            ? <span>지금 출발!</span>
            : <span>{mins}분 {secs.toString().padStart(2, '0')}초</span>}
        </div>
      </div>
    </div>
  );
};

export default RouteCardCountdown;
