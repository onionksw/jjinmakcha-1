import React, { useEffect, useState, useCallback } from 'react';
import { getSubwayArrivals, getSubwayTimetable, SubwayArrival, resolveSubwayDirection } from '../services/realtimeService';
import { getBusArrivals, formatArrtime, formatArrMsg, BusArrivalInfo } from '../services/tagoService';
import { getTagoCityCode } from '../services/tmapService';

interface Props {
  type: 'subway' | 'bus';
  stationName: string;
  lineName?: string;
  endName?: string;
  wayCode?: number | null;
  wayName?: string;
  nextStationName?: string;  // 진행 방향 다음 역 (방향 필터용)
  cityCode?: string;
  lat?: number;
  lon?: number;
}

const RealTimeArrival: React.FC<Props> = ({ type, stationName, lineName, endName, wayCode, wayName, nextStationName, cityCode, lat, lon }) => {
  const [subwayData, setSubwayData] = useState<SubwayArrival[]>([]);
  const [busData, setBusData] = useState<BusArrivalInfo[]>([]);
  const [displayStation, setDisplayStation] = useState(stationName);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (type === 'subway') {
        // 시간표 기반 조회: wayCode로 방향 고정 (1→상행U, 2→하행D)
        const timetable = lineName ? await getSubwayTimetable(stationName, lineName, wayCode) : [];
        if (timetable.length > 0) {
          setSubwayData(timetable);
        } else {
          const dir = resolveSubwayDirection(lineName, wayCode);
          const data = await getSubwayArrivals(stationName, dir);
          const norm = (s: string) => s.replace(/\s/g, '').replace(/^서울|^수도권/, '');
          const filtered = lineName
            ? data.filter(item => { const a = norm(lineName), b = norm(item.line); return a.includes(b) || b.includes(a); })
            : data;
          setSubwayData(filtered);
        }
      } else {
        // cityCode가 명시되지 않으면 좌표로 서울/경기/인천 등 자동 판별
        const resolvedCityCode = cityCode ?? (lat && lon ? await getTagoCityCode(lat, lon) : '11');
        const result = await getBusArrivals(stationName, lineName, resolvedCityCode);
        setBusData(result.arrivals);
        if (result.stationName) setDisplayStation(result.stationName);
      }
      const now = new Date();
      setLastUpdated(
        `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`
      );
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [type, stationName, lineName, endName, nextStationName, cityCode, lat, lon]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const isSubway = type === 'subway';
  const accent = isSubway ? 'text-brandMint' : 'text-brandBlue';
  const bg = isSubway ? 'bg-green-50 border-green-100' : 'bg-blue-50 border-blue-100';
  const tagBg = isSubway ? 'bg-green-100 text-brandMint' : 'bg-blue-100 text-brandBlue';
  const icon = isSubway ? '🚇' : '🚌';

  return (
    <div className={`mt-2 rounded-2xl border p-3 ${bg}`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${isSubway ? 'bg-brandMint' : 'bg-brandBlue'} animate-pulse`} />
          <span className="text-xs font-black text-gray-600">{icon} 실시간 도착</span>
          <span className="text-[10px] text-gray-400 font-bold truncate max-w-[100px]">{displayStation}</span>
        </div>
        <button
          onClick={fetchData}
          className="text-[10px] text-gray-400 hover:text-gray-600 font-bold flex items-center gap-0.5"
        >
          ↺ {lastUpdated}
        </button>
      </div>

      {/* 본문 */}
      {loading ? (
        <div className="flex items-center gap-2 py-1">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-brandBlue rounded-full animate-spin" />
          <span className="text-xs text-gray-400">조회 중...</span>
        </div>
      ) : error ? (
        <p className="text-xs text-gray-400 py-1">정보를 가져올 수 없습니다</p>
      ) : isSubway ? (
        subwayData.length === 0 ? (
          <p className="text-xs text-gray-400 py-1">도착 예정 열차 없음</p>
        ) : (
          <div className="space-y-1">
            {subwayData.map((item, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-xs font-mono text-gray-500 shrink-0 w-10">{item.arrivalTime || '--:--'}</span>
                <span className="text-xs text-gray-700 font-bold flex-1 truncate">{item.destination}</span>
                <span className={`text-xs font-black shrink-0 ${
                  item.minutesLeft <= 1 ? 'text-brandPink' :
                  item.minutesLeft <= 5 ? 'text-orange-500' : accent
                }`}>
                  {item.minutesLeft === 0
                    ? (item.isRealtime ? '🚨 지금!' : '곧')
                    : `${item.minutesLeft}분후`}
                </span>
              </div>
            ))}
          </div>
        )
      ) : (
        busData.length === 0 ? (
          <p className="text-xs text-gray-400 py-1">
            {lineName ? `${lineName}번 실시간 정보 미제공 (광역·외곽 노선)` : '도착 예정 버스 없음'}
          </p>
        ) : (
          <div className="space-y-1">
            {busData.map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${tagBg}`}>{item.routeNo}</span>
                  <span className="text-xs text-gray-500">{item.remainStop}정류장 전</span>
                </div>
                <span className={`text-xs font-black ${(item.arrMsg || '').includes('곧') || item.arrtime <= 60 ? 'text-brandPink' : 'text-brandBlue'}`}>
                  {item.arrMsg ? formatArrMsg(item.arrMsg) : formatArrtime(item.arrtime)}
                </span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};

export default RealTimeArrival;
