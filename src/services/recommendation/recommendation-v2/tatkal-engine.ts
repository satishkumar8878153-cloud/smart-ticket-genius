// Tatkal Intelligence Engine — success chance, difficulty, server-load risk,
// login timing and a short booking strategy.

import { TATKAL_CLASS_DIFFICULTY } from "./config";
import type {
  BookingDifficulty,
  DemandSignal,
  ITatkalEngine,
  ReliabilitySignal,
  TatkalIntel,
} from "./types";
import type { TravelOption } from "../types";
import { clamp } from "./utils";

export class DefaultTatkalEngine implements ITatkalEngine {
  predict(
    option: TravelOption,
    demand: DemandSignal,
    reliability: ReliabilitySignal,
  ): TatkalIntel {
    const s = option.signals;
    const classDifficulty = TATKAL_CLASS_DIFFICULTY[option.travelClass] ?? 55;
    // Success chance drops with demand and difficulty, rises with reliability
    // and seat availability.
    const successChance = clamp(
      Math.round(
        s.tatkalSuccessProbability * 0.45 +
          s.seatAvailability * 0.20 +
          reliability.overall * 0.10 +
          (100 - demand.score) * 0.15 +
          (100 - classDifficulty) * 0.10,
      ),
    );

    const difficultyScore =
      classDifficulty * 0.55 + demand.score * 0.35 + (100 - s.seatAvailability) * 0.10;
    const difficulty: BookingDifficulty =
      difficultyScore < 35 ? "easy"
      : difficultyScore < 55 ? "moderate"
      : difficultyScore < 75 ? "hard"
      : "extreme";

    const serverLoadRisk = clamp(Math.round(demand.score * 0.7 + classDifficulty * 0.3));
    const highDemandWarning = demand.level === "high" || demand.level === "extreme";

    // AC classes open at 10:00 IST, SL at 11:00 IST.
    const isSleeper = option.travelClass === "SL";
    const recommendedLoginTime = isSleeper ? "10:55 IST (T-1)" : "09:55 IST (T-1)";

    const strategy: string[] = [
      `Log in ${isSleeper ? "5" : "5"} min before the ${isSleeper ? "11:00" : "10:00"} IST window`,
      "Pre-fill passenger master list and journey details",
      "Use a saved UPI/card — avoid UPI collect requests",
    ];
    if (highDemandWarning) strategy.push("Expect heavy server load — retry immediately on failure");
    if (option.extraTravelMinutes > 0) {
      strategy.push(`Fallback attempt from ${option.boardingStation} — separate quota may clear faster`);
    }

    return {
      successChance,
      difficulty,
      serverLoadRisk,
      highDemandWarning,
      recommendedLoginTime,
      strategy,
    };
  }
}
