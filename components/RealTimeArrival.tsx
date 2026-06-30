import React, { useEffect, useState, useCallback } from 'react';
import { getSubwayArrivals, SubwayArrival } from '../services/realtimeService';
import { getBusArrivals, formatArrtime, formatArrMsg, BusArrivalInfo } from '../services/tagoService';
import { getTagoCityCode } from '../services/tmapService';

interface Props {
  type: 'subway' | 'bus';
  stationName: string;
  lineName?: string;
  cityCode?: string;
  lat?: number;  // 좌표가 있으면 서울/경기/인천 등 도시코드를 자동 판별
  lon?: number;
}

const RealTimeArrival: React.FC<Props> = ({ type, stationName, lineName, cityCode, lat, lon }) => {
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
        const data = await getSubwayArrivals(stationName);
        setSubwayData(data);
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
  }, [type, stationName, lineName, cityCode, lat, lon]);

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
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-1 min-w-0">
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md shrink-0 ${tagBg}`}>{item.line}</span>
                  <span className="text-xs text-gray-700 font-bold truncate">{item.destination}</span>
                </div>
                <span className={`text-xs font-black shrink-0 ml-2 ${item.message.includes('분') ? 'text-brandPink' : accent}`}>
                  {item.message}
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
