// Mission Confirm service — now backed by the Recommendation Engine.
// The engine ranks every travel option (train × class × date × boarding
// station) via a pluggable weighted scoring model; this service picks three
// complementary plans (A/B/C) from the ranked list and shapes them for the UI.
//
// FastAPI-ready: when VITE_FASTAPI_URL is set the engine calls
// `/recommendations`, and this service still runs unchanged on top of it.

import { apiFetch, USE_FASTAPI } from "./api-client";
import { buildRecommendationAdvice, pickMissionPlans } from "./recommendation";
import type { RecommendationAdvice, ScoredOption } from "./recommendation";
import type {
  SearchQuery,
  SearchResult,
  TicketClass,
} from "./types";

export type PlanKind = "A" | "B" | "C";

export type PlanPros = { advantages: string[]; disadvantages: string[] };

export type MissionPlan = {
  kind: PlanKind;
  title: string;
  tagline: string;
  train: {
    name: string;
    number: string;
    departure: string;
    arrival: string;
    duration: string;
  };
  boardingStation: string;
  travelClass: TicketClass;
  journeyDate: string;
  confirmProbability: number;
  aiConfidence: number;
  fareEstimate: number;
  extraTravel?: string;
  aiExplanation: string;
  pros: PlanPros;
  // Engine-derived fields (kept optional so the current UI keeps working).
  missionScore?: number;
  confidenceLevel?: ScoredOption["confidenceLevel"];
  riskLevel?: ScoredOption["riskLevel"];
  expectedConfirmChance?: number;
};

export type TatkalStrategy = {
  successProbability: number;
  bestBoardingStation: string;
  bestClass: TicketClass;
  openingWindow: string;
  advice: string[];
};

export type GuardianTask = {
  id: "waitlist" | "boarding" | "route" | "notify";
  title: string;
  description: string;
  status: "idle" | "armed" | "watching";
};

export type MissionConfirmResult = {
  query: SearchQuery;
  plans: [MissionPlan, MissionPlan, MissionPlan];
  tatkal: TatkalStrategy;
  guardian: GuardianTask[];
  // Full ranked list is exposed for future UI (e.g. "explore all options").
  ranked: ScoredOption[];
  // Shared Recommendation Engine V2 advice: smart train ranking + nearby
  // station / alternate date / alternate class intelligence with reasons.
  advice: RecommendationAdvice;
};

const PLAN_META: Record<PlanKind, { title: string; tagline: string }> = {
  A: { title: "Plan A · Best Overall", tagline: "Highest AI mission score across every signal" },
  B: { title: "Plan B · Fastest Alternative", tagline: "Fastest option in the top-ranked slice" },
  C: { title: "Plan C · Backup Strategy", tagline: "Independent train/class — activates if Plan A slips" },
};

function extraTravelLabel(mins: number): string | undefined {
  if (mins <= 0) return undefined;
  return `${mins} min`;
}

function toMissionPlan(kind: PlanKind, s: ScoredOption): MissionPlan {
  const meta = PLAN_META[kind];
  return {
    kind,
    title: meta.title,
    tagline: meta.tagline,
    train: {
      name: s.option.trainName,
      number: s.option.trainNumber,
      departure: s.option.departure,
      arrival: s.option.arrival,
      duration: s.option.duration,
    },
    boardingStation: s.option.boardingStation,
    travelClass: s.option.travelClass,
    journeyDate: s.option.journeyDate,
    confirmProbability: s.option.signals.confirmProbability,
    aiConfidence: s.confidence,
    fareEstimate: s.option.fareEstimate,
    extraTravel: extraTravelLabel(s.option.extraTravelMinutes),
    aiExplanation: s.why,
    pros: {
      advantages: s.pros,
      disadvantages: s.cons,
    },
    missionScore: s.missionScore,
    confidenceLevel: s.confidenceLevel,
    riskLevel: s.riskLevel,
    expectedConfirmChance: s.expectedConfirmChance,
  };
}

function buildTatkal(result: SearchResult, ranked: ScoredOption[]): TatkalStrategy {
  // Best Tatkal option = highest tatkalSuccess-weighted score among SL/3A.
  const tatkalCandidates = ranked.filter(
    (r) => r.option.travelClass === "SL" || r.option.travelClass === "3A",
  );
  const best = tatkalCandidates.sort(
    (a, b) =>
      b.option.signals.tatkalSuccessProbability -
      a.option.signals.tatkalSuccessProbability,
  )[0];

  const chosenClass: TicketClass = best?.option.travelClass ?? "3A";
  const boarding = best?.option.boardingStation ?? result.query.source;
  const probability = best
    ? best.option.signals.tatkalSuccessProbability
    : Math.round(result.best.confirmProbability * 0.75);

  return {
    successProbability: probability,
    bestBoardingStation: boarding,
    bestClass: chosenClass,
    openingWindow: chosenClass === "SL" ? "11:00 IST (T-1)" : "10:00 IST (T-1)",
    advice: [
      "Log in 3–4 minutes before the Tatkal window opens",
      `Prefill passenger master list for ${chosenClass}`,
      "Use a saved payment method — UPI collect adds 20–30s",
      best && best.option.extraTravelMinutes > 0
        ? `If the first attempt fails, retry from ${boarding} — separate quota often clears faster`
        : "Retry immediately from an alternate boarding station if the first attempt fails",
    ],
  };
}

function buildGuardian(): GuardianTask[] {
  return [
    {
      id: "waitlist",
      title: "Waiting list monitor",
      description:
        "Watches PNR movement every few minutes and predicts confirmation odds in real time.",
      status: "idle",
    },
    {
      id: "boarding",
      title: "Boarding reminders",
      description:
        "Personalised alerts for platform, coach position and departure countdown.",
      status: "idle",
    },
    {
      id: "route",
      title: "Alternative route alerts",
      description:
        "If seats free up on a faster train, Guardian pings you with a one-tap switch.",
      status: "idle",
    },
    {
      id: "notify",
      title: "Journey notifications",
      description:
        "Delay, diversion and arrival updates — pushed live during the journey.",
      status: "idle",
    },
  ];
}

export async function generateMissionConfirm(
  query: SearchQuery,
  result: SearchResult,
): Promise<MissionConfirmResult> {
  // If a FastAPI backend exposes an aggregated /mission endpoint, prefer it —
  // it can return the same shape (plans built from its own ranked engine).
  if (USE_FASTAPI) {
    try {
      const remote = await apiFetch<MissionConfirmResult>("/mission", {
        method: "POST",
        body: JSON.stringify({ query, result }),
      });
      // Older backends don't return the advice bundle — fill it in locally so
      // Search and Chat always get the same recommendation intelligence.
      if (remote && !remote.advice) {
        remote.advice = await buildRecommendationAdvice(result);
      }
      return remote;
    } catch {
      // Fall through to the in-app engine if the aggregated endpoint isn't ready.
    }
  }

  // Shared AI Decision Engine — the same brain Search, Mission AI Chat and
  // Confirm AI use, so ranking is never duplicated per feature.
  const engine = await runDecisionEngine({ result });
  const advice = engine.advice;
  const ranked = engine.ranked;
  const picks = pickMissionPlans(ranked);

  const A = picks?.A ?? ranked[0];
  const B = picks?.B ?? ranked[1] ?? A;
  const C = picks?.C ?? ranked[2] ?? B;

  const plans: [MissionPlan, MissionPlan, MissionPlan] = [
    toMissionPlan("A", A),
    toMissionPlan("B", B),
    toMissionPlan("C", C),
  ];

  return {
    query,
    plans,
    tatkal: buildTatkal(result, ranked),
    guardian: buildGuardian(),
    ranked,
    advice,
  };
}
