// Route Competition Engine
// Combines popularity, festival, exam, and weekend signals into a single
// competition index for a route+date. Deterministic, config-driven.

import { clamp, type JourneyContext } from "../recommendation/context";
import { detectExams } from "../recommendation/intelligence/exams";
import { detectFestivals } from "../recommendation/intelligence/festivals";
import type { HistoricalStats } from "../recommendation/intelligence/historical";

export type CompetitionBreakdown = {
  demand: number;
  popularity: number;
  rush: number;
  festival: number;
  exam: number;
  weekend: number;
};

export type RouteCompetition = {
  index: number;                  // 0..100
  band: "low" | "moderate" | "high" | "extreme";
  breakdown: CompetitionBreakdown;
  drivers: string[];
};

const WEIGHTS: Record<keyof CompetitionBreakdown, number> = {
  demand: 22,
  popularity: 20,
  rush: 14,
  festival: 18,
  exam: 14,
  weekend: 12,
};

function weekendScore(weekday: number): number {
  if (weekday === 5) return 92; // Fri
  if (weekday === 6) return 88; // Sat
  if (weekday === 0) return 84; // Sun
  if (weekday === 1) return 60; // Mon return
  return 30;
}

function rushScore(ctx: JourneyContext): number {
  let s = 20;
  if (ctx.isMonthEnd) s += 25;
  if (ctx.isMonthStart) s += 20;
  if (ctx.isSummerVacation) s += 35;
  if (ctx.isWinterVacation) s += 30;
  if (ctx.bookingWindowDays <= 3) s += 20;
  return clamp(s);
}

export type RouteCompetitionInput = {
  context: JourneyContext;
  history: HistoricalStats;
  demandScore: number; // from DemandIndex
};

export function computeRouteCompetition(
  input: RouteCompetitionInput,
): RouteCompetition {
  const { context, history, demandScore } = input;
  const journeyISO = `${context.journeyDate.getFullYear()}-${String(
    context.journeyDate.getMonth() + 1,
  ).padStart(2, "0")}-${String(context.journeyDate.getDate()).padStart(2, "0")}`;

  const festivals = detectFestivals(journeyISO);
  const exams = detectExams(journeyISO);

  const breakdown: CompetitionBreakdown = {
    demand: clamp(demandScore),
    popularity: clamp(history.seasonalDemand),
    rush: rushScore(context),
    festival: festivals.demandBoost,
    exam: exams.demandBoost,
    weekend: weekendScore(context.weekday),
  };

  const totalWeight = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);
  const index = clamp(
    Math.round(
      (Object.keys(WEIGHTS) as (keyof CompetitionBreakdown)[]).reduce(
        (acc, k) => acc + breakdown[k] * WEIGHTS[k],
        0,
      ) / totalWeight,
    ),
  );

  const band: RouteCompetition["band"] =
    index >= 82 ? "extreme" : index >= 65 ? "high" : index >= 40 ? "moderate" : "low";

  const drivers = (Object.keys(breakdown) as (keyof CompetitionBreakdown)[])
    .map((k) => ({ k, weighted: breakdown[k] * WEIGHTS[k] }))
    .sort((a, b) => b.weighted - a.weighted)
    .slice(0, 3)
    .map((d) => d.k);

  return { index, band, breakdown, drivers };
}
