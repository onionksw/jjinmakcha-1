import { HybridRoute, RouteSegment } from '../types';

// API 키는 환경 변수에서 읽어옴 (하드코딩 제거)
const getTmapKey = (): string => {
    const key = (import.meta.env.VITE_TMAP_APP_KEY || '').trim();
    if (!key) {
        throw new Error("TMAP_APP_KEY is missing. Please set VITE_TMAP_APP_KEY in your environment variables.");
    }
    return key;
};

// 주소에서 검색 후보 목록 생성 (다양한 변형 시도)
const extractSearchKeyword = (input: string): string[] => {
    const s = input.trim();
    const candidates: string[] = [s];

    // 1. 괄호 안 역명: "경인로 지하 877 (동수역)" → "동수역"
    const parenMatch = s.match(/\(([^)]+)\)/);
    if (parenMatch) candidates.push(parenMatch[1]);

    // 2. 역명 패턴: "동수역", "부평역"
    const stationMatch = s.match(/([가-힣]+역)/);
    if (stationMatch) candidates.push(stationMatch[1]);

    // 3. "지하 NNN" 제거
    const noUnderground = s.replace(/지하\s*\d+/g, '').replace(/\s+/g, ' ').trim();
    if (noUnderground !== s) candidates.push(noUnderground);

    // 4. 시/도 앞부분 제거: "경기 부천시 ..." → "부천시 ..."
    const noProvince = s.replace(/^(서울|경기|인천|부산|대구|광주|대전|울산|세종|강원|충북|충남|전북|전남|경북|경남|제주)\s*/, '');
    if (noProvince !== s) candidates.push(noProvince);

    // 5. 구(區) 레벨 제거: "부천시 원미구 조마루로" → "부천시 조마루로"
    //    (원미구, 소사구 등 시·구 중복 표기 처리)
    const noGu = s.replace(/([가-힣]+시)\s+[가-힣]+구\s+/, '$1 ');
    if (noGu !== s) candidates.push(noGu);

    // 6. 시/도 + 구 모두 제거, 도로명+번지만: "조마루로385번길 92"
    const roadMatch = s.match(/([가-힣0-9]+(?:로|길|대로|번길|로\d+번길)[\d\-]*(?:\s+\d+)?)/);
    if (roadMatch) candidates.push(roadMatch[1]);

    // 7. 시/군/구 + 도로명: "부천시 조마루로385번길 92"
    const cityRoad = s.match(/([가-힣]+(시|군|구))\s+[가-힣0-9]+구\s+(.+)/);
    if (cityRoad) candidates.push(`${cityRoad[1]} ${cityRoad[3]}`);

    return [...new Set(candidates.filter(Boolean))];
};

// TMAP 주소 Geocoding (도로명주소 전용 — POI 검색과 별개)
const tmapAddressGeo = async (address: string): Promise<{ lat: number, lon: number } | null> => {
    try {
        const key = (import.meta.env.VITE_TMAP_APP_KEY || '').trim();
        if (!key) return null;
        const url = `https://apis.openapi.sk.com/tmap/geo/fullAddrGeo?version=1&addressFlag=F00&fullAddr=${encodeURIComponent(address)}&appKey=${key}`;
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        const data = await res.json();
        const coord = data.coordinateInfo?.coordinate?.[0];
        if (coord?.newLat && coord?.newLon) {
            return { lat: parseFloat(coord.newLat), lon: parseFloat(coord.newLon) };
        }
        if (coord?.lat && coord?.lon) {
            return { lat: parseFloat(coord.lat), lon: parseFloat(coord.lon) };
        }
    } catch {}
    return null;
};

const osmSearch = async (query: string): Promise<{ lat: number, lon: number } | null> => {
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1&countrycodes=kr&accept-language=ko`;
        const res = await fetch(url, { headers: { 'User-Agent': 'JjinMakchaApp/1.0' } });
        const data = await res.json();
        if (data?.length > 0) {
            return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
        }
    } catch {}
    return null;
};

const tmapPoiSearch = async (query: string): Promise<{ lat: number, lon: number } | null> => {
    try {
        const key = (import.meta.env.VITE_TMAP_APP_KEY || '').trim();
        if (!key) return null;
        const url = `https://apis.openapi.sk.com/tmap/pois?version=1&searchKeyword=${encodeURIComponent(query)}&resCoordType=WGS84GEO&reqCoordType=WGS84GEO&count=1&appKey=${key}`;
        const res = await fetch(url, { headers: { appKey: key, Accept: 'application/json' } });
        const data = await res.json();
        // Tmap 응답: searchPoiInfo.pois.poi[] 구조
        const poi = data.searchPoiInfo?.pois?.poi?.[0];
        if (poi) return { lat: parseFloat(poi.frontLat || poi.noorLat), lon: parseFloat(poi.frontLon || poi.noorLon) };
    } catch {}
    return null;
};

// ─── 장소 선택 시 좌표 캐시 (재조회 방지) ─────────────────────────────────
const coordCache = new Map<string, { lat: number; lon: number }>();

export const setCachedCoordinates = (key: string, coords: { lat: number; lon: number }) => {
    coordCache.set(key, coords);
};

// ─── POI 자동완성 검색 (여러 결과 반환) ───────────────────────────────────
export interface PoiSuggestion {
    name: string;
    address: string;
    lat: number;
    lon: number;
}

export const searchPoiSuggestions = async (query: string): Promise<PoiSuggestion[]> => {
    try {
        const key = (import.meta.env.VITE_TMAP_APP_KEY || '').trim();
        if (!key) return [];
        const url = `https://apis.openapi.sk.com/tmap/pois?version=1&searchKeyword=${encodeURIComponent(query)}&resCoordType=WGS84GEO&reqCoordType=WGS84GEO&count=8&appKey=${key}`;
        const res = await fetch(url, { headers: { appKey: key, Accept: 'application/json' } });
        const data = await res.json();
        // Tmap 응답: searchPoiInfo.pois.poi[] 구조
        const pois: any[] = data.searchPoiInfo?.pois?.poi || [];
        return pois.map(poi => ({
            name: poi.name || '',
            address: [poi.middleAddrName, poi.lowerAddrName, poi.roadName].filter(Boolean).join(' '),
            lat: parseFloat(poi.frontLat || poi.noorLat),
            lon: parseFloat(poi.frontLon || poi.noorLon),
        })).filter(p => p.lat && p.lon);
    } catch (e) {
        console.error('POI 검색 오류:', e);
        return [];
    }
};

// ─── 좌표 → 주소 (역지오코딩) ────────────────────────────────────────────
export const reverseGeocode = async (lat: number, lon: number): Promise<string> => {
    try {
        const key = (import.meta.env.VITE_TMAP_APP_KEY || '').trim();
        if (key) {
            const url = `https://apis.openapi.sk.com/tmap/geo/reversegeocoding?version=1&lat=${lat}&lon=${lon}&coordType=WGS84GEO&addressType=A10&appKey=${key}`;
            const res = await fetch(url, { headers: { appKey: key, Accept: 'application/json' } });
            const data = await res.json();
            const info = data.addressInfo;
            if (info) {
                const addr = info.roadAddress || info.fullAddress || '';
                if (addr) return addr;
            }
        }
    } catch {}

    // 폴백: OSM Nominatim
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ko`;
        const res = await fetch(url, { headers: { 'User-Agent': 'JjinMakchaApp/1.0' } });
        const data = await res.json();
        const addr = data.address;
        if (addr) {
            const parts = [addr.road, addr.quarter || addr.suburb, addr.city_district || addr.borough].filter(Boolean);
            if (parts.length) return parts.join(' ');
        }
    } catch {}

    return `현재위치`;
};

// 주소를 좌표로 변환 (캐시 → TMAP주소 → OSM → TMAP POI)
export const getCoordinates = async (keyword: string): Promise<{ lat: number, lon: number } | null> => {
    // 장소 선택 시 미리 캐시된 좌표 우선
    if (coordCache.has(keyword)) return coordCache.get(keyword)!;

    const candidates = extractSearchKeyword(keyword);

    for (const query of candidates) {
        // 1순위: TMAP 주소 geocoding (도로명주소에 가장 정확)
        const addrResult = await tmapAddressGeo(query);
        if (addrResult) { console.log(`TMAP주소 성공: "${query}"`, addrResult); return addrResult; }

        // 2순위: OSM Nominatim
        const osmResult = await osmSearch(query);
        if (osmResult) { console.log(`OSM 성공: "${query}"`, osmResult); return osmResult; }

        // 3순위: TMAP POI 검색
        const poiResult = await tmapPoiSearch(query);
        if (poiResult) { console.log(`TMAP POI 성공: "${query}"`, poiResult); return poiResult; }
    }

    console.error('모든 geocoding 시도 실패:', keyword);
    return null;
};

// 2. 대중교통 경로 탐색 함수
export const getTmapTransitRoutes = async (startLoc: string, endLoc: string): Promise<{ routes: HybridRoute[], fullTaxiCost: number }> => {
    try {
        const TMAP_APP_KEY = getTmapKey();

        // 1. 출발지/도착지 좌표 변환
        const startCoords = await getCoordinates(startLoc);
        const endCoords = await getCoordinates(endLoc);

        if (!startCoords || !endCoords) {
            throw new Error("출발지 또는 도착지의 좌표를 찾을 수 없습니다. 정확한 주소나 장소명을 입력해주세요.");
        }

        // 2. TMAP 대중교통 API 호출
        const url = 'https://apis.openapi.sk.com/transit/routes';
        const body = {
            startX: startCoords.lon,  // 숫자로 전송
            startY: startCoords.lat,
            endX: endCoords.lon,
            endY: endCoords.lat,
            count: 5,
            lang: 0,
            format: "json"
        };

        console.log("TMAP Transit API request:", {
            start: startLoc,
            end: endLoc,
            startCoords,
            endCoords
        });

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'accept': 'application/json',
                'appKey': TMAP_APP_KEY,
                'content-type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        console.log("TMAP Transit API response:", data);

        // 응답 에러 처리
        if (data.error) {
            const errorMsg = data.error.message || 'Unknown error';
            if (data.error.code === 'INVALID_API_KEY') {
                throw new Error("TMAP App Key가 유효하지 않습니다.");
            }
            throw new Error(`Transit API Error: ${errorMsg}`);
        }

        // result.status가 명시적으로 존재하고 0이 아닐 때만 오류
        if (data.result && data.result.status !== undefined && data.result.status !== 0) {
            throw new Error(data.result.message || "경로를 찾을 수 없습니다.");
        }

        if (!data.metaData?.plan?.itineraries) {
            // 응답 전체 구조 로깅해서 디버깅
            console.log("Full TMAP response:", JSON.stringify(data).slice(0, 500));
            throw new Error("경로 데이터가 없습니다. 출발지/도착지를 더 정확하게 입력해주세요.");
        }

        const itineraries = data.metaData.plan.itineraries;

        // 택시 요금 추정 (기본값, 실제로는 TMAP 택시 요금 API 연동 필요)
        const fullTaxiCost = 35000;

        // 3. TMAP 응답을 앱의 HybridRoute 형식으로 변환
        const routes: HybridRoute[] = itineraries.slice(0, 3).map((itinerary: any, index: number) => {
            const totalCost = itinerary.fare?.regular?.totalFare || 0;
            const totalDuration = Math.round(itinerary.totalTime / 60); // 초를 분으로 변환

            let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;

            const updateBounds = (lat: number, lng: number) => {
                if (lat < minLat) minLat = lat;
                if (lat > maxLat) maxLat = lat;
                if (lng < minLng) minLng = lng;
                if (lng > maxLng) maxLng = lng;
            };

            const segments: RouteSegment[] = itinerary.legs.map((leg: any) => {
                let type: 'walk' | 'bus' | 'subway' | 'taxi' = 'walk';
                let instruction = '';
                let lineName = '';
                let startName = leg.start?.name || '';
                let endName = leg.end?.name || '';
                const path: {lat: number, lng: number}[] = [];

                // 출발/도착 시간 파싱 (epoch ms → HH:MM)
                const toHHMM = (epoch: any): string | undefined => {
                    if (!epoch) return undefined;
                    const d = new Date(Number(epoch));
                    if (isNaN(d.getTime())) return undefined;
                    return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
                };
                const segDepartureTime = toHHMM(leg.startTime);
                const segArrivalTime = toHHMM(leg.endTime);

                // Extract path coordinates from linestring
                if (leg.mode === 'WALK' && leg.steps) {
                    leg.steps.forEach((step: any) => {
                        if (step.linestring) {
                            const coords = step.linestring.split(' ');
                            coords.forEach((coordStr: string) => {
                                const [lng, lat] = coordStr.split(',').map(Number);
                                if (!isNaN(lat) && !isNaN(lng)) {
                                    path.push({ lat, lng });
                                    updateBounds(lat, lng);
                                }
                            });
                        }
                    });
                } else if ((leg.mode === 'BUS' || leg.mode === 'SUBWAY') && leg.passShape?.linestring) {
                    const coords = leg.passShape.linestring.split(' ');
                    coords.forEach((coordStr: string) => {
                        const [lng, lat] = coordStr.split(',').map(Number);
                        if (!isNaN(lat) && !isNaN(lng)) {
                            path.push({ lat, lng });
                            updateBounds(lat, lng);
                        }
                    });
                } else if (leg.start && leg.end) {
                    path.push({ lat: leg.start.lat, lng: leg.start.lon });
                    path.push({ lat: leg.end.lat, lng: leg.end.lon });
                    updateBounds(leg.start.lat, leg.start.lon);
                    updateBounds(leg.end.lat, leg.end.lon);
                }

                if (leg.mode === 'WALK') {
                    type = 'walk';
                    instruction = `${startName}에서 ${endName}까지 도보 이동`;
                } else if (leg.mode === 'BUS') {
                    type = 'bus';
                    lineName = leg.route || '버스';
                    instruction = `${startName}에서 ${lineName} 버스 탑승`;
                } else if (leg.mode === 'SUBWAY') {
                    type = 'subway';
                    lineName = leg.route || '전철';
                    instruction = `${startName}에서 ${lineName} 탑승`;
                }

                return {
                    type,
                    instruction,
                    durationMinutes: Math.round(leg.sectionTime / 60),
                    cost: 0,
                    lineName,
                    startName,
                    endName,
                    path,
                    departureTime: segDepartureTime,
                    arrivalTime: segArrivalTime,
                };
            });

            // 현재 시간을 기준으로 출발 시간 계산
            const now = new Date();
            const d = new Date(now.getTime() + (index * 10) * 60000);
            const departureTime = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;

            // 환승 지점 찾기
            let transferPoint = '도착지 인근';
            const lastTransitLeg = [...itinerary.legs].reverse().find((leg: any) => leg.mode === 'BUS' || leg.mode === 'SUBWAY');
            if (lastTransitLeg?.end?.name) {
                transferPoint = lastTransitLeg.end.name;
            }

            return {
                id: `tmap-route-${index}`,
                name: `추천 경로 ${index + 1} 🗺️`,
                totalCost,
                totalDuration,
                savedAmount: fullTaxiCost - totalCost,
                transferPoint,
                departureTime,
                taxiCostOnly: fullTaxiCost,
                segments,
                bounds: { minLat, maxLat, minLng, maxLng }
            };
        });

        return {
            routes: routes.length > 0 ? routes : [],
            fullTaxiCost
        };
    } catch (error) {
        console.error("getTmapTransitRoutes Error:", error);
        throw error;
    }
};
