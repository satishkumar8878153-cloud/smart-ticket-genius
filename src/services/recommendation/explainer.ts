// Turns feature contributions into human-readable "why", pros and cons.
// Purely derived from the scorer output — no hardcoded per-train copy.

import type { FeatureContribution, ScoredOption } from "./types";

const FEATURE_COPY: Record<
  FeatureContribution["feature"],
  { positive: string; negative: string; label: string }
> = {
  confirmProbability: {
    label: "confirmation probability",
    positive: "Strong historical confirmation rate on this combination",
    negative: "Confirmation probability is below the safe threshold",
  },
  seatAvailability: {
    label: "seat availability",
    positive: "Healthy seat availability right now",
    negative: "Very tight seat availability",
  },
  tatkalSuccess: {
    label: "Tatkal success",
    positive: "Favourable Tatkal odds as a fallback",
    negative: "Tatkal is unlikely to rescue this booking",
  },
  waitlistSafety: {
    label: "waitlist safety",
    positive: "Low risk of getting stuck on the waiting list",
    negative: "Elevated waiting-list risk",
  },
  fareValue: {
    label: "fare value",
    positive: "Fare is competitive for the class and distance",
    negative: "Premium-priced compared to similar options",
  },
  travelTime: {
    label: "travel time",
    positive: "Shorter overall travel time",
    negative: "Longer journey than most alternatives",
  },
  extraDistance: {
    label: "extra distance",
    positive: "Minimal detour to reach the boarding station",
    negative: "Requires meaningful extra travel to the boarding point",
  },
  boardingConvenience: {
    label: "boarding convenience",
    positive: "Convenient boarding — no local transit required",
    negative: "Boarding station adds friction to the trip",
  },
  changesEase: {
    label: "train changes",
    positive: "Direct or near-direct — no coach changes to worry about",
    negative: "Multiple train changes involved",
  },
};

export function explain(scored: ScoredOption): ScoredOption {
  const strongest = scored.contributions.slice(0, 3);
  const weakest = [...scored.contributions]
    .filter((c) => c.value < 55)
    .sort((a, b) => a.value - b.value)
    .slice(0, 3);

  const pros = strongest
    .filter((c) => c.value >= 60)
    .map((c) => FEATURE_COPY[c.feature].positive);

  const cons = weakest.map((c) => FEATURE_COPY[c.feature].negative);

  const top = strongest[0];
  const why = top
    ? `AI picked this because ${FEATURE_COPY[top.feature].label} scored ${Math.round(top.value)}/100, contributing ${(top.contribution).toFixed(1)} pts to the mission score of ${scored.missionScore}.`
    : `Mission score of ${scored.missionScore} based on a balanced feature vector.`;

  // Guarantee at least one entry so the UI never renders empty lists.
  if (pros.length === 0 && strongest[0]) {
    pros.push(FEATURE_COPY[strongest[0].feature].positive);
  }
  if (cons.length === 0) {
    cons.push("No standout weaknesses — trade-offs are within normal range.");
  }

  return { ...scored, why, pros, cons };
}
