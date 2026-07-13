// Mission Engine V2 — mission score derived from every V2 signal, not just
// confirmation. All values normalized 0..100 before weighting.

import { CLASS_COMFORT, ENVELOPES, MISSION_WEIGHTS } from "./config";
import type { IMissionEngine, OptionContext } from "./types";
import type { TravelOption } from "../types";
import { clamp, invertLinear, parseDurationMin, weightedSum } from "./utils";

export class DefaultMissionEngine implements IMissionEngine {
  score(option: TravelOption, ctx: OptionContext): number {
    const journeyMin = parseDurationMin(option.duration);

    const fareValue = invertLinear(option.fareEstimate, ENVELOPES.fare.best, ENVELOPES.fare.worst);
    const travelTime = invertLinear(journeyMin, ENVELOPES.travelMinutes.best, ENVELOPES.travelMinutes.worst);
    const extraTravel = invertLinear(option.extraTravelMinutes, ENVELOPES.extraTravelMinutes.best, ENVELOPES.extraTravelMinutes.worst);
    const boardingConvenience = option.extraTravelMinutes === 0
      ? 100
      : invertLinear(option.extraTravelMinutes, 0, 75);
    const changes = invertLinear(option.numChanges, ENVELOPES.changes.best, ENVELOPES.changes.worst);
    const demandInverse = clamp(100 - ctx.demand.score);
    const comfort = CLASS_COMFORT[option.travelClass] ?? 60;

    return weightedSum([
      { value: ctx.confirmation.probability, weight: MISSION_WEIGHTS.confirmation },
      { value: ctx.reliability.overall,      weight: MISSION_WEIGHTS.reliability },
      { value: fareValue,                    weight: MISSION_WEIGHTS.fareValue },
      { value: travelTime,                   weight: MISSION_WEIGHTS.travelTime },
      { value: extraTravel,                  weight: MISSION_WEIGHTS.extraTravel },
      { value: boardingConvenience,          weight: MISSION_WEIGHTS.boardingConvenience },
      { value: changes,                      weight: MISSION_WEIGHTS.changes },
      { value: demandInverse,                weight: MISSION_WEIGHTS.demandInverse },
      { value: ctx.tatkal.successChance,     weight: MISSION_WEIGHTS.tatkal },
      { value: comfort,                      weight: MISSION_WEIGHTS.comfort },
    ]);
  }
}
