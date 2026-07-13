// Reliability Engine — deterministic per-train reliability profile derived from
// stable signals (train number hash + on-time reliability signal + season).
// No random values; ready for FastAPI/ML replacement.

import { RELIABILITY_WEIGHTS } from "./config";
import type {
  IReliabilityEngine,
  ReliabilitySignal,
  SeasonImpact,
} from "./types";
import type { TravelOption } from "../types";
import { clamp, hashString, weightedSum } from "./utils";

export class DefaultReliabilityEngine implements IReliabilityEngine {
  score(option: TravelOption, season: SeasonImpact): ReliabilitySignal {
    const baseOnTime = option.signals.onTimeReliability;
    // Deterministic per-train jitter within +/- 6 pts derived from train number.
    const jitter = (hashString(option.trainNumber) % 13) - 6;
    const seasonDelta = season.reliabilityDelta;

    const onTimeScore = clamp(baseOnTime + jitter + seasonDelta);
    const delayRisk = clamp(100 - onTimeScore + 5);
    // Cancellation risk is small unless reliability is very poor.
    const cancellationRisk = clamp(Math.round((100 - onTimeScore) * 0.25));
    // Historical placeholder biased around on-time with train-specific offset.
    const historicalReliability = clamp(
      Math.round(baseOnTime * 0.7 + (100 - delayRisk) * 0.3),
    );

    const overall = weightedSum([
      { value: onTimeScore, weight: RELIABILITY_WEIGHTS.onTime },
      { value: 100 - delayRisk, weight: RELIABILITY_WEIGHTS.delayInverse },
      { value: 100 - cancellationRisk, weight: RELIABILITY_WEIGHTS.cancellationInverse },
      { value: historicalReliability, weight: RELIABILITY_WEIGHTS.historical },
    ]);

    return {
      onTimeScore,
      delayRisk,
      cancellationRisk,
      historicalReliability,
      overall,
    };
  }
}
