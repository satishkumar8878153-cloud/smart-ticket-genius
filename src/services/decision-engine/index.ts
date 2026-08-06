// Shared AI Decision Engine.
//
// The single ranking brain of the product. Search, Mission AI Chat and Confirm
// AI all call `runDecisionEngine` so there is exactly one implementation of
// "what is the best travel option and why".
//
// It reuses Recommendation Engine V2 (confirmation probability, travel
// duration, fare, delay/reliability history, nearby boarding stations) and
// layers user preferences on top through DecisionWeights.

import { getProviders } from "../providers";
import { buildRecommendationAdvice, type RecommendationAdvice } from "../recommendation/advisor";
import { parseDurationToMinutes } from "../recommendation/feature-extractor";
import type { ScoredOption } from "../recommendation/types";
import type { SearchQuery, SearchResult } from "../types";
import {
  DEFAULT_PREFERENCES,
  weightsFromPreferences,
  type UserPreferences,
} from "./preferences";
import type { DecisionWeights } from "../recommendation/decision-score";

export type DecisionEngineInput = {
  /** Pre-fetched availability snapshot. Omit to let the provider fetch it. */
  result?: SearchResult;
  query?: SearchQuery;
  preferences?: UserPreferences;
  weightOverrides?: Partial<DecisionWeights>;
  now?: Date;
};

export type DecisionEngineResult = {
  query: SearchQuery;
  result: SearchResult;
  advice: RecommendationAdvice;
  ranked: ScoredOption[];
  preferences: UserPreferences;
  weights: DecisionWeights;
  /** Options filtered out by hard preference constraints, with the reason. */
  excluded: Array<{ optionId: string; reason: string }>;
};

function violatesPreferences(
  s: ScoredOption,
  prefs: UserPreferences,
): string | null {
  if (
    typeof prefs.maxExtraTravelMinutes === "number" &&
    s.option.extraTravelMinutes > prefs.maxExtraTravelMinutes
  ) {
    return `Needs ${s.option.extraTravelMinutes} min extra travel, above your ${prefs.maxExtraTravelMinutes} min limit.`;
  }
  if (typeof prefs.maxFare === "number" && s.option.fareEstimate > prefs.maxFare) {
    return `Fare ₹${s.option.fareEstimate} exceeds your ₹${prefs.maxFare} budget.`;
  }
  if (prefs.avoidLateNight) {
    const hour = Number(s.option.departure.split(":")[0] ?? 12);
    if (hour >= 23 || hour < 5) {
      return `Departs at ${s.option.departure} — you asked to avoid late-night starts.`;
    }
  }
  if (prefs.preferredClasses && prefs.preferredClasses.length > 0) {
    if (!prefs.preferredClasses.includes(s.option.travelClass)) {
      return `Class ${s.option.travelClass} is outside your preferred classes.`;
    }
  }
  if (prefs.flexibleDates === false && s.option.journeyDate !== s.option.journeyDate) {
    return "Date shift not allowed.";
  }
  return null;
}

/** Preference-aware re-ordering applied on top of the engine's decision score. */
function applyPreferenceOrdering(
  ranked: ScoredOption[],
  prefs: UserPreferences,
): ScoredOption[] {
  const priority = prefs.priority ?? "balanced";
  if (priority === "balanced") return ranked;
  return [...ranked].sort((a, b) => {
    const tie = b.missionScore - a.missionScore;
    switch (priority) {
      case "speed": {
        const at = parseDurationToMinutes(a.option.duration) + a.option.extraTravelMinutes;
        const bt = parseDurationToMinutes(b.option.duration) + b.option.extraTravelMinutes;
        return at - bt || tie;
      }
      case "price":
        return a.option.fareEstimate - b.option.fareEstimate || tie;
      case "confirmation":
        return b.expectedConfirmChance - a.expectedConfirmChance || tie;
      default:
        return tie;
    }
  });
}

export async function runDecisionEngine(
  input: DecisionEngineInput = {},
): Promise<DecisionEngineResult> {
  const preferences = { ...DEFAULT_PREFERENCES, ...(input.preferences ?? {}) };
  const weights = weightsFromPreferences(preferences, input.weightOverrides);

  const result =
    input.result ??
    (await getProviders().availability.getAvailability(
      input.query ??
        (() => {
          throw new Error("runDecisionEngine needs either `result` or `query`.");
        })(),
    ));

  const advice = await buildRecommendationAdvice(result, {
    weights,
    now: input.now,
  });

  const excluded: DecisionEngineResult["excluded"] = [];
  const allowed: ScoredOption[] = [];
  for (const s of advice.ranked) {
    const reason = violatesPreferences(s, preferences);
    if (reason) excluded.push({ optionId: s.option.id, reason });
    else allowed.push(s);
  }
  // Never return an empty ranking because of strict preferences.
  const pool = allowed.length > 0 ? allowed : advice.ranked;
  const ranked = applyPreferenceOrdering(pool, preferences);

  return {
    query: result.query,
    result,
    advice,
    ranked,
    preferences,
    weights,
    excluded,
  };
}

export * from "./preferences";
export type { RecommendationAdvice };
