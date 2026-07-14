// Recommendation Engine — shared types.
// A "TravelOption" is one bookable combination (train × class × date × boarding
// station). The engine extracts a normalized feature vector, scores it via a
// pluggable model, and emits a ScoredOption with explanations.

import type { TicketClass } from "../types";

export type RiskLevel = "low" | "moderate" | "elevated" | "high";

export type ConfidenceLevel = "very-high" | "high" | "medium" | "low";

// One candidate the engine can rank.
export type TravelOption = {
  id: string;
  trainNumber: string;
  trainName: string;
  departure: string;
  arrival: string;
  duration: string;
  travelClass: TicketClass;
  journeyDate: string;
  boardingStation: string;
  boardingStationCode: string;
  extraTravelMinutes: number; // 0 when boarding at the actual source
  numChanges: number;
  fareEstimate: number;
  // Raw signals the engine will normalize (0..100 where meaningful).
  signals: {
    seatAvailability: number;      // 0..100 (100 = plenty of seats)
    confirmProbability: number;    // 0..100
    tatkalSuccessProbability: number; // 0..100
    waitingListRisk: number;       // 0..100 (100 = very risky)
    onTimeReliability: number;     // 0..100
  };
};

// Normalized feature vector (all fields 0..100, higher = better for the user).
export type FeatureVector = {
  seatAvailability: number;
  confirmProbability: number;
  tatkalSuccess: number;
  fareValue: number;         // inverted: cheaper => higher score
  travelTime: number;        // inverted: shorter => higher score
  extraDistance: number;     // inverted: less extra travel => higher score
  boardingConvenience: number;
  changesEase: number;       // inverted: fewer changes => higher score
  waitlistSafety: number;    // inverted from waitingListRisk
};

// Weights for the default linear scorer. Sum is not required to equal 1 — the
// scorer normalizes internally, so tuning individual weights is safe.
export type ScoreWeights = Record<keyof FeatureVector, number>;

export type FeatureContribution = {
  feature: keyof FeatureVector;
  value: number;         // normalized 0..100
  weight: number;        // effective weight after normalization
  contribution: number;  // value * weight
};

// V2 intelligence bundle attached to every scored option. Kept optional so
// legacy callers (and the current UI) keep compiling unchanged.
export type IntelligenceBundle = {
  decisionScore: number;              // 0..100 multi-factor decision score
  decisionBreakdown: Array<{
    factor: string;
    value: number;
    weight: number;
    contribution: number;
  }>;
  demandIndex: number;                // 0..100
  demandBand: "low" | "moderate" | "high" | "extreme";
  festivalPeak: string | null;
  examPeak: string | null;
  historicalConfirmTrend: number;     // 0..100
  seasonalDemand: number;             // 0..100
  trainPopularity: number;            // 0..100
  waitlist: {
    movementSpeed: "fast" | "moderate" | "slow" | "stalled";
    movementPerDay: number;
    racConversionChance: number;
    finalConfirmChance: number;
    waitingRiskScore: number;
    currentPosition: number | null;
    daysToChart: number;
  };
  boardingSuggestion: {
    suggestedStation: string;
    suggestedStationCode: string;
    expectedImprovement: number;
    additionalTravelMinutes: number;
    worthwhile: boolean;
  } | null;
  whySelected: string[];
  whyRejected: string[];
};

export type ScoredOption = {
  option: TravelOption;
  missionScore: number;               // 0..100
  confidence: number;                 // 0..100
  confidenceLevel: ConfidenceLevel;
  expectedConfirmChance: number;      // 0..100
  riskLevel: RiskLevel;
  why: string;                        // one-line AI explanation
  pros: string[];
  cons: string[];
  features: FeatureVector;
  contributions: FeatureContribution[]; // sorted desc by contribution
  intelligence?: IntelligenceBundle;    // v2 enrichment (optional for BC)
};

// Pluggable scorer contract. A FastAPI backend can implement this by making
// a network round-trip; the default in-app scorer is a weighted linear model.
export interface ScoringModel {
  readonly id: string;
  score(options: TravelOption[], weights: ScoreWeights): Promise<ScoredOption[]>;
}
