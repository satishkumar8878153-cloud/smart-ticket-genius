// Recommendation Engine V2 orchestrator. Every engine is injected — swap any
// module for a FastAPI-backed implementation without changing this file.

import type { SearchResult, TicketClass } from "../types";
import type { ScoredOption as LegacyScoredOption } from "../types";
import { enumerateTravelOptions } from "../option-generator";

import { DefaultConfidenceEngine } from "./confidence-engine";
import { DefaultConfirmationEngine } from "./confirmation-engine";
import { DefaultDemandEngine } from "./demand-engine";
import { DefaultExplainEngine } from "./explain-engine";
import { DefaultMissionEngine } from "./mission-engine";
import { DefaultRankingEngine } from "./ranking-engine";
import { DefaultReliabilityEngine } from "./reliability-engine";
import { DefaultRiskEngine } from "./risk-engine";
import { DefaultSeasonEngine } from "./season-engine";
import { DefaultTatkalEngine } from "./tatkal-engine";

import type {
  DiversifiedPicks,
  IConfidenceEngine,
  IConfirmationEngine,
  IDemandEngine,
  IExplainEngine,
  IMissionEngine,
  IRankingEngine,
  IReliabilityEngine,
  IRiskEngine,
  ISeasonEngine,
  ITatkalEngine,
  ScoredOptionV2,
} from "./types";

export type EngineDeps = {
  demand?: IDemandEngine;
  season?: ISeasonEngine;
  reliability?: IReliabilityEngine;
  confirmation?: IConfirmationEngine;
  tatkal?: ITatkalEngine;
  mission?: IMissionEngine;
  ranking?: IRankingEngine;
  risk?: IRiskEngine;
  confidence?: IConfidenceEngine;
  explain?: IExplainEngine;
};

export type RecommendationV2Result = {
  ranked: ScoredOptionV2[];
  picks: DiversifiedPicks | null;
};

export class RecommendationEngineV2 {
  private readonly d: Required<EngineDeps>;

  constructor(deps: EngineDeps = {}) {
    this.d = {
      demand: deps.demand ?? new DefaultDemandEngine(),
      season: deps.season ?? new DefaultSeasonEngine(),
      reliability: deps.reliability ?? new DefaultReliabilityEngine(),
      confirmation: deps.confirmation ?? new DefaultConfirmationEngine(),
      tatkal: deps.tatkal ?? new DefaultTatkalEngine(),
      mission: deps.mission ?? new DefaultMissionEngine(),
      ranking: deps.ranking ?? new DefaultRankingEngine(),
      risk: deps.risk ?? new DefaultRiskEngine(),
      confidence: deps.confidence ?? new DefaultConfidenceEngine(),
      explain: deps.explain ?? new DefaultExplainEngine(),
    };
  }

  run(result: SearchResult): RecommendationV2Result {
    const options = enumerateTravelOptions(result);
    // Season & demand are constant per journey-date — memoize by date string.
    const seasonByDate = new Map<string, ReturnType<ISeasonEngine["infer"]>>();
    const demandByDate = new Map<string, ReturnType<IDemandEngine["estimate"]>>();

    const scored: ScoredOptionV2[] = new Array(options.length);
    for (let i = 0; i < options.length; i++) {
      const option = options[i];
      let season = seasonByDate.get(option.journeyDate);
      if (!season) {
        season = this.d.season.infer(option.journeyDate);
        seasonByDate.set(option.journeyDate, season);
      }
      let demand = demandByDate.get(option.journeyDate);
      if (!demand) {
        demand = this.d.demand.estimate({
          journeyDate: option.journeyDate,
          route: { source: result.query.source, destination: result.query.destination },
        });
        demandByDate.set(option.journeyDate, demand);
      }

      const reliability = this.d.reliability.score(option, season);
      const confirmation = this.d.confirmation.compute(option, demand, season, reliability);
      const tatkal = this.d.tatkal.predict(option, demand, reliability);
      const ctx = { demand, season, reliability, confirmation, tatkal };
      const missionScore = this.d.mission.score(option, ctx);
      const risk = this.d.risk.assess(option, ctx);
      const confidence = this.d.confidence.assess(option, ctx);
      // Explanation needs rank — placeholder, we fill after sort.
      scored[i] = {
        option,
        missionScore,
        ctx,
        risk,
        confidence,
        explanation: { summary: "", pros: [], cons: [] },
      };
    }

    const ranked = this.d.ranking.rank(scored);
    for (let i = 0; i < ranked.length; i++) {
      const r = ranked[i];
      r.explanation = this.d.explain.explain(r.option, r.ctx, r.missionScore, i);
    }
    const picks = this.d.ranking.diversify(ranked);
    return { ranked, picks };
  }
}

// ---- Legacy adapter ------------------------------------------------------
// Maps a V2 ScoredOption to the legacy ScoredOption shape so the existing
// mission service (and UI) keeps working without any change.
export function toLegacyScored(v2: ScoredOptionV2): LegacyScoredOption {
  const confidenceLevel: LegacyScoredOption["confidenceLevel"] =
    v2.confidence.label === "very-high" ? "very-high"
    : v2.confidence.label === "high" ? "high"
    : v2.confidence.label === "medium" ? "medium"
    : "low";

  const riskLevel: LegacyScoredOption["riskLevel"] =
    v2.risk.level === "low" ? "low"
    : v2.risk.level === "moderate" ? "moderate"
    : v2.risk.level === "elevated" ? "elevated"
    : "high"; // legacy has no "critical" — collapse to "high"

  // Build a legacy feature vector deterministically from V2 signals.
  const features = {
    seatAvailability: v2.option.signals.seatAvailability,
    confirmProbability: v2.ctx.confirmation.probability,
    tatkalSuccess: v2.ctx.tatkal.successChance,
    waitlistSafety: 100 - v2.option.signals.waitingListRisk,
    fareValue: 0, travelTime: 0, extraDistance: 0,
    boardingConvenience: 0, changesEase: 0,
  };

  return {
    option: v2.option,
    missionScore: v2.missionScore,
    confidence: v2.confidence.score,
    confidenceLevel,
    expectedConfirmChance: v2.ctx.confirmation.probability,
    riskLevel,
    why: v2.explanation.summary,
    pros: v2.explanation.pros,
    cons: v2.explanation.cons,
    features,
    contributions: [],
  };
}

// Re-exports for consumers that want direct V2 output.
export type { ScoredOptionV2, DiversifiedPicks } from "./types";
export type { TicketClass };
