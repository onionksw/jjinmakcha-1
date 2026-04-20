const isDev = import.meta.env.DEV;
const TMAP_KEY = import.meta.env.VITE_TMAP_APP_KEY || '';

export interface SubwayArrival {
  line: string;
  destination: string;
  message: string;      // "2분 후", "잠시 후"
  prevStation: string;
}

export interface BusArrival {
  routeName: string;
  arrivalTime: string;
  remainStop: number;
}

// 지하철 실시간 도착 (역명)
export const getSubwayArrivals = async (stationName: string): Promise<SubwayArrival[]> => {
  try {
    const clean = stationName.replace(/역$/, '').replace(/\(.*\)/, '').trim();
    const url = isDev
      ? `/api/subway?station=${encodeURIComponent(clean)}`
      : `/api/subway?station=${encodeURIComponent(clean)}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.realtimeArrivalList) return [];

    return data.realtimeArrivalList.slice(0, 4).map((item: any) => ({
      line: item.subwayNm || item.subwayId,
      destination: item.trainLineNm || '',
      message: item.arvlMsg2 || '정보없음',
      prevStation: item.arvlMsg3 || '',
    }));
  } catch (e) {
    console.error('지하철 실시간 도착 오류:', e);
    return [];
  }
};

// 버스 실시간 도착 (정류소 이름)
export const getBusArrivals = async (stationName: string, routeName?: string): Promise<BusArrival[]> => {
  try {
    const clean = stationName.replace(/정류장$/, '').replace(/정류소$/, '').trim();
    const url = `/api/bus?stationName=${encodeURIComponent(clean)}&routeName=${encodeURIComponent(routeName || '')}`;

    const res = await fetch(url);
    const data = await res.json();

    return (data.arrivals || []).slice(0, 4);
  } catch (e) {
    console.error('버스 실시간 도착 오류:', e);
    return [];
  }
};
