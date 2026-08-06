// User preferences → decision weight adjustments.
//
// Preferences are declarative and optional. They never replace the engine's
// factors; they nudge the shared DecisionWeights so every consumer (Search,
// Mission AI, Confirm AI) ranks with the same model but the traveller's bias.

import type { DecisionWeights } from "../recommendation/decision-score";
import { DEFAULT_DECISION_WEIGHTS } from "../recommendation/decision-score";
import type { TicketClass } from "../types";

export type TravelPriority =
  | "confirmation"
  | "speed"
  | "price"
  | "comfort"
  | "balanced";

export type UserPreferences = {
  /** What matters most to this traveller. */
  priority?: TravelPriority;
  /** Maximum acceptable detour to a nearby boarding station, in minutes. */
  maxExtraTravelMinutes?: number;
  /** Preferred classes, most preferred first. */
  preferredClasses?: TicketClass[];
  /** Avoid late-night departures when true. */
  avoidLateNight?: boolean;
  /** Hard fare ceiling in INR. */
  maxFare?: number;
  /** Willing to shift the journey date if it improves confirmation odds. */
  flexibleDates?: boolean;
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  priority: "balanced",
  maxExtraTravelMinutes: 90,
  avoidLateNight: false,
  flexibleDates: true,
};

const PRIORITY_BIAS: Record<TravelPriority, Partial<DecisionWeights>> = {
  confirmation: { confirmation: 30, waitingMovement: 16, tatkal: 7 },
  speed: { travelTime: 18, boarding: 8, comfort: 4 },
  price: { fare: 20, comfort: 3 },
  comfort: { comfort: 16, reliability: 11 },
  balanced: {},
};

/** Merge preferences (and optional explicit overrides) into decision weights. */
export function weightsFromPreferences(
  prefs: UserPreferences = DEFAULT_PREFERENCES,
  overrides?: Partial<DecisionWeights>,
): DecisionWeights {
  const bias = PRIORITY_BIAS[prefs.priority ?? "balanced"];
  const weights: DecisionWeights = {
    ...DEFAULT_DECISION_WEIGHTS,
    ...bias,
    ...(overrides ?? {}),
  };

  // A traveller unwilling to detour cares more about boarding convenience.
  if ((prefs.maxExtraTravelMinutes ?? 90) <= 30) {
    weights.boarding = Math.max(weights.boarding, 12);
  }
  // Fare ceiling implies price sensitivity.
  if (typeof prefs.maxFare === "number") {
    weights.fare = Math.max(weights.fare, 14);
  }
  return weights;
}
