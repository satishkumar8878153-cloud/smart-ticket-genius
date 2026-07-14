// Boarding Optimization — for a chosen train/class/date, scan sibling options
// (same train, same class, same date, different boarding station) and pick the
// one that materially improves confirmation odds while staying within an
// acceptable extra-travel envelope.

import type { TravelOption } from "../types";

export type BoardingSuggestion = {
  currentStation: string;
  suggestedStation: string;
  suggestedStationCode: string;
  expectedImprovement: number;      // percentage points on confirm probability
  additionalTravelMinutes: number;
  worthwhile: boolean;              // improvement outweighs extra travel
};

function sameJourney(a: TravelOption, b: TravelOption): boolean {
  return (
    a.trainNumber === b.trainNumber &&
    a.travelClass === b.travelClass &&
    a.journeyDate === b.journeyDate
  );
}

export function optimizeBoarding(
  target: TravelOption,
  pool: TravelOption[],
): BoardingSuggestion | null {
  const siblings = pool.filter(
    (o) => sameJourney(o, target) && o.boardingStationCode !== target.boardingStationCode,
  );
  if (siblings.length === 0) return null;

  // Score = confirmation delta minus a travel-time penalty.
  const scored = siblings
    .map((s) => {
      const delta =
        s.signals.confirmProbability - target.signals.confirmProbability;
      const extra = s.extraTravelMinutes - target.extraTravelMinutes;
      const penalty = Math.max(0, extra) * 0.15;
      return { s, delta, extra, net: delta - penalty };
    })
    .sort((a, b) => b.net - a.net);

  const best = scored[0];
  if (!best || best.delta <= 2) return null; // < 2pp is noise

  return {
    currentStation: target.boardingStation,
    suggestedStation: best.s.boardingStation,
    suggestedStationCode: best.s.boardingStationCode,
    expectedImprovement: Math.round(best.delta),
    additionalTravelMinutes: Math.max(0, best.extra),
    worthwhile: best.net >= 5,
  };
}
