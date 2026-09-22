import React, { useState, useEffect, useCallback } from 'react';
import { Clock } from 'lucide-react';
import { getSubwayArrivals, resolveSubwayDirection, lineNameToSubwayId } from '../services/realtimeService';
import { RouteSegment } from '../types';

// 백그라운드 알림(안드로이드 CommuteForegroundService)에 그대로 실어 보낼 수 있게, 화면에
// 보이는 카드가 최종적으로 뭘 그리는지를 그대로 반영한 상태값 — App.tsx가 이 콜백을 받아서
// 네이티브 알림 내용을 갱신함(실시간 지하철 폴링 등 이 컴포넌트의 로직을 중복 구현하지 않기 위함)
export interface CommuteCountdownState {
  urgent: boolean;
  comment: string;
  leaveInMins: number | null;
  mins: number;
  secs: number;
  transitIcon: string;
  transitName: string;
  departureClock: string | null; // "HH:MM" 형태, 없으면 null
  walkMinutes: number;
  stopLabel: string;
}

interface Props {
  firstTransitSeg: RouteSegment | undefined;
  walkMinutes: number;
  routeIndex: number;
  // 사용자가 "지금"이 아닌 특정 출발 시각을 지정해서 검색한 경우 — 이때는 실시간
  // 지하철 도착정보(현재 시각 기준)를 보여주면 안 되고, 검색 시각 기준 예정 시각으로
  // 카운트다운해야 함
  isScheduled?: boolean;
  onUpdate?: (state: CommuteCountdownState) => void;
}

// "HH:MM" 예정 시각을 오늘/내일 기준 타임스탬프로 변환 (자정 넘어가는 심야 경로 대응)
export function parseScheduledTime(hhmm: string): number | null {
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const target = new Date();
  target.setHours(Number(m[1]), Number(m[2]), 0, 0);
  if (target.getTime() < Date.now()) target.setDate(target.getDate() + 1);
  return target.getTime();
}

function getComment(leaveInMins: number, routeIndex: number): string {
  if (routeIndex === 1) return '막병 시키자~ 🍾';
  if (routeIndex === 2) return '빠르게 2차 고? 🥂';
  if (leaveInMins <= 0) return '놓치겠다! 뛰어!! 🏃‍♂️';
  if (leaveInMins < 20) return '편의점도 못 들려! 서둘러! 💦';
  if (leaveInMins < 40) return '아쉬운데 한 잔만 더? 🍺';
  if (leaveInMins < 60) return '코노 들렸다 갈까?! 🎤';
  if (leaveInMins < 90) return '천천히 마셔도 됨 🐢';
  if (leaveInMins < 100) return '해장국 먹고 가도 되겠는데? 🍲';
  return '지금은 막차 시간 잊고 일단 마셔~ 🍻';
}

const RouteCardCountdown: React.FC<Props> = ({ firstTransitSeg, walkMinutes, routeIndex, isScheduled, onUpdate }) => {
  const [nextTransitMs, setNextTransitMs] = useState<number | null>(null);
  const [trainArrivalTime, setTrainArrivalTime] = useState<string | null>(null); // "HH:MM"
  const [trainMinutesLeft, setTrainMinutesLeft] = useState<number | null>(null); // 열차까지 남은 분
  const [loading, setLoading] = useState(firstTransitSeg?.type === 'subway' && !isScheduled);
  const [, setTick] = useState(0);

  const fetchRealtime = useCallback(async () => {
    if (isScheduled || firstTransitSeg?.type !== 'subway' || !firstTransitSeg.startName) return;
    const clean = firstTransitSeg.startName.replace(/역$/, '').trim();
    const dir = resolveSubwayDirection(firstTransitSeg.lineName, firstTransitSeg.wayCode);
    const sid = lineNameToSubwayId(firstTransitSeg.lineName || '') || undefined;
    const arrivals = await getSubwayArrivals(clean, dir, sid);
    if (arrivals.length > 0) {
      // 도보 시간보다 먼저 도착하는(이미 놓치는) 열차는 건너뛰고, 걸어가서
      // 실제로 탈 수 있는 다음 열차를 선택 (없으면 조회된 것 중 가장 늦은 열차)
      const catchable = arrivals.find(a => a.minutesLeft >= walkMinutes) || arrivals[arrivals.length - 1];
      setNextTransitMs(Date.now() + catchable.minutesLeft * 60000);
      setTrainArrivalTime(catchable.arrivalTime || null);
      setTrainMinutesLeft(catchable.minutesLeft);
    }
    setLoading(false);
  }, [isScheduled, firstTransitSeg?.type, firstTransitSeg?.startName, firstTransitSeg?.nextStationName, walkMinutes]);

  useEffect(() => {
    fetchRealtime();
    const id = setInterval(fetchRealtime, 30000);
    return () => clearInterval(id);
  }, [fetchRealtime]);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 5000);
    return () => clearInterval(id);
  }, []);

  // 출발까지 남은 시간 = 열차 도착 - 지금 - 도보 시간 (지하철 실시간 트래킹 기준)
  const leaveInMs = nextTransitMs !== null
    ? nextTransitMs - Date.now() - walkMinutes * 60000
    : null;
  const leaveInMins = leaveInMs !== null ? Math.round(leaveInMs / 60000) : null;
  const leaveInSecs = leaveInMs !== null ? Math.max(0, Math.floor(leaveInMs / 1000)) : null;

  // 출발까지 남은 시간 (경로 계산 시 산출된 예정 탑승 시각 기준 — 버스/택시/시각지정검색 등)
  const scheduledTarget = firstTransitSeg?.departureTime ? parseScheduledTime(firstTransitSeg.departureTime) : null;
  const schedLeaveInMs = scheduledTarget !== null ? scheduledTarget - Date.now() - walkMinutes * 60000 : null;
  const schedLeaveInMins = schedLeaveInMs !== null ? Math.round(schedLeaveInMs / 60000) : null;
  const schedLeaveInSecs = schedLeaveInMs !== null ? Math.max(0, Math.floor(schedLeaveInMs / 1000)) : null;

  const isSubway = firstTransitSeg?.type === 'subway';
  const isBus = firstTransitSeg?.type === 'bus';

  // 실시간 조회는 끝났지만 데이터가 없는 경우(인천1·2호선 등 서울시 API 밖 노선처럼
  // 커버리지가 없는 노선) — 빈 화면 대신, 경로 계산 시 산출된 예정 탑승 시각으로 대체
  const noLiveSubwayData = isSubway && !isScheduled && !loading && leaveInMins === null;
  // 지하철은 원래 실시간 도착정보(현재 시각 기준)를 쓰지만, 사용자가 "지금"이 아닌 특정
  // 시각으로 검색한 경우(isScheduled)나 실시간 커버리지가 없는 노선은 예정 시각 기준으로
  const useScheduled = !isSubway || isScheduled || noLiveSubwayData;

  const effMins = useScheduled ? schedLeaveInMins : leaveInMins;
  const effSecs = useScheduled ? schedLeaveInSecs : leaveInSecs;
  const urgent = effMins !== null && effMins <= 1;
  const comment = getComment(effMins ?? 999, routeIndex);
  const mins = effSecs !== null ? Math.floor(effSecs / 60) : 0;
  const secs = effSecs !== null ? effSecs % 60 : 0;
  const transitIcon = isSubway ? '🚇' : isBus ? '🚌' : firstTransitSeg?.type === 'taxi' ? '🚕' : '🚶';
  const transitName = isSubway ? (firstTransitSeg?.lineName || '지하철') : isBus ? (firstTransitSeg?.lineName || '버스') : firstTransitSeg?.type === 'taxi' ? '택시' : '도보';
  const stopLabel = (isSubway || isBus) ? (isSubway ? '역까지 도보' : '정류장까지 도보') : '목적지까지 도보';
  const departureClock = useScheduled ? (firstTransitSeg?.departureTime || null) : trainArrivalTime;

  // 백그라운드 알림용 콜백 — 실시간 열차 조회 중(아직 값이 없는 순간)에는 안 쏨
  useEffect(() => {
    if (!onUpdate || (isSubway && !isScheduled && loading)) return;
    onUpdate({ urgent, comment, leaveInMins: effMins, mins, secs, transitIcon, transitName, departureClock, walkMinutes, stopLabel });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urgent, comment, effMins, mins, secs, transitIcon, transitName, departureClock, walkMinutes, stopLabel, onUpdate, isSubway, isScheduled, loading]);

  // ─── 실시간 조회 중 (지하철 · "지금" 검색일 때만) ───────────────────────
  if (isSubway && !isScheduled && loading) {
    return (
      <div className="space-y-2">
        <div className="rounded-2xl px-4 py-3 flex items-center gap-3 bg-gray-50">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-brandBlue rounded-full animate-spin shrink-0" />
          <p className="text-xs text-gray-400 font-bold">실시간 열차 조회 중...</p>
        </div>
      </div>
    );
  }

  // ─── 버스·택시·(시각 지정 검색 또는 실시간 데이터 없는) 지하철 첫 탑승: 실시간
  // 트래킹 대신, 경로 계산 시 산출된 예정 탑승 시각(departureTime)을 기준으로
  // 카운트다운 ─────────────────────────────────────────────────────────
  if (useScheduled) {
    return (
      <div className="space-y-0">
        {/* 긴박도 배너 */}
        <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 mb-3 ${urgent ? 'bg-red-50' : 'bg-blue-50'}`}>
          <Clock className={`w-4 h-4 shrink-0 ${urgent ? 'text-red-500 animate-pulse' : 'text-brandBlue'}`} />
          <div className="min-w-0">
            <p className="text-[11px] text-gray-500 font-bold">
              {schedLeaveInMins === null
                ? (walkMinutes > 0
                    ? <>도보 <span className="font-black text-gray-800">{walkMinutes}분</span> 후 탑승</>
                    : <span className="font-black text-gray-800">바로 탑승 가능</span>)
                : urgent
                  ? <span className="font-black text-red-500">지금 출발!</span>
                  : <>출발까지 <span className="font-black text-gray-800">{schedLeaveInMins}분</span> 남음</>}
            </p>
            <p className={`text-sm font-black truncate ${urgent ? 'text-red-500' : 'text-brandBlue'}`}>"{comment}"</p>
          </div>
        </div>
        {/* 탑승 수단 + 시간 + 도보 정보 박스 */}
        <div className="rounded-xl bg-gray-50 px-3 py-2.5 flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-base">{transitIcon}</span>
            <div>
              <p className="text-[10px] text-gray-400 font-bold">첫 탑승</p>
              <p className="text-sm font-black text-gray-800">{transitName}</p>
            </div>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div className="text-center">
            <p className="text-[10px] text-gray-400 font-bold">탑승 시각</p>
            <p className="text-sm font-black text-gray-800">
              {firstTransitSeg?.departureTime || '--:--'}
            </p>
          </div>
          <div className="h-8 w-px bg-gray-200" />
          <div className="flex items-center gap-1.5">
            <span className="text-base">🚶</span>
            <div>
              <p className="text-[10px] text-gray-400 font-bold">{stopLabel}</p>
              <p className="text-sm font-black text-gray-800">
                {walkMinutes > 0 ? `${walkMinutes}분` : '바로'}
              </p>
            </div>
          </div>
        </div>
        {/* 카운트다운 — 예정 탑승 시각 기준 */}
        <div className="border-t border-gray-100 pt-3">
          <p className="text-[10px] text-gray-400 font-bold mb-1">
            지금 출발해야 할 시간까지{walkMinutes > 0 ? ` (도보 ${walkMinutes}분 포함)` : ''}
          </p>
          <div className={`flex items-center gap-2 font-mono font-bold text-xl ${schedLeaveInMins === null ? 'text-gray-300' : urgent ? 'text-red-500 animate-pulse' : 'text-brandBlue'}`}>
            <Clock className="w-5 h-5" />
            {schedLeaveInMins === null
              ? <span>예정 시각 정보 없음</span>
              : schedLeaveInMins <= 0
                ? <span>지금 출발!</span>
                : <span>{mins}분 {secs.toString().padStart(2, '0')}초</span>}
          </div>
        </div>
      </div>
    );
  }

  // 여기부터는 지하철 + "지금" 검색 + 실시간 데이터 확보된 경우만 남음
  if (leaveInMins === null) return null;

  return (
    <div className="space-y-0">
      {/* 긴박도 배너 */}
      <div className={`rounded-2xl px-4 py-3 flex items-center gap-3 mb-3 ${urgent ? 'bg-red-50' : 'bg-blue-50'}`}>
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

      {/* 열차 정보 + 도보 시간 */}
      <div className="rounded-xl bg-gray-50 px-3 py-2.5 flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-base">🚇</span>
          <div>
            <p className="text-[10px] text-gray-400 font-bold">다음 열차</p>
            <p className="text-sm font-black text-gray-800">
              {trainArrivalTime
                ? <>{trainArrivalTime} 도착</>
                : '--:-- 도착'}
            </p>
          </div>
        </div>
        <div className="h-8 w-px bg-gray-200" />
        <div className="text-center">
          <p className="text-[10px] text-gray-400 font-bold">열차까지</p>
          <p className="text-sm font-black text-brandMint">
            {trainMinutesLeft !== null ? `${trainMinutesLeft}분 후` : '--분 후'}
          </p>
        </div>
        <div className="h-8 w-px bg-gray-200" />
        <div className="flex items-center gap-1.5">
          <span className="text-base">🚶</span>
          <div>
            <p className="text-[10px] text-gray-400 font-bold">역까지 도보</p>
            <p className="text-sm font-black text-gray-800">
              {walkMinutes > 0 ? `${walkMinutes}분` : '바로'}
            </p>
          </div>
        </div>
      </div>

      {/* 초 단위 카운트다운 */}
      <div className="border-t border-gray-100 pt-3">
        <p className="text-[10px] text-gray-400 font-bold mb-1">
          지금 출발해야 할 시간까지{walkMinutes > 0 ? ` (도보 ${walkMinutes}분 포함)` : ''}
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
