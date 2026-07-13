// Central config for Recommendation Engine V2. Every weight, threshold and
// multiplier lives here so tuning (or FastAPI-provided overrides) is trivial.

import type { SeasonType } from "./types";

export const DEMAND_WEIGHTS = {
  weekend: 12,
  friday: 8,
  monday: 5,
  holiday: 20,
  festival: 22,
  exam: 10,
  vacation: 15,
  longWeekend: 18,
  specialRush: 15,
  baseline: 35,
};

export const DEMAND_LEVEL_THRESHOLDS = {
  veryLow: 20,
  low: 40,
  medium: 60,
  high: 80,
  // >= 80 => extreme
};

export const SEASON_MULTIPLIERS: Record<
  SeasonType,
  { demand: number; fare: number; reliability: number }
> = {
  "regular":          { demand: 1.00, fare: 1.00, reliability:  0 },
  "summer-vacation":  { demand: 1.25, fare: 1.15, reliability: -4 },
  "winter-vacation":  { demand: 1.18, fare: 1.10, reliability: -3 },
  "festival":         { demand: 1.35, fare: 1.20, reliability: -6 },
  "exam":             { demand: 1.10, fare: 1.03, reliability: -1 },
};

// Reliability sub-weights (must sum to 1).
export const RELIABILITY_WEIGHTS = {
  onTime: 0.45,
  delayInverse: 0.20,
  cancellationInverse: 0.15,
  historical: 0.20,
};

// Confirmation blend weights (normalized internally).
export const CONFIRMATION_WEIGHTS = {
  seatAvailability: 0.30,
  baseProbability: 0.25,
  reliability: 0.12,
  demandPenalty: 0.15,
  seasonPenalty: 0.08,
  waitlistSafety: 0.10,
};

// Class base difficulty for Tatkal (higher = harder).
export const TATKAL_CLASS_DIFFICULTY: Record<string, number> = {
  SL: 65,
  "3A": 70,
  "2A": 55,
  "1A": 30,
  CC: 45,
  EC: 35,
};

// Mission Score V2 weights (normalized internally).
export const MISSION_WEIGHTS = {
  confirmation: 0.22,
  reliability: 0.14,
  fareValue: 0.10,
  travelTime: 0.12,
  extraTravel: 0.08,
  boardingConvenience: 0.07,
  changes: 0.06,
  demandInverse: 0.08,
  tatkal: 0.05,
  comfort: 0.08,
};

// Class comfort baseline (0..100).
export const CLASS_COMFORT: Record<string, number> = {
  "1A": 100,
  EC: 92,
  "2A": 85,
  "3A": 70,
  CC: 60,
  SL: 45,
};

// Risk thresholds (0..100 risk score).
export const RISK_THRESHOLDS = {
  low: 20,
  moderate: 40,
  elevated: 60,
  high: 80,
  // >= 80 => critical
};

// Confidence label thresholds.
export const CONFIDENCE_THRESHOLDS = {
  low: 45,
  medium: 65,
  high: 82,
  // >= 82 => very-high
};

// Fare / travel-time envelopes for inversion (0=worst, 100=best).
export const ENVELOPES = {
  fare: { best: 500, worst: 4500 },
  travelMinutes: { best: 240, worst: 1440 },
  extraTravelMinutes: { best: 0, worst: 90 },
  changes: { best: 0, worst: 3 },
};
