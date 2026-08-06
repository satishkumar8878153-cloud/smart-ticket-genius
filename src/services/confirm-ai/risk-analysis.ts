// Confirm AI — risk analysis.
// Converts engine signals into a structured risk profile plus mitigations.

import type { ScoredOption } from "../recommendation/types";

export type RiskFactor = {
  factor: string;
  severity: "low" | "moderate" | "high";
  detail: string;
};

export type RiskAnalysis = {
  optionId: string;
  level: ScoredOption["riskLevel"];
  score: number;              // 0..100 (higher = riskier)
  factors: RiskFactor[];
  mitigations: string[];
  summary: string;
};

function severity(value: number): RiskFactor["severity"] {
  if (value >= 70) return "high";
  if (value >= 45) return "moderate";
  return "low";
}

export function analyzeRisk(s: ScoredOption): RiskAnalysis {
  const intel = s.intelligence;
  const factors: RiskFactor[] = [];

  const wlRisk = s.option.signals.waitingListRisk;
  factors.push({
    factor: "Waiting list",
    severity: severity(wlRisk),
    detail: `Waiting-list pressure scored ${wlRisk}/100${
      intel ? ` with ${intel.waitlist.movementSpeed} movement` : ""
    }.`,
  });

  const demand = intel?.demandIndex ?? 100 - s.option.signals.seatAvailability;
  factors.push({
    factor: "Demand",
    severity: severity(demand),
    detail: intel
      ? `${intel.demandBand} demand (index ${intel.demandIndex}).`
      : `Estimated demand index ${Math.round(demand)}.`,
  });

  const reliability = 100 - s.option.signals.onTimeReliability;
  factors.push({
    factor: "Delay history",
    severity: severity(reliability),
    detail: `On-time reliability is ${s.option.signals.onTimeReliability}%.`,
  });

  if (s.option.extraTravelMinutes > 0) {
    factors.push({
      factor: "Boarding detour",
      severity: severity(Math.min(100, s.option.extraTravelMinutes)),
      detail: `Requires ${s.option.extraTravelMinutes} min extra travel to ${s.option.boardingStation}.`,
    });
  }

  const score = Math.round(
    factors.reduce(
      (acc, f) => acc + (f.severity === "high" ? 100 : f.severity === "moderate" ? 55 : 20),
      0,
    ) / Math.max(1, factors.length),
  );

  const mitigations: string[] = [];
  if (wlRisk >= 50) {
    mitigations.push("Keep a Tatkal attempt ready as a same-day fallback.");
  }
  if (intel?.boardingSuggestion?.worthwhile) {
    mitigations.push(
      `Board at ${intel.boardingSuggestion.suggestedStation} for about +${intel.boardingSuggestion.expectedImprovement}% confirmation.`,
    );
  }
  if (demand >= 60) {
    mitigations.push("Shift the journey by a day to step outside the demand peak.");
  }
  if (reliability >= 45) {
    mitigations.push("Add buffer time for onward connections — this train slips often.");
  }
  if (mitigations.length === 0) {
    mitigations.push("No active mitigation needed — proceed with the primary plan.");
  }

  return {
    optionId: s.option.id,
    level: s.riskLevel,
    score,
    factors,
    mitigations,
    summary: `Overall ${s.riskLevel} risk (${score}/100) driven by ${
      factors.sort((a, b) => (b.severity > a.severity ? 1 : -1))[0]?.factor.toLowerCase() ?? "mixed signals"
    }.`,
  };
}
