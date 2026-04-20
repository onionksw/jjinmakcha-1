import React, { useEffect, useRef, useState } from 'react';
import { HybridRoute } from '../types';

declare global {
  interface Window {
    Tmapv2: any;
  }
}

interface Props {
  route: HybridRoute;
  height?: string;
}

const TmapRouteView: React.FC<Props> = ({ route, height = '40vh' }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const init = () => {
      if (cancelled || !mapRef.current) return;
      if (!window.Tmapv2) {
        setError('TMAP SDK 로드 실패');
        return;
      }

      const allCoords: { lat: number; lng: number }[] = [];
      (route as any).segments?.forEach((seg: any) => {
        if (seg.path?.length > 0) allCoords.push(...seg.path);
      });

      if (allCoords.length === 0) {
        setError('경로 좌표 없음');
        return;
      }

      const centerLat = allCoords.reduce((s, c) => s + c.lat, 0) / allCoords.length;
      const centerLng = allCoords.reduce((s, c) => s + c.lng, 0) / allCoords.length;

      try {
        mapRef.current.innerHTML = '';
        const map = new window.Tmapv2.Map(mapRef.current, {
          center: new window.Tmapv2.LatLng(centerLat, centerLng),
          width: '100%',
          height: height,
          zoom: 13,
        });
        mapInstance.current = map;

        const colorMap: Record<string, string> = {
          walk: '#9CA3AF',
          bus: '#4CC9F0',
          subway: '#06D6A0',
          taxi: '#FFD93D',
        };

        (route as any).segments?.forEach((seg: any) => {
          if (!seg.path || seg.path.length < 2) return;
          const latlngs = seg.path.map((p: any) => new window.Tmapv2.LatLng(p.lat, p.lng));
          new window.Tmapv2.Polyline({
            path: latlngs,
            strokeColor: colorMap[seg.type] || '#4CC9F0',
            strokeWeight: seg.type === 'walk' ? 3 : 6,
            strokeStyle: seg.type === 'walk' ? 'dot' : 'solid',
            map,
          });
        });

        new window.Tmapv2.Marker({
          position: new window.Tmapv2.LatLng(allCoords[0].lat, allCoords[0].lng),
          map,
          title: '출발',
        });
        const last = allCoords[allCoords.length - 1];
        new window.Tmapv2.Marker({
          position: new window.Tmapv2.LatLng(last.lat, last.lng),
          map,
          title: '도착',
        });
      } catch (e: any) {
        console.error('Map init error:', e);
        setError(e.message);
      }
    };

    // SDK가 준비될 때까지 대기
    const timer = setTimeout(init, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (mapInstance.current) {
        try { mapInstance.current.destroy?.(); } catch {}
        mapInstance.current = null;
      }
    };
  }, [route]);

  if (error) {
    return (
      <div style={{ height }} className="w-full bg-blue-50 flex flex-col items-center justify-center gap-2 text-gray-400">
        <span className="text-3xl">🗺️</span>
        <span className="text-sm font-bold">지도를 불러올 수 없습니다</span>
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height, position: 'relative' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
};

export default TmapRouteView;
