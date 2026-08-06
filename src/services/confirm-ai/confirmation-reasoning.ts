// Confirm AI — confirmation reasoning.
// Explains, in plain language, why a booking is (or is not) expected to
// confirm, using the engine's intelligence bundle. No new scoring logic.

import type { ScoredOption } from "../recommendation/types";

export type ConfirmationVerdict =
  | "very-likely"
  | "likely"
  | "uncertain"
  | "unlikely";

export type ConfirmationReasoning = {
  optionId: string;
  verdict: ConfirmationVerdict;
  expectedConfirmChance: number;
  confidence: number;
  drivers: string[];   // what pushes confirmation up
  blockers: string[];  // what holds it back
  summary: string;
};

function verdictFor(chance: number): ConfirmationVerdict {
  if (chance >= 85) return "very-likely";
  if (chance >= 65) return "likely";
  if (chance >= 45) return "uncertain";
  return "unlikely";
}

export function reasonConfirmation(s: ScoredOption): ConfirmationReasoning {
  const intel = s.intelligence;
  const drivers: string[] = [];
  const blockers: string[] = [];

  if (s.option.signals.confirmProbability >= 70) {
    drivers.push(
      `Historical confirmation on this train/class is ${s.option.signals.confirmProbability}%.`,
    );
  } else {
    blockers.push(
      `Historical confirmation is only ${s.option.signals.confirmProbability}% for this combination.`,
    );
  }

  if (intel) {
    const wl = intel.waitlist;
    if (wl.movementSpeed === "fast" || wl.movementSpeed === "moderate") {
      drivers.push(
        `Waiting list moves ${wl.movementSpeed} (~${wl.movementPerDay}/day) with ${wl.daysToChart} days to charting.`,
      );
    } else {
      blockers.push(`Waiting list movement is ${wl.movementSpeed} — clearance is slow.`);
    }
    if (wl.racConversionChance >= 60) {
      drivers.push(`RAC conversion chance is ${wl.racConversionChance}%.`);
    }
    if (intel.demandBand === "high" || intel.demandBand === "extreme") {
      blockers.push(`${intel.demandBand} demand on these dates (index ${intel.demandIndex}).`);
    }
    if (intel.festivalPeak) blockers.push(`Festival peak: ${intel.festivalPeak}.`);
    if (intel.examPeak) blockers.push(`Exam travel peak: ${intel.examPeak}.`);
    if (intel.historicalConfirmTrend >= 70) {
      drivers.push(`Positive historical trend (${intel.historicalConfirmTrend}/100) on this route.`);
    }
  }

  if (s.option.signals.seatAvailability >= 60) {
    drivers.push("Seats are still open in this class right now.");
  }
  if (s.option.signals.waitingListRisk >= 60) {
    blockers.push(`Waiting-list risk scored ${s.option.signals.waitingListRisk}/100.`);
  }

  const verdict = verdictFor(s.expectedConfirmChance);
  const summary =
    `${s.option.trainNumber} ${s.option.trainName} in ${s.option.travelClass} on ${s.option.journeyDate} is ` +
    `${verdict.replace("-", " ")} to confirm (${s.expectedConfirmChance}% expected, ${s.confidenceLevel} confidence).`;

  return {
    optionId: s.option.id,
    verdict,
    expectedConfirmChance: s.expectedConfirmChance,
    confidence: s.confidence,
    drivers,
    blockers,
    summary,
  };
}
