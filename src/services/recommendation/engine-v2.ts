// Recommendation Engine V2.1 — orchestrates every intelligence module:
// historical trend, festival + exam calendars, demand index, waitlist model,
// train popularity, boarding optimization, and the multi-factor AI Decision
// Score. Each option is annotated with an IntelligenceBundle and an
// Explainability record.
//
// Deterministic, strict TypeScript. FastAPI-ready: when USE_FASTAPI is on,
// the top-level `rankOptions` in ./index still delegates the whole ranking to
// the remote scorer. This module powers the in-app path.

import { apiFetch, USE_FASTAPI } from "../api-client";
import type { SearchResult } from "../types";
import { buildJourneyContext, type JourneyContext } from "./context";
import {
  computeDecisionScore,
  DEFAULT_DECISION_WEIGHTS,
  type DecisionWeights,
} from "./decision-score";
import { buildExplainability } from "./explainable";
import { extractFeatures } from "./feature-extractor";
import { optimizeBoarding } from "./intelligence/boarding";
import { computeDemandIndex } from "./intelligence/demand";
import { detectExams } from "./intelligence/exams";
import { detectFestivals } from "./intelligence/festivals";
import {
  deriveHistoricalStats,
  hydrateFromDatabase,
  type RouteHistoryProvider,
} from "./intelligence/historical";
import { rankAlternateDates, type DateIntelligence } from "./intelligence/dates";
import { computeTrainPopularity } from "./intelligence/train-popularity";
import { predictWaitlist } from "./intelligence/waitlist";
import { enumerateTravelOptions } from "./option-generator";
import type {
  ConfidenceLevel,
  IntelligenceBundle,
  RiskLevel,
  ScoredOption,
  TravelOption,
} from "./types";

export type EngineV2Options = {
  weights?: Partial<DecisionWeights>;
  historyProvider?: RouteHistoryProvider;
  now?: Date;
};

export type EngineV2Result = {
  ranked: ScoredOption[];
  context: JourneyContext;
  dateIntelligence: DateIntelligence;
  festival: ReturnType<typeof detectFestivals>;
  exams: ReturnType<typeof detectExams>;
};

function mergeDecisionWeights(overrides?: Partial<DecisionWeights>): DecisionWeights {
  if (!overrides) return { ...DEFAULT_DECISION_WEIGHTS };
  return { ...DEFAULT_DECISION_WEIGHTS, ...overrides };
}

function confidenceLevelFor(score: number): ConfidenceLevel {
  if (score >= 82) return "very-high";
  if (score >= 65) return "high";
  if (score >= 45) return "medium";
  return "low";
}

function riskLevelFor(waitingRiskScore: number): RiskLevel {
  if (waitingRiskScore < 25) return "low";
  if (waitingRiskScore < 45) return "moderate";
  if (waitingRiskScore < 65) return "elevated";
  return "high";
}

async function scoreOption(
  option: TravelOption,
  ctx: JourneyContext,
  pool: TravelOption[],
  weights: DecisionWeights,
  historyProvider?: RouteHistoryProvider,
): Promise<ScoredOption> {
  const history = historyProvider
    ? await hydrateFromDatabase(option, ctx, historyProvider)
    : deriveHistoricalStats(option, ctx);

  const festivals = detectFestivals(option.journeyDate);
  const exams = detectExams(option.journeyDate);
  const demand = computeDemandIndex(ctx, history, festivals, exams);

  // Availability label used for WL parsing: fall back to a synthetic band.
  const availabilityLabel =
    option.signals.seatAvailability > 60
      ? "AVAILABLE"
      : option.signals.seatAvailability > 30
        ? `RAC ${Math.round((100 - option.signals.seatAvailability) / 4)}`
        : `WL ${Math.round((100 - option.signals.seatAvailability) / 2)}`;

  const waitlist = predictWaitlist(
    option,
    ctx.bookingWindowDays,
    demand,
    availabilityLabel,
  );

  const popularity = computeTrainPopularity(option, history, demand);
  const boarding = optimizeBoarding(option, pool);
  const boardingUplift = boarding?.worthwhile
    ? Math.max(0, 100 - boarding.expectedImprovement * 6)
    : 100;

  const decision = computeDecisionScore(
    { option, history, demand, waitlist, popularity, boardingUplift },
    weights,
  );

  const explain = buildExplainability({
    option,
    decision,
    history,
    demand,
    festivals,
    exams,
    waitlist,
    popularity,
    boarding,
  });

  const features = extractFeatures(option);

  const intelligence: IntelligenceBundle = {
    decisionScore: decision.score,
    decisionBreakdown: decision.breakdown.map((b) => ({
      factor: b.factor,
      value: b.value,
      weight: b.weight,
      contribution: b.contribution,
    })),
    demandIndex: demand.score,
    demandBand: demand.band,
    festivalPeak: festivals.peakName,
    examPeak: exams.peakName,
    historicalConfirmTrend: history.historicalConfirmTrend,
    seasonalDemand: history.seasonalDemand,
    trainPopularity: popularity.score,
    waitlist: {
      movementSpeed: waitlist.movementSpeed,
      movementPerDay: waitlist.movementPerDay,
      racConversionChance: waitlist.racConversionChance,
      finalConfirmChance: waitlist.finalConfirmChance,
      waitingRiskScore: waitlist.waitingRiskScore,
      currentPosition: waitlist.currentPosition,
      daysToChart: waitlist.daysToChart,
    },
    boardingSuggestion: boarding
      ? {
          suggestedStation: boarding.suggestedStation,
          suggestedStationCode: boarding.suggestedStationCode,
          expectedImprovement: boarding.expectedImprovement,
          additionalTravelMinutes: boarding.additionalTravelMinutes,
          worthwhile: boarding.worthwhile,
        }
      : null,
    whySelected: explain.whySelected,
    whyRejected: explain.whyRejected,
  };

  const why =
    explain.whySelected[0] ??
    `Decision score ${decision.score}/100 across ${decision.breakdown.length} factors.`;

  return {
    option,
    missionScore: decision.score,
    confidence: explain.confidence.score,
    confidenceLevel: explain.confidence.level,
    expectedConfirmChance: waitlist.finalConfirmChance,
    riskLevel: riskLevelFor(waitlist.waitingRiskScore),
    why,
    pros: explain.advantages,
    cons: explain.disadvantages,
    features,
    contributions: decision.breakdown.map((b) => ({
      // Map decision factors onto the legacy contribution shape so any
      // consumer still walking `contributions` keeps working. Only feature-
      // vector keys are typed there, so we alias the closest analogue.
      feature:
        b.factor === "confirmation"
          ? "confirmProbability"
          : b.factor === "waitingMovement"
            ? "waitlistSafety"
            : b.factor === "fare"
              ? "fareValue"
              : b.factor === "travelTime"
                ? "travelTime"
                : b.factor === "boarding"
                  ? "boardingConvenience"
                  : b.factor === "tatkal"
                    ? "tatkalSuccess"
                    : b.factor === "routePopularity"
                      ? "confirmProbability"
                      : b.factor === "demand" || b.factor === "season"
                        ? "seatAvailability"
                        : b.factor === "reliability"
                          ? "confirmProbability"
                          : "changesEase",
      value: b.value,
      weight: b.weight,
      contribution: b.contribution,
    })),
    intelligence,
  };
}

export async function runRecommendationEngineV2(
  result: SearchResult,
  opts: EngineV2Options = {},
): Promise<EngineV2Result> {
  // FastAPI can override the full ranking pipeline (falls back to local scoring).
  if (USE_FASTAPI) {
    try {
      const remote = await apiFetch<EngineV2Result>("/recommendations/v2", {
        method: "POST",
        body: JSON.stringify({
          query: result.query,
          options: enumerateTravelOptions(result),
          weights: mergeDecisionWeights(opts.weights),
        }),
      });
      if (remote?.ranked?.length) return remote;
    } catch (err) {
      console.warn("FastAPI /recommendations/v2 unavailable, scoring locally", err);
    }
  }


  const ctx = buildJourneyContext(result.query, opts.now);
  const pool = enumerateTravelOptions(result);
  const weights = mergeDecisionWeights(opts.weights);

  const scored = await Promise.all(
    pool.map((o) => scoreOption(o, ctx, pool, weights, opts.historyProvider)),
  );
  scored.sort((a, b) => b.missionScore - a.missionScore);

  return {
    ranked: scored,
    context: ctx,
    dateIntelligence: rankAlternateDates(ctx, pool),
    festival: detectFestivals(result.query.date),
    exams: detectExams(result.query.date),
  };
}
