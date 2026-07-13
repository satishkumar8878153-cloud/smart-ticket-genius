// Confirmation Engine — richer than a raw probability. Combines seat availability,
// demand, season, reliability, waitlist risk, class and journey length.

import { CONFIRMATION_WEIGHTS } from "./config";
import type {
  ConfirmationSignal,
  DemandSignal,
  IConfirmationEngine,
  ReliabilitySignal,
  SeasonImpact,
} from "./types";
import type { TravelOption } from "../types";
import { clamp, parseDurationMin, weightedSum } from "./utils";

const CLASS_ELASTICITY: Record<string, number> = {
  SL: -6, "3A": -4, "2A": 0, "1A": 6, CC: 2, EC: 4,
};

export class DefaultConfirmationEngine implements IConfirmationEngine {
  compute(
    option: TravelOption,
    demand: DemandSignal,
    season: SeasonImpact,
    reliability: ReliabilitySignal,
  ): ConfirmationSignal {
    const s = option.signals;
    const waitlistSafety = clamp(100 - s.waitingListRisk);

    // Long-distance journeys have slightly higher confirm probability at booking.
    const journeyMin = parseDurationMin(option.duration);
    const distanceBoost = clamp((journeyMin - 240) / 24, -5, 12);

    // Demand & season lower the effective probability.
    const demandPenalty = clamp(
      100 - Math.round(demand.score * season.demandMultiplier),
    );
    const seasonPenalty = clamp(120 - Math.round(season.demandMultiplier * 100));

    const classAdj = CLASS_ELASTICITY[option.travelClass] ?? 0;

    const probability = weightedSum([
      { value: s.seatAvailability, weight: CONFIRMATION_WEIGHTS.seatAvailability },
      { value: clamp(s.confirmProbability + classAdj + distanceBoost),
        weight: CONFIRMATION_WEIGHTS.baseProbability },
      { value: reliability.overall, weight: CONFIRMATION_WEIGHTS.reliability },
      { value: demandPenalty, weight: CONFIRMATION_WEIGHTS.demandPenalty },
      { value: seasonPenalty, weight: CONFIRMATION_WEIGHTS.seasonPenalty },
      { value: waitlistSafety, weight: CONFIRMATION_WEIGHTS.waitlistSafety },
    ]);

    // Expected waitlist movement — positive = seats likely to clear.
    const expectedWaitlistMovement = Math.round(
      (waitlistSafety - 50) / 6 + (100 - demand.score) / 12,
    );

    // Confidence blends probability with reliability & waitlist safety.
    const confidence = weightedSum([
      { value: probability, weight: 0.6 },
      { value: reliability.overall, weight: 0.2 },
      { value: waitlistSafety, weight: 0.2 },
    ]);

    return { probability, expectedWaitlistMovement, confidence };
  }
}
