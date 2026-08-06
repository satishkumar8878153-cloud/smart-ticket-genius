// Confirm AI — alternate journey planning.
// Reuses the Tatkal Alternate Journey AI plus the shared advisor's nearby
// station / date / class intelligence, and picks the single best fallback.

import { generateAlternateJourneys, type AlternateJourneyResult, type AlternateOption } from "../tatkal/alternate-journey";
import type { RecommendationAdvice } from "../recommendation/advisor";
import type { ScoredOption } from "../recommendation/types";

export type AlternatePlan = {
  alternates: AlternateJourneyResult;
  bestFallback: AlternateOption | null;
  nearbyStation: RecommendationAdvice["nearbyStation"];
  alternateDate: RecommendationAdvice["alternateDate"];
  alternateClass: RecommendationAdvice["alternateClass"];
  summary: string;
};

export function planAlternateJourneys(
  ranked: ScoredOption[],
  advice?: Pick<RecommendationAdvice, "nearbyStation" | "alternateDate" | "alternateClass">,
): AlternatePlan {
  const alternates = generateAlternateJourneys(ranked);
  const pool = [
    ...alternates.trains,
    ...alternates.dates,
    ...alternates.stations,
    ...alternates.classes,
  ].sort(
    (a, b) =>
      b.expectedConfirmChance - a.expectedConfirmChance || b.missionScore - a.missionScore,
  );
  const bestFallback = pool[0] ?? null;

  return {
    alternates,
    bestFallback,
    nearbyStation: advice?.nearbyStation ?? null,
    alternateDate: advice?.alternateDate ?? null,
    alternateClass: advice?.alternateClass ?? null,
    summary: bestFallback
      ? `Best fallback: ${bestFallback.label} — ${bestFallback.reason}`
      : "No meaningful alternate journey available for this search.",
  };
}
