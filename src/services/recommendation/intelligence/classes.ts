// Alternate Class Intelligence — when the traveller's selected class has weak
// availability, look for another class on the SAME train, date and boarding
// station that materially improves confirmation odds, and explain the
// trade-off (fare difference, comfort, confirmation uplift).

import type { TicketClass } from "../../types";
import type { ScoredOption } from "../types";

export type ClassSuggestion = {
  currentClass: TicketClass;
  suggestedClass: TicketClass;
  currentConfirmProbability: number;
  suggestedConfirmProbability: number;
  confirmImprovement: number; // percentage points
  fareDifference: number;     // ₹, positive = costs more
  worthwhile: boolean;
  reason: string;
};

const COMFORT_RANK: Record<TicketClass, number> = {
  SL: 1,
  CC: 2,
  "3A": 3,
  EC: 4,
  "2A": 5,
  "1A": 6,
};

function poorAvailability(o: ScoredOption): boolean {
  return (
    o.option.signals.seatAvailability < 45 ||
    o.option.signals.confirmProbability < 62 ||
    o.riskLevel === "elevated" ||
    o.riskLevel === "high"
  );
}

/**
 * @param target the option the traveller currently intends to book
 * @param pool   every scored option produced by the engine
 */
export function suggestAlternateClass(
  target: ScoredOption,
  pool: ScoredOption[],
): ClassSuggestion | null {
  const siblings = pool.filter(
    (o) =>
      o.option.trainNumber === target.option.trainNumber &&
      o.option.journeyDate === target.option.journeyDate &&
      o.option.boardingStationCode === target.option.boardingStationCode &&
      o.option.travelClass !== target.option.travelClass,
  );
  if (siblings.length === 0) return null;

  const needsHelp = poorAvailability(target);

  const scored = siblings
    .map((s) => {
      const delta =
        s.option.signals.confirmProbability -
        target.option.signals.confirmProbability;
      const fareDelta = s.option.fareEstimate - target.option.fareEstimate;
      // Prefer a real confirmation uplift, penalise big fare jumps lightly.
      const net = delta - Math.max(0, fareDelta) / 250;
      return { s, delta, fareDelta, net };
    })
    .sort((a, b) => b.net - a.net);

  const best = scored[0];
  if (!best || best.delta < (needsHelp ? 6 : 12)) return null;

  const suggested = best.s.option.travelClass;
  const current = target.option.travelClass;
  const isUpgrade = COMFORT_RANK[suggested] > COMFORT_RANK[current];
  const worthwhile = needsHelp && best.net >= 5;

  const fareText =
    best.fareDelta === 0
      ? "at the same fare"
      : best.fareDelta > 0
        ? `for ₹${best.fareDelta} more`
        : `and saves ₹${Math.abs(best.fareDelta)}`;

  const reason = needsHelp
    ? `${current} looks tight (${target.option.signals.confirmProbability}% confirm, availability ${Math.round(target.option.signals.seatAvailability)}/100). ${suggested} on the same train confirms ${Math.round(best.delta)}pp higher ${fareText}${isUpgrade ? " with a more comfortable coach" : ""}.`
    : `${suggested} confirms ${Math.round(best.delta)}pp higher than ${current} on this train ${fareText} — worth it if your budget allows.`;

  return {
    currentClass: current,
    suggestedClass: suggested,
    currentConfirmProbability: target.option.signals.confirmProbability,
    suggestedConfirmProbability: best.s.option.signals.confirmProbability,
    confirmImprovement: Math.round(best.delta),
    fareDifference: Math.round(best.fareDelta),
    worthwhile,
    reason,
  };
}
