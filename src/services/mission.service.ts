// Mission Confirm service — generates three travel strategies (A/B/C),
// a Tatkal strategy and Journey Guardian placeholders.
// Prepared for FastAPI: when VITE_FASTAPI_URL is set the whole payload is
// fetched from `/mission`. Otherwise we derive a deterministic response
// from the existing SearchResult so the UI is always populated.

import { apiFetch, USE_FASTAPI } from "./api-client";
import type {
  AlternateDate,
  AlternateStation,
  SearchQuery,
  SearchResult,
  TicketClass,
  TrainRecommendation,
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
};

// --------- Derivation helpers (fallback when no FastAPI backend) --------- //

type ConfidenceInputs = {
  confirmProbability: number; // 0..100
  convenience: number; // 0..100  (higher = fewer changes / shorter extra travel)
  changes: number; // count
  journeyMinutes: number;
  fare: number;
};

function parseDurationToMinutes(d: string): number {
  const m = /([0-9]+)h\s*([0-9]+)?/i.exec(d);
  if (!m) return 600;
  return Number(m[1]) * 60 + Number(m[2] ?? 0);
}

// Modular AI-confidence formula. Tuned for readability; a FastAPI backend
// can override entirely by returning aiConfidence directly.
export function computeAIConfidence(inp: ConfidenceInputs): number {
  const seat = inp.confirmProbability; // already 0..100
  const convenience = inp.convenience;
  const changesPenalty = Math.min(inp.changes, 3) * 8;
  const timeScore = Math.max(0, 100 - Math.max(0, inp.journeyMinutes - 480) / 6);
  const farePenalty = Math.min(30, Math.max(0, (inp.fare - 1500) / 120));
  const raw =
    seat * 0.4 +
    convenience * 0.25 +
    timeScore * 0.2 +
    (100 - farePenalty) * 0.15 -
    changesPenalty;
  return Math.max(1, Math.min(100, Math.round(raw)));
}

function estimateFare(travelClass: TicketClass, journeyMinutes: number): number {
  const base: Record<TicketClass, number> = {
    SL: 450, "3A": 1150, "2A": 1750, "1A": 2950, CC: 780, EC: 1550,
  };
  return Math.round(base[travelClass] + journeyMinutes * 0.9);
}

function buildPlanA(
  result: SearchResult,
  bestDate: AlternateDate,
): MissionPlan {
  const t = result.best;
  const mins = parseDurationToMinutes(t.duration);
  const fare = estimateFare(t.bestClass, mins);
  const confidence = computeAIConfidence({
    confirmProbability: t.confirmProbability,
    convenience: 92,
    changes: 0,
    journeyMinutes: mins,
    fare,
  });
  return {
    kind: "A",
    title: "Plan A · Best Overall",
    tagline: "Highest confirmation and smoothest journey",
    train: mapTrain(t),
    boardingStation: result.query.source,
    travelClass: t.bestClass,
    journeyDate: bestDate.date,
    confirmProbability: t.confirmProbability,
    aiConfidence: confidence,
    fareEstimate: fare,
    aiExplanation: t.reason,
    pros: {
      advantages: [
        `${t.confirmProbability}% confirm probability in ${t.bestClass}`,
        "Direct boarding at your source station",
        "Best combined score of price, time and comfort",
      ],
      disadvantages: [
        "Peak-demand slot — book as early as possible",
      ],
    },
  };
}

function buildPlanB(
  result: SearchResult,
  altStation: AlternateStation,
  altDate: AlternateDate,
): MissionPlan {
  const t = result.otherTrains[0] ?? result.best;
  const mins = parseDurationToMinutes(t.duration) - 25;
  const fare = estimateFare(t.bestClass, mins);
  const confirm = Math.min(99, t.confirmProbability + 6);
  const confidence = computeAIConfidence({
    confirmProbability: confirm,
    convenience: 74,
    changes: 1,
    journeyMinutes: mins,
    fare,
  });
  return {
    kind: "B",
    title: "Plan B · Fastest Alternative",
    tagline: "Different boarding point, minimal extra travel",
    train: mapTrain(t),
    boardingStation: altStation.name,
    travelClass: t.bestClass,
    journeyDate: altDate.date,
    confirmProbability: confirm,
    aiConfidence: confidence,
    fareEstimate: fare,
    extraTravel: altStation.extraTravel,
    aiExplanation: `Boarding from ${altStation.name} skips the initial congested leg and improves ${t.bestClass} availability.`,
    pros: {
      advantages: [
        `Higher availability at ${altStation.name}`,
        `Only ${altStation.extraTravel} extra travel to reach boarding point`,
        "Typically faster overall arrival window",
      ],
      disadvantages: [
        "Requires local transit to the alternate station",
        "Slightly later booking cut-off",
      ],
    },
  };
}

function buildPlanC(
  result: SearchResult,
  fallbackClass: TicketClass,
): MissionPlan {
  const t = result.otherTrains[1] ?? result.otherTrains[0] ?? result.best;
  const mins = parseDurationToMinutes(t.duration);
  const fare = estimateFare(fallbackClass, mins);
  const confirm = Math.max(35, t.confirmProbability - 12);
  const confidence = computeAIConfidence({
    confirmProbability: confirm,
    convenience: 60,
    changes: 2,
    journeyMinutes: mins + 45,
    fare,
  });
  return {
    kind: "C",
    title: "Plan C · Backup Strategy",
    tagline: "Ready to deploy if Plan A fails to confirm",
    train: mapTrain(t),
    boardingStation: result.query.source,
    travelClass: fallbackClass,
    journeyDate: result.query.date,
    confirmProbability: confirm,
    aiConfidence: confidence,
    fareEstimate: fare,
    aiExplanation: `Switches to ${fallbackClass} on ${t.trainName} — different demand curve, so freed inventory often opens closer to departure.`,
    pros: {
      advantages: [
        `Alternate class (${fallbackClass}) with independent quota`,
        "Different train — insulates against Plan A cancellations",
        "Auto-activates when Plan A drops below 40% confirmation",
      ],
      disadvantages: [
        "Longer journey time",
        "May involve a change of platform or coach position",
      ],
    },
  };
}

function mapTrain(t: TrainRecommendation) {
  return {
    name: t.trainName,
    number: t.trainNumber,
    departure: t.departure,
    arrival: t.arrival,
    duration: t.duration,
  };
}

function pickFallbackClass(current: TicketClass): TicketClass {
  const order: TicketClass[] = ["3A", "SL", "2A", "CC", "EC", "1A"];
  return order.find((c) => c !== current) ?? "SL";
}

function buildTatkal(result: SearchResult): TatkalStrategy {
  const altStation = result.alternateStations[0];
  const best = result.best;
  const probability = Math.max(
    25,
    Math.min(92, Math.round(best.confirmProbability * 0.75 + 10)),
  );
  const tatkalClass: TicketClass = best.bestClass === "SL" ? "SL" : "3A";
  return {
    successProbability: probability,
    bestBoardingStation: altStation ? altStation.name : result.query.source,
    bestClass: tatkalClass,
    openingWindow: tatkalClass === "SL" ? "11:00 IST (T-1)" : "10:00 IST (T-1)",
    advice: [
      "Log in 3–4 minutes before the Tatkal window opens",
      `Prefill passenger master list for ${tatkalClass}`,
      "Use a saved payment method — UPI collect adds 20–30s",
      altStation
        ? `If Plan A stalls, retry from ${altStation.name} — separate quota often clears faster`
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
  if (USE_FASTAPI) {
    return apiFetch<MissionConfirmResult>("/mission", {
      method: "POST",
      body: JSON.stringify({ query, best: result.best }),
    });
  }

  const bestDate =
    result.alternateDates.find((d) => d.status.tone === "success") ??
    result.alternateDates[0];
  const altStation = result.alternateStations[0];
  const altDate =
    result.alternateDates.find(
      (d) => d.status.tone !== "danger" && d.date !== result.query.date,
    ) ?? result.alternateDates[1] ?? bestDate;

  const planA = buildPlanA(result, bestDate);
  const planB = buildPlanB(result, altStation, altDate);
  const planC = buildPlanC(result, pickFallbackClass(result.best.bestClass));

  return {
    query,
    plans: [planA, planB, planC],
    tatkal: buildTatkal(result),
    guardian: buildGuardian(),
  };
}
