import React, { useEffect, useState, useCallback } from 'react';
import { getSubwayArrivals, getBusArrivals, SubwayArrival, BusArrival } from '../services/realtimeService';

interface Props {
  type: 'subway' | 'bus';
  stationName: string;
  lineName?: string;
}

const RealTimeArrival: React.FC<Props> = ({ type, stationName, lineName }) => {
  const [subwayData, setSubwayData] = useState<SubwayArrival[]>([]);
  const [busData, setBusData] = useState<BusArrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      if (type === 'subway') {
        const data = await getSubwayArrivals(stationName);
        setSubwayData(data);
      } else {
        const data = await getBusArrivals(stationName, lineName);
        setBusData(data);
      }
      const now = new Date();
      setLastUpdated(`${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}:${now.getSeconds().toString().padStart(2,'0')}`);
    } finally {
      setLoading(false);
    }
  }, [type, stationName, lineName]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // 30초마다 갱신
    return () => clearInterval(interval);
  }, [fetchData]);

  const bgColor = type === 'subway' ? 'bg-green-50 border-green-100' : 'bg-blue-50 border-blue-100';
  const dotColor = type === 'subway' ? 'bg-brandMint' : 'bg-brandBlue';
  const icon = type === 'subway' ? '🚇' : '🚌';

  return (
    <div className={`mt-2 rounded-2xl border p-3 ${bgColor}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1">
          <span className={`w-2 h-2 rounded-full ${dotColor} animate-pulse`} />
          <span className="text-xs font-black text-gray-600">{icon} 실시간 도착 정보</span>
        </div>
        <button
          onClick={fetchData}
          className="text-[10px] text-gray-400 hover:text-gray-600 font-bold flex items-center gap-1"
        >
          ↺ {lastUpdated}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-1">
          <div className="w-4 h-4 border-2 border-gray-200 border-t-brandBlue rounded-full animate-spin" />
          <span className="text-xs text-gray-400">조회 중...</span>
        </div>
      ) : type === 'subway' ? (
        subwayData.length === 0 ? (
          <p className="text-xs text-gray-400 py-1">도착 정보 없음</p>
        ) : (
          <div className="space-y-1">
            {subwayData.map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-1 min-w-0">
                  <span className="text-[10px] font-bold text-brandMint bg-green-100 px-1.5 py-0.5 rounded-md shrink-0">{item.line}</span>
                  <span className="text-xs text-gray-700 font-bold truncate">{item.destination}</span>
                </div>
                <span className={`text-xs font-black shrink-0 ml-2 ${item.message.includes('분') ? 'text-brandPink' : 'text-brandMint'}`}>
                  {item.message}
                </span>
              </div>
            ))}
          </div>
        )
      ) : (
        busData.length === 0 ? (
          <p className="text-xs text-gray-400 py-1">도착 정보 없음</p>
        ) : (
          <div className="space-y-1">
            {busData.map((item, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] font-bold text-brandBlue bg-blue-100 px-1.5 py-0.5 rounded-md">{item.routeName}</span>
                  <span className="text-xs text-gray-500">{item.remainStop}정류장 전</span>
                </div>
                <span className="text-xs font-black text-brandPink">{item.arrivalTime}</span>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  );
};

export default RealTimeArrival;
