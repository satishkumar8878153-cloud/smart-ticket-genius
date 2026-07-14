// Historical Route Intelligence — models route- and class-level historical
// patterns. In-app implementation is deterministic, derived from the observed
// signals in the current SearchResult so it works before a backing table
// exists. `hydrateFromDatabase` is the seam a FastAPI backend fills once
// per-route historical stats are persisted.

import type { TicketClass } from "../../types";
import { clamp, type JourneyContext } from "../context";
import type { TravelOption } from "../types";

export type HistoricalStats = {
  routeId: string;
  travelClass: TicketClass;
  historicalConfirmTrend: number;   // 0..100, higher = better historical clearance
  seasonalDemand: number;           // 0..100 for this month
  volatility: number;               // 0..100, higher = swings a lot day-to-day
  sampleQuality: "derived" | "database";
};

export type RouteHistoryProvider = {
  get(routeId: string, cls: TicketClass, month: number): Promise<HistoricalStats | null>;
};

// Seasonal curve — a real-world approximation for Indian rail: Oct–Nov peak
// (festival), May–Jun peak (summer), moderate Feb–Mar/Jul–Sep, low Aug/Sep.
// Values 0..100 represent demand share of the year; higher = more crowded.
const MONTHLY_DEMAND = [65, 55, 60, 60, 85, 88, 70, 72, 78, 92, 95, 80];

function classAdjustment(cls: TicketClass): number {
  switch (cls) {
    case "SL":
    case "3A":
      return 6; // sleeper/3A always in higher demand
    case "2A":
      return 2;
    case "CC":
      return 4;
    case "1A":
    case "EC":
      return -6; // premium classes clear more reliably
  }
}

export function deriveHistoricalStats(
  option: TravelOption,
  ctx: JourneyContext,
): HistoricalStats {
  const monthIdx = ctx.journeyDate.getMonth();
  const seasonalBase = MONTHLY_DEMAND[monthIdx];

  // Trend anchored on observed confirm probability + waitlist safety, adjusted
  // downward when the class is historically tighter.
  const trend =
    option.signals.confirmProbability * 0.65 +
    (100 - option.signals.waitingListRisk) * 0.35 -
    classAdjustment(option.travelClass);

  // Volatility: high when confirm is mid-band (30–70) — those routes swing.
  const distanceFromMid = Math.abs(option.signals.confirmProbability - 50);
  const volatility = clamp(70 - distanceFromMid * 1.2);

  return {
    routeId: ctx.routeId,
    travelClass: option.travelClass,
    historicalConfirmTrend: clamp(Math.round(trend)),
    seasonalDemand: clamp(seasonalBase + classAdjustment(option.travelClass)),
    volatility: Math.round(volatility),
    sampleQuality: "derived",
  };
}

export async function hydrateFromDatabase(
  option: TravelOption,
  ctx: JourneyContext,
  provider?: RouteHistoryProvider,
): Promise<HistoricalStats> {
  if (provider) {
    const row = await provider.get(
      ctx.routeId,
      option.travelClass,
      ctx.journeyDate.getMonth() + 1,
    );
    if (row) return row;
  }
  return deriveHistoricalStats(option, ctx);
}
