// AI Decision Score — the v2 multi-factor score that supersedes the plain
// weighted-linear model. Each factor is a real, normalized 0..100 driver
// derived from a dedicated intelligence module. Weights are exposed so a
// FastAPI backend or A/B experiment can tune them without code changes.

import { clamp } from "./context";
import type { TravelOption } from "./types";
import type { DemandIndex } from "./intelligence/demand";
import type { HistoricalStats } from "./intelligence/historical";
import type { TrainPopularity } from "./intelligence/train-popularity";
import type { WaitlistPrediction } from "./intelligence/waitlist";
import { parseDurationToMinutes } from "./feature-extractor";

export type DecisionFactor =
  | "confirmation"
  | "waitingMovement"
  | "demand"
  | "season"
  | "fare"
  | "reliability"
  | "travelTime"
  | "comfort"
  | "boarding"
  | "tatkal"
  | "routePopularity";

export type DecisionWeights = Record<DecisionFactor, number>;

export const DEFAULT_DECISION_WEIGHTS: DecisionWeights = {
  confirmation: 20,
  waitingMovement: 12,
  demand: 8,          // higher demand => lower score (inverted below)
  season: 6,          // seasonal demand (inverted)
  fare: 8,            // cheaper => higher score (inverted)
  reliability: 8,
  travelTime: 8,      // shorter => higher score (inverted)
  comfort: 6,
  boarding: 6,
  tatkal: 5,
  routePopularity: 5,
};

export type DecisionBreakdown = Array<{
  factor: DecisionFactor;
  value: number;        // 0..100 after inversion (higher = better)
  weight: number;       // normalized
  contribution: number; // value * weight
}>;

export type DecisionScore = {
  score: number;                    // 0..100
  breakdown: DecisionBreakdown;     // sorted desc by contribution
  topDrivers: DecisionFactor[];     // top 3
  worstDrivers: DecisionFactor[];   // bottom 3 (< 55)
};

// Comfort: subjective class-quality proxy.
function comfortScore(cls: TravelOption["travelClass"]): number {
  switch (cls) {
    case "1A": return 98;
    case "EC": return 92;
    case "2A": return 85;
    case "CC": return 72;
    case "3A": return 65;
    case "SL": return 45;
  }
}

function invertLinear(value: number, best: number, worst: number): number {
  if (worst === best) return 100;
  const t = (value - best) / (worst - best);
  return clamp(Math.round((1 - t) * 100));
}

function normalizeWeights(w: DecisionWeights): DecisionWeights {
  const total = Object.values(w).reduce((a, b) => a + Math.max(0, b), 0) || 1;
  const out = {} as DecisionWeights;
  (Object.keys(w) as DecisionFactor[]).forEach((k) => {
    out[k] = Math.max(0, w[k]) / total;
  });
  return out;
}

export type DecisionInputs = {
  option: TravelOption;
  history: HistoricalStats;
  demand: DemandIndex;
  waitlist: WaitlistPrediction;
  popularity: TrainPopularity;
  boardingUplift: number; // 0..100 — 100 when boarding is already optimal
};

export function computeDecisionScore(
  inputs: DecisionInputs,
  weights: DecisionWeights = DEFAULT_DECISION_WEIGHTS,
): DecisionScore {
  const { option, history, demand, waitlist, popularity, boardingUplift } = inputs;
  const minutes = parseDurationToMinutes(option.duration);

  const values: Record<DecisionFactor, number> = {
    confirmation: option.signals.confirmProbability,
    waitingMovement: waitlist.finalConfirmChance,
    demand: 100 - demand.score,              // less demand pressure = better
    season: 100 - history.seasonalDemand,    // off-season = better
    fare: invertLinear(option.fareEstimate, 500, 4500),
    reliability: option.signals.onTimeReliability,
    travelTime: invertLinear(minutes + option.extraTravelMinutes, 240, 1500),
    comfort: comfortScore(option.travelClass),
    boarding: boardingUplift,
    tatkal: option.signals.tatkalSuccessProbability,
    routePopularity: popularity.score,
  };

  const w = normalizeWeights(weights);
  const breakdown: DecisionBreakdown = (Object.keys(values) as DecisionFactor[])
    .map((factor) => ({
      factor,
      value: values[factor],
      weight: w[factor],
      contribution: values[factor] * w[factor],
    }))
    .sort((a, b) => b.contribution - a.contribution);

  const score = clamp(
    Math.round(breakdown.reduce((acc, b) => acc + b.contribution, 0)),
  );

  const topDrivers = breakdown.slice(0, 3).map((b) => b.factor);
  const worstDrivers = [...breakdown]
    .filter((b) => b.value < 55)
    .sort((a, b) => a.value - b.value)
    .slice(0, 3)
    .map((b) => b.factor);

  return { score, breakdown, topDrivers, worstDrivers };
}
