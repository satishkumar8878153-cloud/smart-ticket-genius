// Curated dictionaries for the Mission AI natural-language parser.
// Extendable at runtime via the config-driven addAliases() helper.

import type { Quota } from "./types";
import type { TicketClass } from "../types";

export const MONTHS: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

// Common Indian station / city aliases → canonical short label.
// The engine later resolves canonical labels to station codes via the
// stations service; this only needs to normalize the natural-language token.
export const CITY_ALIASES: Record<string, string> = {
  delhi: "Delhi",
  "new delhi": "New Delhi",
  ndls: "New Delhi",
  mumbai: "Mumbai",
  bombay: "Mumbai",
  bom: "Mumbai",
  patna: "Patna",
  pnbe: "Patna",
  kolkata: "Kolkata",
  calcutta: "Kolkata",
  howrah: "Howrah",
  bangalore: "Bengaluru",
  bengaluru: "Bengaluru",
  chennai: "Chennai",
  madras: "Chennai",
  hyderabad: "Hyderabad",
  pune: "Pune",
  ahmedabad: "Ahmedabad",
  lucknow: "Lucknow",
  jaipur: "Jaipur",
  bhopal: "Bhopal",
  varanasi: "Varanasi",
  ranchi: "Ranchi",
  guwahati: "Guwahati",
};

export const QUOTA_ALIASES: Record<string, Quota> = {
  tatkal: "TATKAL",
  "premium tatkal": "PREMIUM_TATKAL",
  ladies: "LADIES",
  senior: "SENIOR_CITIZEN",
  "senior citizen": "SENIOR_CITIZEN",
  "lower berth": "LOWER_BERTH",
  general: "GENERAL",
  normal: "GENERAL",
};

export const CLASS_ALIASES: Record<string, TicketClass> = {
  sl: "SL", sleeper: "SL",
  "3a": "3A", "third ac": "3A", "3rd ac": "3A",
  "2a": "2A", "second ac": "2A", "2nd ac": "2A",
  "1a": "1A", "first ac": "1A", "1st ac": "1A",
  cc: "CC", "chair car": "CC",
  ec: "EC", executive: "EC",
};

// Hindi/Hinglish relative date tokens.
export const RELATIVE_DAYS: Record<string, number> = {
  aaj: 0, today: 0,
  kal: 1, kl: 1, tomorrow: 1,
  parso: 2, parsoo: 2,
  "day after tomorrow": 2,
  "next week": 7,
  "agle hafte": 7,
  "agle week": 7,
};

export function addCityAliases(entries: Record<string, string>): void {
  for (const [k, v] of Object.entries(entries)) {
    CITY_ALIASES[k.toLowerCase()] = v;
  }
}
