// Risk Engine — 5-level risk assessment with reasons.

import { RISK_THRESHOLDS } from "./config";
import type {
  IRiskEngine,
  OptionContext,
  RiskAssessment,
  RiskLevelV2,
} from "./types";
import type { TravelOption } from "../types";
import { clamp } from "./utils";

export class DefaultRiskEngine implements IRiskEngine {
  assess(option: TravelOption, ctx: OptionContext): RiskAssessment {
    const reasons: string[] = [];
    const waitlistRisk = option.signals.waitingListRisk;

    const raw =
      (100 - ctx.confirmation.probability) * 0.40 +
      waitlistRisk * 0.20 +
      (100 - ctx.reliability.overall) * 0.15 +
      ctx.demand.score * 0.10 +
      ctx.tatkal.serverLoadRisk * 0.05 +
      (100 - option.signals.seatAvailability) * 0.10;
    const score = clamp(Math.round(raw));

    if (ctx.confirmation.probability < 60) reasons.push("Confirmation probability below safe threshold");
    if (waitlistRisk > 60) reasons.push("Elevated waiting-list risk");
    if (ctx.reliability.overall < 60) reasons.push("Train reliability below average");
    if (ctx.demand.level === "high" || ctx.demand.level === "extreme")
      reasons.push(`Demand is ${ctx.demand.level.replace("-", " ")}`);
    if (ctx.tatkal.serverLoadRisk > 70) reasons.push("High server load risk on Tatkal window");
    if (option.numChanges > 0) reasons.push(`${option.numChanges} train change(s) in route`);
    if (reasons.length === 0) reasons.push("All signals within safe tolerances");

    return { score, level: this.levelOf(score), reasons };
  }

  private levelOf(score: number): RiskLevelV2 {
    const t = RISK_THRESHOLDS;
    if (score < t.low) return "low";
    if (score < t.moderate) return "moderate";
    if (score < t.elevated) return "elevated";
    if (score < t.high) return "high";
    return "critical";
  }
}
