// Recommendation Engine facade.
// - `rankOptions` runs Engine V2.1 (multi-factor decision score + full
//   intelligence bundle per option) and returns the ranked list.
// - `runEngineV2` exposes the full engine result (ranked options plus
//   alternate-date intelligence, festival + exam context) for callers that
//   need more than a bare ranking.
// - `pickMissionPlans` selects three complementary strategies (best overall,
//   fastest alternative, backup) from the ranked list.

import { apiFetch, USE_FASTAPI } from "../api-client";
import type { SearchResult } from "../types";
import type { DecisionWeights } from "./decision-score";
import { runRecommendationEngineV2, type EngineV2Options } from "./engine-v2";
import { enumerateTravelOptions } from "./option-generator";
import type { ScoredOption } from "./types";

export type MissionPickKind = "A" | "B" | "C";

export type EngineOptions = {
  weights?: Partial<DecisionWeights>;
};

export async function rankOptions(
  result: SearchResult,
  opts: EngineOptions = {},
): Promise<ScoredOption[]> {
  // Full remote path — FastAPI backend computes scores end-to-end (optional).
  if (USE_FASTAPI) {
    try {
      const remote = await apiFetch<ScoredOption[]>("/recommendations", {
        method: "POST",
        body: JSON.stringify({
          query: result.query,
          options: enumerateTravelOptions(result),
          weights: opts.weights,
        }),
      });
      if (Array.isArray(remote) && remote.length > 0) return remote;
    } catch (err) {
      console.warn("FastAPI /recommendations unavailable, ranking locally", err);
    }
  }

  const v2 = await runRecommendationEngineV2(result, opts as EngineV2Options);
  return v2.ranked;
}

export async function runEngineV2(
  result: SearchResult,
  opts: EngineV2Options = {},
) {
  return runRecommendationEngineV2(result, opts);
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

  return { A, B, C: backup };
}

function durationMin(d: string): number {
  const m = /([0-9]+)h\s*([0-9]+)?/i.exec(d);
  if (!m) return 600;
  return Number(m[1]) * 60 + Number(m[2] ?? 0);
}

export { enumerateTravelOptions };
export { WeightedLinearScorer } from "./scoring-model";
export { DEFAULT_WEIGHTS } from "./weights";
export { DEFAULT_DECISION_WEIGHTS } from "./decision-score";
export type { DecisionWeights, DecisionFactor, DecisionScore } from "./decision-score";
export type {
  IntelligenceBundle,
  ScoredOption,
  ScoreWeights,
  ScoringModel,
  TravelOption,
} from "./types";
