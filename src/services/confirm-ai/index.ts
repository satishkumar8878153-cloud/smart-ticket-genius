// Mission Confirm AI — public entry point.
//
// Composes the shared AI Decision Engine with the Confirm AI reasoning
// modules and the AI Explanation Layer into one call:
//
//   const report = await buildConfirmReport({ query });
//
// Every part reuses existing engines (Recommendation Engine V2, Tatkal V3);
// nothing here re-implements scoring.

import { runDecisionEngine, type DecisionEngineInput } from "../decision-engine";
import type { RecommendationAdvice } from "../recommendation/advisor";
import type { ScoredOption } from "../recommendation/types";
import type { TatkalPrediction } from "../tatkal/tatkal-engine";
import { reasonConfirmation, type ConfirmationReasoning } from "./confirmation-reasoning";
import { analyzeRisk, type RiskAnalysis } from "./risk-analysis";
import {
  buildConfirmBookingStrategy,
  type ConfirmBookingStrategy,
} from "./booking-strategy";
import { planAlternateJourneys, type AlternatePlan } from "./alternate-planner";
import { buildAIExplanation, type AIExplanation } from "../ai-explanation";

export type ConfirmReport = {
  advice: RecommendationAdvice;
  ranked: ScoredOption[];
  primary: ScoredOption | null;
  confirmation: ConfirmationReasoning | null;
  risk: RiskAnalysis | null;
  strategy: ConfirmBookingStrategy;
  alternates: AlternatePlan;
  explanation: AIExplanation;
};

export async function buildConfirmReport(
  input: DecisionEngineInput & {
    tatkalByOptionId?: Record<string, TatkalPrediction>;
  } = {},
): Promise<ConfirmReport> {
  const { advice, ranked } = await runDecisionEngine(input);
  const primary = ranked[0] ?? null;

  const strategy = buildConfirmBookingStrategy({
    ranked,
    tatkalByOptionId: input.tatkalByOptionId,
  });
  const alternates = planAlternateJourneys(ranked, advice);
  const explanation = buildAIExplanation({ advice, ranked, strategy });

  return {
    advice,
    ranked,
    primary,
    confirmation: primary ? reasonConfirmation(primary) : null,
    risk: primary ? analyzeRisk(primary) : null,
    strategy,
    alternates,
    explanation,
  };
}

export * from "./confirmation-reasoning";
export * from "./risk-analysis";
export * from "./booking-strategy";
export * from "./alternate-planner";
