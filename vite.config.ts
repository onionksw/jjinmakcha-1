import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // Capacitor 네이티브 앱은 dist/를 그대로 번들링해서 로컬 파일로 실행하기 때문에
    // 오프라인 캐싱용 PWA 서비스워커가 필요 없고, 오히려 리빌드해도 캐시된 옛 파일을
    // 계속 보여주는 충돌을 일으킬 수 있어 네이티브 빌드에서는 아예 뺌.
    const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true';
    const TAGO_KEY = env.TAGO_API_KEY || '';
    const SEOUL_KEY = env.SEOUL_SUBWAY_API_KEY || 'sample';
    const SEOUL_BUS_KEY = env.SEOUL_BUS_API_KEY || '';
    const ODSAY_KEY = env.ODSAY_API_KEY || '';
    const ODSAY_REFERER = env.ODSAY_REFERER || 'http://localhost:3000';
    const KAKAO_REST_KEY = env.KAKAO_REST_API_KEY || '';
    const NAVER_CLIENT_ID = env.NAVER_CLIENT_ID || '';
    const NAVER_CLIENT_SECRET = env.NAVER_CLIENT_SECRET || '';
    const TAGO_BASE = 'https://apis.data.go.kr/1613000';
    const SEOUL_BUS_BASE = 'http://ws.bus.go.kr/api/rest';
    const ODSAY_BASE = 'https://api.odsay.com/v1/api';
    const KAKAO_LOCAL_BASE = 'https://dapi.kakao.com/v2/local';
    const KAKAO_TRANSIT_BASE = 'https://dapi.kakao.com/v2/routing/publictraffic';
    const KAKAO_DIRECTIONS_BASE = 'https://apis-navi.kakaomobility.com/v1/directions';
    const KAKAO_WALK_BASE = 'https://dapi.kakao.com/v2/routing/walk';
    const NAVER_LOCAL_BASE = 'https://openapi.naver.com/v1/search/local.json';
    const stripTags = (s: string): string => s.replace(/<[^>]*>/g, '');

    const toItems = (data: any): any[] => {
        const item = data?.response?.body?.items?.item;
        if (!item) return [];
        return Array.isArray(item) ? item : [item];
    };

    return {
        server: {
            port: 3000,
            host: '0.0.0.0',
        },
        plugins: [
            react(),
            ...(isCapacitorBuild ? [] : [VitePWA({
                registerType: 'autoUpdate',
                includeAssets: ['icons/icon.svg'],
                manifest: {
                    name: '찐막차',
                    short_name: '찐막차',
                    description: '막차 시간 계산 & 스마트 귀가 경로',
                    theme_color: '#4CC9F0',
                    background_color: '#F0F9FF',
                    display: 'standalone',
                    orientation: 'portrait',
                    start_url: '/',
                    scope: '/',
                    icons: [
                        {
                            src: '/icons/icon-192.png',
                            sizes: '192x192',
                            type: 'image/png',
                            purpose: 'any',
                        },
                        {
                            src: '/icons/icon-512.png',
                            sizes: '512x512',
                            type: 'image/png',
                            purpose: 'any maskable',
                        },
                    ],
                },
                workbox: {
                    skipWaiting: true,
                    clientsClaim: true,
                    globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
                    // /landing은 별도 정적 페이지이므로 SPA 네비게이션 폴백(index.html 강제 서빙) 대상에서 제외
                    navigateFallbackDenylist: [/^\/landing/, /^\/privacy/, /^\/terms/],
                    runtimeCaching: [
                        {
                            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                            handler: 'CacheFirst',
                            options: { cacheName: 'google-fonts', expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 } },
                        },
                    ],
                },
            })]),
            {
                name: 'api-dev-middleware',
                configureServer(server) {
                    server.middlewares.use(async (req, res, next) => {
                        const url = req.url || '';

                        // 지하철 실시간 도착 (subway-timetable은 별도 처리 — 이 핸들러 제외)
                        if (url.startsWith('/api/subway') && !url.startsWith('/api/subway-timetable')) {
                            const params = new URLSearchParams(url.split('?')[1] || '');
                            const station = params.get('station') || '';
                            try {
                                const apiUrl = `http://swopenAPI.seoul.go.kr/api/subway/${SEOUL_KEY}/json/realtimeStationArrival/0/20/${encodeURIComponent(station)}`;
                                const r = await fetch(apiUrl);
                                const data = await r.json();
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify(data));
                            } catch (e: any) {
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: e.message }));
                            }
                            return;
                        }

                        // 버스 도착 (TAGO)
                        if (url.startsWith('/api/tago-arrival')) {
                            const params = new URLSearchParams(url.split('?')[1] || '');
                            const cityCode = params.get('cityCode') || '11';
                            const nodeNm = params.get('nodeNm') || '';
                            const routeNo = params.get('routeNo') || '';
                            try {
                                // 정류소 검색
                                const stationUrl = `${TAGO_BASE}/BusSttnInfoInqireService/getSttnNoList?serviceKey=${TAGO_KEY}&cityCode=${cityCode}&nodeNm=${encodeURIComponent(nodeNm)}&_type=json&numOfRows=5`;
                                const stationRes = await fetch(stationUrl);
                                const stationData = await stationRes.json();
                                const stations = toItems(stationData);

                                if (stations.length === 0) {
                                    res.setHeader('Content-Type', 'application/json');
                                    res.end(JSON.stringify({ arrivals: [], stationName: nodeNm }));
                                    return;
                                }

                                const nodeId = stations[0].nodeid;
                                const stationName = stations[0].nodenm;

                                // 도착 정보
                                const arrivalUrl = `${TAGO_BASE}/ArvlInfoInqireService/getSttnAcctoArvlPrearngeInfoList?serviceKey=${TAGO_KEY}&cityCode=${cityCode}&nodeId=${nodeId}&_type=json&numOfRows=10`;
                                const arrivalRes = await fetch(arrivalUrl);
                                const arrivalData = await arrivalRes.json();
                                let arrivals = toItems(arrivalData).map((item: any) => ({
                                    routeNo: String(item.routeno ?? ''),
                                    routeId: item.routeid || '',
                                    arrtime: Number(item.arrtime || 0),
                                    remainStop: Number(item.arrprevstationcnt || 0),
                                    vehicleNo: item.vehicletp || '',
                                }));

                                if (routeNo) {
                                    arrivals = arrivals.filter((a: any) => a.routeNo.includes(routeNo));
                                }

                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ stationName, nodeId, arrivals: arrivals.slice(0, 6) }));
                            } catch (e: any) {
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: e.message, arrivals: [] }));
                            }
                            return;
                        }

                        // 버스 위치 (TAGO)
                        if (url.startsWith('/api/tago-location')) {
                            const params = new URLSearchParams(url.split('?')[1] || '');
                            const cityCode = params.get('cityCode') || '11';
                            const routeNo = params.get('routeNo') || '';
                            try {
                                const routeUrl = `${TAGO_BASE}/BusRouteInfoInqireService/getRouteNoList?serviceKey=${TAGO_KEY}&cityCode=${cityCode}&routeNo=${encodeURIComponent(routeNo)}&_type=json&numOfRows=5`;
                                const routeRes = await fetch(routeUrl);
                                const routeData = await routeRes.json();
                                const routes = toItems(routeData);

                                if (routes.length === 0) {
                                    res.setHeader('Content-Type', 'application/json');
                                    res.end(JSON.stringify({ buses: [] }));
                                    return;
                                }

                                const routeId = routes[0].routeid;
                                const locUrl = `${TAGO_BASE}/BusLcInfoInqireService/getRouteAcctoBusLcList?serviceKey=${TAGO_KEY}&cityCode=${cityCode}&routeId=${routeId}&_type=json`;
                                const locRes = await fetch(locUrl);
                                const locData = await locRes.json();
                                const buses = toItems(locData).map((b: any) => ({
                                    vehicleNo: b.vehicleno || '',
                                    lat: Number(b.gpslati || 0),
                                    lng: Number(b.gpslong || 0),
                                    nodeName: b.nodenm || '',
                                }));

                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ buses }));
                            } catch (e: any) {
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: e.message, buses: [] }));
                            }
                            return;
                        }

                        // 버스 노선 유형 조회 (심야버스 여부)
                        if (url.startsWith('/api/tago-route-type')) {
                            const params = new URLSearchParams(url.split('?')[1] || '');
                            const cityCode = params.get('cityCode') || '11';
                            const routeNo = params.get('routeNo') || '';
                            if (!TAGO_KEY) {
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ routetp: null, error: 'NO_KEY' }));
                                return;
                            }
                            try {
                                const apiUrl = `${TAGO_BASE}/BusRouteInfoInqireService/getRouteNoList`
                                    + `?serviceKey=${TAGO_KEY}&cityCode=${cityCode}`
                                    + `&routeNo=${encodeURIComponent(routeNo)}`
                                    + `&_type=json&numOfRows=5`;
                                const r = await fetch(apiUrl);
                                const data = await r.json();
                                const items = toItems(data);
                                const match = items.find((i: any) => i.routeno === routeNo) || items[0];
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify(match
                                    ? { routetp: match.routetp ?? null, routeid: match.routeid ?? null }
                                    : { routetp: null }
                                ));
                            } catch (e: any) {
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: e.message, routetp: null }));
                            }
                            return;
                        }

                        // ODsay 대중교통 경로 탐색 프록시
                        if (url.startsWith('/api/odsay')) {
                            const params = new URLSearchParams(url.split('?')[1] || '');
                            const SX = params.get('SX') || '';
                            const SY = params.get('SY') || '';
                            const EX = params.get('EX') || '';
                            const EY = params.get('EY') || '';
                            const SearchType = params.get('SearchType') || '';
                            const SearchDate = params.get('SearchDate') || '';
                            const SearchTime = params.get('SearchTime') || '';
                            if (!ODSAY_KEY) {
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: [{ code: 'NO_KEY', message: 'ODSAY_API_KEY 환경변수가 설정되지 않았습니다' }] }));
                                return;
                            }
                            try {
                                let apiUrl = `${ODSAY_BASE}/searchPubTransPathT?SX=${SX}&SY=${SY}&EX=${EX}&EY=${EY}&apiKey=${ODSAY_KEY}`;
                                if (SearchType) apiUrl += `&SearchType=${SearchType}`;
                                if (SearchDate) apiUrl += `&SearchDate=${SearchDate}`;
                                if (SearchTime) apiUrl += `&SearchTime=${SearchTime}`;
                                const r = await fetch(apiUrl, {
                                    headers: {
                                        'Referer': ODSAY_REFERER,
                                        'Origin': ODSAY_REFERER,
                                        'User-Agent': 'Mozilla/5.0',
                                    },
                                });
                                const data = await r.json();
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify(data));
                            } catch (e: any) {
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: [{ code: '500', message: e.message }] }));
                            }
                            return;
                        }

                        // 서울 버스 도착 정보
                        if (url.startsWith('/api/seoul-bus')) {
                            const params = new URLSearchParams(url.split('?')[1] || '');
                            const stationName = params.get('stationName') || '';
                            const routeNo = params.get('routeNo') || '';
                            const routeOnly = params.get('routeOnly') || '';
                            const toSeoulItems = (data: any): any[] => {
                                // JSON 응답은 XML과 달리 ServiceResult 래퍼가 없음
                                const items = data?.msgBody?.itemList ?? data?.ServiceResult?.msgBody?.itemList;
                                if (!items) return [];
                                return Array.isArray(items) ? items : [items];
                            };

                            // 정류소 없이 노선 자체의 첫차/막차 시각만 필요할 때 (시각 지정 경로 검증용)
                            if (routeOnly && routeNo) {
                                try {
                                    const routeUrl = `${SEOUL_BUS_BASE}/busRouteInfo/getBusRouteList?serviceKey=${SEOUL_BUS_KEY}&strSrch=${encodeURIComponent(routeNo)}&resultType=json`;
                                    const routeRes = await fetch(routeUrl);
                                    const routeData = await routeRes.json();
                                    const routes = toSeoulItems(routeData);
                                    const candidates = routes.filter((r: any) => r.busRouteAbrv === routeNo || r.busRouteNm === routeNo);
                                    const route = candidates[0] || routes[0];
                                    res.setHeader('Content-Type', 'application/json');
                                    if (!route) { res.end(JSON.stringify({ found: false })); return; }
                                    res.end(JSON.stringify({
                                        found: true,
                                        busRouteId: route.busRouteId,
                                        firstBusTm: route.firstBusTm || '',
                                        lastBusTm: route.lastBusTm || '',
                                        routeType: route.routeType || '',
                                    }));
                                } catch (e: any) {
                                    res.setHeader('Content-Type', 'application/json');
                                    res.end(JSON.stringify({ found: false, error: e.message }));
                                }
                                return;
                            }

                            try {
                                // 1. 정류소명 → arsId
                                const stUrl = `${SEOUL_BUS_BASE}/stationinfo/getStationByName?serviceKey=${SEOUL_BUS_KEY}&stSrch=${encodeURIComponent(stationName)}&resultType=json`;
                                const stRes = await fetch(stUrl);
                                const stData = await stRes.json();
                                const stations = toSeoulItems(stData);

                                if (stations.length === 0) {
                                    res.setHeader('Content-Type', 'application/json');
                                    res.end(JSON.stringify({ stationName, arsId: '', arrivals: [] }));
                                    return;
                                }

                                const arsId = stations[0].arsId;
                                const foundName = stations[0].stNm || stationName;

                                // 2. arsId → 도착 정보
                                // 공식 활용가이드 기준 stId만으로 조회 가능한 전체버스용 함수가 없고
                                // getLowArrInfoByStIdList(저상버스 한정)만 존재함
                                const arrUrl = `${SEOUL_BUS_BASE}/arrive/getLowArrInfoByStId?serviceKey=${SEOUL_BUS_KEY}&arsId=${arsId}&resultType=json`;
                                const arrRes = await fetch(arrUrl);
                                const arrData = await arrRes.json();
                                let arrivals = toSeoulItems(arrData).map((item: any) => ({
                                    routeNo: item.rtNm || '',
                                    arrMsg: item.arrmsg1 || '',
                                    arrMsg2: item.arrmsg2 || '',
                                    remainStop: 0,
                                    arrtime: 0,
                                }));

                                if (routeNo) {
                                    arrivals = arrivals.filter((a: any) => a.routeNo.includes(routeNo));
                                }

                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ stationName: foundName, arsId, arrivals: arrivals.slice(0, 6) }));
                            } catch (e: any) {
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: e.message, arrivals: [] }));
                            }
                            return;
                        }

                        // 카카오 API 통합 프록시 (Vercel Hobby 플랜 서버리스 함수 12개 제한 때문에
                        // kakao-local/transit/directions/walk를 파일 하나로 합쳐서 씀 — type 파라미터로 분기)
                        if (url.startsWith('/api/kakao-local')) {
                            const params = new URLSearchParams(url.split('?')[1] || '');
                            const type = params.get('type') || '';
                            if (!KAKAO_REST_KEY) {
                                res.statusCode = 500;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: 'KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다' }));
                                return;
                            }

                            let targetUrl = '';
                            if (type === 'transit' || type === 'walk') {
                                const start_x = params.get('start_x') || '';
                                const start_y = params.get('start_y') || '';
                                const end_x = params.get('end_x') || '';
                                const end_y = params.get('end_y') || '';
                                if (!start_x || !start_y || !end_x || !end_y) {
                                    res.statusCode = 400;
                                    res.setHeader('Content-Type', 'application/json');
                                    res.end(JSON.stringify({ error: 'start_x, start_y, end_x, end_y가 필요합니다' }));
                                    return;
                                }
                                const qs = new URLSearchParams({ start_x, start_y, end_x, end_y, input_coord: 'WGS84' }).toString();
                                targetUrl = `${type === 'transit' ? KAKAO_TRANSIT_BASE : KAKAO_WALK_BASE}?${qs}`;
                            } else if (type === 'directions') {
                                const origin = params.get('origin') || '';
                                const destination = params.get('destination') || '';
                                if (!origin || !destination) {
                                    res.statusCode = 400;
                                    res.setHeader('Content-Type', 'application/json');
                                    res.end(JSON.stringify({ error: 'origin, destination이 필요합니다' }));
                                    return;
                                }
                                const qs = new URLSearchParams({ origin, destination }).toString();
                                targetUrl = `${KAKAO_DIRECTIONS_BASE}?${qs}`;
                            } else {
                                const KAKAO_ENDPOINTS: Record<string, string> = {
                                    address: '/search/address.json',
                                    keyword: '/search/keyword.json',
                                    coord2address: '/geo/coord2address.json',
                                    coord2regioncode: '/geo/coord2regioncode.json',
                                };
                                const kakaoPath = KAKAO_ENDPOINTS[type];
                                if (!kakaoPath) {
                                    res.statusCode = 400;
                                    res.setHeader('Content-Type', 'application/json');
                                    res.end(JSON.stringify({ error: `알 수 없는 type: ${type}` }));
                                    return;
                                }
                                params.delete('type');
                                targetUrl = `${KAKAO_LOCAL_BASE}${kakaoPath}?${params.toString()}`;
                            }

                            try {
                                const r = await fetch(targetUrl, {
                                    headers: { Authorization: `KakaoAK ${KAKAO_REST_KEY}` },
                                });
                                const data = await r.json();
                                res.statusCode = r.status;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify(data));
                            } catch (e: any) {
                                res.statusCode = 500;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: e.message }));
                            }
                            return;
                        }

                        // 네이버 지역 검색 프록시
                        if (url.startsWith('/api/naver-local')) {
                            const params = new URLSearchParams(url.split('?')[1] || '');
                            const query = params.get('query') || '';
                            const display = params.get('display') || '8';
                            if (!query) {
                                res.statusCode = 400;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: 'query 필요' }));
                                return;
                            }
                            if (!NAVER_CLIENT_ID || !NAVER_CLIENT_SECRET) {
                                res.statusCode = 500;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: 'NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 환경변수가 설정되지 않았습니다' }));
                                return;
                            }
                            try {
                                const r = await fetch(
                                    `${NAVER_LOCAL_BASE}?query=${encodeURIComponent(query)}&display=${display}&sort=random`,
                                    {
                                        headers: {
                                            'X-Naver-Client-Id': NAVER_CLIENT_ID,
                                            'X-Naver-Client-Secret': NAVER_CLIENT_SECRET,
                                        },
                                    },
                                );
                                const data = await r.json();
                                const items = (data.items || []).map((item: any) => ({
                                    name: stripTags(item.title || ''),
                                    category: item.category || '',
                                    address: item.roadAddress || item.address || '',
                                    lat: Number(item.mapy) / 1e7,
                                    lon: Number(item.mapx) / 1e7,
                                })).filter((p: any) => p.lat && p.lon);
                                res.statusCode = r.status;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ items }));
                            } catch (e: any) {
                                res.statusCode = 500;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: e.message }));
                            }
                            return;
                        }

                        // 좌표 → TAGO 시군구 코드
                        if (url.startsWith('/api/tago-city-code')) {
                            const params = new URLSearchParams(url.split('?')[1] || '');
                            const lat = params.get('lat') || '';
                            const lon = params.get('lon') || '';
                            if (!lat || !lon) {
                                res.statusCode = 400;
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ error: 'lat, lon 필요' }));
                                return;
                            }
                            try {
                                const r = await fetch(
                                    `${TAGO_BASE}/BusSttnInfoInqireService/getCrdntPrxmtSttnList?serviceKey=${TAGO_KEY}&gpsLati=${lat}&gpsLong=${lon}&_type=json&numOfRows=1`
                                );
                                const data = await r.json();
                                const item = data?.response?.body?.items?.item;
                                const first = Array.isArray(item) ? item[0] : item;
                                const cityCode = first?.citycode ? String(first.citycode) : '11';
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ cityCode }));
                            } catch (e: any) {
                                res.setHeader('Content-Type', 'application/json');
                                res.end(JSON.stringify({ cityCode: '11', error: e.message }));
                            }
                            return;
                        }

                        next();
                    });
                },
            },
        ],
        resolve: {
            alias: {
                '@': path.resolve(__dirname, '.'),
            },
        },
    };
});
