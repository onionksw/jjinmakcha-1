import React, { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import TmapRouteView from './TmapRouteView';
import { EMBED_MAP_URL } from './EmbedMap';
import { HybridRoute } from '../types';

interface Props {
  route: HybridRoute;
  height?: string;
}

const EMBED_ORIGIN = new URL(EMBED_MAP_URL).origin;

// iOS 앱은 출처가 capacitor://localhost라 카카오가 지도 SDK를 쓰지 못하게 함(EmbedMap.tsx 참고)
// → 등록된 웹 도메인에서 도는 지도 페이지를 iframe으로 띄우고, 경로 데이터와 위치를 이 컴포넌트가
// 넘겨줌. 웹/안드로이드(https://localhost는 등록됨)는 그대로 직접 렌더링.
const IosMapFrame: React.FC<Props> = ({ route, height = '40vh' }) => {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const readyRef = useRef(false);
  const routeRef = useRef(route);
  routeRef.current = route;
  const watchesRef = useRef(new Map<number, number>());

  const post = (msg: object) => frameRef.current?.contentWindow?.postMessage(msg, EMBED_ORIGIN);

  const sendRoute = () => {
    if (!readyRef.current) return;
    // JSON 왕복으로 structured clone 불가능한 값(함수 등)을 걸러냄
    post({ type: 'embed-map-route', route: JSON.parse(JSON.stringify(routeRef.current)) });
  };

  useEffect(() => {
    const watches = watchesRef.current;
    const onError = (id: number) => (e: unknown) =>
      post({ type: 'embed-geo-error', id, message: (e as { message?: string })?.message ?? '위치 오류' });
    const onOk = (id: number) => (p: GeolocationPosition) =>
      post({ type: 'embed-geo-result', id, latitude: p.coords.latitude, longitude: p.coords.longitude });

    const onMessage = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow || e.origin !== EMBED_ORIGIN) return;
      const { type, id } = e.data ?? {};
      if (type === 'embed-map-ready') {
        readyRef.current = true;
        sendRoute();
      } else if (type === 'embed-geo-get') {
        navigator.geolocation.getCurrentPosition(onOk(id), onError(id), { enableHighAccuracy: true, timeout: 10000 });
      } else if (type === 'embed-geo-watch') {
        watches.set(id, navigator.geolocation.watchPosition(onOk(id), onError(id), { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }));
      } else if (type === 'embed-geo-clear') {
        const watchId = watches.get(id);
        if (watchId !== undefined) navigator.geolocation.clearWatch(watchId);
        watches.delete(id);
      }
    };
    window.addEventListener('message', onMessage);
    return () => {
      window.removeEventListener('message', onMessage);
      watches.forEach(watchId => navigator.geolocation.clearWatch(watchId));
      watches.clear();
    };
  }, []);

  useEffect(() => { sendRoute(); }, [route]);

  return (
    <iframe
      ref={frameRef}
      src={EMBED_MAP_URL}
      title="경로 지도"
      style={{ width: '100%', height, border: 0, display: 'block' }}
    />
  );
};

const RouteMap: React.FC<Props> = (props) =>
  Capacitor.getPlatform() === 'ios' ? <IosMapFrame {...props} /> : <TmapRouteView {...props} />;

export default RouteMap;
