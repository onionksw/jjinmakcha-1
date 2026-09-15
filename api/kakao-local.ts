import type { VercelRequest, VercelResponse } from '@vercel/node';

// 카카오 API 통합 프록시 — Vercel Hobby 플랜 서버리스 함수 12개 제한 때문에
// 로컬 검색/대중교통/자동차/도보 길찾기를 파일 하나로 합쳐서 씀 (type 파라미터로 분기).
const API_KEY = process.env.KAKAO_REST_API_KEY || '';
const LOCAL_BASE = 'https://dapi.kakao.com/v2/local';
const TRANSIT_BASE = 'https://dapi.kakao.com/v2/routing/publictraffic';
const WALK_BASE = 'https://dapi.kakao.com/v2/routing/walk';
const DIRECTIONS_BASE = 'https://apis-navi.kakaomobility.com/v1/directions';

const LOCAL_ENDPOINTS: Record<string, string> = {
  address: '/search/address.json',
  keyword: '/search/keyword.json',
  coord2address: '/geo/coord2address.json',
  coord2regioncode: '/geo/coord2regioncode.json',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');

  const { type, ...params } = req.query as Record<string, string>;

  if (!API_KEY) {
    return res.status(500).json({ error: 'KAKAO_REST_API_KEY 환경변수가 설정되지 않았습니다' });
  }

  let url: string;

  if (type === 'transit' || type === 'walk') {
    const { start_x, start_y, end_x, end_y } = params;
    if (!start_x || !start_y || !end_x || !end_y) {
      return res.status(400).json({ error: 'start_x, start_y, end_x, end_y가 필요합니다' });
    }
    const qs = new URLSearchParams({ start_x, start_y, end_x, end_y, input_coord: 'WGS84' }).toString();
    url = `${type === 'transit' ? TRANSIT_BASE : WALK_BASE}?${qs}`;
  } else if (type === 'directions') {
    const { origin, destination } = params;
    if (!origin || !destination) {
      return res.status(400).json({ error: 'origin, destination이 필요합니다' });
    }
    url = `${DIRECTIONS_BASE}?${new URLSearchParams({ origin, destination }).toString()}`;
  } else {
    const path = LOCAL_ENDPOINTS[type];
    if (!path) {
      return res.status(400).json({ error: `알 수 없는 type: ${type}` });
    }
    const qs = new URLSearchParams(params as Record<string, string>).toString();
    url = `${LOCAL_BASE}${path}?${qs}`;
  }

  try {
    const r = await fetch(url, {
      headers: { Authorization: `KakaoAK ${API_KEY}` },
    });
    const data = await r.json();
    res.status(r.status).json(data);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
}
