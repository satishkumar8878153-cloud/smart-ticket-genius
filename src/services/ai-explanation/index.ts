// AI Explanation Layer.
//
// One place that turns engine output into narrative explanations:
//   - why this train was selected
//   - why the alternatives ranked lower
//   - the booking strategy
//   - better nearby stations
//   - better travel dates
//
// It only reads existing engine artefacts (RecommendationAdvice, ScoredOption,
// intelligence bundles, Confirm AI modules) — no new scoring, no duplication.

import type { RecommendationAdvice } from "../recommendation/advisor";
import type { ScoredOption } from "../recommendation/types";
import type { ConfirmBookingStrategy } from "../confirm-ai/booking-strategy";

export type ExplanationSection = {
  id: "selection" | "alternatives" | "strategy" | "stations" | "dates";
  title: string;
  lines: string[];
};

export type AIExplanation = {
  headline: string;
  sections: ExplanationSection[];
  /** Flat text, useful for chat replies. */
  text: string;
};

function explainSelection(advice: RecommendationAdvice): ExplanationSection {
  const best = advice.bestChoice;
  if (!best) {
    return { id: "selection", title: "Why this train", lines: ["No option matched this journey."] };
  }
  return {
    id: "selection",
    title: "Why this train",
    lines: [
      `${best.trainNumber} ${best.trainName} · ${best.travelClass} · ${best.journeyDate} from ${best.boardingStation}.`,
      `Mission score ${best.missionScore}/100 with ${best.expectedConfirmChance}% expected confirmation and ${best.riskLevel} risk.`,
      ...best.reasons,
    ],
  };
}

function explainAlternatives(
  advice: RecommendationAdvice,
  ranked: ScoredOption[],
): ExplanationSection {
  const best = ranked[0];
  const lines: string[] = [];
  for (const s of ranked.slice(1, 4)) {
    const gap = best ? Math.max(0, best.missionScore - s.missionScore) : 0;
    const weak = s.intelligence?.whyRejected?.[0] ?? s.cons[0] ?? "no standout advantage";
    lines.push(
      `${s.option.trainNumber} ${s.option.trainName} (${s.option.travelClass}) ranked lower by ${gap} pts — ${weak}`,
    );
  }
  if (lines.length === 0) {
    lines.push("No comparable alternatives were returned for this route.");
  }
  void advice;
  return { id: "alternatives", title: "Why alternatives ranked lower", lines };
}

function explainStrategy(strategy?: ConfirmBookingStrategy): ExplanationSection {
  const lines: string[] = [];
  if (strategy) {
    lines.push(strategy.headline);
    strategy.plans.forEach((p) =>
      lines.push(`Plan ${p.id} · ${p.label}: ${p.reason}`),
    );
    strategy.actions.forEach((a) => lines.push(`${a.step}. ${a.action} (${a.when})`));
  } else {
    lines.push("Book the primary option now and keep the top alternate open until charting.");
  }
  return { id: "strategy", title: "Booking strategy", lines };
}

function explainStations(advice: RecommendationAdvice): ExplanationSection {
  const n = advice.nearbyStation;
  return {
    id: "stations",
    title: "Better nearby stations",
    lines: n
      ? [
          `${n.suggestedStation} (${n.suggestedStationCode}) instead of ${n.currentStation}: ${n.reason}`,
          `+${n.expectedImprovement}% expected confirmation for ${n.additionalTravelMinutes} min extra travel — ${
            n.worthwhile ? "worth it" : "probably not worth the detour"
          }.`,
        ]
      : ["Your boarding station is already the best option on this route."],
  };
}

function explainDates(advice: RecommendationAdvice): ExplanationSection {
  const d = advice.alternateDate;
  return {
    id: "dates",
    title: "Better travel dates",
    lines: d
      ? [
          `${d.date}: ${d.confirmProbability}% confirmation (${
            d.improvementVsSelected >= 0 ? "+" : ""
          }${d.improvementVsSelected}% vs your date) at ₹${d.fare}.`,
          d.reason,
        ]
      : ["Your selected date is already the strongest in the current window."],
  };
}

export function buildAIExplanation(input: {
  advice: RecommendationAdvice;
  ranked?: ScoredOption[];
  strategy?: ConfirmBookingStrategy;
}): AIExplanation {
  const ranked = input.ranked ?? input.advice.ranked;
  const sections = [
    explainSelection(input.advice),
    explainAlternatives(input.advice, ranked),
    explainStrategy(input.strategy),
    explainStations(input.advice),
    explainDates(input.advice),
  ];
  const best = input.advice.bestChoice;
  const headline = best
    ? `${best.trainName} in ${best.travelClass} is the strongest pick — ${best.expectedConfirmChance}% expected confirmation.`
    : "No confident recommendation for this journey yet.";

  return {
    headline,
    sections,
    text: [headline, ...sections.map((s) => `${s.title}:\n${s.lines.map((l) => `• ${l}`).join("\n")}`)].join("\n\n"),
  };
}
