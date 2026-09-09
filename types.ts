
export interface RouteSegment {
  type: 'walk' | 'bus' | 'subway' | 'taxi';
  instruction: string;
  alightInstruction?: string;  // 하차 안내 (버스/지하철)
  durationMinutes: number;
  cost: number;
  departureTime?: string;  // HH:MM
  arrivalTime?: string;    // HH:MM
  lineName?: string;
  startName?: string;
  endName?: string;
  path?: { lat: number; lng: number }[];
  wayCode?: number | null;
  wayName?: string;
  nextStationName?: string;  // passStopList 기준 진행 방향 다음 역 (방향 필터용)
}

export interface HybridRoute {
  id: string;
  name: string;
  totalCost: number;        // 대중교통 요금만
  totalDuration: number;
  savedAmount: number;
  segments: RouteSegment[];
  departureTime: string;
  transferPoint: string;
  taxiCostOnly: number;
  fullTaxiMinutes?: number;  // 전액 택시 소요 시간 (비교용)
  // 하이브리드 추가 필드
  transferCount: number;    // 환승 횟수
  walkMinutes: number;      // 총 도보 시간 (택시 대체 전)
  taxiWalkCost: number;     // 도보 구간 택시 대체 비용 (5분 이상 도보만)
  hybridTotalCost: number;  // 대중교통 + 택시 합산
  hasTaxi: boolean;         // 택시 구간 포함 여부
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  // 하이브리드 전략 타입
  routeType?: 'time-saving' | 'cost-saving' | 'balanced';
  routeLabel?: string;          // "⚡ 빠른 귀가형" 등 표시용 레이블
  timeValueScore?: number;      // 택시 효율 (분절약 / 천원), 클수록 가성비 좋음
  timeSavedByTaxi?: number;     // 택시 대체로 단축된 분
  // MCDM 엔진 추가 필드
  timeMode?: 'day' | 'night';   // 경로 산출 시점의 시간대
  taxiBoardingPoint?: string;   // 택시 탑승 지점명
  taxiJustification?: string;   // 이 지점에서 택시를 타야 하는 이유 한 문장
  comparisonNote?: string;      // 다른 경로 대비 트레이드오프 한 줄 (예: "알뜰형보다 8분 빠름 · 3,200원 더 비쌈")
  destLat?: number;             // 실제 목적지 위도
  destLng?: number;             // 실제 목적지 경도
  origLat?: number;             // 실제 출발지 위도
  origLng?: number;             // 실제 출발지 경도
}

export interface Place {
  id: string;
  name: string;
  type: string;
  rating: string;
  address: string;
  description: string;
  closingTime: string;
  tags: string[];
  imageKeyword: string;
  representativeMenu: string;
  distance: string;
  imageUrl?: string;
}

export interface UserLocation {
  lat: number;
  lng: number;
  address?: string;
}

export interface LDTResult {
  latestDepartureTime: string;   // "HH:MM"
  latestDepartureMs?: number;    // epoch ms (경로 상세 조회용)
  remainingMinutes: number;      // 지금부터 몇 분 더
  routeExistsNow: boolean;       // 지금도 경로가 있는지
  reachedSearchLimit: boolean;   // 다음날 04시까지 가능한지
  hybridBonus?: number;          // 택시 활용 시 추가 가능 분
  hybridTaxiCost?: number;       // 택시 예상 비용
}

export enum AppState {
  HOME = 'HOME',
  SEARCHING = 'SEARCHING',
  RESULTS = 'RESULTS',
  DETAILS = 'DETAILS',
  PLACE_DETAIL = 'PLACE_DETAIL',
  LDT_DETAIL = 'LDT_DETAIL',
  SHARED_VIEW = 'SHARED_VIEW'  // 카카오톡 공유 링크로 들어온 사람이 보는 정적 경로 요약 화면
}

// 카카오톡 공유 시 URL에 통째로 인코딩해서 넣는 경로 요약 (로그인·서버 조회 없이 그대로 렌더링)
export interface SharedRouteSnapshot {
  s: string;   // 출발지
  e: string;   // 도착지
  dep: string; // 출발 시각 HH:MM
  arr: string; // 도착 시각 HH:MM
  dur: number; // 총 소요시간(분)
  cost: number; // 총 비용
  saved: number; // 절약 금액
  segs: { t: RouteSegment['type']; i: string; d: number }[]; // 구간별: 타입/안내문구/소요시간
}
