
export interface RouteSegment {
  type: 'walk' | 'bus' | 'subway' | 'taxi';
  instruction: string;
  durationMinutes: number;
  cost: number;
  departureTime?: string;  // HH:MM
  arrivalTime?: string;    // HH:MM
  lineName?: string;
  startName?: string;
  endName?: string;
  path?: { lat: number; lng: number }[];
}

export interface HybridRoute {
  id: string;
  name: string;
  totalCost: number;
  totalDuration: number;
  savedAmount: number;
  segments: RouteSegment[];
  departureTime: string;
  transferPoint: string;
  taxiCostOnly: number;
  bounds?: { minLat: number; maxLat: number; minLng: number; maxLng: number };
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

export enum AppState {
  HOME = 'HOME',
  SEARCHING = 'SEARCHING',
  RESULTS = 'RESULTS',
  DETAILS = 'DETAILS',
  PLACE_DETAIL = 'PLACE_DETAIL'
}
