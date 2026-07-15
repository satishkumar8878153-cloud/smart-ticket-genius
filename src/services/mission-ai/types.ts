// Mission AI Foundation — shared types.

import type { TicketClass } from "../types";

export type Quota =
  | "GENERAL"
  | "TATKAL"
  | "PREMIUM_TATKAL"
  | "LADIES"
  | "SENIOR_CITIZEN"
  | "LOWER_BERTH";

export type ParsedTravelRequest = {
  source: string | null;
  destination: string | null;
  date: string | null;             // ISO YYYY-MM-DD
  quota: Quota | null;
  preferredClass: TicketClass | null;
  passengerCount: number | null;
  budget: number | null;
  rawText: string;
  language: "en" | "hi" | "hinglish" | "unknown";
  confidence: number;              // 0..100
  unresolved: string[];            // fields that could not be extracted
};

export interface NaturalLanguageParser {
  readonly id: string;
  parse(text: string, now?: Date): ParsedTravelRequest;
}
