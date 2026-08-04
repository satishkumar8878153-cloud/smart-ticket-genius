import { apiFetch, USE_FASTAPI, ApiError } from "./api-client";
import type { SearchResult } from "@/lib/mock-data";
import { buildRecommendationAdvice } from "./recommendation";
import type { SearchResult as EngineSearchResult } from "./types";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  result?: SearchResult | null;
  createdAt: number;
}

interface ChatApiResponse {
  reply: string;
  result?: SearchResult | null;
}

/**
 * Sends a message to the Mission AI chat backend (FastAPI `/chat`).
 * The full session history is included so follow-up questions keep context;
 * backends that ignore the extra field still work unchanged.
 */
export async function sendChatMessage(
  message: string,
  history: ChatMessage[],
): Promise<{ reply: string; result: SearchResult | null }> {
  if (!USE_FASTAPI) {
    throw new ApiError(
      "Mission AI chat is not configured yet. Set VITE_FASTAPI_URL to enable it.",
      503,
    );
  }

  const contextual = buildContextualMessage(message, history);

  const data = await apiFetch<ChatApiResponse>("/chat", {
    method: "POST",
    body: JSON.stringify({
      message: contextual,
      history: history.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  const result = data.result ?? null;
  if (!result?.best) return { reply: data.reply, result };

  // Chat and Search share one recommendation brain: enrich the reply with the
  // same Recommendation Engine V2 advice (best choice, nearby station,
  // alternate date, alternate class) instead of duplicating logic here.
  try {
    const advice = await buildRecommendationAdvice(result as unknown as EngineSearchResult);
    if (advice.insights.length > 0) {
      return {
        reply: `${data.reply}\n\n${advice.insights.map((i) => `• ${i}`).join("\n")}`,
        result,
      };
    }
  } catch (err) {
    console.warn("Recommendation advice unavailable for chat reply", err);
  }
  return { reply: data.reply, result };
}

/**
 * Session context is preserved client-side: the last few turns are prefixed
 * to the message so a stateless backend can still resolve follow-ups
 * like "what about tomorrow?".
 */
function buildContextualMessage(message: string, history: ChatMessage[]): string {
  const recent = history.slice(-6);
  if (recent.length === 0) return message;

  const transcript = recent
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
    .join("\n");

  return `Previous conversation:\n${transcript}\n\nCurrent message: ${message}`;
}

export const SUGGESTED_PROMPTS = [
  "New Delhi to Mumbai Central tomorrow in 3A",
  "Cheapest train from Patna to Delhi this weekend",
  "Which train has the best confirmation chance to Chennai?",
  "Tatkal strategy for Howrah to New Delhi",
];
