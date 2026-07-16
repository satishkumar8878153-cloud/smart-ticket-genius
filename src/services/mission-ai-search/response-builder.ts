// Response Builder — final structured AI response for the search layer.
// Pure function: takes raw natural language, returns MissionSearchResponse.

import { parseNaturalQuery } from "./query-parser";
import { defaultSearchOrchestrator } from "./search-orchestrator";
import type { MissionSearchResponse, ParsedQuery } from "./types";

function humanizeMissing(missing: string[]): string {
  if (missing.length === 0) return "";
  const map: Record<string, string> = {
    source: "boarding city",
    destination: "destination city",
    date: "journey date",
  };
  const parts = missing.map((m) => map[m] ?? m);
  if (parts.length === 1) return `Please specify the ${parts[0]}.`;
  const last = parts.pop();
  return `Please specify the ${parts.join(", ")} and ${last}.`;
}

function buildMessage(parsed: ParsedQuery, missing: string[]): string {
  if (missing.length > 0) return humanizeMissing(missing);
  const j = parsed.journey;
  return `Journey detected: ${j.source} → ${j.destination} on ${j.journeyDate}. Intent: ${parsed.intent.primary}.`;
}

export function buildMissionSearchResponse(
  text: string,
  now?: Date,
): MissionSearchResponse {
  const parsed = parseNaturalQuery(text, now);
  const { search, recommendation, missing } =
    defaultSearchOrchestrator.orchestrate(parsed);

  return {
    ok: missing.length === 0,
    parsed,
    detected: {
      journey: parsed.journey,
      intent: parsed.intent,
      preferences: parsed.preferences,
    },
    search,
    recommendation,
    missing,
    message: buildMessage(parsed, missing),
  };
}
