import { HybridRoute, RouteSegment } from '../types';

// API 키는 환경 변수에서 읽어옴 (하드코딩 제거)
const getTmapKey = (): string => {
    const key = (import.meta.env.VITE_TMAP_APP_KEY || '').trim();
    if (!key) {
        throw new Error("TMAP_APP_KEY is missing. Please set VITE_TMAP_APP_KEY in your environment variables.");
    }
    return key;
};

// 1. 주소를 좌표로 변환하는 함수 (TMAP POI API 활용)
export const getCoordinates = async (keyword: string): Promise<{ lat: number, lon: number } | null> => {
    // 1st Try: OSM (Nominatim) API as it doesn't require keys and works stably for Korean stations
    try {
        const osmUrl = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(keyword)}&format=json&limit=1`;
        const osmResponse = await fetch(osmUrl, {
            headers: {
                'User-Agent': 'JjinMakchaApp/1.0'
            }
        });
        const osmData = await osmResponse.json();

        if (osmData && osmData.length > 0) {
            return {
                lat: parseFloat(osmData[0].lat),
                lon: parseFloat(osmData[0].lon)
            };
        }
    } catch (osmError) {
        console.warn("OSM Geocoding failed, falling back to TMAP:", osmError);
    }

    try {
        const TMAP_APP_KEY = getTmapKey();
        const url = `https://apis.openapi.sk.com/tmap/pois?version=1&searchKeyword=${encodeURIComponent(keyword)}&resCoordType=WGS84GEO&reqCoordType=WGS84GEO&count=1`;

        const response = await fetch(url, {
            headers: {
                'appKey': TMAP_APP_KEY,
                'Accept': 'application/json'
            }
        });

        const data = await response.json();

        // Check for API errors
        if (data.error) {
            if (data.error.code === 'INVALID_API_KEY') {
               console.warn("TMAP App Key가 유효하지 않거나 'TMAP POI(통합) 검색 API' 권한이 없습니다.");
            } else {
               console.warn(`POI Search API Error: ${data.error.message || 'Unknown error'}`);
            }
            return null;
        }

        // TMAP POI API 응답 구조 수정
        if (data.searchPoiInfo?.pois && Array.isArray(data.searchPoiInfo.pois)) {
            const poi = data.searchPoiInfo.pois[0];
            if (poi) {
                return {
                    lat: parseFloat(poi.frontLat || poi.noorLat),
                    lon: parseFloat(poi.frontLon || poi.noorLon)
                };
            }
        }
        return null;
    } catch (error) {
        console.error("Geocoding error:", error);
        return null;
    }
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
