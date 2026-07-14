// Passenger Demand Index — combines the calendar/behavioural signals into a
// single 0..100 demand score. Purely deterministic; every factor is a real
// signal (weekday, vacation, festival, exam, route popularity, class demand,
// booking window). Weights sum to 100 for interpretability.

import type { TicketClass } from "../../types";
import { clamp, type JourneyContext } from "../context";
import type { ExamSignal } from "./exams";
import type { FestivalSignal } from "./festivals";
import type { HistoricalStats } from "./historical";

export type DemandBreakdown = {
  weekday: number;
  holiday: number;
  vacation: number;
  festival: number;
  exam: number;
  routePopularity: number;
  classPopularity: number;
  bookingWindow: number;
};

export type DemandIndex = {
  score: number;                    // 0..100 demand pressure
  band: "low" | "moderate" | "high" | "extreme";
  breakdown: DemandBreakdown;
  drivers: string[];                // top-3 factor labels for explainability
};

const WEIGHTS = {
  weekday: 8,
  holiday: 8,
  vacation: 10,
  festival: 22,
  exam: 14,
  routePopularity: 14,
  classPopularity: 12,
  bookingWindow: 12,
};

function weekdayScore(weekday: number): number {
  // Sun/Fri/Sat weekends peak; Mon return travel is also elevated.
  switch (weekday) {
    case 0: return 85; // Sun
    case 1: return 70; // Mon
    case 2: return 45; // Tue
    case 3: return 40; // Wed
    case 4: return 55; // Thu
    case 5: return 90; // Fri
    case 6: return 88; // Sat
    default: return 50;
  }
}

function holidayScore(ctx: JourneyContext): number {
  let s = 0;
  if (ctx.isMonthStart || ctx.isMonthEnd) s += 40;
  if (ctx.weekday === 5 || ctx.weekday === 0) s += 25;
  return clamp(s);
}

function vacationScore(ctx: JourneyContext): number {
  if (ctx.isSummerVacation) return 90;
  if (ctx.isWinterVacation) return 82;
  return 20;
}

function bookingWindowScore(days: number): number {
  // Very tight (< 3 days) and very early (> 90 days) both indicate high
  // demand pressure: last-minute means competition, far-out means peak
  // days already opening up.
  if (days <= 1) return 95;
  if (days <= 3) return 85;
  if (days <= 7) return 70;
  if (days <= 30) return 50;
  if (days <= 60) return 45;
  if (days <= 90) return 55;
  return 65;
}

function classPopularityScore(cls: TicketClass): number {
  switch (cls) {
    case "SL": return 88;
    case "3A": return 90;
    case "2A": return 70;
    case "CC": return 72;
    case "1A": return 45;
    case "EC": return 50;
  }
}

// Route popularity anchored on historical demand + confirmation trend.
function routePopularityFromHistory(h: HistoricalStats): number {
  return clamp(
    Math.round(h.seasonalDemand * 0.6 + (100 - h.historicalConfirmTrend) * 0.4),
  );
}

export function computeDemandIndex(
  ctx: JourneyContext,
  history: HistoricalStats,
  festivals: FestivalSignal,
  exams: ExamSignal,
): DemandIndex {
  const breakdown: DemandBreakdown = {
    weekday: weekdayScore(ctx.weekday),
    holiday: holidayScore(ctx),
    vacation: vacationScore(ctx),
    festival: festivals.demandBoost,
    exam: exams.demandBoost,
    routePopularity: routePopularityFromHistory(history),
    classPopularity: classPopularityScore(ctx.travelClass),
    bookingWindow: bookingWindowScore(ctx.bookingWindowDays),
  };

  const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  const score = clamp(
    Math.round(
      (Object.keys(WEIGHTS) as (keyof DemandBreakdown)[]).reduce(
        (acc, key) => acc + breakdown[key] * WEIGHTS[key],
        0,
      ) / totalWeight,
    ),
  );

  const band: DemandIndex["band"] =
    score >= 82 ? "extreme" : score >= 65 ? "high" : score >= 40 ? "moderate" : "low";

  const drivers = (Object.keys(breakdown) as (keyof DemandBreakdown)[])
    .map((k) => ({ k, weighted: breakdown[k] * WEIGHTS[k] }))
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, 3)
    .map((d) => d.k);

  return { score, band, breakdown, drivers };
}
