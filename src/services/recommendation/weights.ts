// Default weights for the AI scoring model. Not hardcoded in the scorer —
// callers may override, and a FastAPI backend can return its own set.

import type { ScoreWeights } from "./types";

export const DEFAULT_WEIGHTS: ScoreWeights = {
  confirmProbability: 0.22,
  seatAvailability: 0.15,
  tatkalSuccess: 0.06,
  waitlistSafety: 0.12,
  fareValue: 0.10,
  travelTime: 0.12,
  extraDistance: 0.08,
  boardingConvenience: 0.08,
  changesEase: 0.07,
};

// Small helper to override a subset of weights safely.
export function mergeWeights(overrides: Partial<ScoreWeights> = {}): ScoreWeights {
  return { ...DEFAULT_WEIGHTS, ...overrides };
}
