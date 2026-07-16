// Query Parser — top-level pipeline that produces a ParsedQuery.
// Orchestrates entity extraction, intent detection, and priority mapping.

import { defaultEntityExtractor } from "./entity-extractor";
import { defaultIntentDetector } from "./intent-detector";
import type {
  DetectedIntent,
  DetectedPreferences,
  JourneyIntent,
  JourneyPriority,
  ParsedQuery,
  QueryParser,
} from "./types";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectLanguage(text: string): ParsedQuery["language"] {
  const hi = /(mujhe|jana|hai|kal|aaj|parso|chahiye|sabse|achhi|hafte|se|andar|rupaye|sasti|jyada|zyada)/;
  const en = /(to|from|on|by|book|need|want|travel|between|cheapest|fastest|highest)/;
  const isHi = hi.test(text);
  const isEn = en.test(text);
  if (isHi && isEn) return "hinglish";
  if (isHi) return "hi";
  if (isEn) return "en";
  return "unknown";
}

function intentToPriority(intent: JourneyIntent): JourneyPriority {
  switch (intent) {
    case "HIGHEST_CONFIRMATION":
    case "LOWEST_RISK":
      return "CONFIRMATION";
    case "CHEAPEST":
      return "PRICE";
    case "FASTEST":
      return "SPEED";
    case "PREMIUM":
      return "COMFORT";
    case "TATKAL":
      return "FLEXIBILITY";
    case "BALANCED":
    default:
      return "BALANCED";
  }
}

function scoreConfidence(
  hasSource: boolean,
  hasDestination: boolean,
  hasDate: boolean,
  intent: DetectedIntent,
): number {
  let s = 0;
  if (hasSource) s += 25;
  if (hasDestination) s += 35;
  if (hasDate) s += 25;
  if (intent.primary !== "BALANCED") s += 15;
  return Math.min(100, s);
}

export class DefaultQueryParser implements QueryParser {
  readonly id = "default-query-parser";

  parse(text: string, now: Date = new Date()): ParsedQuery {
    const normalized = normalize(text);
    const language = detectLanguage(normalized);

    const { journey, preferences: partial } =
      defaultEntityExtractor.extract(normalized);
    const intent = defaultIntentDetector.detect(normalized);

    // Quota inference from intent when the sentence didn't explicitly say so.
    const quota =
      partial.quota ?? (intent.primary === "TATKAL" ? "TATKAL" : null);

    const preferences: DetectedPreferences = {
      ...partial,
      quota,
      journeyPriority: intentToPriority(intent.primary),
    };

    const unresolved: string[] = [];
    if (!journey.source) unresolved.push("source");
    if (!journey.destination) unresolved.push("destination");
    if (!journey.journeyDate) unresolved.push("date");

    return {
      rawText: text,
      normalizedText: normalized,
      language,
      journey,
      preferences,
      intent,
      confidence: scoreConfidence(
        !!journey.source,
        !!journey.destination,
        !!journey.journeyDate,
        intent,
      ),
      unresolved,
    };
  }
}

export const defaultQueryParser = new DefaultQueryParser();

export function parseNaturalQuery(text: string, now?: Date): ParsedQuery {
  return defaultQueryParser.parse(text, now);
}
