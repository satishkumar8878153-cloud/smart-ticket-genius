// Train Popularity Index — a per-train reputation score combining observed
// booking demand, historical confirmation trend, class demand mix and route
// popularity. Used both as a decision factor and as an explainable driver.

import { clamp } from "../context";
import type { TravelOption } from "../types";
import type { DemandIndex } from "./demand";
import type { HistoricalStats } from "./historical";

export type TrainPopularity = {
  trainNumber: string;
  score: number;                // 0..100
  band: "niche" | "standard" | "popular" | "flagship";
  drivers: {
    bookingDemand: number;
    confirmationTrend: number;
    classDemand: number;
    routeDemand: number;
  };
};

// Rough class-demand map — SL/3A dominate typical bookings.
function classDemand(cls: TravelOption["travelClass"]): number {
  switch (cls) {
    case "SL": return 92;
    case "3A": return 90;
    case "2A": return 68;
    case "CC": return 70;
    case "EC": return 55;
    case "1A": return 45;
  }
}

export function computeTrainPopularity(
  option: TravelOption,
  history: HistoricalStats,
  demand: DemandIndex,
): TrainPopularity {
  const bookingDemand = clamp(
    Math.round(
      (100 - option.signals.seatAvailability) * 0.7 + demand.score * 0.3,
    ),
  );
  const confirmationTrend = history.historicalConfirmTrend;
  const classDem = classDemand(option.travelClass);
  const routeDemand = demand.breakdown.routePopularity;

  const score = clamp(
    Math.round(
      bookingDemand * 0.35 +
      confirmationTrend * 0.15 +
      classDem * 0.20 +
      routeDemand * 0.30,
    ),
  );

  const band: TrainPopularity["band"] =
    score >= 85 ? "flagship" : score >= 70 ? "popular" : score >= 50 ? "standard" : "niche";

  return {
    trainNumber: option.trainNumber,
    score,
    band,
    drivers: {
      bookingDemand,
      confirmationTrend,
      classDemand: classDem,
      routeDemand,
    },
  };
}
