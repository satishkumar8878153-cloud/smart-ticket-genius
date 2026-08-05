import { USE_FASTAPI, ApiError } from "./api-client";
import type { SearchResult } from "./types";
import { searchTrains } from "./search.service";
import { buildRecommendationAdvice } from "./recommendation";
import type { RankedTrain, RecommendationAdvice } from "./recommendation/advisor";
import { parseTravelRequest } from "./mission-ai";
import type { Quota } from "./mission-ai/types";
import type { TicketClass } from "./types";
import { parseDurationToMinutes } from "./recommendation/feature-extractor";

export type ChatRole = "user" | "assistant";

/**
 * Slots Mission AI needs before it can run the Recommendation Engine.
 * They accumulate across the turns of the current chat session, so a user can
 * answer follow-up questions one at a time ("Delhi to Mumbai" → "tomorrow" → "3A").
 */
export interface MissionSlots {
  source: string | null;
  destination: string | null;
  date: string | null;
  travelClass: TicketClass | null;
  quota: Quota | null;
}

/** Structured recommendation payload rendered as cards inside the chat. */
export interface ChatRecommendation {
  query: { source: string; destination: string; date: string; travelClass: TicketClass };
  quota: Quota;
  best: RankedTrain | null;
  alternateTrain: RankedTrain | null;
  cheapest: RankedTrain | null;
  fastest: RankedTrain | null;
  alternateClass: RecommendationAdvice["alternateClass"];
  nearbyStation: RecommendationAdvice["nearbyStation"];
  alternateDate: RecommendationAdvice["alternateDate"];
}

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  result?: SearchResult | null;
  recommendation?: ChatRecommendation | null;
  slots?: MissionSlots;
  createdAt: number;
}

export const EMPTY_SLOTS: MissionSlots = {
  source: null,
  destination: null,
  date: null,
  travelClass: null,
  quota: null,
};

function todayISO(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

const CLASS_CODES: TicketClass[] = ["SL", "3A", "2A", "1A", "CC", "EC"];

/**
 * Merges a new user message into the running session memory using the existing
 * Mission AI natural-language parser — no parsing logic is duplicated here.
 */
export function updateSlots(prev: MissionSlots, message: string): MissionSlots {
  const parsed = parseTravelRequest(message);
  const text = message.trim().toUpperCase();

  // A bare class reply ("3A") is an answer to a follow-up question.
  const bareClass = CLASS_CODES.find((c) => text === c) ?? null;

  return {
    source: parsed.source ?? prev.source,
    destination: parsed.destination ?? prev.destination,
    date: parsed.date ?? prev.date,
    travelClass: (parsed.preferredClass as TicketClass | null) ?? bareClass ?? prev.travelClass,
    quota: parsed.quota ?? prev.quota,
  };
}

/** Rebuilds session memory from every user turn of the current chat session. */
export function slotsFromHistory(history: ChatMessage[], current?: string): MissionSlots {
  let slots = EMPTY_SLOTS;
  for (const m of history) {
    if (m.role === "user") slots = updateSlots(slots, m.content);
  }
  if (current) slots = updateSlots(slots, current);
  return slots;
}

function missingSlotQuestion(slots: MissionSlots): string | null {
  if (!slots.source && !slots.destination)
    return "Happy to help! Which stations are you travelling between? For example: *New Delhi to Mumbai Central*.";
  if (!slots.source)
    return `Got the destination — **${slots.destination}**. Which station are you starting from?`;
  if (!slots.destination)
    return `Starting from **${slots.source}** — where are you heading?`;
  if (!slots.date)
    return `**${slots.source} → ${slots.destination}**. Which date do you want to travel? You can say *tomorrow*, *this weekend* or a date like *15 Nov*.`;
  if (!slots.travelClass)
    return `Which class should I check for ${slots.source} → ${slots.destination} on ${slots.date}? (SL, 3A, 2A, 1A, CC or EC)`;
  return null;
}

function cheapestOf(trains: RankedTrain[]): RankedTrain | null {
  if (trains.length === 0) return null;
  return [...trains].sort((a, b) => a.fareEstimate - b.fareEstimate)[0];
}

function fastestOf(trains: RankedTrain[]): RankedTrain | null {
  if (trains.length === 0) return null;
  return [...trains].sort(
    (a, b) => parseDurationToMinutes(a.duration) - parseDurationToMinutes(b.duration),
  )[0];
}

function summarise(advice: RecommendationAdvice, quota: Quota): string {
  const best = advice.bestChoice;
  const q = advice.query;
  if (!best) {
    return `I couldn't rank any train for ${q.source} → ${q.destination} on ${q.date} in ${q.travelClass}. Try a nearby major station or another date.`;
  }
  const lines = [
    `Here's the best option for **${q.source} → ${q.destination}** on **${q.date}** in **${q.travelClass}** (${quota.replace(/_/g, " ").toLowerCase()} quota):`,
    "",
    `**${best.trainName} (${best.trainNumber})** — ${best.confirmProbability}% confirmation chance, mission score ${best.missionScore}/100.`,
  ];
  if (best.reasons[0]) lines.push("", best.reasons[0]);
  return lines.join("\n");
}

/**
 * Mission AI turn handler. It is the single brain of the app: it keeps session
 * memory, asks follow-up questions when information is missing, and otherwise
 * runs the SAME pipeline Search uses — `searchTrains` → Recommendation
 * Engine V2 (`buildRecommendationAdvice`) — so both surfaces always agree.
 */
export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
): Promise<{ reply: string; result: SearchResult | null; recommendation: ChatRecommendation | null; slots: MissionSlots }> {
  const slots = slotsFromHistory(history, message);

  const question = missingSlotQuestion(slots);
  if (question) {
    return { reply: question, result: null, recommendation: null, slots };
  }

  const query = {
    source: slots.source!,
    destination: slots.destination!,
    date: slots.date ?? todayISO(1),
    travelClass: slots.travelClass!,
  };

  let result: SearchResult;
  try {
    result = await searchTrains(query);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return {
        reply: `I couldn't find trains for **${query.source} → ${query.destination}** on ${query.date}. Try a nearby major station, or tell me a different date.`,
        result: null,
        recommendation: null,
        slots,
      };
    }
    throw new ApiError(
      USE_FASTAPI
        ? "Mission AI couldn't reach the train service just now. Please retry in a moment."
        : "Mission AI is unavailable right now. Please try again.",
      503,
    );
  }

  const advice = await buildRecommendationAdvice(result);
  const quota: Quota = slots.quota ?? "GENERAL";
  const ranked = advice.rankedTrains;

  const recommendation: ChatRecommendation = {
    query,
    quota,
    best: advice.bestChoice,
    alternateTrain: ranked[1] ?? null,
    cheapest: cheapestOf(ranked),
    fastest: fastestOf(ranked),
    alternateClass: advice.alternateClass,
    nearbyStation: advice.nearbyStation,
    alternateDate: advice.alternateDate,
  };

  return { reply: summarise(advice, quota), result, recommendation, slots };
}

export const SUGGESTED_PROMPTS = [
  "New Delhi to Mumbai Central tomorrow in 3A",
  "Cheapest train from Patna to Delhi this weekend",
  "Which train has the best confirmation chance to Chennai?",
  "Tatkal strategy for Howrah to New Delhi",
];
