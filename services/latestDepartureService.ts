import { getCoordinates } from './tmapService';
import { LDTResult } from '../types';

const BINARY_SEARCH_ITERATIONS = 8;

const pad2 = (n: number) => n.toString().padStart(2, '0');
const toSearchDate = (d: Date) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
const toSearchTime = (d: Date) => `${pad2(d.getHours())}${pad2(d.getMinutes())}`;
const toHHMM = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

// 하루 = 04:00 ~ 다음날 04:00
function getTransitDayEnd(from: Date): Date {
  const todayEnd = new Date(from);
  todayEnd.setHours(4, 0, 0, 0);
  if (from.getTime() < todayEnd.getTime()) return todayEnd;
  const tomorrowEnd = new Date(from);
  tomorrowEnd.setDate(tomorrowEnd.getDate() + 1);
  tomorrowEnd.setHours(4, 0, 0, 0);
  return tomorrowEnd;
}

// dayEnd(04:00)에서 하루 전 22:00 → 탐색 시작점
function getNightStart(dayEnd: Date): Date {
  const start = new Date(dayEnd);
  start.setDate(start.getDate() - 1);
  start.setHours(22, 0, 0, 0);
  return start;
}

// 실용적 경로 여부:
// - 경로 존재
// - 대기 시간 ≤ 30분 (첫차 대기 제외)
// - 총 소요 ≤ 240분
async function hasRouteAt(
  sx: number, sy: number,
  ex: number, ey: number,
  date: Date
): Promise<boolean> {
  const url = `/api/odsay?SX=${sx}&SY=${sy}&EX=${ex}&EY=${ey}&SearchDate=${toSearchDate(date)}&SearchTime=${toSearchTime(date)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return false;
    const data = await res.json();
    if (data.error) return false;
    const paths: any[] = data.result?.path;
    if (!Array.isArray(paths) || paths.length === 0) return false;
    return paths.some((p: any) => {
      const totalTime: number = p.info?.totalTime ?? 9999;
      if (totalTime > 240) return false;
      const sectionTime: number = (p.subPath || []).reduce((s: number, sp: any) => s + (sp.sectionTime || 0), 0);
      const waitTime = totalTime - sectionTime;
      return waitTime <= 30;
    });
  } catch {
    return false;
  }
}

function estimateTaxiCost(walkMinutes: number): number {
  const distanceKm = (walkMinutes / 60) * 4;
  if (distanceKm <= 1.6) return 4800;
  const extra = Math.ceil((distanceKm - 1.6) * 1000 / 131) * 100;
  return Math.min(4800 + extra, 20000);
}

export async function findLatestDeparture(
  startLoc: string,
  endLoc: string,
  firstWalkMinutes = 0
): Promise<LDTResult | null> {
  try {
    const [startCoords, endCoords] = await Promise.all([
      getCoordinates(startLoc),
      getCoordinates(endLoc),
    ]);
    if (!startCoords || !endCoords) return null;

    const sx = startCoords.lon, sy = startCoords.lat;
    const ex = endCoords.lon, ey = endCoords.lat;
    const now = new Date();

    // 1. 지금 경로 존재 여부
    const existsNow = await hasRouteAt(sx, sy, ex, ey, now);
    if (!existsNow) {
      return { latestDepartureTime: toHHMM(now), remainingMinutes: 0, routeExistsNow: false, reachedSearchLimit: false };
    }

    // 2. 탐색 윈도우: 오늘 밤 22:00 → 다음날 04:00
    const dayEnd = getTransitDayEnd(now);
    const nightStart = getNightStart(dayEnd); // 전날 22:00

    // 3. 04:00에 실용 경로 있는지 확인
    const existsAtEnd = await hasRouteAt(sx, sy, ex, ey, dayEnd);

    let latestValidMs: number;

    if (existsAtEnd) {
      // 새벽 04:00에도 심야버스 운행 → 찐막차 = 04:00
      latestValidMs = dayEnd.getTime();
    } else {
      // 이진 탐색: [nightStart(22:00), dayEnd(04:00)]
      let loMs = nightStart.getTime();
      let hiMs = dayEnd.getTime();
      latestValidMs = loMs;

      // nightStart에 경로 있는지 먼저 확인
      const existsAtNightStart = await hasRouteAt(sx, sy, ex, ey, nightStart);
      if (!existsAtNightStart) {
        // 22:00에도 경로 없으면 → 지금 시점부터 탐색
        loMs = now.getTime();
        latestValidMs = loMs;
      }

      for (let i = 0; i < BINARY_SEARCH_ITERATIONS; i++) {
        const midMs = Math.round((loMs + hiMs) / 2);
        if (await hasRouteAt(sx, sy, ex, ey, new Date(midMs))) {
          latestValidMs = midMs;
          loMs = midMs;
        } else {
          hiMs = midMs;
        }
      }
    }

    // 5분 단위로 내림
    latestValidMs = Math.floor(latestValidMs / (5 * 60 * 1000)) * (5 * 60 * 1000);
    const latestDate = new Date(latestValidMs);
    const remainingMinutes = Math.max(0, Math.floor((latestValidMs - now.getTime()) / 60000));
    const hybridBonus = firstWalkMinutes > 0 ? Math.round(firstWalkMinutes * 0.8) : 0;

    return {
      latestDepartureTime: toHHMM(latestDate),
      latestDepartureMs: latestValidMs,
      remainingMinutes,
      routeExistsNow: true,
      reachedSearchLimit: existsAtEnd,
      hybridBonus: hybridBonus || undefined,
      hybridTaxiCost: hybridBonus ? estimateTaxiCost(firstWalkMinutes) : undefined,
    };
  } catch (e) {
    console.error('LDT 계산 오류:', e);
    return null;
  }
}
