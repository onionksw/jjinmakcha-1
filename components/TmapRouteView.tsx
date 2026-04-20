import React, { useEffect, useRef } from 'react';
import { HybridRoute } from '../types';

interface Props {
  route: HybridRoute;
  height?: string;
}

const TmapRouteView: React.FC<Props> = ({ route, height = '40vh' }) => {
  const mapRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={mapRef}
      style={{ height }}
      className="w-full bg-gradient-to-br from-blue-50 to-blue-100 flex flex-col items-center justify-center gap-3 text-brandBlue"
    >
      <div className="text-4xl">🗺️</div>
      <div className="text-center">
        <p className="font-black text-lg">경로 지도</p>
        <p className="text-sm text-gray-500 font-medium">환승점: {route.transferPoint}</p>
      </div>
      <div className="flex gap-4 text-xs font-bold text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-brandMint inline-block"></span>지하철</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-brandBlue inline-block"></span>버스</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-full bg-brandYellow inline-block"></span>택시</span>
      </div>
    </div>
  );
};

export default TmapRouteView;
