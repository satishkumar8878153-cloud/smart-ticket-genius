// Explainable AI — turns a DecisionScore + intelligence bundle into concrete
// natural-language explanations. No random templates; every sentence quotes a
// real number surfaced by the engine so the user can audit the decision.

import type { DecisionFactor, DecisionScore } from "./decision-score";
import type { BoardingSuggestion } from "./intelligence/boarding";
import type { DemandIndex } from "./intelligence/demand";
import type { ExamSignal } from "./intelligence/exams";
import type { FestivalSignal } from "./intelligence/festivals";
import type { HistoricalStats } from "./intelligence/historical";
import type { TrainPopularity } from "./intelligence/train-popularity";
import type { WaitlistPrediction } from "./intelligence/waitlist";
import type { TravelOption } from "./types";

export type Explainability = {
  whySelected: string[];
  whyRejected: string[];   // reasons this option would be rejected
  advantages: string[];
  disadvantages: string[];
  risk: {
    level: "low" | "moderate" | "elevated" | "high";
    reasons: string[];
  };
  confidence: {
    level: "very-high" | "high" | "medium" | "low";
    score: number;
  };
};

const POSITIVE: Record<DecisionFactor, (v: number) => string> = {
  confirmation: (v) => `Confirmation probability sits at ${v}%.`,
  waitingMovement: (v) => `Waiting-list model projects ${v}% final confirmation.`,
  demand: (v) => `Demand pressure is calm (${100 - v}/100).`,
  season: (v) => `Off-season month keeps historical demand at ${100 - v}/100.`,
  fare: (v) => `Fare scores ${v}/100 for value on this class/distance.`,
  reliability: (v) => `On-time reliability rated ${v}/100.`,
  travelTime: (v) => `Total travel time scores ${v}/100 vs peers.`,
  comfort: (v) => `Class comfort index at ${v}/100.`,
  boarding: (v) => `Boarding station is already near-optimal (${v}/100).`,
  tatkal: (v) => `Tatkal odds as fallback are ${v}%.`,
  routePopularity: (v) => `Train popularity index at ${v}/100.`,
};

const NEGATIVE: Record<DecisionFactor, (v: number) => string> = {
  confirmation: (v) => `Confirmation probability only ${v}% — expect risk.`,
  waitingMovement: (v) => `Waiting-list clearance projected at just ${v}%.`,
  demand: (v) => `Heavy demand pressure (${100 - v}/100) crowding this date.`,
  season: (v) => `Peak-season month with demand ${100 - v}/100.`,
  fare: (v) => `Priced above peers — value score ${v}/100.`,
  reliability: (v) => `Reliability score below average (${v}/100).`,
  travelTime: (v) => `Longer journey than most alternatives (${v}/100).`,
  comfort: (v) => `Class comfort below average (${v}/100).`,
  boarding: (v) => `Boarding station adds friction (${v}/100).`,
  tatkal: (v) => `Tatkal fallback is weak (${v}%).`,
  routePopularity: (v) => `Niche train popularity (${v}/100) — thinner recovery options.`,
};

function riskLevel(waitlist: WaitlistPrediction): Explainability["risk"]["level"] {
  const r = waitlist.waitingRiskScore;
  if (r < 25) return "low";
  if (r < 45) return "moderate";
  if (r < 65) return "elevated";
  return "high";
}

function confidenceLevel(
  score: number,
): Explainability["confidence"]["level"] {
  if (score >= 82) return "very-high";
  if (score >= 65) return "high";
  if (score >= 45) return "medium";
  return "low";
}

export type ExplainInputs = {
  option: TravelOption;
  decision: DecisionScore;
  history: HistoricalStats;
  demand: DemandIndex;
  festivals: FestivalSignal;
  exams: ExamSignal;
  waitlist: WaitlistPrediction;
  popularity: TrainPopularity;
  boarding: BoardingSuggestion | null;
};

export function buildExplainability(inputs: ExplainInputs): Explainability {
  const { decision, waitlist, demand, festivals, exams, boarding } = inputs;

  const whySelected: string[] = decision.breakdown
    .slice(0, 3)
    .filter((b) => b.value >= 55)
    .map((b) => POSITIVE[b.factor](Math.round(b.value)));

  const whyRejected: string[] = decision.breakdown
    .filter((b) => b.value < 45)
    .slice(0, 3)
    .map((b) => NEGATIVE[b.factor](Math.round(b.value)));

  const advantages: string[] = [];
  const disadvantages: string[] = [];

  if (waitlist.movementSpeed === "fast" || waitlist.movementSpeed === "moderate") {
    advantages.push(
      `WL moving ~${waitlist.movementPerDay}/day with ${waitlist.daysToChart}d to chart.`,
    );
  } else if (waitlist.currentPosition !== null) {
    disadvantages.push(
      `WL ${waitlist.currentPosition} moving at ${waitlist.movementPerDay}/day — clearance uncertain.`,
    );
  }

  if (festivals.peakName) {
    disadvantages.push(
      `${festivals.peakName} within ${festivals.hits[0]?.window ?? 0}d spikes demand by ${festivals.demandBoost}/100.`,
    );
  }
  if (exams.peakName) {
    disadvantages.push(
      `${exams.peakName} window active — exam travel demand +${exams.demandBoost}/100.`,
    );
  }
  if (boarding?.worthwhile) {
    advantages.push(
      `Boarding at ${boarding.suggestedStation} lifts confirmation by ~${boarding.expectedImprovement}pp (+${boarding.additionalTravelMinutes} min travel).`,
    );
  }
  if (demand.band === "low" || demand.band === "moderate") {
    advantages.push(`Overall demand index only ${demand.score}/100 (${demand.band}).`);
  } else {
    disadvantages.push(`Demand index is ${demand.band} (${demand.score}/100).`);
  }

  // Guarantee at least one bullet each so downstream UI is stable.
  if (whySelected.length === 0 && decision.breakdown[0]) {
    whySelected.push(POSITIVE[decision.breakdown[0].factor](Math.round(decision.breakdown[0].value)));
  }
  if (advantages.length === 0) advantages.push(whySelected[0] ?? "Balanced across all factors.");
  if (disadvantages.length === 0) disadvantages.push("No standout weaknesses in the decision breakdown.");

  const risk = riskLevel(waitlist);
  const riskReasons: string[] = [];
  if (waitlist.waitingRiskScore >= 45)
    riskReasons.push(`Waiting-list risk score ${waitlist.waitingRiskScore}/100.`);
  if (demand.score >= 65)
    riskReasons.push(`Demand pressure ${demand.score}/100.`);
  if (waitlist.daysToChart <= 1)
    riskReasons.push(`Only ${waitlist.daysToChart}d to chart preparation.`);
  if (riskReasons.length === 0) riskReasons.push("Signals stable across the board.");

  const confidenceScore = Math.round(
    decision.score * 0.7 + waitlist.finalConfirmChance * 0.3,
  );

  return {
    whySelected,
    whyRejected,
    advantages,
    disadvantages,
    risk: { level: risk, reasons: riskReasons },
    confidence: { level: confidenceLevel(confidenceScore), score: confidenceScore },
  };
}
