// Normalizes raw TravelOption signals into a 0..100 FeatureVector where a
// higher value is always "better for the user". Kept separate from the scorer
// so FastAPI or an alternate scorer can reuse the same feature engineering.

import type { FeatureVector, TravelOption } from "./types";

export function parseDurationToMinutes(d: string): number {
  const m = /([0-9]+)h\s*([0-9]+)?/i.exec(d);
  if (!m) return 600;
  return Number(m[1]) * 60 + Number(m[2] ?? 0);
}

// Piecewise linear mapping so we can invert cost-like signals into scores.
function invertLinear(value: number, best: number, worst: number): number {
  if (worst === best) return 100;
  const t = (value - best) / (worst - best);
  return Math.max(0, Math.min(100, Math.round((1 - t) * 100)));
}

export function extractFeatures(option: TravelOption): FeatureVector {
  const journeyMinutes = parseDurationToMinutes(option.duration);

  return {
    seatAvailability: option.signals.seatAvailability,
    confirmProbability: option.signals.confirmProbability,
    tatkalSuccess: option.signals.tatkalSuccessProbability,
    waitlistSafety: 100 - option.signals.waitingListRisk,
    // Cost-like signals inverted so higher = better.
    fareValue: invertLinear(option.fareEstimate, 500, 4500),
    travelTime: invertLinear(journeyMinutes, 240, 1440),
    extraDistance: invertLinear(option.extraTravelMinutes, 0, 90),
    boardingConvenience:
      option.extraTravelMinutes === 0
        ? 100
        : invertLinear(option.extraTravelMinutes, 0, 75),
    changesEase: invertLinear(option.numChanges, 0, 3),
  };
}
