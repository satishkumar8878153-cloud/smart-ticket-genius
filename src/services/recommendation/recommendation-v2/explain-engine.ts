// Explain Engine — human-readable summary, pros and cons.
// Derives copy from computed signals; no per-train hardcoded strings.

import type {
  Explanation,
  IExplainEngine,
  OptionContext,
} from "./types";
import type { TravelOption } from "../types";

function pctLabel(v: number): string {
  return `${Math.round(v)}%`;
}

export class DefaultExplainEngine implements IExplainEngine {
  explain(
    option: TravelOption,
    ctx: OptionContext,
    missionScore: number,
    rank: number,
  ): Explanation {
    const pros: string[] = [];
    const cons: string[] = [];

    if (ctx.confirmation.probability >= 75)
      pros.push(`Strong confirmation probability (${pctLabel(ctx.confirmation.probability)})`);
    else if (ctx.confirmation.probability < 55)
      cons.push(`Confirmation probability is only ${pctLabel(ctx.confirmation.probability)}`);

    if (ctx.reliability.overall >= 75) pros.push("Historically reliable train with low delay risk");
    else if (ctx.reliability.overall < 55) cons.push("Below-average on-time reliability");

    if (ctx.demand.score < 40) pros.push(`Lower travel demand (${ctx.demand.level.replace("-", " ")})`);
    else if (ctx.demand.score > 70) cons.push(`Very high travel demand (${ctx.demand.level.replace("-", " ")})`);

    if (option.extraTravelMinutes === 0) pros.push("Direct boarding — no extra travel");
    else if (option.extraTravelMinutes > 30) cons.push(`${option.extraTravelMinutes} min extra travel to boarding station`);

    if (ctx.tatkal.successChance >= 70) pros.push("Solid Tatkal fallback available");
    else if (ctx.tatkal.difficulty === "extreme") cons.push("Tatkal fallback is extremely competitive");

    if (option.fareEstimate < 1200) pros.push("Competitively priced fare");
    if (option.numChanges > 0) cons.push(`${option.numChanges} coach/train change(s)`);

    if (pros.length === 0) pros.push("Balanced signals across every dimension");
    if (cons.length === 0) cons.push("No standout weaknesses — trade-offs within normal range");

    const rankPhrase = rank === 0
      ? "This option ranks first"
      : `This option ranks #${rank + 1}`;
    const summary =
      `${rankPhrase} with a mission score of ${missionScore}. It combines ` +
      `${pctLabel(ctx.confirmation.probability)} confirmation probability, ` +
      `${ctx.reliability.overall}/100 reliability and ` +
      `${ctx.demand.level.replace("-", " ")} demand on ${option.journeyDate}.`;

    return { summary, pros, cons };
  }
}
