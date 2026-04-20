import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const seoulKey = env.SEOUL_SUBWAY_API_KEY || 'sample';
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/api/subway': {
            target: 'http://swopenAPI.seoul.go.kr',
            changeOrigin: true,
            rewrite: (p) => {
              const params = new URLSearchParams(p.split('?')[1] || '');
              const station = params.get('station') || '';
              return `/api/subway/${seoulKey}/json/realtimeStationArrival/0/5/${encodeURIComponent(station)}`;
            },
          },
          '/api/bus': {
            target: 'https://apis.openapi.sk.com',
            changeOrigin: true,
            rewrite: (p) => {
              const params = new URLSearchParams(p.split('?')[1] || '');
              const station = params.get('stationName') || '';
              return `/tmap/transit/pois/busStations?version=1&searchKeyword=${encodeURIComponent(station)}&count=3`;
            },
            headers: { appKey: env.VITE_TMAP_APP_KEY || '' },
          },
        },
      },
      plugins: [react()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
