import React, { useEffect, useRef, useCallback, useState } from 'react';
import { HybridRoute } from '../types';

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
  if (seg.type === 'walk')   return '#9CA3AF';
  if (seg.type === 'taxi')   return '#F97316';
  if (seg.type === 'bus')    return '#3B82F6';
  if (seg.type === 'subway') return getSubwayColor(seg.lineName || '');
  return '#06D6A0';
};

let _sdkPromise: Promise<void> | null = null;

const loadKakaoSDK = (): Promise<void> => {
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const w = window as any;
  if (w.kakao?.maps?.Map) return Promise.resolve();
  if (_sdkPromise) return _sdkPromise;

  _sdkPromise = new Promise<void>((resolve, reject) => {
    if (w.kakao?.maps?.load) {
      w.kakao.maps.load(resolve);
    } else {
      // index.html에서 SDK가 아직 로드 중 — 100ms 간격으로 최대 10초 대기
      let attempts = 0;
      const timer = setInterval(() => {
        attempts++;
        if (w.kakao?.maps?.load) {
          clearInterval(timer);
          w.kakao.maps.load(resolve);
        } else if (attempts > 100) {
          clearInterval(timer);
          _sdkPromise = null;
          reject(new Error('카카오맵 SDK 로드 타임아웃'));
        }
      }, 100);
    }
  });
  /* eslint-enable */
  return _sdkPromise;
};


// ─── OSRM 도보 경로 (무료, API 키 불필요) ────────────────────────────────
const walkPathCache = new Map<string, { lat: number; lng: number }[]>();

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pathLengthM(path: { lat: number; lng: number }[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    total += haversineM(path[i - 1].lat, path[i - 1].lng, path[i].lat, path[i].lng);
  }
  return total;
}

async function fetchWalkPath(
  startLat: number, startLng: number,
  endLat: number,   endLng: number,
): Promise<{ lat: number; lng: number }[]> {
  const key = `${startLat.toFixed(5)},${startLng.toFixed(5)}->${endLat.toFixed(5)},${endLng.toFixed(5)}`;
  if (walkPathCache.has(key)) return walkPathCache.get(key)!;
  try {
    const url = `https://router.project-osrm.org/route/v1/foot/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    const coords: number[][] = data.routes?.[0]?.geometry?.coordinates;
    if (coords?.length >= 2) {
      const path = coords.map(([lng, lat]) => ({ lat, lng }));
      // OSRM 한국 보행자 데이터가 시장·골목 등에서 부실해 엉뚱하게 크게
      // 우회하는 경로를 줄 때가 있음 — 직선거리 대비 과도하게 길면 버림
      const straight = haversineM(startLat, startLng, endLat, endLng);
      if (pathLengthM(path) > straight * 2.2 + 150) {
        return [];
      }
      walkPathCache.set(key, path);
      return path;
    }
  } catch (e) {
    console.error('[도보경로 오류]', e);
  }
  return [];
}

// 이 컴포넌트가 쓰는 위치 API만 뽑은 최소 형태 — iOS 앱의 지도 iframe 안에서는 위치를
// 직접 못 받아서(RouteMap.tsx 참고) 앱 본체가 대신 받아 postMessage로 넘겨주는 어댑터를 주입함
export interface GeoAdapter {
  getCurrentPosition(
    ok: (p: { coords: { latitude: number; longitude: number } }) => void,
    err: (e: unknown) => void,
    opts?: PositionOptions,
  ): void;
  watchPosition(
    ok: (p: { coords: { latitude: number; longitude: number } }) => void,
    err: (e: unknown) => void,
    opts?: PositionOptions,
  ): number;
  clearWatch(id: number): void;
}

// 나침반 방향 — iOS는 iOS 13+부터 DeviceOrientationEvent.requestPermission()으로 사용자
// 제스처 안에서 허가를 받아야 하고, iframe(EmbedMap.tsx)에서는 그 허가 자체가 불안정해서
// 위치와 동일하게 iOS는 앱 본체(RouteMap.tsx)가 대신 구독해 postMessage로 넘겨줌
export interface HeadingAdapter {
  watchHeading(cb: (headingDeg: number) => void): number;
  clearHeading(id: number): void;
}

function browserHeadingAdapter(): HeadingAdapter {
  const handlers = new Map<number, (e: Event) => void>();
  let nextId = 1;
  return {
    watchHeading(cb) {
      const handler = (e: Event) => {
        const de = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
        // iOS: webkitCompassHeading은 이미 "북쪽=0"인 실제 방위각. 안드로이드/크롬은 alpha가
        // 기기 기준 회전값이라 (360 - alpha)로 뒤집어야 나침반 방위(북=0, 시계방향)와 맞음
        const heading = de.webkitCompassHeading ?? (de.alpha != null ? (360 - de.alpha) % 360 : null);
        if (heading != null) cb(heading);
      };
      const eventName = 'ondeviceorientationabsolute' in window ? 'deviceorientationabsolute' : 'deviceorientation';
      const id = nextId++;
      handlers.set(id, handler);

      const requestPermission = (DeviceOrientationEvent as any)?.requestPermission;
      if (typeof requestPermission === 'function') {
        requestPermission().then((state: string) => {
          if (state === 'granted') window.addEventListener(eventName, handler);
        }).catch(() => {});
      } else {
        window.addEventListener(eventName, handler);
      }
      return id;
    },
    clearHeading(id) {
      const handler = handlers.get(id);
      if (handler) {
        window.removeEventListener('deviceorientationabsolute', handler);
        window.removeEventListener('deviceorientation', handler);
        handlers.delete(id);
      }
    },
  };
}

interface Props {
  route: HybridRoute;
  height?: string;
  geo?: GeoAdapter;
  heading?: HeadingAdapter;
}

const TmapRouteView: React.FC<Props> = ({ route, height = '40vh', geo, heading }) => {
  const getGeo = (): GeoAdapter => geo ?? navigator.geolocation;
  // 매번 새로 만들면 clearHeading이 자기가 등록 안 한 다른 인스턴스의 handlers를 봐서
  // 못 지움 — ref로 하나만 만들어 재사용
  const defaultHeading = useRef<HeadingAdapter | null>(null);
  const getHeading = (): HeadingAdapter => {
    if (heading) return heading;
    if (!defaultHeading.current) defaultHeading.current = browserHeadingAdapter();
    return defaultHeading.current;
  };
  const headingWatchId = useRef<number | null>(null);
  const headingDeg = useRef<number>(0);
  const mapRef    = useRef<HTMLDivElement>(null);
  const mapInst   = useRef<any>(null);
  const overlays  = useRef<any[]>([]);
  const plines    = useRef<any[]>([]);
  const myLocOverlay = useRef<any>(null);
  const watchIdRef = useRef<number | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  const stopTracking = () => {
    if (watchIdRef.current !== null) {
      getGeo().clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsTracking(false);
  };

  const clearMap = () => {
    overlays.current.forEach(o => o.setMap(null));
    overlays.current = [];
    plines.current.forEach(p => p.setMap(null));
    plines.current = [];
    // 지도가 통째로 교체되는 상황이므로 실시간 추적도 같이 끊어야 함 —
    // 안 하면 이전 지도용 watch가 계속 돌면서 사라진 마커를 갱신하려 함
    stopTracking();
    // 지도 인스턴스 자체가 교체되므로(경로 재조회 등) 이전 지도에 붙어있던
    // 내 위치 마커 참조도 함께 정리 — 안 하면 새 지도엔 안 보이는데 참조는 살아있어
    // setPosition()이 조용히 무시되고, 다음 클릭 때도 마커가 안 뜨는 상태가 됨
    if (myLocOverlay.current) {
      myLocOverlay.current.setMap(null);
      myLocOverlay.current = null;
    }
    if (headingWatchId.current !== null) {
      getHeading().clearHeading(headingWatchId.current);
      headingWatchId.current = null;
    }
    myLocConeEl.current = null;
  };

  const addOverlay = (map: any, kakao: any, lat: number, lng: number, html: string, yAnchor = 1.1) => {
    const o = new kakao.maps.CustomOverlay({
      position: new kakao.maps.LatLng(lat, lng),
      content: html,
      yAnchor,
    });
    o.setMap(map);
    overlays.current.push(o);
  };

  useEffect(() => {
    if (!mapRef.current) return;

    const segments = route.segments || [];
    const allCoords: { lat: number; lng: number }[] = [];
    segments.forEach((seg: any) => seg.path?.forEach((p: any) => allCoords.push(p)));
    if (allCoords.length === 0) return;

    let cancelled = false;
    setMapError(null);

    loadKakaoSDK().then(async () => {
      if (cancelled || !mapRef.current) return;

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const kakao: any = (window as any).kakao;
      /* eslint-enable */

      if (mapInst.current) { clearMap(); mapInst.current = null; }

      const center = allCoords[Math.floor(allCoords.length / 2)];
      let map: any;
      try {
        map = new kakao.maps.Map(mapRef.current, {
          center: new kakao.maps.LatLng(center.lat, center.lng),
          level: 5,
        });
      } catch (e: any) {
        if (!cancelled) setMapError(e?.message || String(e));
        return;
      }
      mapInst.current = map;

      // ── walk 좌표 보완: path 없는 도보 구간은 인접 segment 끝점 + 실제 출발/도착 좌표로 직선 ──
      const origPt  = route.origLat && route.origLng ? { lat: route.origLat, lng: route.origLng } : null;
      const destPt  = route.destLat && route.destLng ? { lat: route.destLat, lng: route.destLng } : null;
      const isFirstWalk = (idx: number) => idx === 0 || segments.slice(0, idx).every((s: any) => s.type === 'walk');
      const isLastWalk  = (idx: number) => segments.slice(idx + 1).every((s: any) => s.type === 'walk');

      const enriched: any[] = segments.map((seg: any, idx: number) => {
        if (seg.type !== 'walk' || (seg.path?.length ?? 0) >= 2) return seg;
        const prev = segments[idx - 1];
        const next = segments[idx + 1];

        // 첫 번째 도보: 실제 출발 좌표 사용
        const startFallback = isFirstWalk(idx) ? origPt : null;
        // 마지막 도보: 실제 도착 좌표 사용
        const endFallback   = isLastWalk(idx)  ? destPt : null;

        const start = prev?.path?.at?.(-1) ?? startFallback;
        const end   = next?.path?.[0]      ?? endFallback;

        if (start && end && (start.lat !== end.lat || start.lng !== end.lng)) {
          return { ...seg, path: [start, end] };
        }
        return seg;
      });

      // ── walk 직선(2점) → OSRM 실제 보행 경로로 교체 ────────────────────
      if (!cancelled) {
        await Promise.all(enriched.map(async (seg, i) => {
          if (seg.type !== 'walk' || (seg.path?.length ?? 0) !== 2) return;
          const [s, e] = seg.path;
          const actual = await fetchWalkPath(s.lat, s.lng, e.lat, e.lng);
          if (actual.length >= 2) enriched[i] = { ...seg, path: actual };
        }));
      }
      if (cancelled || !mapRef.current) return;

      // ── 1차: 대중교통·택시 폴리라인 (walk보다 먼저 그려 아래에 위치) ──────
      enriched.forEach((seg: any) => {
        if (seg.type === 'walk' || !seg.path || seg.path.length < 2) return;
        const path  = seg.path.map((p: any) => new kakao.maps.LatLng(p.lat, p.lng));
        const color = segmentColor(seg);
        const shadow = new kakao.maps.Polyline({ path, strokeWeight: 12, strokeColor: '#ffffff', strokeOpacity: 0.85, strokeStyle: 'solid' });
        shadow.setMap(map); plines.current.push(shadow);
        const line = new kakao.maps.Polyline({ path, strokeWeight: 7, strokeColor: color, strokeOpacity: 1, strokeStyle: 'solid' });
        line.setMap(map); plines.current.push(line);
      });

      // ── 2차: 도보 폴리라인 (위에 겹쳐 보이도록 나중에 그림) ──────────────
      enriched.forEach((seg: any) => {
        if (seg.type !== 'walk' || !seg.path || seg.path.length < 2) return;
        const path = seg.path.map((p: any) => new kakao.maps.LatLng(p.lat, p.lng));
        const bg = new kakao.maps.Polyline({ path, strokeWeight: 10, strokeColor: '#ffffff', strokeOpacity: 1, strokeStyle: 'solid' });
        bg.setMap(map); plines.current.push(bg);
        const dash = new kakao.maps.Polyline({ path, strokeWeight: 5, strokeColor: '#38BDF8', strokeOpacity: 1, strokeStyle: 'dash' });
        dash.setMap(map); plines.current.push(dash);

        if (seg.durationMinutes) {
          const mid = seg.path[Math.floor(seg.path.length / 2)];
          addOverlay(map, kakao, mid.lat, mid.lng, `
            <div style="background:white;border:1.5px solid #38BDF8;border-radius:20px;
              padding:3px 10px;font-size:10px;font-weight:800;color:#0EA5E9;
              white-space:nowrap;box-shadow:0 1px 6px rgba(56,189,248,0.15);pointer-events:none;">
              🚶 ${seg.durationMinutes}분
            </div>`, 0.5);
        }
      });


      const lastSeg = segments[segments.length - 1];
      const endName = lastSeg?.endName || route.transferPoint || '도착';
      const destLat = route.destLat ?? allCoords[allCoords.length - 1].lat;
      const destLng = route.destLng ?? allCoords[allCoords.length - 1].lng;

      // ── 전체 경로 맞춤 뷰를 마커 생성보다 먼저 적용해서 실제 줌 레벨을 얻음 ──
      // (수도권 광역 경로처럼 넓게 축소될수록 고정 픽셀 마커가 서로 겹쳐 보이는
      // 문제가 있어서, 줌 레벨에 비례해 마커 크기를 함께 줄임)
      const bounds = new kakao.maps.LatLngBounds();
      allCoords.forEach(c => bounds.extend(new kakao.maps.LatLng(c.lat, c.lng)));
      bounds.extend(new kakao.maps.LatLng(destLat, destLng));
      map.setBounds(bounds, 60, 60, 60, 60);

      const zoomLevel = map.getLevel();
      // level 4 이하(도보권 수준 확대)는 원래 크기 그대로, 넓어질수록 최대 0.55배까지 축소
      const scale = Math.max(0.55, Math.min(1, 1 - (zoomLevel - 4) * 0.09));
      const px = (base: number) => Math.round(base * scale);

      // ── 도착 마커 (빨강): 실제 목적지 좌표 우선, 없으면 마지막 경로 좌표 사용 ──
      addOverlay(map, kakao, destLat, destLng, `
        <div style="display:flex;flex-direction:column;align-items:center;gap:${px(10)}px;pointer-events:none;">
          <div style="width:${px(42)}px;height:${px(42)}px;background:#EF4444;border:${Math.max(2, px(3.5))}px solid white;border-radius:50%;
            display:flex;align-items:center;justify-content:center;
            box-shadow:0 4px 16px rgba(239,68,68,0.45);font-size:${px(20)}px;">🏠</div>
          <div style="background:#EF4444;color:white;border-radius:10px;padding:${Math.max(2, px(3))}px ${px(10)}px;
            font-size:${Math.max(8, px(10))}px;font-weight:900;white-space:nowrap;max-width:100px;
            overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 8px rgba(239,68,68,0.35);">
            ${endName}
          </div>
        </div>`);

      // ── 환승·탑승 마커 ────────────────────────────────────────────
      let stepNum = 1;
      segments.forEach((seg: any, idx: number) => {
        if (idx === 0 || !seg.path?.length || seg.type === 'walk') return;
        // 단일 좌표(path 1개)는 폴리라인 없이 탑승 마커만 표시 (택시 환승 지점 등)
        const pos   = seg.path[0];
        const color = segmentColor(seg);
        const emoji = seg.type === 'subway' ? '🚇' : seg.type === 'taxi' ? '🚕' : '🚌';
        const label = seg.lineName || (seg.type === 'taxi' ? '택시' : seg.type === 'bus' ? '버스' : '지하철');
        const name  = seg.startName || label;
        const time  = seg.departureTime || '';
        const num   = stepNum++;

        addOverlay(map, kakao, pos.lat, pos.lng, `
          <div style="display:flex;flex-direction:column;align-items:center;gap:${px(10)}px;pointer-events:none;">
            <div style="position:relative;">
              <div style="width:${px(38)}px;height:${px(38)}px;background:${color};border:${Math.max(2, px(3))}px solid white;border-radius:50%;
                display:flex;align-items:center;justify-content:center;
                box-shadow:0 4px 12px rgba(0,0,0,0.22);font-size:${px(17)}px;">${emoji}</div>
              <div style="position:absolute;top:-5px;right:-5px;width:${Math.max(12, px(18))}px;height:${Math.max(12, px(18))}px;
                background:white;border:${Math.max(1, px(2))}px solid ${color};border-radius:50%;
                display:flex;align-items:center;justify-content:center;
                font-size:${Math.max(7, px(9))}px;font-weight:900;color:${color};line-height:1;">${num}</div>
            </div>
            <div style="background:${color};color:white;border-radius:10px;padding:${Math.max(2, px(3))}px ${px(9)}px;
              font-size:${Math.max(8, px(10))}px;font-weight:900;white-space:nowrap;max-width:110px;
              overflow:hidden;text-overflow:ellipsis;box-shadow:0 2px 6px rgba(0,0,0,0.18);">
              ${name}${time ? ` · ${time}` : ''}
            </div>
          </div>`);
      });

    }).catch(err => {
      console.error('카카오맵 로드 실패:', err);
      if (!cancelled) setMapError(String(err?.message || err));
    });

    return () => { cancelled = true; clearMap(); };
  }, [route]);

  // 방향 원뿔(cone) DOM 노드를 직접 들고 있다가 heading이 바뀔 때마다 transform만 갱신 —
  // 나침반은 초당 여러 번 갱신되는데, 그때마다 Kakao CustomOverlay content를 통째로
  // 새로 그리면(setContent) 매번 리플로우/깜빡임이 생겨서 DOM 노드를 직접 돌림
  const myLocConeEl = useRef<HTMLDivElement | null>(null);

  const updateHeadingCone = (deg: number) => {
    headingDeg.current = deg;
    if (myLocConeEl.current) {
      myLocConeEl.current.style.opacity = '1';
      // transform-origin이 삼각형의 밑변(50% 100%)이라 translate로 그 점을 마커 중심에
      // 맞춰두면, rotate는 그 중심점을 축으로 뾰족한 끝만 시계방향으로 도는 나침반처럼 움직임
      myLocConeEl.current.style.transform = `translate(-50%, -100%) rotate(${deg}deg)`;
    }
  };

  // 마커가 있으면 위치만 옮기고(setPosition), 없을 때만 새로 생성 — 클릭마다
  // 새로 만들면 이전 마커가 지도에 남아 계속 쌓이던 버그라 반드시 재사용해야 함
  const placeMyLocMarker = (map: any, kakao: any, lat: number, lng: number, pan: boolean) => {
    const pos = new kakao.maps.LatLng(lat, lng);
    if (pan) map.panTo(pos);
    if (myLocOverlay.current) {
      myLocOverlay.current.setPosition(pos);
    } else {
      const wrapper = document.createElement('div');
      wrapper.style.cssText = 'position:relative;width:20px;height:20px;';

      const cone = document.createElement('div');
      // 북쪽(0deg)일 때 위를 가리키는 삼각형 — 방향을 아직 못 받아온 상태(opacity 0)로 시작
      cone.style.cssText = `
        position:absolute;left:50%;top:50%;width:0;height:0;opacity:0;
        border-left:12px solid transparent;border-right:12px solid transparent;
        border-bottom:34px solid rgba(59,130,246,0.35);
        transform-origin:50% 100%;transform:translate(-50%,-100%) rotate(0deg);
        pointer-events:none;transition:opacity 0.2s;
      `;
      myLocConeEl.current = cone;

      const dot = document.createElement('div');
      dot.style.cssText = `
        position:absolute;left:50%;top:50%;width:20px;height:20px;margin:-10px 0 0 -10px;
        background:#3B82F6;border:3px solid white;border-radius:50%;
        box-shadow:0 0 0 6px rgba(59,130,246,0.2);
      `;

      wrapper.appendChild(cone);
      wrapper.appendChild(dot);

      myLocOverlay.current = new kakao.maps.CustomOverlay({
        position: pos,
        content: wrapper,
        yAnchor: 0.5,
      });
      myLocOverlay.current.setMap(map);
    }
  };

  // 1번째 클릭: 현재 위치를 한 번만 잡아서 보여줌
  // 2번째 클릭(이미 위치를 잡아둔 상태): 실시간 추적 모드 시작 — watchPosition으로
  // 위치가 바뀔 때마다 마커가 자연스럽게 따라오도록 함
  // 추적 중 다시 클릭: 추적은 끄지 않고 현재 위치로 지도만 다시 중심 이동
  const goToMyLocation = useCallback(() => {
    const map = mapInst.current;
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const kakao: any = (window as any).kakao;
    /* eslint-enable */
    if (!map) return;

    // iOS는 DeviceOrientationEvent 권한도 위치처럼 사용자 제스처가 필요해서, 위치 요청(비동기)이
    // 끝난 뒤가 아니라 버튼 클릭 이 시점에 바로(동기적으로) 요청해야 허가 요청이 씹히지 않음
    if (headingWatchId.current === null) {
      headingWatchId.current = getHeading().watchHeading(updateHeadingCone);
    }

    if (isTracking) {
      getGeo().getCurrentPosition(
        ({ coords: { latitude: lat, longitude: lng } }) => placeMyLocMarker(map, kakao, lat, lng, true),
        () => {},
        { enableHighAccuracy: true, timeout: 10000 },
      );
      return;
    }

    if (!myLocOverlay.current) {
      getGeo().getCurrentPosition(
        ({ coords: { latitude: lat, longitude: lng } }) => placeMyLocMarker(map, kakao, lat, lng, true),
        () => alert('위치 정보를 가져올 수 없습니다.'),
        { enableHighAccuracy: true, timeout: 10000 },
      );
      return;
    }

    watchIdRef.current = getGeo().watchPosition(
      ({ coords: { latitude: lat, longitude: lng } }) => placeMyLocMarker(map, kakao, lat, lng, true),
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 },
    );
    setIsTracking(true);
  }, [isTracking, geo]);

  return (
    <div style={{ position: 'relative', width: '100%', height, overflow: 'hidden' }}>
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />
      {mapError && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8f9fa', flexDirection: 'column', gap: 8, padding: 16 }}>
          <span style={{ fontSize: 24 }}>🗺️</span>
          <p style={{ fontSize: 12, color: '#6b7280', textAlign: 'center', wordBreak: 'break-all' }}>지도 오류: {mapError}</p>
        </div>
      )}
      <button
        onClick={goToMyLocation}
        title={isTracking ? '실시간 추적 중 (탭하면 현재 위치로 재중심)' : '현재 위치로 이동'}
        style={{
          position: 'absolute', bottom: '100px', right: '12px', zIndex: 1000,
          width: '44px', height: '44px', background: isTracking ? '#3B82F6' : 'white', border: 'none',
          borderRadius: '50%', cursor: 'pointer', fontSize: '21px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isTracking ? '0 3px 14px rgba(59,130,246,0.5)' : '0 3px 14px rgba(0,0,0,0.18)',
          transition: 'transform 0.15s, background 0.15s',
        }}
        onMouseDown={e => (e.currentTarget.style.transform = 'scale(0.9)')}
        onMouseUp={e => (e.currentTarget.style.transform = 'scale(1)')}
      >
        {isTracking ? '🧭' : '📍'}
      </button>
    </div>
  );
};

export default TmapRouteView;
