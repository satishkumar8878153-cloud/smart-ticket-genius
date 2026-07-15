// Boarding Optimizer V2
// Extends the V1 heuristic with an explainable payload:
// suggested boarding, expected confirmation improvement, extra distance,
// extra travel time, and a natural-language reason.

import type { TravelOption } from "../recommendation/types";

export type BoardingOptimizationV2 = {
  currentStation: string;
  currentStationCode: string;
  suggestedStation: string;
  suggestedStationCode: string;
  expectedImprovement: number;      // percentage points on confirmProbability
  extraTravelMinutes: number;
  extraDistanceKm: number;          // best-effort estimate: 55 km/h avg
  worthwhile: boolean;
  reason: string;
};

const AVG_APPROACH_KMPH = 55;

function sameJourney(a: TravelOption, b: TravelOption): boolean {
  return (
    a.trainNumber === b.trainNumber &&
    a.travelClass === b.travelClass &&
    a.journeyDate === b.journeyDate
  );
}

export function optimizeBoardingV2(
  target: TravelOption,
  pool: TravelOption[],
): BoardingOptimizationV2 | null {
  const siblings = pool.filter(
    (o) =>
      sameJourney(o, target) &&
      o.boardingStationCode !== target.boardingStationCode,
  );
  if (siblings.length === 0) return null;

  const scored = siblings
    .map((s) => {
      const delta =
        s.signals.confirmProbability - target.signals.confirmProbability;
      const extra = Math.max(0, s.extraTravelMinutes - target.extraTravelMinutes);
      const penalty = extra * 0.15;
      return { s, delta, extra, net: delta - penalty };
    })
    .sort((a, b) => b.net - a.net);

  const best = scored[0];
  if (!best || best.delta <= 2) return null;

  const extraKm = Math.round((best.extra / 60) * AVG_APPROACH_KMPH);
  const worthwhile = best.net >= 5;
  const reason = worthwhile
    ? `Boarding at ${best.s.boardingStation} improves confirmation by ${Math.round(best.delta)}pp for ${best.extra} min extra travel.`
    : `Marginal improvement (${Math.round(best.delta)}pp) for ${best.extra} min extra travel — only take it if you have flexibility.`;

  return {
    currentStation: target.boardingStation,
    currentStationCode: target.boardingStationCode,
    suggestedStation: best.s.boardingStation,
    suggestedStationCode: best.s.boardingStationCode,
    expectedImprovement: Math.round(best.delta),
    extraTravelMinutes: best.extra,
    extraDistanceKm: extraKm,
    worthwhile,
    reason,
  };
}
