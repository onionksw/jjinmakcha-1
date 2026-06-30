import type { VercelRequest, VercelResponse } from '@vercel/node';

const KEY = process.env.SEOUL_SUBWAY_API_KEY || 'sample';
const BASE = 'https://swopenAPI.seoul.go.kr/api/subway';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { station, subwayId } = req.query as Record<string, string>;
  if (!station || !subwayId) return res.status(400).json({ error: 'station, subwayId 필요' });

  const clean = station.replace(/역$/, '').replace(/\(.*\)/, '').trim();

  const now = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const day = now.getDay(); // 0=일, 6=토
  const weekType = day === 0 ? '3' : day === 6 ? '2' : '1';

  try {
    // 상행(U) + 하행(D) 두 방향 모두 조회
    const [uRes, dRes] = await Promise.all([
      fetch(`${BASE}/${KEY}/json/timeTable/1/200/${subwayId}/${encodeURIComponent(clean)}/U/${weekType}`),
      fetch(`${BASE}/${KEY}/json/timeTable/1/200/${subwayId}/${encodeURIComponent(clean)}/D/${weekType}`),
    ]);

    // XML 응답이면 JSON 파싱 실패 → 에러로 처리
    const [uText, dText] = await Promise.all([uRes.text(), dRes.text()]);
    let uData: any = {}, dData: any = {};
    try { uData = JSON.parse(uText); } catch { console.warn('[시간표] U방향 JSON파싱실패:', uText.slice(0, 100)); }
    try { dData = JSON.parse(dText); } catch { console.warn('[시간표] D방향 JSON파싱실패:', dText.slice(0, 100)); }

    const toRows = (data: any) => {
      const svc = data?.SearchSTNTimeTableByIDService;
      if (!svc) return [];
      const rows = svc.row ?? [];
      // row가 단일 객체(배열 아님)로 올 때도 처리
      return Array.isArray(rows) ? rows : [rows];
    };

    const parseMin = (t: string) => {
      const [h, m] = t.split(':').map(Number);
      return h * 60 + m;
    };

    const WINDOW = 90; // 앞으로 90분 이내 열차만
    const uRows = toRows(uData);
    const dRows = toRows(dData);

    if (uRows.length === 0 && dRows.length === 0) {
      console.warn('[시간표] 행 없음 — station:', clean, 'subwayId:', subwayId,
        '| uData:', JSON.stringify(uData).slice(0, 150));
    }

    const all = [
      ...uRows.map((r: any) => ({ ...r, _dir: 'U' })),
      ...dRows.map((r: any) => ({ ...r, _dir: 'D' })),
    ]
      .filter((r: any) => {
        const t = parseMin(r.ARRIVETIME || r.DEPARTURETIME || '00:00');
        const diff = t - nowMin;
        // 자정 넘김 처리 (예: 현재 23:50, 열차 00:10 → diff=-1430 → +1440)
        const adj = diff < -720 ? diff + 1440 : diff;
        return adj >= 0 && adj <= WINDOW;
      })
      .map((r: any) => {
        const timeStr = r.ARRIVETIME || r.DEPARTURETIME || '00:00';
        const diff = parseMin(timeStr) - nowMin;
        const adj = diff < -720 ? diff + 1440 : diff;
        return {
          arrivalTime: timeStr.slice(0, 5),
          minutesLeft: adj,
          destination: (r.LEFT_END_NM || r.INOUT_TAG || '').replace(/종점행$/, '행'),
          direction: r._dir,
        };
      })
      .sort((a: any, b: any) => a.minutesLeft - b.minutesLeft)
      .slice(0, 8);

    return res.json({ trains: all, _debug: { uRows: uRows.length, dRows: dRows.length, key: KEY.slice(0, 4) + '...' } });
  } catch (e: any) {
    return res.status(500).json({ error: e.message });
  }
}
