import type { VercelRequest, VercelResponse } from '@vercel/node';

// 서울시 자체 시간표 API(SearchSTNTimeTableByIDService)는 서울교통공사 운영 노선만
// 커버해서 신분당선/인천1·2호선/GTX-A/경전철 등은 데이터가 아예 없었음. 국토교통부
// TAGO 지하철정보 서비스는 전국 노선을 다 갖고 있어서(실측 확인됨) 이걸로 교체.
const KEY = process.env.TAGO_API_KEY || '';
const BASE = 'http://apis.data.go.kr/1613000/SubwayInfo';

// TAGO 노선명은 "신분당"/"인천1호선"/"GTX-A"처럼 표기가 제각각이라, 역명 검색
// 결과의 subwayRouteName과 우리가 가진 lineName(예: "신분당선")을 비교할 때
// "호선"/"선" 접미사와 공백을 지우고 부분일치로 맞춤
const normalizeLine = (name: string): string =>
  name.replace(/\s/g, '').replace(/호선$/, '').replace(/선$/, '');

const toRows = (data: any): any[] => {
  const items = data?.response?.body?.items?.item;
  if (!items) return [];
  return Array.isArray(items) ? items : [items];
};

// 운행일 기준(04:00~다음날 04:00) 분으로 변환 — 00~03시대는 전날 심야의 연장으로 취급
const toServiceMin = (hhmmss: string): number => {
  const h = Number(hhmmss.slice(0, 2)), m = Number(hhmmss.slice(2, 4));
  return (h < 4 ? h + 24 : h) * 60 + m;
};
const toHHMM = (hhmmss: string): string => `${hhmmss.slice(0, 2)}:${hhmmss.slice(2, 4)}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { station, lineName, dir } = req.query as Record<string, string>;
  if (!station || !lineName) return res.status(400).json({ error: 'station, lineName 필요' });

  const clean = station.replace(/역$/, '').replace(/\(.*\)/, '').trim();
  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const day = now.getDay(); // 0=일, 6=토
  const dailyTypeCode = day === 0 ? '03' : day === 6 ? '02' : '01';
  const normTarget = normalizeLine(lineName);

  try {
    // 1단계: 역명으로 검색 → 같은 역명이라도 노선마다 다른 subwayStationId를 가지므로
    // 우리가 찾는 노선명과 일치하는 항목을 골라냄
    const searchRes = await fetch(
      `${BASE}/GetKwrdFndSubwaySttnList?serviceKey=${KEY}&subwayStationName=${encodeURIComponent(clean)}&numOfRows=50&pageNo=1&_type=json`
    );
    const searchData = await searchRes.json();
    const candidates = toRows(searchData);
    const match = candidates.find(c => {
      const norm = normalizeLine(c.subwayRouteName || '');
      return norm === normTarget || norm.includes(normTarget) || normTarget.includes(norm);
    });

    if (!match) {
      return res.json({
        trains: [],
        firstTrain: { U: null, D: null },
        lastTrain: { U: null, D: null },
        _debug: { reason: 'STATION_LINE_NOT_FOUND', station: clean, lineName, candidates: candidates.map(c => c.subwayRouteName) },
      });
    }

    // 2단계: 해당 역의 방향별 시간표 조회 (dir 지정 시 그 방향만, 없으면 U+D 모두)
    const fetchDir = async (d: string) => {
      const r = await fetch(
        `${BASE}/GetSubwaySttnAcctoSchdulList?serviceKey=${KEY}&subwayStationId=${match.subwayStationId}&dailyTypeCode=${dailyTypeCode}&upDownTypeCode=${d}&numOfRows=500&pageNo=1&_type=json`
      );
      return toRows(await r.json());
    };
    const [uRows, dRows] = dir === 'U'
      ? [await fetchDir('U'), []]
      : dir === 'D'
      ? [[], await fetchDir('D')]
      : await Promise.all([fetchDir('U'), fetchDir('D')]);

    // "now"와 무관하게, 그날 시간표상 실제 첫차/막차 시각 — LDT/시각 지정 검색 검증용
    const edgeTrain = (rows: any[], pick: 'first' | 'last'): string | null => {
      if (rows.length === 0) return null;
      let best: { t: string; m: number } | null = null;
      for (const r of rows) {
        const t = r.depTime as string;
        // GTX-A 등 일부 노선은 방향에 따라 depTime이 "0" 같은 자리표시자로만
        // 채워져 있는 경우가 있어(TAGO 데이터 자체 결측) 유효한 HHMMSS 형식만 사용
        if (!t || t.length < 4) continue;
        const m = toServiceMin(t);
        if (!best || (pick === 'first' ? m < best.m : m > best.m)) best = { t, m };
      }
      return best ? toHHMM(best.t) : null;
    };

    const WINDOW = 90; // 앞으로 90분 이내 열차만 (실시간 탭 표시용)
    const all = [
      ...uRows.map((r: any) => ({ ...r, _dir: 'U' })),
      ...dRows.map((r: any) => ({ ...r, _dir: 'D' })),
    ]
      .filter((r: any) => r.depTime && String(r.depTime).length >= 4)
      .map((r: any) => {
        const h = Number(r.depTime?.slice(0, 2) ?? 0), m = Number(r.depTime?.slice(2, 4) ?? 0);
        const t = h * 60 + m;
        const diff = t - nowMin;
        const adj = diff < -720 ? diff + 1440 : diff; // 자정 넘김 처리
        return { r, adj };
      })
      .filter(({ adj }) => adj >= 0 && adj <= WINDOW)
      .map(({ r, adj }) => ({
        arrivalTime: toHHMM(r.depTime),
        minutesLeft: adj,
        destination: r.endSubwayStationNm ? `${r.endSubwayStationNm}행` : '',
        direction: r._dir,
      }))
      .sort((a, b) => a.minutesLeft - b.minutesLeft)
      .slice(0, 8);

    return res.json({
      trains: all,
      firstTrain: { U: edgeTrain(uRows, 'first'), D: edgeTrain(dRows, 'first') },
      lastTrain: { U: edgeTrain(uRows, 'last'), D: edgeTrain(dRows, 'last') },
      _debug: {
        subwayStationId: match.subwayStationId,
        matchedRouteName: match.subwayRouteName,
        uRows: uRows.length,
        dRows: dRows.length,
      },
    });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
