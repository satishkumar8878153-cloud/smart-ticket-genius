// Tatkal Intelligence Engine V3
// Deterministic scoring of a Tatkal booking attempt using journey context,
// route competition, demand index, and per-option Tatkal signals.
// FastAPI-ready: when USE_FASTAPI is on, callers can substitute a remote
// scorer without changing the shape returned here.

import { clamp, type JourneyContext } from "../recommendation/context";
import type { TravelOption } from "../recommendation/types";
import type { DemandIndex } from "../recommendation/intelligence/demand";
import type { RouteCompetition } from "./route-competition";

export type BookingDifficulty =
  | "very-easy"
  | "easy"
  | "moderate"
  | "hard"
  | "extreme";

export type TatkalPrediction = {
  bookingDifficulty: BookingDifficulty;
  competitionScore: number;   // 0..100
  demandScore: number;        // 0..100 (echoes demand index for context)
  tatkalSuccessScore: number; // 0..100
  bookingWindowQuality: number; // 0..100 (100 = ideal window)
  routeCompetitionScore: number; // 0..100
  drivers: string[];
};

export type TatkalEngineInput = {
  option: TravelOption;
  context: JourneyContext;
  demand: DemandIndex;
  routeCompetition: RouteCompetition;
};

// Ideal booking window for Tatkal is same-day (T-1 open at 10am/11am).
// Score decays sharply outside that window.
function bookingWindowQuality(days: number): number {
  if (days <= 0) return 100;
  if (days === 1) return 92;
  if (days === 2) return 60;
  if (days <= 4) return 35;
  return 15;
}

function difficultyFor(score: number): BookingDifficulty {
  if (score >= 85) return "extreme";
  if (score >= 68) return "hard";
  if (score >= 48) return "moderate";
  if (score >= 28) return "easy";
  return "very-easy";
}

export function predictTatkal(input: TatkalEngineInput): TatkalPrediction {
  const { option, context, demand, routeCompetition } = input;

  const window = bookingWindowQuality(context.bookingWindowDays);
  const success = clamp(option.signals.tatkalSuccessProbability);
  const wlPressure = clamp(option.signals.waitingListRisk);

  // Competition = weighted mix of route competition + demand + WL pressure.
  const competition = clamp(
    Math.round(
      routeCompetition.index * 0.5 +
        demand.score * 0.3 +
        wlPressure * 0.2,
    ),
  );

  // Difficulty score (higher = harder). Success rate reduces difficulty.
  const difficultyScore = clamp(
    Math.round(competition * 0.6 + (100 - window) * 0.2 + (100 - success) * 0.2),
  );

  const drivers: string[] = [];
  if (routeCompetition.index >= 70) drivers.push("high route competition");
  if (demand.score >= 70) drivers.push(`${demand.band} demand`);
  if (wlPressure >= 60) drivers.push("elevated waiting list");
  if (window < 50) drivers.push("suboptimal booking window");
  if (success >= 70) drivers.push("historically strong Tatkal success");

  return {
    bookingDifficulty: difficultyFor(difficultyScore),
    competitionScore: competition,
    demandScore: demand.score,
    tatkalSuccessScore: success,
    bookingWindowQuality: window,
    routeCompetitionScore: routeCompetition.index,
    drivers,
  };
}
