// Mission AI Search Engine V1 — shared types.
// Foundation only: converts natural language into structured search input.
// No UI, no network calls. FastAPI/ML-ready via interfaces.

import type { Quota } from "../mission-ai/types";
import type { SearchQuery, TicketClass } from "../types";

export type JourneyIntent =
  | "HIGHEST_CONFIRMATION"
  | "CHEAPEST"
  | "FASTEST"
  | "TATKAL"
  | "PREMIUM"
  | "BALANCED"
  | "LOWEST_RISK";

export type JourneyPriority =
  | "CONFIRMATION"
  | "PRICE"
  | "SPEED"
  | "COMFORT"
  | "FLEXIBILITY"
  | "BALANCED";

export type DetectedJourney = {
  source: string | null;
  destination: string | null;
  journeyDate: string | null; // ISO YYYY-MM-DD
};

export type DetectedPreferences = {
  preferredClass: TicketClass | null;
  quota: Quota | null;
  passengerCount: number | null;
  budget: number | null;
  journeyPriority: JourneyPriority;
};

export type IntentSignal = {
  intent: JourneyIntent;
  score: number; // 0..100 confidence for this specific intent match
};

export type DetectedIntent = {
  primary: JourneyIntent;
  secondary: JourneyIntent[];
  signals: IntentSignal[];
};

export type ParsedQuery = {
  rawText: string;
  normalizedText: string;
  language: "en" | "hi" | "hinglish" | "unknown";
  journey: DetectedJourney;
  preferences: DetectedPreferences;
  intent: DetectedIntent;
  confidence: number; // 0..100 overall
  unresolved: string[]; // missing critical fields (source/destination/date)
};

export type SearchOrchestrationRequest = {
  query: SearchQuery;
  intent: DetectedIntent;
  preferences: DetectedPreferences;
};

export type RecommendationRequest = {
  query: SearchQuery;
  intent: JourneyIntent;
  preferences: DetectedPreferences;
  // Weight overrides — the Recommendation Engine can consume these to bias
  // its scoring model without being called directly here.
  weightHints: Partial<Record<
    | "availability"
    | "confirmation"
    | "tatkal"
    | "fare"
    | "travelTime"
    | "extraTravel"
    | "convenience"
    | "reliability",
    number
  >>;
};

export type MissionSearchResponse = {
  ok: boolean;
  parsed: ParsedQuery;
  detected: {
    journey: DetectedJourney;
    intent: DetectedIntent;
    preferences: DetectedPreferences;
  };
  search: SearchOrchestrationRequest | null;
  recommendation: RecommendationRequest | null;
  missing: string[]; // human-readable missing fields
  message: string;
};

// ---------- Pluggable interfaces (Dependency Injection / FastAPI-ready) ----------

export interface QueryParser {
  readonly id: string;
  parse(text: string, now?: Date): ParsedQuery;
}

export interface IntentDetector {
  readonly id: string;
  detect(normalizedText: string): DetectedIntent;
}

export interface EntityExtractor {
  readonly id: string;
  extract(normalizedText: string): {
    journey: DetectedJourney;
    preferences: Omit<DetectedPreferences, "journeyPriority">;
  };
}

export interface DateParser {
  readonly id: string;
  parse(normalizedText: string, now?: Date): string | null;
}

export interface SearchOrchestrator {
  readonly id: string;
  orchestrate(parsed: ParsedQuery): {
    search: SearchOrchestrationRequest | null;
    recommendation: RecommendationRequest | null;
    missing: string[];
  };
}
