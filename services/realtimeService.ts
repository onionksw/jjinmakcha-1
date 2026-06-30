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

    return trains.slice(0, 4).map(t => ({
      line: lineName,
      destination: t.destination,
      message: '',
      prevStation: '',
      minutesLeft: t.minutesLeft,
      arrivalTime: t.arrivalTime,
    }));
  } catch {
    return [];
  }
};

export interface SubwayArrival {
  line: string;
  destination: string;
  message: string;      // "2분 후", "잠시 후" — fallback 표시용
  prevStation: string;
  minutesLeft: number;  // 도착까지 남은 분 (0 = 곧 도착)
  arrivalTime: string;  // "HH:MM" 형식 도착 예정 시각
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
    const url = `/api/subway?station=${encodeURIComponent(clean)}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.realtimeArrivalList) return [];

    const now = Date.now();
    return data.realtimeArrivalList.slice(0, 4).map((item: any) => {
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
          // "곧 도착" / "진입" 등 — 실제 시각 불명확, UI에서 "곧"으로 표시
          minutesLeft = 0;
          arrivalTime = '';
        }
      }

      return {
        line: item.subwayNm || SUBWAY_LINE_MAP[item.subwayId] || item.subwayId,
        destination: item.trainLineNm || '',
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
