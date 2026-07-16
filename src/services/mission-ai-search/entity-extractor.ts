// Entity Extractor — cities, class, quota, passenger count, budget.
// Reuses the mission-ai dictionaries as the single source of truth.

import {
  CITY_ALIASES,
  CLASS_ALIASES,
  QUOTA_ALIASES,
} from "../mission-ai/dictionaries";
import type { Quota } from "../mission-ai/types";
import type { TicketClass } from "../types";
import { defaultDateParser } from "./date-parser";
import type {
  DetectedJourney,
  DetectedPreferences,
  EntityExtractor,
} from "./types";

function extractCities(text: string): {
  source: string | null;
  destination: string | null;
} {
  const keys = Object.keys(CITY_ALIASES).sort((a, b) => b.length - a.length);
  const alt = keys.map((c) => c.replace(/\s+/g, "\\s+")).join("|");

  const pairPatterns = [
    new RegExp(`(${alt})\\s+(?:to|se)\\s+(${alt})`, "i"),
    new RegExp(`from\\s+(${alt})\\s+to\\s+(${alt})`, "i"),
    new RegExp(`between\\s+(${alt})\\s+and\\s+(${alt})`, "i"),
  ];
  for (const p of pairPatterns) {
    const m = p.exec(text);
    if (m) {
      return {
        source: CITY_ALIASES[m[1].toLowerCase().replace(/\s+/g, " ")] ?? m[1],
        destination:
          CITY_ALIASES[m[2].toLowerCase().replace(/\s+/g, " ")] ?? m[2],
      };
    }
  }

  const single = new RegExp(`\\b(${alt})\\b`, "i").exec(text);
  if (single) {
    return {
      source: null,
      destination:
        CITY_ALIASES[single[1].toLowerCase().replace(/\s+/g, " ")] ??
        single[1],
    };
  }
  return { source: null, destination: null };
}

function extractQuota(text: string): Quota | null {
  const keys = Object.keys(QUOTA_ALIASES).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const re = new RegExp(`\\b${k.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(text)) return QUOTA_ALIASES[k];
  }
  return null;
}

function extractClass(text: string): TicketClass | null {
  const keys = Object.keys(CLASS_ALIASES).sort((a, b) => b.length - a.length);
  for (const k of keys) {
    const re = new RegExp(`\\b${k.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(text)) return CLASS_ALIASES[k];
  }
  // Generic "ac" → default to 3A (most common) so downstream has a hint.
  if (/\bac\b/i.test(text)) return "3A";
  return null;
}

function extractPassengerCount(text: string): number | null {
  const m =
    /\b(\d{1,2})\s*(?:passengers?|tickets?|log|people|adults?|seats?)\b/.exec(
      text,
    );
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 20) return n;
  }
  return null;
}

function extractBudget(text: string): number | null {
  const capped =
    /(?:under|below|max|budget|upto|up to|within|<=?|≤|ke andar|ke under)\s*(?:rs\.?|inr|₹|rupaye|rupees)?\s*(\d{2,6})/.exec(
      text,
    );
  if (capped) return Number(capped[1]);
  const rupaye =
    /(\d{2,6})\s*(?:rs\.?|inr|₹|rupaye|rupees)\b/.exec(text);
  if (rupaye) return Number(rupaye[1]);
  const rs = /(?:rs\.?|inr|₹)\s*(\d{2,6})/.exec(text);
  if (rs) return Number(rs[1]);
  return null;
}

export class DefaultEntityExtractor implements EntityExtractor {
  readonly id = "default-entity-extractor";

  extract(text: string): {
    journey: DetectedJourney;
    preferences: Omit<DetectedPreferences, "journeyPriority">;
  } {
    const cities = extractCities(text);
    const journeyDate = defaultDateParser.parse(text);
    return {
      journey: {
        source: cities.source,
        destination: cities.destination,
        journeyDate,
      },
      preferences: {
        preferredClass: extractClass(text),
        quota: extractQuota(text),
        passengerCount: extractPassengerCount(text),
        budget: extractBudget(text),
      },
    };
  }
}

export const defaultEntityExtractor = new DefaultEntityExtractor();
