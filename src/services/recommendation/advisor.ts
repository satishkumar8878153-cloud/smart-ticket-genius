// Recommendation Advisor — the single entry point shared by Search and
// Mission AI Chat. It runs Recommendation Engine V2 once and turns the ranked
// options into the four production capabilities the product exposes:
//
//   1. Smart Train Ranking (with an explicit Best Choice)
//   2. Nearby Station Intelligence
//   3. Alternate Date Intelligence
//   4. Alternate Class Intelligence
//
// Every item carries human-readable reasons (higher confirmation, faster
// journey, lower fare, better timing) so no consumer has to re-derive them.

import type { SearchQuery, SearchResult, TicketClass } from "../types";
import { runRecommendationEngineV2, type EngineV2Options } from "./engine-v2";
import { suggestAlternateClass, type ClassSuggestion } from "./intelligence/classes";
import { parseDurationToMinutes } from "./feature-extractor";
import type { ScoredOption } from "./types";

export type RankedTrain = {
  rank: number;
  isBestChoice: boolean;
  trainNumber: string;
  trainName: string;
  departure: string;
  arrival: string;
  duration: string;
  travelClass: TicketClass;
  boardingStation: string;
  journeyDate: string;
  fareEstimate: number;
  confirmProbability: number;
  expectedConfirmChance: number;
  missionScore: number;
  confidence: number;
  riskLevel: ScoredOption["riskLevel"];
  reasons: string[];
  optionId: string;
};

export type NearbyStationAdvice = {
  currentStation: string;
  suggestedStation: string;
  suggestedStationCode: string;
  expectedImprovement: number;
  additionalTravelMinutes: number;
  worthwhile: boolean;
  reason: string;
};

export type AlternateDateAdvice = {
  date: string;
  fare: number;
  confirmProbability: number;
  improvementVsSelected: number;
  reason: string;
};

export type RecommendationAdvice = {
  query: SearchQuery;
  bestChoice: RankedTrain | null;
  rankedTrains: RankedTrain[];
  nearbyStation: NearbyStationAdvice | null;
  alternateDate: AlternateDateAdvice | null;
  alternateClass: ClassSuggestion | null;
  insights: string[];
  ranked: ScoredOption[];
};

function timingQuality(departure: string): { score: number; label: string } {
  const h = Number(departure.split(":")[0] ?? 12);
  if (h >= 15 && h <= 22) return { score: 100, label: "convenient evening departure" };
  if (h >= 6 && h < 15) return { score: 75, label: "daytime departure" };
  return { score: 45, label: "late-night departure" };
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function buildReasons(
  s: ScoredOption,
  peers: ScoredOption[],
  isBest: boolean,
): string[] {
  const reasons: string[] = [];
  const confirmMedian = median(peers.map((p) => p.option.signals.confirmProbability));
  const fareMedian = median(peers.map((p) => p.option.fareEstimate));
  const durationMedian = median(peers.map((p) => parseDurationToMinutes(p.option.duration)));
  const mins = parseDurationToMinutes(s.option.duration);

  if (s.option.signals.confirmProbability >= confirmMedian + 4) {
    reasons.push(
      `Higher confirmation — ${s.option.signals.confirmProbability}% vs ${Math.round(confirmMedian)}% typical on this route.`,
    );
  }
  if (mins <= durationMedian - 30) {
    reasons.push(
      `Faster journey — ${s.option.duration}, about ${Math.round((durationMedian - mins) / 60)}h quicker than the average train here.`,
    );
  }
  if (s.option.fareEstimate <= fareMedian - 100) {
    reasons.push(
      `Lower fare — ₹${s.option.fareEstimate}, roughly ₹${Math.round(fareMedian - s.option.fareEstimate)} below the route average.`,
    );
  }
  const timing = timingQuality(s.option.departure);
  if (timing.score >= 75) {
    reasons.push(`Better timing — ${timing.label} at ${s.option.departure}.`);
  }
  if (s.riskLevel === "low") {
    reasons.push(`Low waitlist risk with ${s.expectedConfirmChance}% expected final confirmation.`);
  }
  if (reasons.length === 0) {
    reasons.push(s.why);
  }
  if (isBest) {
    reasons.unshift(
      `Best choice — highest AI mission score (${s.missionScore}/100) across confirmation, duration, fare and convenience.`,
    );
  }
  return reasons;
}

function toRankedTrain(
  s: ScoredOption,
  index: number,
  peers: ScoredOption[],
): RankedTrain {
  return {
    rank: index + 1,
    isBestChoice: index === 0,
    trainNumber: s.option.trainNumber,
    trainName: s.option.trainName,
    departure: s.option.departure,
    arrival: s.option.arrival,
    duration: s.option.duration,
    travelClass: s.option.travelClass,
    boardingStation: s.option.boardingStation,
    journeyDate: s.option.journeyDate,
    fareEstimate: s.option.fareEstimate,
    confirmProbability: s.option.signals.confirmProbability,
    expectedConfirmChance: s.expectedConfirmChance,
    missionScore: s.missionScore,
    confidence: s.confidence,
    riskLevel: s.riskLevel,
    reasons: buildReasons(s, peers, index === 0),
    optionId: s.option.id,
  };
}

export async function buildRecommendationAdvice(
  result: SearchResult,
  opts: EngineV2Options = {},
): Promise<RecommendationAdvice> {
  const engine = await runRecommendationEngineV2(result, opts);
  const { ranked } = engine;
  const query = result.query;

  // Smart Train Ranking: only the journey the traveller actually asked for
  // (requested date, requested class, boarding at the source station), one
  // entry per train, already ordered by the engine's decision score.
  const onRequestedJourney = ranked.filter(
    (s) =>
      s.option.journeyDate === query.date &&
      s.option.travelClass === query.travelClass &&
      s.option.extraTravelMinutes === 0,
  );
  const pickPool = onRequestedJourney.length > 0 ? onRequestedJourney : ranked;

  const byTrain = new Map<string, ScoredOption>();
  for (const s of pickPool) {
    const prev = byTrain.get(s.option.trainNumber);
    if (!prev || s.missionScore > prev.missionScore) byTrain.set(s.option.trainNumber, s);
  }
  const peers = Array.from(byTrain.values()).sort(
    (a, b) => b.missionScore - a.missionScore,
  );
  const rankedTrains = peers.map((s, i) => toRankedTrain(s, i, peers));
  const bestScored = peers[0] ?? null;
  const bestChoice = rankedTrains[0] ?? null;

  // 2. Nearby Station Intelligence — reuse the engine's boarding optimizer.
  const boarding = bestScored?.intelligence.boardingSuggestion ?? null;
  const nearbyStation: NearbyStationAdvice | null =
    boarding && bestScored
      ? {
          currentStation: bestScored.option.boardingStation,
          suggestedStation: boarding.suggestedStation,
          suggestedStationCode: boarding.suggestedStationCode,
          expectedImprovement: boarding.expectedImprovement,
          additionalTravelMinutes: boarding.additionalTravelMinutes,
          worthwhile: boarding.worthwhile,
          reason: boarding.worthwhile
            ? `Board at ${boarding.suggestedStation} instead of ${bestScored.option.boardingStation}: a separate quota lifts confirmation by about ${boarding.expectedImprovement}pp for ${boarding.additionalTravelMinutes} min extra travel.`
            : `${boarding.suggestedStation} offers a small ${boarding.expectedImprovement}pp confirmation gain, but costs ${boarding.additionalTravelMinutes} min extra travel — only worth it if you are flexible.`,
        }
      : null;

  // 3. Alternate Date Intelligence.
  const selectedConfirm = bestScored?.option.signals.confirmProbability ?? 0;
  const bestDate = engine.dateIntelligence.best;
  const alternateDate: AlternateDateAdvice | null =
    bestDate && bestDate.date !== query.date && bestDate.confirmProbability > selectedConfirm + 4
      ? {
          date: bestDate.date,
          fare: bestDate.fare,
          confirmProbability: bestDate.confirmProbability,
          improvementVsSelected: Math.round(bestDate.confirmProbability - selectedConfirm),
          reason: `Travelling on ${bestDate.date} raises confirmation to ${bestDate.confirmProbability}% (about ${Math.round(bestDate.confirmProbability - selectedConfirm)}pp better than ${query.date}) — ${bestDate.reason}`,
        }
      : null;

  // 4. Alternate Class Intelligence.
  const alternateClass = bestScored ? suggestAlternateClass(bestScored, ranked) : null;

  const insights: string[] = [];
  if (bestChoice) insights.push(bestChoice.reasons[0]);
  if (bestChoice?.reasons[1]) insights.push(bestChoice.reasons[1]);
  if (nearbyStation) insights.push(nearbyStation.reason);
  if (alternateDate) insights.push(alternateDate.reason);
  if (alternateClass) insights.push(alternateClass.reason);

  return {
    query,
    bestChoice,
    rankedTrains,
    nearbyStation,
    alternateDate,
    alternateClass,
    insights,
    ranked,
  };
}
