import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { HybridRoute } from '../types';

// Leaflet 기본 마커 아이콘 경로 수정
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
});

interface Props {
  route: HybridRoute;
  height?: string;
}

const colorMap: Record<string, string> = {
  walk: '#9CA3AF',
  bus: '#4CC9F0',
  subway: '#06D6A0',
  taxi: '#FFD93D',
};

const TmapRouteView: React.FC<Props> = ({ route, height = '40vh' }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current) return;

    // 경로 좌표 수집
    const allCoords: [number, number][] = [];
    (route as any).segments?.forEach((seg: any) => {
      if (seg.path?.length > 0) {
        seg.path.forEach((p: any) => allCoords.push([p.lat, p.lng]));
      }
    });

    if (allCoords.length === 0) return;

    // 기존 지도 제거
    if (mapInstance.current) {
      mapInstance.current.remove();
      mapInstance.current = null;
    }

    // 지도 생성 (OpenStreetMap 타일)
    const map = L.map(mapRef.current, { zoomControl: true }).setView(
      allCoords[Math.floor(allCoords.length / 2)],
      13
    );
    mapInstance.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    // 세그먼트별 경로 그리기
    (route as any).segments?.forEach((seg: any) => {
      if (!seg.path || seg.path.length < 2) return;
      const latlngs: [number, number][] = seg.path.map((p: any) => [p.lat, p.lng]);
      L.polyline(latlngs, {
        color: colorMap[seg.type] || '#4CC9F0',
        weight: seg.type === 'walk' ? 3 : 6,
        dashArray: seg.type === 'walk' ? '6, 8' : undefined,
        opacity: 0.85,
      }).addTo(map);
    });

    // 출발/도착 마커
    const makeIcon = (label: string, bg: string) => L.divIcon({
      html: `<div style="background:${bg};color:white;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:900;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.35)">${label}</div>`,
      className: '',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

    L.marker(allCoords[0], { icon: makeIcon('출', '#4CC9F0') }).addTo(map);
    L.marker(allCoords[allCoords.length - 1], { icon: makeIcon('도', '#FF6B6B') }).addTo(map);

    // 환승 지점 마커 (walk가 아닌 세그먼트 시작점)
    const segments = (route as any).segments || [];
    segments.forEach((seg: any, idx: number) => {
      if (idx === 0) return; // 출발은 이미 표시
      if (!seg.path || seg.path.length === 0) return;
      if (seg.type === 'walk') return; // 도보는 환승 아님

      const pos: [number, number] = [seg.path[0].lat, seg.path[0].lng];
      const bgColor = seg.type === 'subway' ? '#06D6A0' : seg.type === 'bus' ? '#4CC9F0' : '#FFD93D';
      const emoji = seg.type === 'subway' ? '🚇' : seg.type === 'bus' ? '🚌' : '🚕';

      const icon = L.divIcon({
        html: `<div style="background:${bgColor};color:white;border-radius:12px;padding:2px 7px;font-size:11px;font-weight:900;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.3);white-space:nowrap;">${emoji} ${seg.lineName || seg.type}</div>`,
        className: '',
        iconAnchor: [0, 10],
      });

      L.marker(pos, { icon })
        .bindPopup(`<b>${seg.startName || ''}</b><br/>${seg.lineName || ''} ${seg.departureTime ? '출발 ' + seg.departureTime : ''}`)
        .addTo(map);
    });

    // 전체 경로가 보이도록 화면 맞춤
    map.fitBounds(L.latLngBounds(allCoords), { padding: [30, 30] });

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [route]);

  return <div ref={mapRef} style={{ width: '100%', height }} />;
};

export default TmapRouteView;
