// Confidence Engine — how sure V2 is about this option's ranking.

import { CONFIDENCE_THRESHOLDS } from "./config";
import type {
  ConfidenceAssessment,
  ConfidenceLabelV2,
  IConfidenceEngine,
  OptionContext,
} from "./types";
import type { TravelOption } from "../types";
import { clamp } from "./utils";

export class DefaultConfidenceEngine implements IConfidenceEngine {
  assess(_option: TravelOption, ctx: OptionContext): ConfidenceAssessment {
    // Confidence blends the confirmation-engine confidence with reliability
    // and an inverse-demand term (calmer demand = more predictable outcome).
    const raw =
      ctx.confirmation.confidence * 0.55 +
      ctx.reliability.overall * 0.25 +
      (100 - ctx.demand.score) * 0.20;
    const score = clamp(Math.round(raw));
    return { score, label: this.labelOf(score) };
  }

  private labelOf(score: number): ConfidenceLabelV2 {
    const t = CONFIDENCE_THRESHOLDS;
    if (score >= t.high) return "very-high";
    if (score >= t.medium) return "high";
    if (score >= t.low) return "medium";
    return "low";
  }
}
