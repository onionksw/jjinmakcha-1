import React, { useEffect, useRef, useCallback } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { HybridRoute } from '../types';

import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: markerIcon, iconRetinaUrl: markerIcon2x, shadowUrl: markerShadow });

interface Props {
  route: HybridRoute;
  height?: string;
}

const getSubwayColor = (lineName: string): string => {
  const n = lineName || '';
  if (n.includes('1호선')) return '#0052A4';
  if (n.includes('2호선')) return '#00A84D';
  if (n.includes('3호선')) return '#EF7C1C';
  if (n.includes('4호선')) return '#00A4E3';
  if (n.includes('5호선')) return '#996CAC';
  if (n.includes('6호선')) return '#CD7C2F';
  if (n.includes('7호선')) return '#747F00';
  if (n.includes('8호선')) return '#E6186C';
  if (n.includes('9호선')) return '#BDB092';
  if (n.includes('신분당')) return '#D31145';
  if (n.includes('분당') || n.includes('수인')) return '#F5A200';
  if (n.includes('경의') || n.includes('중앙')) return '#77C4A3';
  if (n.includes('경춘')) return '#0C8E72';
  if (n.includes('공항')) return '#0065B3';
  if (n.includes('GTX')) return '#9C4EA8';
  return '#06D6A0';
};

const segmentColor = (seg: any): string => {
  if (seg.type === 'walk') return '#9CA3AF';
  if (seg.type === 'bus') return '#4CC9F0';
  if (seg.type === 'subway') return getSubwayColor(seg.lineName || '');
  return '#FFD93D';
};

const TmapRouteView: React.FC<Props> = ({ route, height = '40vh' }) => {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const myLocationMarker = useRef<L.Marker | null>(null);
  const myLocationCircle = useRef<L.Circle | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const goToMyLocation = useCallback(() => {
    const map = mapInstance.current;
    if (!map) return;

    const btn = btnRef.current;
    if (btn) {
      btn.style.background = '#3B82F6';
      btn.style.color = 'white';
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;

        // 기존 현위치 레이어 제거
        if (myLocationMarker.current) { myLocationMarker.current.remove(); myLocationMarker.current = null; }
        if (myLocationCircle.current) { myLocationCircle.current.remove(); myLocationCircle.current = null; }

        // 정확도 원
        myLocationCircle.current = L.circle([lat, lng], {
          radius: accuracy,
          color: '#3B82F6',
          fillColor: '#3B82F6',
          fillOpacity: 0.12,
          weight: 1,
          dashArray: '4 4',
        }).addTo(map);

        // 현위치 마커
        const myIcon = L.divIcon({
          html: `
            <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
              <div style="background:#3B82F6;color:white;border-radius:10px;padding:4px 8px;font-size:11px;font-weight:900;white-space:nowrap;box-shadow:0 3px 10px rgba(59,130,246,0.5);border:2px solid white;">
                📍 현재 위치
              </div>
              <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #3B82F6;"></div>
              <div style="width:12px;height:12px;background:#3B82F6;border-radius:50%;border:3px solid white;margin-top:-2px;box-shadow:0 0 0 3px rgba(59,130,246,0.3);"></div>
            </div>`,
          className: '',
          iconAnchor: [50, 42],
        });
        myLocationMarker.current = L.marker([lat, lng], { icon: myIcon }).addTo(map);

        map.flyTo([lat, lng], 16, { duration: 1.2 });

        if (btn) {
          btn.style.background = '#3B82F6';
          btn.style.color = 'white';
        }
      },
      () => {
        alert('위치 정보를 가져올 수 없습니다. 브라우저 위치 권한을 확인해주세요.');
        if (btn) {
          btn.style.background = 'white';
          btn.style.color = '#374151';
        }
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  useEffect(() => {
    if (!mapRef.current) return;

    const segments = (route as any).segments || [];
    const allCoords: [number, number][] = [];
    segments.forEach((seg: any) => {
      seg.path?.forEach((p: any) => allCoords.push([p.lat, p.lng]));
    });
    if (allCoords.length === 0) return;

    if (mapInstance.current) { mapInstance.current.remove(); mapInstance.current = null; }

    const map = L.map(mapRef.current, { zoomControl: false }).setView(
      allCoords[Math.floor(allCoords.length / 2)], 13
    );
    mapInstance.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // 세그먼트별 경로 폴리라인
    segments.forEach((seg: any) => {
      if (!seg.path || seg.path.length < 2) return;
      const latlngs: [number, number][] = seg.path.map((p: any) => [p.lat, p.lng]);
      L.polyline(latlngs, {
        color: segmentColor(seg),
        weight: seg.type === 'walk' ? 3 : 6,
        dashArray: seg.type === 'walk' ? '6, 8' : undefined,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round',
      }).addTo(map);
    });

    // ── 출발 마커 ──
    const startCoord = allCoords[0];
    const startName = segments[0]?.startName || '출발';
    const startIcon = L.divIcon({
      html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
          <div style="background:#1F2937;color:white;border-radius:10px;padding:4px 8px;font-size:11px;font-weight:900;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.35);border:2px solid white;max-width:120px;overflow:hidden;text-overflow:ellipsis;">
            🚩 ${startName}
          </div>
          <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #1F2937;"></div>
          <div style="width:10px;height:10px;background:#1F2937;border-radius:50%;border:2px solid white;margin-top:-2px;box-shadow:0 2px 5px rgba(0,0,0,0.3);"></div>
        </div>`,
      className: '',
      iconAnchor: [60, 38],
    });
    L.marker(startCoord, { icon: startIcon }).addTo(map);

    // ── 도착 마커 ──
    const endCoord = allCoords[allCoords.length - 1];
    const lastSeg = segments[segments.length - 1];
    const endName = lastSeg?.endName || route.transferPoint || '도착';
    const endIcon = L.divIcon({
      html: `
        <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
          <div style="background:#FF6B6B;color:white;border-radius:10px;padding:4px 8px;font-size:11px;font-weight:900;white-space:nowrap;box-shadow:0 3px 10px rgba(0,0,0,0.35);border:2px solid white;max-width:120px;overflow:hidden;text-overflow:ellipsis;">
            🏁 ${endName}
          </div>
          <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid #FF6B6B;"></div>
          <div style="width:10px;height:10px;background:#FF6B6B;border-radius:50%;border:2px solid white;margin-top:-2px;box-shadow:0 2px 5px rgba(0,0,0,0.3);"></div>
        </div>`,
      className: '',
      iconAnchor: [60, 38],
    });
    L.marker(endCoord, { icon: endIcon }).addTo(map);

    // ── 환승 마커 ──
    let stepNum = 1;
    segments.forEach((seg: any, idx: number) => {
      if (idx === 0) return;
      if (!seg.path || seg.path.length === 0) return;
      if (seg.type === 'walk') return;

      const pos: [number, number] = [seg.path[0].lat, seg.path[0].lng];
      const color = segmentColor(seg);
      const emoji = seg.type === 'subway' ? '🚇' : '🚌';
      const label = seg.lineName || (seg.type === 'bus' ? '버스' : '전철');
      const stationName = seg.startName || '';
      const time = seg.departureTime || '';
      const num = stepNum++;

      const icon = L.divIcon({
        html: `
          <div style="position:relative;display:flex;flex-direction:column;align-items:center;">
            <div style="display:flex;align-items:center;gap:4px;background:${color};color:white;border-radius:10px;padding:4px 8px;font-size:11px;font-weight:900;box-shadow:0 3px 10px rgba(0,0,0,0.35);border:2px solid white;white-space:nowrap;">
              <span style="background:rgba(255,255,255,0.3);border-radius:50%;width:16px;height:16px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:900;flex-shrink:0;">${num}</span>
              <span>${emoji} ${label}</span>
              ${time ? `<span style="font-size:9px;opacity:0.85;">· ${time}</span>` : ''}
            </div>
            <div style="width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-top:8px solid ${color};"></div>
            <div style="width:10px;height:10px;background:${color};border-radius:50%;border:2px solid white;margin-top:-2px;box-shadow:0 2px 5px rgba(0,0,0,0.3);"></div>
          </div>`,
        className: '',
        iconAnchor: [60, 42],
      });

      const popupContent = `
        <div style="font-family:'Jua',sans-serif;min-width:150px;">
          <div style="font-size:14px;font-weight:900;color:#1F2937;margin-bottom:4px;">${stationName}${seg.type === 'subway' ? '역' : ' 정류장'}</div>
          <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
            <span style="background:${color};color:white;border-radius:6px;padding:2px 6px;font-size:11px;font-weight:900;">${emoji} ${label}</span>
          </div>
          ${time ? `<div style="font-size:11px;color:#6B7280;margin-top:4px;">⏰ 출발 예정 <b style="color:${color}">${time}</b></div>` : ''}
          ${seg.durationMinutes ? `<div style="font-size:11px;color:#6B7280;">⏱ 약 ${seg.durationMinutes}분 탑승</div>` : ''}
          ${seg.endName ? `<div style="font-size:11px;color:#6B7280;">📍 하차: ${seg.endName}${seg.type === 'subway' ? '역' : ''}</div>` : ''}
        </div>`;

      L.marker(pos, { icon })
        .bindPopup(popupContent, { maxWidth: 220, className: 'transit-popup' })
        .addTo(map);
    });

    map.fitBounds(L.latLngBounds(allCoords), { padding: [40, 40] });

    return () => {
      map.remove();
      mapInstance.current = null;
      myLocationMarker.current = null;
      myLocationCircle.current = null;
    };
  }, [route]);

  return (
    <div style={{ position: 'relative', width: '100%', height }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%', borderRadius: '16px', overflow: 'hidden' }} />
      {/* 현위치 버튼 */}
      <button
        ref={btnRef}
        onClick={goToMyLocation}
        title="현재 위치로 이동"
        style={{
          position: 'absolute',
          bottom: '90px',
          right: '10px',
          zIndex: 1000,
          width: '34px',
          height: '34px',
          background: 'white',
          border: '2px solid rgba(0,0,0,0.2)',
          borderRadius: '4px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 1px 5px rgba(0,0,0,0.2)',
          fontSize: '18px',
          transition: 'background 0.2s, color 0.2s',
          color: '#374151',
        }}
      >
        ◎
      </button>
    </div>
  );
};

export default TmapRouteView;
