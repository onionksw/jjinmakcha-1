import { API_BASE } from './apiBase';

export interface BusArrivalInfo {
  routeNo: string;
  routeId?: string;
  arrtime: number;      // 초 (TAGO)
  remainStop: number;
  vehicleNo?: string;
  arrMsg?: string;      // 서울 버스 API 메시지 (e.g. "3분18초후[5번째 전]")
  arrMsg2?: string;
}

export interface BusLocation {
  vehicleNo: string;
  lat: number;
  lng: number;
  nodeName: string;
}

export interface TagoArrivalResult {
  stationName: string;
  nodeId?: string;
  arsId?: string;
  arrivals: BusArrivalInfo[];
}

export const formatArrtime = (seconds: number): string => {
  if (seconds <= 60) return '곧 도착 🔴';
  const min = Math.round(seconds / 60);
  if (min <= 5) return `${min}분 후 🟠`;
  return `${min}분 후`;
};

export const formatArrMsg = (msg: string): string => {
  if (!msg || msg === '운행종료' || msg === '출발대기') return msg || '';
  if (msg.includes('곧 도착')) return '곧 도착 🔴';
  const minMatch = msg.match(/(\d+)분/);
  if (minMatch) {
    const min = Number(minMatch[1]);
    if (min <= 5) return `${min}분 후 🟠`;
    return `${min}분 후`;
  }
  return msg;
};

// 서울 버스 도착 조회 (ws.bus.go.kr)
export const getSeoulBusArrivals = async (
  stationName: string,
  routeNo?: string,
): Promise<TagoArrivalResult> => {
  const params = new URLSearchParams({ stationName });
  if (routeNo) params.set('routeNo', routeNo);

  try {
    const res = await fetch(`${API_BASE}/api/seoul-bus?${params}`);
    if (!res.ok) return { stationName, arrivals: [] };
    const data = await res.json();
    if (data.error) return { stationName, arrivals: [] };
    return data;
  } catch {
    return { stationName, arrivals: [] };
  }
};

// 지방 버스 도착 조회 (TAGO)
export const getBusArrivals = async (
  stationName: string,
  routeNo?: string,
  cityCode = '11'
): Promise<TagoArrivalResult> => {
  // 서울(11)은 서울 버스 API 사용
  if (cityCode === '11') {
    return getSeoulBusArrivals(stationName, routeNo);
  }

  const params = new URLSearchParams({ cityCode, nodeNm: stationName });
  if (routeNo) params.set('routeNo', routeNo);

  try {
    const res = await fetch(`${API_BASE}/api/tago-arrival?${params}`);
    if (!res.ok) return { stationName, arrivals: [] };
    const data = await res.json();
    if (data.error) return { stationName, arrivals: [] };
    return data;
  } catch {
    return { stationName, arrivals: [] };
  }
};

export const getBusLocations = async (
  routeNo: string,
  cityCode = '11'
): Promise<BusLocation[]> => {
  try {
    const res = await fetch(`${API_BASE}/api/tago-location?cityCode=${cityCode}&routeNo=${encodeURIComponent(routeNo)}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.buses || [];
  } catch {
    return [];
  }
};
