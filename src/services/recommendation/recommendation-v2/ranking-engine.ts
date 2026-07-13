// Ranking Engine — sorts by mission score and derives diversified picks.

import type {
  DiversifiedPicks,
  IRankingEngine,
  ScoredOptionV2,
} from "./types";
import { parseDurationMin } from "./utils";

export class DefaultRankingEngine implements IRankingEngine {
  rank(scored: ScoredOptionV2[]): ScoredOptionV2[] {
    return [...scored].sort((a, b) => b.missionScore - a.missionScore);
  }

  diversify(ranked: ScoredOptionV2[]): DiversifiedPicks | null {
    if (ranked.length === 0) return null;
    const bestOverall = ranked[0];

    const highestConfirmation = [...ranked].sort(
      (a, b) => b.ctx.confirmation.probability - a.ctx.confirmation.probability,
    )[0];

    const fastest = [...ranked].sort((a, b) => {
      const at = parseDurationMin(a.option.duration) + a.option.extraTravelMinutes;
      const bt = parseDurationMin(b.option.duration) + b.option.extraTravelMinutes;
      return at - bt;
    })[0];

    const cheapest = [...ranked].sort(
      (a, b) => a.option.fareEstimate - b.option.fareEstimate,
    )[0];

    const bestTatkal = [...ranked].sort(
      (a, b) => b.ctx.tatkal.successChance - a.ctx.tatkal.successChance,
    )[0];

    const safest = [...ranked].sort((a, b) => a.risk.score - b.risk.score)[0];

    // Hidden gem — mid-pack mission score but low risk and good reliability.
    const midStart = Math.floor(ranked.length * 0.3);
    const midEnd = Math.floor(ranked.length * 0.75);
    const midSlice = ranked.slice(midStart, midEnd);
    const hiddenGem = [...midSlice]
      .filter((r) => r.risk.score < 45 && r.ctx.reliability.overall >= 70)
      .sort((a, b) => b.missionScore - a.missionScore)[0] ?? null;

    return {
      bestOverall,
      highestConfirmation,
      fastest,
      cheapest,
      bestTatkal,
      safest,
      hiddenGem,
    };
  }
}
