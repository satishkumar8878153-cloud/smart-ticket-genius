// Alternate Date Intelligence — ranks the enumerated dates in the pool for a
// given train and class, and returns three actionable picks:
//   • Best Date    — highest confirmation × lowest waitlist risk
//   • Safer Date   — lowest demand pressure among the top confirm candidates
//   • Cheapest Date — lowest fare among the top confirm candidates

import { clamp, parseJourneyDate, type JourneyContext } from "../context";
import type { TravelOption } from "../types";
import type { DemandIndex } from "./demand";
import { detectExams } from "./exams";
import { detectFestivals } from "./festivals";

export type DatePick = {
  date: string;
  fare: number;
  confirmProbability: number;
  waitlistRisk: number;
  demandScore: number;
  reason: string;
};

export type DateIntelligence = {
  best: DatePick | null;
  safer: DatePick | null;
  cheapest: DatePick | null;
  ranked: DatePick[];
};

function demandForDate(dateISO: string): number {
  // Reuse festival + exam calendars for a lightweight per-date demand proxy
  // (weekday & booking window are handled at the option level).
  const f = detectFestivals(dateISO);
  const e = detectExams(dateISO);
  const day = parseJourneyDate(dateISO).getDay();
  const weekday = day === 0 || day === 5 || day === 6 ? 20 : 0;
  return clamp(f.demandBoost * 0.5 + e.demandBoost * 0.3 + weekday);
}

function scoreConfirm(o: TravelOption): number {
  return clamp(
    o.signals.confirmProbability * 0.7 +
      (100 - o.signals.waitingListRisk) * 0.3,
  );
}

export function rankAlternateDates(
  ctx: JourneyContext,
  pool: TravelOption[],
): DateIntelligence {
  const same = pool.filter(
    (o) => o.travelClass === ctx.travelClass,
  );

  // De-duplicate by date, keeping the highest-confirm option per date.
  const byDate = new Map<string, TravelOption>();
  for (const o of same) {
    const prev = byDate.get(o.journeyDate);
    if (!prev || scoreConfirm(o) > scoreConfirm(prev)) byDate.set(o.journeyDate, o);
  }

  const picks: DatePick[] = Array.from(byDate.values()).map((o) => {
    const demand = demandForDate(o.journeyDate);
    return {
      date: o.journeyDate,
      fare: o.fareEstimate,
      confirmProbability: o.signals.confirmProbability,
      waitlistRisk: o.signals.waitingListRisk,
      demandScore: demand,
      reason: "",
    };
  });

  if (picks.length === 0) {
    return { best: null, safer: null, cheapest: null, ranked: [] };
  }

  const rankedByConfirm = [...picks].sort(
    (a, b) => b.confirmProbability - a.confirmProbability,
  );
  const topSlice = rankedByConfirm.slice(0, Math.min(5, rankedByConfirm.length));

  const best = { ...rankedByConfirm[0] };
  best.reason = `Highest confirmation odds (${best.confirmProbability}%) with waitlist risk ${best.waitlistRisk}.`;

  const saferSrc = [...topSlice].sort((a, b) => a.demandScore - b.demandScore)[0];
  const safer = { ...saferSrc };
  safer.reason = `Lowest demand pressure (${safer.demandScore}/100) in the top-confirm window.`;

  const cheapestSrc = [...topSlice].sort((a, b) => a.fare - b.fare)[0];
  const cheapest = { ...cheapestSrc };
  cheapest.reason = `Lowest fare (₹${cheapest.fare}) while keeping healthy confirm odds.`;

  return { best, safer, cheapest, ranked: rankedByConfirm };
}
