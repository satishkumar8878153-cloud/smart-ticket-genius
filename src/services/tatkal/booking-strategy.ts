// Booking Strategy AI
// Produces four complementary plans (A/B/C/D) from a ranked ScoredOption set.
// Plan A = best overall, Plan B = safer / alternate date, Plan C = cheaper,
// Plan D = fastest. Reasons are derived from the option's IntelligenceBundle
// and Tatkal prediction, never hardcoded.

import type { ScoredOption } from "../recommendation/types";
import type { TatkalPrediction } from "./tatkal-engine";

export type PlanId = "A" | "B" | "C" | "D";

export type BookingPlan = {
  id: PlanId;
  label: string;
  train: { number: string; name: string };
  travelClass: string;
  boarding: { station: string; code: string };
  journeyDate: string;
  reason: string;
  confidence: number;               // 0..100
  risk: "low" | "moderate" | "elevated" | "high";
  missionScore: number;
  expectedConfirmChance: number;
  tatkal?: TatkalPrediction;
};

export type BookingStrategyInput = {
  ranked: ScoredOption[];
  tatkalByOptionId?: Record<string, TatkalPrediction>;
};

function baseFrom(
  s: ScoredOption,
  id: PlanId,
  label: string,
  reason: string,
  tatkal?: TatkalPrediction,
): BookingPlan {
  return {
    id,
    label,
    train: { number: s.option.trainNumber, name: s.option.trainName },
    travelClass: s.option.travelClass,
    boarding: {
      station: s.option.boardingStation,
      code: s.option.boardingStationCode,
    },
    journeyDate: s.option.journeyDate,
    reason,
    confidence: s.confidence,
    risk: s.riskLevel,
    missionScore: s.missionScore,
    expectedConfirmChance: s.expectedConfirmChance,
    tatkal,
  };
}

function parseMinutes(duration: string): number {
  // "12h 45m" style; safe fallback.
  const h = /([0-9]+)\s*h/.exec(duration);
  const m = /([0-9]+)\s*m/.exec(duration);
  return (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
}

export function buildBookingStrategy(
  input: BookingStrategyInput,
): BookingPlan[] {
  const { ranked, tatkalByOptionId = {} } = input;
  if (ranked.length === 0) return [];

  const tatkalFor = (s: ScoredOption) => tatkalByOptionId[s.option.id];
  const seen = new Set<string>();
  const plans: BookingPlan[] = [];

  const pushPlan = (
    src: ScoredOption | undefined,
    id: PlanId,
    label: string,
    reason: string,
  ) => {
    if (!src) return;
    if (seen.has(src.option.id) && plans.length >= 1) return;
    seen.add(src.option.id);
    plans.push(baseFrom(src, id, label, reason, tatkalFor(src)));
  };

  // A — top ranked.
  const a = ranked[0];
  pushPlan(
    a,
    "A",
    "Best Overall",
    a.why || `Highest decision score with ${a.expectedConfirmChance}% confirmation odds.`,
  );

  // B — lowest risk with strong confirm.
  const b = [...ranked]
    .filter((s) => s.option.id !== a.option.id)
    .sort(
      (x, y) =>
        (x.riskLevel === "low" ? 0 : x.riskLevel === "moderate" ? 1 : x.riskLevel === "elevated" ? 2 : 3) -
        (y.riskLevel === "low" ? 0 : y.riskLevel === "moderate" ? 1 : y.riskLevel === "elevated" ? 2 : 3) ||
        y.expectedConfirmChance - x.expectedConfirmChance,
    )[0];
  pushPlan(
    b,
    "B",
    "Safer Alternate",
    b ? `Lower risk (${b.riskLevel}) with ${b.expectedConfirmChance}% confirm odds.` : "",
  );

  // C — cheapest among top half.
  const half = Math.max(3, Math.ceil(ranked.length / 2));
  const c = [...ranked.slice(0, half)]
    .filter((s) => !seen.has(s.option.id))
    .sort((x, y) => x.option.fareEstimate - y.option.fareEstimate)[0];
  pushPlan(
    c,
    "C",
    "Value Pick",
    c ? `Lowest fare (₹${c.option.fareEstimate}) while keeping healthy confirm odds.` : "",
  );

  // D — fastest travel time among top half.
  const d = [...ranked.slice(0, half)]
    .filter((s) => !seen.has(s.option.id))
    .sort(
      (x, y) => parseMinutes(x.option.duration) - parseMinutes(y.option.duration),
    )[0];
  pushPlan(
    d,
    "D",
    "Fastest Route",
    d ? `Shortest travel time (${d.option.duration}) in the top-confirm window.` : "",
  );

  return plans;
}
