import React from 'react';

interface Props {
  stationName: string;
}

const RealTimeArrival: React.FC<Props> = ({ stationName }) => {
  return (
    <div className="mt-2 bg-blue-50 px-3 py-2 rounded-xl text-xs text-brandBlue font-bold flex items-center gap-1">
      <span>🚇</span>
      <span>{stationName} 실시간 도착 정보 준비 중...</span>
    </div>
  );
};

export default RealTimeArrival;
