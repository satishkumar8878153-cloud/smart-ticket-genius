// Confirm AI — booking strategy.
// Thin wrapper over the existing Tatkal Booking Strategy AI so Confirm AI does
// not duplicate plan-selection logic. Adds the "what to do now" action list.

import {
  buildBookingStrategy,
  type BookingPlan,
  type BookingStrategyInput,
} from "../tatkal/booking-strategy";
import type { ScoredOption } from "../recommendation/types";

export type BookingAction = {
  step: number;
  action: string;
  when: string;
};

export type ConfirmBookingStrategy = {
  plans: BookingPlan[];
  actions: BookingAction[];
  headline: string;
};

function actionsFor(primary: ScoredOption | undefined): BookingAction[] {
  if (!primary) return [];
  const intel = primary.intelligence;
  const days = intel?.waitlist.daysToChart ?? 0;
  const actions: BookingAction[] = [
    {
      step: 1,
      action: `Book ${primary.option.trainNumber} ${primary.option.trainName} in ${primary.option.travelClass} from ${primary.option.boardingStation}.`,
      when: "Now",
    },
  ];
  if (primary.expectedConfirmChance < 75) {
    actions.push({
      step: actions.length + 1,
      action: "Hold the backup plan open — do not cancel it until the chart prepares.",
      when: `Until T-${Math.max(1, days)} days`,
    });
    actions.push({
      step: actions.length + 1,
      action: "Prepare a Tatkal attempt with a saved passenger list and payment method.",
      when: "Tatkal window, T-1",
    });
  }
  if (intel?.boardingSuggestion?.worthwhile) {
    actions.push({
      step: actions.length + 1,
      action: `If it stays waitlisted, switch boarding to ${intel.boardingSuggestion.suggestedStation}.`,
      when: "Before charting",
    });
  }
  actions.push({
    step: actions.length + 1,
    action: "Enable Journey Guardian alerts for PNR movement and boarding reminders.",
    when: "After booking",
  });
  return actions;
}

export function buildConfirmBookingStrategy(
  input: BookingStrategyInput,
): ConfirmBookingStrategy {
  const plans = buildBookingStrategy(input);
  const primary = input.ranked[0];
  return {
    plans,
    actions: actionsFor(primary),
    headline: primary
      ? `Primary: ${primary.option.trainNumber} ${primary.option.trainName} · ${primary.option.travelClass} · ${primary.expectedConfirmChance}% expected confirmation.`
      : "No bookable option found for this journey.",
  };
}

export type { BookingPlan };
