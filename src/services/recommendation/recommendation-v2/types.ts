// Recommendation Engine V2 — shared types.
// Every engine is a small independent interface so a FastAPI/ML backend can
// swap any implementation in without touching the callers.

import type { TravelOption } from "../types";

export type DemandLevel = "very-low" | "low" | "medium" | "high" | "extreme";
export type SeasonType =
  | "regular"
  | "summer-vacation"
  | "winter-vacation"
  | "festival"
  | "exam";
export type RiskLevelV2 = "low" | "moderate" | "elevated" | "high" | "critical";
export type ConfidenceLabelV2 = "very-high" | "high" | "medium" | "low";
export type BookingDifficulty = "easy" | "moderate" | "hard" | "extreme";

export type DemandContext = {
  journeyDate: string;             // ISO date
  route?: { source: string; destination: string };
};

export type DemandSignal = {
  score: number;                   // 0..100
  level: DemandLevel;
  reasons: string[];
};

export type SeasonImpact = {
  season: SeasonType;
  demandMultiplier: number;        // e.g. 1.15
  fareMultiplier: number;
  reliabilityDelta: number;        // -100..100
  reasons: string[];
};

export type ReliabilitySignal = {
  onTimeScore: number;             // 0..100
  delayRisk: number;               // 0..100 (higher = riskier)
  cancellationRisk: number;        // 0..100
  historicalReliability: number;   // 0..100 (placeholder)
  overall: number;                 // 0..100
};

export type ConfirmationSignal = {
  probability: number;             // 0..100
  expectedWaitlistMovement: number;// signed integer (positions cleared)
  confidence: number;              // 0..100
};

export type TatkalIntel = {
  successChance: number;           // 0..100
  difficulty: BookingDifficulty;
  serverLoadRisk: number;          // 0..100
  highDemandWarning: boolean;
  recommendedLoginTime: string;    // e.g. "09:56 IST"
  strategy: string[];
};

export type RiskAssessment = {
  level: RiskLevelV2;
  score: number;                   // 0..100
  reasons: string[];
};

export type ConfidenceAssessment = {
  score: number;                   // 0..100
  label: ConfidenceLabelV2;
};

export type Explanation = {
  summary: string;
  pros: string[];
  cons: string[];
};

export type OptionContext = {
  demand: DemandSignal;
  season: SeasonImpact;
  reliability: ReliabilitySignal;
  confirmation: ConfirmationSignal;
  tatkal: TatkalIntel;
};

export type ScoredOptionV2 = {
  option: TravelOption;
  missionScore: number;            // 0..100
  ctx: OptionContext;
  risk: RiskAssessment;
  confidence: ConfidenceAssessment;
  explanation: Explanation;
};

export type DiversifiedPicks = {
  bestOverall: ScoredOptionV2;
  highestConfirmation: ScoredOptionV2;
  fastest: ScoredOptionV2;
  cheapest: ScoredOptionV2;
  bestTatkal: ScoredOptionV2;
  safest: ScoredOptionV2;
  hiddenGem: ScoredOptionV2 | null;
};

// ---- Engine interfaces (dependency-injection ready) ----

export interface IDemandEngine {
  estimate(ctx: DemandContext): DemandSignal;
}
export interface ISeasonEngine {
  infer(journeyDate: string): SeasonImpact;
}
export interface IReliabilityEngine {
  score(option: TravelOption, season: SeasonImpact): ReliabilitySignal;
}
export interface IConfirmationEngine {
  compute(
    option: TravelOption,
    demand: DemandSignal,
    season: SeasonImpact,
    reliability: ReliabilitySignal,
  ): ConfirmationSignal;
}
export interface ITatkalEngine {
  predict(
    option: TravelOption,
    demand: DemandSignal,
    reliability: ReliabilitySignal,
  ): TatkalIntel;
}
export interface IMissionEngine {
  score(option: TravelOption, ctx: OptionContext): number;
}
export interface IRiskEngine {
  assess(option: TravelOption, ctx: OptionContext): RiskAssessment;
}
export interface IConfidenceEngine {
  assess(option: TravelOption, ctx: OptionContext): ConfidenceAssessment;
}
export interface IExplainEngine {
  explain(
    option: TravelOption,
    ctx: OptionContext,
    missionScore: number,
    rank: number,
  ): Explanation;
}
export interface IRankingEngine {
  rank(scored: ScoredOptionV2[]): ScoredOptionV2[];
  diversify(ranked: ScoredOptionV2[]): DiversifiedPicks | null;
}
