// Tatkal Explain AI
// Produces the "why / risk / pros / cons" bundle for each booking plan by
// combining the plan's ScoredOption explainability and the TatkalPrediction.

import type { BookingPlan } from "./booking-strategy";
import type { ScoredOption } from "../recommendation/types";

export type PlanExplanation = {
  planId: BookingPlan["id"];
  why: string;
  risk: string;
  advantages: string[];
  disadvantages: string[];
};

export type TatkalExplainInput = {
  plans: BookingPlan[];
  scoredByOptionId: Record<string, ScoredOption>;
};

function riskNarrative(plan: BookingPlan): string {
  const tatkal = plan.tatkal;
  if (!tatkal) return `Risk level: ${plan.risk}.`;
  return `Risk ${plan.risk}. Booking difficulty ${tatkal.bookingDifficulty} (competition ${tatkal.competitionScore}/100, window quality ${tatkal.bookingWindowQuality}/100).`;
}

export function explainPlans(input: TatkalExplainInput): PlanExplanation[] {
  return input.plans.map((plan) => {
    const scored = input.scoredByOptionId[plan.train.number + ":" + plan.travelClass + ":" + plan.journeyDate + ":" + plan.boarding.code]
      ?? Object.values(input.scoredByOptionId).find((s) => s.option.id === (plan as unknown as { optionId?: string }).optionId);

    // Fallback: match by train+class+date+boarding
    const match =
      scored ??
      Object.values(input.scoredByOptionId).find(
        (s) =>
          s.option.trainNumber === plan.train.number &&
          s.option.travelClass === plan.travelClass &&
          s.option.journeyDate === plan.journeyDate &&
          s.option.boardingStationCode === plan.boarding.code,
      );

    const advantages = match?.pros ?? [];
    const disadvantages = match?.cons ?? [];
    const why =
      match?.intelligence?.whySelected?.[0] ??
      match?.why ??
      plan.reason;

    return {
      planId: plan.id,
      why: `Plan ${plan.id} (${plan.label}): ${why}`,
      risk: riskNarrative(plan),
      advantages,
      disadvantages,
    };
  });
}
