// Waiting List Movement Engine — predicts how a waiting-list ticket is likely
// to evolve before chart preparation. Uses observable signals from the
// TravelOption plus the demand index (higher demand => slower movement).
// All math is deterministic and interpretable.

import { clamp } from "../context";
import type { TravelOption } from "../types";
import type { DemandIndex } from "./demand";

export type WaitlistPrediction = {
  currentPosition: number | null;   // parsed from availability label when present
  movementSpeed: "fast" | "moderate" | "slow" | "stalled";
  movementPerDay: number;           // estimated positions cleared per day
  racConversionChance: number;      // 0..100
  finalConfirmChance: number;       // 0..100 by chart preparation
  waitingRiskScore: number;         // 0..100 higher = riskier
  daysToChart: number;              // journey - today, floored at 0
};

function parseWlPosition(label: string): number | null {
  const m = /WL\s*(\d+)/i.exec(label ?? "");
  return m ? Number(m[1]) : null;
}

export function predictWaitlist(
  option: TravelOption,
  daysToJourney: number,
  demand: DemandIndex,
  availabilityLabel: string,
): WaitlistPrediction {
  const wl = parseWlPosition(availabilityLabel);
  const daysToChart = Math.max(0, daysToJourney);

  // Baseline movement per day: derived from historical clearance signals.
  // Seat availability & waitlist safety inform how fluid the coach is.
  const baseMovement =
    option.signals.seatAvailability * 0.04 +
    (100 - option.signals.waitingListRisk) * 0.05;

  // Demand throttles movement — high demand reduces clearance.
  const demandFactor = 1 - demand.score / 180; // 100 demand => 0.44x
  const movementPerDay = Math.max(0, Number((baseMovement * demandFactor).toFixed(2)));

  // If we could parse the WL number, project it against days-to-chart.
  const canClear = movementPerDay * daysToChart;
  const conversionSignal = wl == null ? 60 : clamp(100 - (wl - canClear) * 6);

  // RAC conversion: the last mile of the queue moves faster on chart prep.
  const racConversion = clamp(
    Math.round(conversionSignal * 0.55 + option.signals.confirmProbability * 0.35 + 10),
  );

  const finalConfirm = clamp(
    Math.round(
      conversionSignal * 0.5 +
      option.signals.confirmProbability * 0.35 +
      (100 - demand.score) * 0.15,
    ),
  );

  const speed: WaitlistPrediction["movementSpeed"] =
    movementPerDay >= 3
      ? "fast"
      : movementPerDay >= 1.5
        ? "moderate"
        : movementPerDay >= 0.5
          ? "slow"
          : "stalled";

  const risk = clamp(
    Math.round(
      option.signals.waitingListRisk * 0.55 +
      (100 - finalConfirm) * 0.35 +
      demand.score * 0.10,
    ),
  );

  return {
    currentPosition: wl,
    movementSpeed: speed,
    movementPerDay,
    racConversionChance: racConversion,
    finalConfirmChance: finalConfirm,
    waitingRiskScore: risk,
    daysToChart,
  };
}
