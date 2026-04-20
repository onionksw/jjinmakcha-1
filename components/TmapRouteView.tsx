import React, { useEffect, useRef } from 'react';
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

const TMAP_KEY = import.meta.env.VITE_TMAP_APP_KEY || '';

const TmapRouteView: React.FC<Props> = ({ route, height = '40vh' }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);

  useEffect(() => {
    const loadMap = () => {
      if (!mapRef.current || !window.Tmapv2) return;

      // 경로 전체 좌표 수집
      const allCoords: { lat: number; lng: number }[] = [];
      (route as any).segments?.forEach((seg: any) => {
        if (seg.path && seg.path.length > 0) {
          allCoords.push(...seg.path);
        }
      });

      if (allCoords.length === 0) return;

      // 중심점 계산
      const centerLat = allCoords.reduce((s, c) => s + c.lat, 0) / allCoords.length;
      const centerLng = allCoords.reduce((s, c) => s + c.lng, 0) / allCoords.length;

      // 지도 생성
      mapInstance.current = new window.Tmapv2.Map(mapRef.current, {
        center: new window.Tmapv2.LatLng(centerLat, centerLng),
        width: '100%',
        height: height,
        zoom: 13,
      });

      const map = mapInstance.current;

      // 세그먼트별 색상
      const colorMap: Record<string, string> = {
        walk: '#9CA3AF',
        bus: '#4CC9F0',
        subway: '#06D6A0',
        taxi: '#FFD93D',
      };

      // 경로 폴리라인 그리기
      (route as any).segments?.forEach((seg: any) => {
        if (!seg.path || seg.path.length < 2) return;
        const latlngs = seg.path.map((p: any) => new window.Tmapv2.LatLng(p.lat, p.lng));
        new window.Tmapv2.Polyline({
          path: latlngs,
          strokeColor: colorMap[seg.type] || '#4CC9F0',
          strokeWeight: seg.type === 'walk' ? 3 : 5,
          strokeStyle: seg.type === 'walk' ? 'dot' : 'solid',
          map,
        });
      });

      // 출발/도착 마커
      if (allCoords.length > 0) {
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
      }
    };

    if (window.Tmapv2) {
      loadMap();
    } else {
      const script = document.createElement('script');
      script.src = `https://apis.openapi.sk.com/tmap/js?version=1&appKey=${TMAP_KEY}`;
      script.onload = loadMap;
      document.head.appendChild(script);
    }

    return () => {
      if (mapInstance.current) {
        mapInstance.current.destroy?.();
        mapInstance.current = null;
      }
    };
  }, [route]);

  return <div ref={mapRef} style={{ width: '100%', height }} />;
};

export default TmapRouteView;
