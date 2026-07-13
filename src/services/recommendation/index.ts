// Recommendation Engine facade.
// - `rankOptions` enumerates all travel options for a SearchResult and returns
//   them sorted by mission score (FastAPI can replace the scorer entirely).
// - `pickMissionPlans` selects three complementary strategies (best overall,
//   fastest alternative, backup) from the ranked list.

import { apiFetch, USE_FASTAPI } from "../api-client";
import type { SearchResult } from "../types";
import { explain } from "./explainer";
import { enumerateTravelOptions } from "./option-generator";
import { RecommendationEngineV2, toLegacyScored } from "./recommendation-v2/recommendation-v2";
import { WeightedLinearScorer } from "./scoring-model";
import type {
  ScoredOption,
  ScoreWeights,
  ScoringModel,
  TravelOption,
} from "./types";
import { DEFAULT_WEIGHTS, mergeWeights } from "./weights";

export type MissionPickKind = "A" | "B" | "C";

export type EngineOptions = {
  model?: ScoringModel;
  weights?: Partial<ScoreWeights>;
};

export async function rankOptions(
  result: SearchResult,
  opts: EngineOptions = {},
): Promise<ScoredOption[]> {
  // Full remote path — FastAPI backend computes scores end-to-end.
  if (USE_FASTAPI) {
    return apiFetch<ScoredOption[]>("/recommendations", {
      method: "POST",
      body: JSON.stringify({
        query: result.query,
        options: enumerateTravelOptions(result),
        weights: mergeWeights(opts.weights),
      }),
    });
  }

  // Default local path — Recommendation Engine V2 multi-stage pipeline.
  // Legacy `WeightedLinearScorer` remains available via opts.model for A/B.
  if (opts.model) {
    const weights = mergeWeights(opts.weights);
    const options = enumerateTravelOptions(result);
    const scored = await opts.model.score(options, weights);
    return scored.map(explain).sort((a, b) => b.missionScore - a.missionScore);
  }

  const v2 = new RecommendationEngineV2();
  const { ranked } = v2.run(result);
  return ranked.map(toLegacyScored);
}

// Selects three complementary plans from ranked options.
// A = highest mission score.
// B = fastest journey among the top slice, ideally a different boarding point.
// C = backup with a different train OR class from A, still solid confidence.
export function pickMissionPlans(
  ranked: ScoredOption[],
): Record<MissionPickKind, ScoredOption> | null {
  if (ranked.length === 0) return null;
  const A = ranked[0];

  const topSlice = ranked.slice(0, Math.min(ranked.length, 20));

  const fastest = [...topSlice]
    .filter((r) => r.option.id !== A.option.id)
    .sort((a, b) => {
      const at = durationMin(a.option.duration) + a.option.extraTravelMinutes;
      const bt = durationMin(b.option.duration) + b.option.extraTravelMinutes;
      return at - bt;
    })[0];
  const B = fastest ?? ranked[1] ?? A;

  const backup =
    topSlice.find(
      (r) =>
        r.option.id !== A.option.id &&
        r.option.id !== B.option.id &&
        (r.option.trainNumber !== A.option.trainNumber ||
          r.option.travelClass !== A.option.travelClass),
    ) ?? ranked[2] ?? B;

  return { A, B: B, C: backup };
}

function durationMin(d: string): number {
  const m = /([0-9]+)h\s*([0-9]+)?/i.exec(d);
  if (!m) return 600;
  return Number(m[1]) * 60 + Number(m[2] ?? 0);
}

export { DEFAULT_WEIGHTS, WeightedLinearScorer, enumerateTravelOptions };
export type { ScoredOption, ScoreWeights, ScoringModel, TravelOption };
