import React, { useEffect, useMemo, useState } from 'react';
import TmapRouteView, { GeoAdapter } from './TmapRouteView';
import { HybridRoute } from '../types';

// iOS 네이티브 앱(출처 capacitor://localhost)에서는 카카오맵 SDK가 거부돼서(도메인 불일치,
// 그리고 location.protocol이 https가 아니라 SDK 본체를 http로 불러와 iOS가 차단) 지도를
// 직접 못 그림 — 등록된 도메인(jjinmakcha.com)에서 이 페이지를 iframe으로 띄우고, 앱이
// postMessage로 경로 데이터를 넘겨주면 여기서 지도를 그림 (RouteMap.tsx 참고).
// 위치도 iframe 안에서 직접 받지 않고(권한 동작이 불확실) 앱 본체가 대신 받아서 넘겨줌.
export const EMBED_MAP_URL = 'https://jjinmakcha.com/embed-map';

const ALLOWED_PARENT_ORIGINS = ['capacitor://localhost', 'ionic://localhost', 'https://localhost'];

type GeoCallbacks = {
  ok: Parameters<GeoAdapter['getCurrentPosition']>[0];
  err: Parameters<GeoAdapter['getCurrentPosition']>[1];
  once: boolean;
};

const EmbedMap: React.FC = () => {
  const [route, setRoute] = useState<HybridRoute | null>(null);

  const geo = useMemo(() => {
    const callbacks = new Map<number, GeoCallbacks>();
    let nextId = 1;
    const ask = (type: string, id: number) => window.parent.postMessage({ type, id }, '*');

    const adapter: GeoAdapter = {
      getCurrentPosition(ok, err) {
        const id = nextId++;
        callbacks.set(id, { ok, err, once: true });
        ask('embed-geo-get', id);
      },
      watchPosition(ok, err) {
        const id = nextId++;
        callbacks.set(id, { ok, err, once: false });
        ask('embed-geo-watch', id);
        return id;
      },
      clearWatch(id) {
        callbacks.delete(id);
        ask('embed-geo-clear', id);
      },
    };

    const handle = (data: any) => {
      const cb = callbacks.get(data.id);
      if (!cb) return;
      if (data.type === 'embed-geo-result') {
        cb.ok({ coords: { latitude: data.latitude, longitude: data.longitude } });
        if (cb.once) callbacks.delete(data.id);
      } else if (data.type === 'embed-geo-error') {
        cb.err(new Error(data.message));
        callbacks.delete(data.id);
      }
    };

    return { adapter, handle };
  }, []);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (!ALLOWED_PARENT_ORIGINS.includes(e.origin)) return;
      if (e.data?.type === 'embed-map-route') setRoute(e.data.route);
      else if (typeof e.data?.type === 'string' && e.data.type.startsWith('embed-geo-')) geo.handle(e.data);
    };
    window.addEventListener('message', onMessage);
    window.parent.postMessage({ type: 'embed-map-ready' }, '*');
    return () => window.removeEventListener('message', onMessage);
  }, [geo]);

  if (!route) return null;
  return <TmapRouteView route={route} height="100vh" geo={geo.adapter} />;
};

export default EmbedMap;
