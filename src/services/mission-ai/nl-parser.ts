// Natural Language Parser — foundation only.
// Handles English, Hindi (romanized), and Hinglish sentences of the form:
//   "Mujhe Patna se Mumbai 15 November jana hai"
//   "Kal Delhi jana hai"
//   "Tatkal me sabse achhi train"
//   "Book 2 tickets Delhi to Patna on 20 Dec in 3A under 2000"
//
// Deterministic, dictionary-driven; no ML dependency. A FastAPI/LLM parser
// can implement NaturalLanguageParser to override.

import type { TicketClass } from "../types";
import {
  CITY_ALIASES,
  CLASS_ALIASES,
  MONTHS,
  QUOTA_ALIASES,
  RELATIVE_DAYS,
} from "./dictionaries";
import type {
  NaturalLanguageParser,
  ParsedTravelRequest,
  Quota,
} from "./types";

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?;:()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function detectLanguage(text: string): ParsedTravelRequest["language"] {
  const hindiTokens = /(mujhe|jana|hai|kal|aaj|parso|chahiye|sabse|achhi|hafte|me|se)/;
  const englishTokens = /(to|from|on|by|book|need|want|travel|between)/;
  const hi = hindiTokens.test(text);
  const en = englishTokens.test(text);
  if (hi && en) return "hinglish";
  if (hi) return "hi";
  if (en) return "en";
  return "unknown";
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function extractDate(text: string, now: Date): string | null {
  // 1) Relative words.
  for (const [token, offset] of Object.entries(RELATIVE_DAYS)) {
    const re = new RegExp(`(^|\\s)${token}(\\s|$)`);
    if (re.test(text)) {
      const d = new Date(now);
      d.setDate(d.getDate() + offset);
      return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
  }
  // 2) "15 November", "15 nov", "15/11", "15-11-2026", "2026-11-15"
  const iso = /(\b\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(text);
  if (iso) return toISO(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dmy = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(text);
  if (dmy) {
    const d = Number(dmy[1]);
    const m = Number(dmy[2]);
    let y = dmy[3] ? Number(dmy[3]) : now.getFullYear();
    if (y < 100) y += 2000;
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return toISO(y, m, d);
  }

  const monthName = new RegExp(
    `\\b(\\d{1,2})\\s+(${Object.keys(MONTHS).join("|")})\\b(?:\\s+(\\d{4}))?`,
  );
  const mn = monthName.exec(text);
  if (mn) {
    const d = Number(mn[1]);
    const m = MONTHS[mn[2]];
    const y = mn[3] ? Number(mn[3]) : now.getFullYear();
    // If the resolved date is already past, roll to next year.
    const resolved = new Date(y, m - 1, d);
    if (resolved.getTime() < new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() && !mn[3]) {
      return toISO(y + 1, m, d);
    }
    return toISO(y, m, d);
  }
  return null;
}

function extractCities(text: string): { source: string | null; destination: string | null } {
  // Prefer explicit "X to Y" / "X se Y" patterns.
  const cityKeys = Object.keys(CITY_ALIASES).sort((a, b) => b.length - a.length);
  const cityAlt = cityKeys.map((c) => c.replace(/\s+/g, "\\s+")).join("|");

  const patterns = [
    new RegExp(`(${cityAlt})\\s+(?:to|se)\\s+(${cityAlt})`, "i"),
    new RegExp(`from\\s+(${cityAlt})\\s+to\\s+(${cityAlt})`, "i"),
  ];
  for (const p of patterns) {
    const m = p.exec(text);
    if (m) {
      return {
        source: CITY_ALIASES[m[1].toLowerCase().replace(/\s+/g, " ")] ?? m[1],
        destination: CITY_ALIASES[m[2].toLowerCase().replace(/\s+/g, " ")] ?? m[2],
      };
    }
  }
  // Single city detected → destination only (Hindi "kal Delhi jana hai").
  const single = new RegExp(`\\b(${cityAlt})\\b`, "i").exec(text);
  if (single) {
    return {
      source: null,
      destination:
        CITY_ALIASES[single[1].toLowerCase().replace(/\s+/g, " ")] ?? single[1],
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
  return null;
}

function extractPassengers(text: string): number | null {
  const m = /\b(\d{1,2})\s*(?:passengers?|tickets?|log|people|adults?)\b/.exec(text);
  if (m) {
    const n = Number(m[1]);
    if (n >= 1 && n <= 20) return n;
  }
  return null;
}

function extractBudget(text: string): number | null {
  const m = /(?:under|below|max|budget|upto|up to|within|<=?|≤)\s*(?:rs\.?|inr|₹)?\s*(\d{2,6})/.exec(
    text,
  );
  if (m) return Number(m[1]);
  const rs = /(?:rs\.?|inr|₹)\s*(\d{2,6})/.exec(text);
  if (rs) return Number(rs[1]);
  return null;
}

function scoreConfidence(fields: {
  source: string | null;
  destination: string | null;
  date: string | null;
}): number {
  let s = 0;
  if (fields.source) s += 30;
  if (fields.destination) s += 40;
  if (fields.date) s += 30;
  return s;
}

export class DefaultNaturalLanguageParser implements NaturalLanguageParser {
  readonly id = "default-rule-based";

  parse(text: string, now: Date = new Date()): ParsedTravelRequest {
    const raw = text;
    const norm = normalize(text);

    const cities = extractCities(norm);
    const date = extractDate(norm, now);
    const quota = extractQuota(norm);
    const preferredClass = extractClass(norm);
    const passengerCount = extractPassengers(norm);
    const budget = extractBudget(norm);
    const language = detectLanguage(norm);

    const unresolved: string[] = [];
    if (!cities.source) unresolved.push("source");
    if (!cities.destination) unresolved.push("destination");
    if (!date) unresolved.push("date");

    return {
      source: cities.source,
      destination: cities.destination,
      date,
      quota,
      preferredClass,
      passengerCount,
      budget,
      rawText: raw,
      language,
      confidence: scoreConfidence({ ...cities, date }),
      unresolved,
    };
  }
}

export const defaultParser = new DefaultNaturalLanguageParser();

export function parseTravelRequest(
  text: string,
  now?: Date,
  parser: NaturalLanguageParser = defaultParser,
): ParsedTravelRequest {
  return parser.parse(text, now);
}
