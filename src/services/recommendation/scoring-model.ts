// Default in-app scoring model: normalized weighted linear combination of the
// feature vector. Implements the ScoringModel interface, so a FastAPI-backed
// scorer can drop in without changing the engine or the callers.

import { extractFeatures } from "./feature-extractor";
import type {
  ConfidenceLevel,
  FeatureContribution,
  FeatureVector,
  RiskLevel,
  ScoredOption,
  ScoreWeights,
  ScoringModel,
  TravelOption,
} from "./types";

function normalizeWeights(weights: ScoreWeights): ScoreWeights {
  const total = Object.values(weights).reduce((acc, w) => acc + Math.max(0, w), 0);
  if (total <= 0) return weights;
  const out = {} as ScoreWeights;
  (Object.keys(weights) as (keyof ScoreWeights)[]).forEach((k) => {
    out[k] = Math.max(0, weights[k]) / total;
  });
  return out;
}

function computeMissionScore(features: FeatureVector, weights: ScoreWeights) {
  const w = normalizeWeights(weights);
  const contributions: FeatureContribution[] = (
    Object.keys(features) as (keyof FeatureVector)[]
  ).map((key) => {
    const value = features[key];
    const weight = w[key];
    return { feature: key, value, weight, contribution: value * weight };
  });
  const raw = contributions.reduce((acc, c) => acc + c.contribution, 0);
  return {
    missionScore: Math.max(0, Math.min(100, Math.round(raw))),
    contributions: contributions.sort((a, b) => b.contribution - a.contribution),
  };
}

// Confidence reflects how "sure" the engine is about this score — a function
// of the top signals (confirm probability, availability, waitlist safety) and
// how spread out the feature vector is (a balanced option is more trustworthy).
function computeConfidence(features: FeatureVector): number {
  const anchor =
    features.confirmProbability * 0.5 +
    features.seatAvailability * 0.25 +
    features.waitlistSafety * 0.25;
  // Penalize very lopsided vectors — variance too high means uncertain fit.
  const values = Object.values(features);
  const mean = values.reduce((a, v) => a + v, 0) / values.length;
  const variance =
    values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  const spreadPenalty = Math.min(20, Math.sqrt(variance) / 3);
  return Math.max(1, Math.min(100, Math.round(anchor - spreadPenalty)));
}

function confidenceLabel(confidence: number): ConfidenceLevel {
  if (confidence >= 82) return "very-high";
  if (confidence >= 65) return "high";
  if (confidence >= 45) return "medium";
  return "low";
}

function riskLabel(features: FeatureVector): RiskLevel {
  // Risk climbs as confirm probability drops and waitlist risk rises.
  const risk =
    (100 - features.confirmProbability) * 0.55 +
    (100 - features.waitlistSafety) * 0.35 +
    (100 - features.seatAvailability) * 0.10;
  if (risk < 25) return "low";
  if (risk < 45) return "moderate";
  if (risk < 65) return "elevated";
  return "high";
}

// Expected confirmation chance blends the raw confirm probability with the
// waitlist-safety signal — a high probability with low waitlist safety is
// discounted, mirroring how brokers report a "realistic" confirmation odds.
function expectedConfirmChance(features: FeatureVector): number {
  const blended =
    features.confirmProbability * 0.7 + features.waitlistSafety * 0.3;
  return Math.max(1, Math.min(99, Math.round(blended)));
}

export class WeightedLinearScorer implements ScoringModel {
  readonly id = "weighted-linear-v1";

  async score(
    options: TravelOption[],
    weights: ScoreWeights,
  ): Promise<ScoredOption[]> {
    return options.map((option) => {
      const features = extractFeatures(option);
      const { missionScore, contributions } = computeMissionScore(features, weights);
      const confidence = computeConfidence(features);
      return {
        option,
        features,
        contributions,
        missionScore,
        confidence,
        confidenceLevel: confidenceLabel(confidence),
        expectedConfirmChance: expectedConfirmChance(features),
        riskLevel: riskLabel(features),
        why: "", // populated by the explainer
        pros: [],
        cons: [],
      };
    });
  }
}
