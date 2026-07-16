// Search Orchestrator — converts a ParsedQuery into a SearchQuery + a
// RecommendationRequest that the existing Recommendation Engine can consume.
// This module does NOT call the engine directly; it only prepares payloads.

import type { SearchQuery, TicketClass } from "../types";
import type {
  JourneyIntent,
  ParsedQuery,
  RecommendationRequest,
  SearchOrchestrationRequest,
  SearchOrchestrator,
} from "./types";

const DEFAULT_CLASS: TicketClass = "3A";

function intentWeightHints(intent: JourneyIntent): RecommendationRequest["weightHints"] {
  switch (intent) {
    case "HIGHEST_CONFIRMATION":
      return { confirmation: 0.35, availability: 0.25, reliability: 0.15 };
    case "LOWEST_RISK":
      return { confirmation: 0.3, reliability: 0.25, availability: 0.2 };
    case "CHEAPEST":
      return { fare: 0.4, availability: 0.2, confirmation: 0.15 };
    case "FASTEST":
      return { travelTime: 0.4, extraTravel: 0.2, confirmation: 0.15 };
    case "TATKAL":
      return { tatkal: 0.45, availability: 0.2, confirmation: 0.15 };
    case "PREMIUM":
      return { convenience: 0.35, reliability: 0.2, confirmation: 0.2 };
    case "BALANCED":
    default:
      return {};
  }
}

export class DefaultSearchOrchestrator implements SearchOrchestrator {
  readonly id = "default-search-orchestrator";

  orchestrate(parsed: ParsedQuery): {
    search: SearchOrchestrationRequest | null;
    recommendation: RecommendationRequest | null;
    missing: string[];
  } {
    const missing: string[] = [];
    if (!parsed.journey.source) missing.push("source");
    if (!parsed.journey.destination) missing.push("destination");
    if (!parsed.journey.journeyDate) missing.push("date");

    if (!parsed.journey.source || !parsed.journey.destination || !parsed.journey.journeyDate) {
      return { search: null, recommendation: null, missing };
    }

    const query: SearchQuery = {
      source: parsed.journey.source,
      destination: parsed.journey.destination,
      date: parsed.journey.journeyDate,
      travelClass: parsed.preferences.preferredClass ?? DEFAULT_CLASS,
    };

    const search: SearchOrchestrationRequest = {
      query,
      intent: parsed.intent,
      preferences: parsed.preferences,
    };

    const recommendation: RecommendationRequest = {
      query,
      intent: parsed.intent.primary,
      preferences: parsed.preferences,
      weightHints: intentWeightHints(parsed.intent.primary),
    };

    return { search, recommendation, missing };
  }
}

export const defaultSearchOrchestrator = new DefaultSearchOrchestrator();
