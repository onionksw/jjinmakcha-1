const SUBWAY_LINE_MAP: Record<string, string> = {
  '1001': '1호선', '1002': '2호선', '1003': '3호선', '1004': '4호선',
  '1005': '5호선', '1006': '6호선', '1007': '7호선', '1008': '8호선',
  '1009': '9호선', '1063': '경의중앙선', '1065': '공항철도', '1067': '경춘선',
  '1075': '수인분당선', '1077': '신분당선', '1092': '우이신설선',
  // 실측: 1075 = 수인분당선 (서울 Metro API 기준), GTX-A는 별도 API 사용
};

// lineName → subwayId 매핑 (ODsay 노선명 → 서울 API 코드)
const LINE_NAME_TO_ID: Array<[string, string]> = [
  ['공항철도', '1065'], ['신분당선', '1077'], ['경의중앙선', '1063'],
  ['경춘선', '1067'], ['우이신설선', '1092'], ['수인분당선', '1075'], ['분당선', '1075'],
  ['9호선', '1009'], ['8호선', '1008'], ['7호선', '1007'], ['6호선', '1006'],
  ['5호선', '1005'], ['4호선', '1004'], ['3호선', '1003'], ['2호선', '1002'], ['1호선', '1001'],
];

// ODsay wayCode → Seoul Metro API updnLine 값으로 변환
// 실측 확인 (2025):
//   2호선: updnLine = "외선"(wayCode 1) / "내선"(wayCode 2)
//          — "외선순환"/"내선순환" 아님, ODsay sub.way는 목적지역명이라 사용 불가
//   나머지: updnLine = "상행"(wayCode 1) / "하행"(wayCode 2)
export const resolveSubwayDirection = (
  lineName: string | undefined,
  wayCode: number | null | undefined,
): string | undefined => {
  if (!wayCode) return undefined;
  const line = (lineName || '').replace(/\s/g, '');
  if (line.includes('2호선')) return wayCode === 1 ? '외선' : '내선';
  return wayCode === 1 ? '상행' : '하행';
};

export const lineNameToSubwayId = (lineName: string): string | null => {
  const norm = lineName.replace(/\s/g, '').replace(/^서울|^수도권/, '');
  const match = LINE_NAME_TO_ID.find(([key]) => norm.includes(key) || key.includes(norm));
  return match ? match[1] : null;
};

// 시간표 기반 지하철 도착 조회
// wayCode: ODsay 방향코드 (1=상행→U, 2=하행→D). 지정하면 해당 방향만 조회
export const getSubwayTimetable = async (
  stationName: string,
  lineName: string,
  wayCode?: number | null,
): Promise<SubwayArrival[]> => {
  const subwayId = lineNameToSubwayId(lineName);
  if (!subwayId) return [];

  try {
    const clean = stationName.replace(/역$/, '').replace(/\(.*\)/, '').trim();
    // wayCode로 방향 고정: 1→U(상행), 2→D(하행), 없으면 둘 다 조회
    const dir = wayCode === 1 ? 'U' : wayCode === 2 ? 'D' : '';
    const url = `/api/subway-timetable?station=${encodeURIComponent(clean)}&subwayId=${subwayId}${dir ? `&dir=${dir}` : ''}`;
    const res = await fetch(url);
    const data = await res.json();
    if (!data.trains || data.trains.length === 0) {
      console.warn('[시간표] 응답 없음:', { station: clean, subwayId, dir, data });
      return [];
    }

    const trains = data.trains as { arrivalTime: string; minutesLeft: number; destination: string; direction: string }[];

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
// direction: 서울 Metro API updnLine 값 — "상행"/"하행" 또는 2호선 "외선"/"내선"
// subwayId: "1002" 등 — 고속터미널처럼 여러 노선 혼재 시 정확히 구분
export const getSubwayArrivals = async (stationName: string, direction?: string, subwayId?: string): Promise<SubwayArrival[]> => {
  try {
    const clean = stationName.replace(/역$/, '').replace(/\(.*\)/, '').trim();
    const url = `/api/subway?station=${encodeURIComponent(clean)}`;

    const res = await fetch(url);
    const data = await res.json();

    if (!data.realtimeArrivalList) return [];

    const now = Date.now();
    const rawList: any[] = data.realtimeArrivalList || [];

    // 1단계: 방향 필터 (결과 0이면 전체 폴백)
    const dirFiltered = direction
      ? rawList.filter((i: any) => i.updnLine === direction)
      : rawList;
    const afterDir = dirFiltered.length > 0 ? dirFiltered : rawList;

    // 2단계: 노선 필터 (고속터미널 등 다노선 혼재 역 대응, 결과 0이면 폴백)
    const lineFiltered = subwayId
      ? afterDir.filter((i: any) => i.subwayId === subwayId)
      : afterDir;
    const dirList = lineFiltered.length > 0 ? lineFiltered : afterDir;

    const candidates = dirList.slice(0, 20);
    const mapped = candidates.map((item: any) => {
      const barvlDt = Number(item.barvlDt || 0);
      let minutesLeft = 0;
      let arrivalTime = '';

      const arvlMsg = item.arvlMsg2 || '';
      if (barvlDt > 0) {
        minutesLeft = Math.max(0, Math.round(barvlDt / 60));
      } else {
        // barvlDt=0 → arvlMsg2에서 시간 추정
        const minMatch = arvlMsg.match(/(\d+)분/);
        const stationMatch = arvlMsg.match(/\[(\d+)\]번째\s*전역/);
        if (minMatch) {
          // "2분 후[3번째 전역]" 형태
          minutesLeft = Number(minMatch[1]);
        } else if (stationMatch) {
          // "[5]번째 전역 (용산)" 형태 — barvlDt 미제공(Korail 등), 역 개수 × 2분 추정
          minutesLeft = Number(stationMatch[1]) * 2;
        } else if (arvlMsg.includes('전역 도착')) {
          // "전역 도착" = 바로 전역 출발, 약 1분
          minutesLeft = 1;
        } else {
          // "진입" / "곧 도착" 등 = 지금 도착 중
          minutesLeft = 0;
        }
      }
      if (minutesLeft > 0) {
        const d = new Date(now + minutesLeft * 60000);
        arrivalTime = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      } else {
        const d = new Date(now);
        arrivalTime = `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
      }

      return {
        line: item.subwayNm || SUBWAY_LINE_MAP[item.subwayId] || item.subwayId,
        destination: item.trainLineNm || '',
        isRealtime: true,
        message: arvlMsg || '정보없음',
        prevStation: item.arvlMsg3 || '',
        minutesLeft,
        arrivalTime,
      };
    });

    // minutesLeft 기준 정렬, 같은 열차 중복 제거
    const seen = new Set<string>();
    return mapped
      .sort((a, b) => a.minutesLeft - b.minutesLeft)
      .filter(item => {
        const key = `${item.destination}|${item.minutesLeft}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 5);
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
