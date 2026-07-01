const SUBWAY_LINE_MAP: Record<string, string> = {
  '1001': '1호선', '1002': '2호선', '1003': '3호선', '1004': '4호선',
  '1005': '5호선', '1006': '6호선', '1007': '7호선', '1008': '8호선',
  '1009': '9호선', '1063': '경의중앙선', '1065': '공항철도', '1067': '경춘선',
  '1075': 'GTX-A', '1077': '신분당선', '1092': '우이신설선',
};

// lineName → subwayId 매핑 (ODsay 노선명 → 서울 API 코드)
const LINE_NAME_TO_ID: Array<[string, string]> = [
  ['공항철도', '1065'], ['신분당선', '1077'], ['경의중앙선', '1063'],
  ['경춘선', '1067'], ['우이신설선', '1092'], ['GTX', '1075'],
  ['9호선', '1009'], ['8호선', '1008'], ['7호선', '1007'], ['6호선', '1006'],
  ['5호선', '1005'], ['4호선', '1004'], ['3호선', '1003'], ['2호선', '1002'], ['1호선', '1001'],
];

export const lineNameToSubwayId = (lineName: string): string | null => {
  const norm = lineName.replace(/\s/g, '').replace(/^서울|^수도권/, '');
  const match = LINE_NAME_TO_ID.find(([key]) => norm.includes(key) || key.includes(norm));
  return match ? match[1] : null;
};

// 시간표 기반 지하철 도착 조회
export const getSubwayTimetable = async (
  stationName: string,
  lineName: string,
  endStationName?: string,  // 하차역 — 방향 필터에 사용
): Promise<SubwayArrival[]> => {
  const subwayId = lineNameToSubwayId(lineName);
  if (!subwayId) return [];

  try {
    const clean = stationName.replace(/역$/, '').replace(/\(.*\)/, '').trim();
    const res = await fetch(`/api/subway-timetable?station=${encodeURIComponent(clean)}&subwayId=${subwayId}`);
    const data = await res.json();
    if (!data.trains) {
      console.warn('[시간표] 응답 없음:', { station: clean, subwayId, data });
      return [];
    }

    let trains = data.trains as { arrivalTime: string; minutesLeft: number; destination: string; direction: string }[];

    // 하차역이 있으면 목적지 방향 필터 (endStationName이 destination에 포함되는 방향 우선)
    if (endStationName) {
      const endClean = endStationName.replace(/역$/, '').trim();
      const directionTrains = trains.filter(t => t.destination.includes(endClean));
      // 방향이 맞는 열차가 있으면 그쪽만, 없으면 전체 표시
      if (directionTrains.length > 0) trains = directionTrains;
    }

    return trains.slice(0, 3).map(t => ({
      line: lineName,
      destination: t.destination,
      message: '',
      prevStation: '',
      minutesLeft: t.minutesLeft,
      arrivalTime: t.arrivalTime,
      isRealtime: false,
    }));
  } catch {
    return [];
  }
};

export interface SubwayArrival {
  line: string;
  destination: string;
  message: string;
  prevStation: string;
  minutesLeft: number;
  arrivalTime: string;  // "HH:MM"
  isRealtime?: boolean; // true = 실시간 barvlDt 기반, false = 시간표 기반
}

export interface BusArrival {
  routeName: string;
  arrivalTime: string;
  remainStop: number;
}

// 지하철 실시간 도착 (역명)
// wayName: ODsay sub.way (종착역 이름). 있으면 trainLineNm에 포함된 열차만 반환
export const getSubwayArrivals = async (stationName: string, wayName?: string): Promise<SubwayArrival[]> => {
  try {
    const clean = stationName.replace(/역$/, '').replace(/\(.*\)/, '').trim();
    const url = `/api/subway?station=${encodeURIComponent(clean)}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.realtimeArrivalList) return [];

    const now = Date.now();
    const rawList: any[] = data.realtimeArrivalList || [];

    // wayName(ODsay 종착역)으로 방향 필터 — trainLineNm에 wayName 포함 여부
    const dirList = wayName
      ? (() => {
          const key = wayName.replace(/역$/, '').trim();
          const matched = rawList.filter((i: any) =>
            (i.trainLineNm || '').includes(key)
          );
          // 매칭된 게 없으면(방향명 불일치 등) 전체 사용
          return matched.length > 0 ? matched : rawList;
        })()
      : rawList;

    // barvlDt > 0인 (아직 안 온) 열차 우선
    const sorted = [
      ...dirList.filter((i: any) => Number(i.barvlDt || 0) > 0),
      ...dirList.filter((i: any) => Number(i.barvlDt || 0) === 0),
    ].slice(0, 6);
    return sorted.map((item: any) => {
      const barvlDt = Number(item.barvlDt || 0);
      let minutesLeft = 0;
      let arrivalTime = '';

      if (barvlDt > 0) {
        minutesLeft = Math.max(0, Math.round(barvlDt / 60));
        const d = new Date(now + barvlDt * 1000);
        arrivalTime = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      } else {
        // barvlDt=0일 때 arvlMsg2에서 분 추출 ("2분 후[3번째 전역]" 등)
        const minMatch = (item.arvlMsg2 || '').match(/(\d+)분/);
        if (minMatch) {
          minutesLeft = Number(minMatch[1]);
          const d = new Date(now + minutesLeft * 60000);
          arrivalTime = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        } else {
          // "곧 도착" / "진입" — 현재 시각 = 이 열차가 지금 도착 중
          minutesLeft = 0;
          const d = new Date(now);
          arrivalTime = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
        }
      }

      return {
        line: item.subwayNm || SUBWAY_LINE_MAP[item.subwayId] || item.subwayId,
        destination: item.trainLineNm || '',
        isRealtime: true,
        message: item.arvlMsg2 || '정보없음',
        prevStation: item.arvlMsg3 || '',
        minutesLeft,
        arrivalTime,
      };
    });
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
