import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    const TAGO_KEY = env.TAGO_API_KEY || '';
    const SEOUL_KEY = env.SEOUL_SUBWAY_API_KEY || 'sample';
    const SEOUL_BUS_KEY = env.SEOUL_BUS_API_KEY || '';
    const ODSAY_KEY = env.ODSAY_API_KEY || '';
    const ODSAY_REFERER = env.ODSAY_REFERER || 'http://localhost:3000';
    const TAGO_BASE = 'https://apis.data.go.kr/1613000';
    const SEOUL_BUS_BASE = 'http://ws.bus.go.kr/api/rest';
    const ODSAY_BASE = 'https://api.odsay.com/v1/api';

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
            {
                name: 'api-dev-middleware',
                configureServer(server) {
                    server.middlewares.use(async (req, res, next) => {
                        const url = req.url || '';

                        // 지하철 실시간 도착
                        if (url.startsWith('/api/subway')) {
                            const params = new URLSearchParams(url.split('?')[1] || '');
                            const station = params.get('station') || '';
                            try {
                                const apiUrl = `http://swopenAPI.seoul.go.kr/api/subway/${SEOUL_KEY}/json/realtimeStationArrival/0/5/${encodeURIComponent(station)}`;
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
                                    routeNo: item.routeno || '',
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
                            const toSeoulItems = (data: any): any[] => {
                                const items = data?.ServiceResult?.msgBody?.itemList;
                                if (!items) return [];
                                return Array.isArray(items) ? items : [items];
                            };
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
