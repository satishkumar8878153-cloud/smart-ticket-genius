// Exam Season Engine — detects major recurring Indian exam windows and
// returns a normalized demand boost driven by student travel.
// Windows are curated approximate month ranges (Notification/Exam/Result
// windows published annually). A FastAPI backend can override via
// /intelligence/exams.

import { clamp } from "../context";

export type ExamHit = {
  name: string;
  reason: "exam-day" | "reporting" | "result-travel";
  daysAway: number;
  intensity: number;
};

export type ExamSignal = {
  hits: ExamHit[];
  demandBoost: number;
  peakName: string | null;
};

type Window = {
  name: string;
  reason: ExamHit["reason"];
  // Repeats every year. month is 1-indexed for readability; converted below.
  from: { month: number; day: number };
  to: { month: number; day: number };
  weight: number;
};

// Typical recurring windows (public examination calendars). Covers the peak
// student-travel days; keep additive and non-overlapping where possible.
const WINDOWS: Window[] = [
  // UPSC Prelims typically end of May / early June
  { name: "UPSC Prelims", reason: "exam-day", from: { month: 5, day: 25 }, to: { month: 6, day: 5 }, weight: 70 },
  // UPSC Mains window in September
  { name: "UPSC Mains", reason: "exam-day", from: { month: 9, day: 15 }, to: { month: 9, day: 30 }, weight: 60 },
  // SSC CGL / CHSL peaks
  { name: "SSC CGL", reason: "exam-day", from: { month: 7, day: 1 }, to: { month: 7, day: 20 }, weight: 65 },
  { name: "SSC CHSL", reason: "exam-day", from: { month: 6, day: 20 }, to: { month: 7, day: 10 }, weight: 55 },
  // Railway RRB windows (multiple; use the common CBT band)
  { name: "RRB NTPC/Group D", reason: "exam-day", from: { month: 8, day: 20 }, to: { month: 9, day: 15 }, weight: 75 },
  // NEET UG — first Sunday of May
  { name: "NEET UG", reason: "exam-day", from: { month: 5, day: 1 }, to: { month: 5, day: 10 }, weight: 85 },
  // JEE Main sessions (Jan and Apr)
  { name: "JEE Main (Jan)", reason: "exam-day", from: { month: 1, day: 20 }, to: { month: 2, day: 5 }, weight: 70 },
  { name: "JEE Main (Apr)", reason: "exam-day", from: { month: 4, day: 1 }, to: { month: 4, day: 15 }, weight: 70 },
  // JEE Advanced typically late May
  { name: "JEE Advanced", reason: "exam-day", from: { month: 5, day: 22 }, to: { month: 5, day: 30 }, weight: 60 },
  // CUET UG multi-week window
  { name: "CUET UG", reason: "exam-day", from: { month: 5, day: 15 }, to: { month: 6, day: 15 }, weight: 65 },
  // College reporting rush after JEE/NEET counselling
  { name: "College reporting", reason: "reporting", from: { month: 7, day: 15 }, to: { month: 8, day: 15 }, weight: 55 },
  // Board results → home travel
  { name: "Board results", reason: "result-travel", from: { month: 5, day: 5 }, to: { month: 5, day: 25 }, weight: 45 },
];

function inWindow(journey: Date, w: Window): number {
  const y = journey.getFullYear();
  const from = new Date(y, w.from.month - 1, w.from.day);
  const to = new Date(y, w.to.month - 1, w.to.day);
  const jt = journey.getTime();
  if (jt < from.getTime() || jt > to.getTime()) return 0;
  // Peak at window midpoint, gentle taper at edges (never below 60%).
  const mid = (from.getTime() + to.getTime()) / 2;
  const half = (to.getTime() - from.getTime()) / 2 || 1;
  const distance = Math.abs(jt - mid) / half; // 0 at mid, 1 at edge
  return 1 - distance * 0.4;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

export function detectExams(journeyISO: string): ExamSignal {
  const [y, m, d] = journeyISO.split("-").map(Number);
  const journey = new Date(y, (m ?? 1) - 1, d ?? 1);

  const hits: ExamHit[] = [];
  for (const w of WINDOWS) {
    const factor = inWindow(journey, w);
    if (factor <= 0) continue;
    const midpoint = new Date(
      journey.getFullYear(),
      Math.round((w.from.month + w.to.month) / 2) - 1,
      Math.round((w.from.day + w.to.day) / 2),
    );
    hits.push({
      name: w.name,
      reason: w.reason,
      daysAway: daysBetween(midpoint, journey),
      intensity: Math.round(w.weight * factor),
    });
  }
  hits.sort((a, b) => b.intensity - a.intensity);

  const combined = hits.reduce(
    (acc, h) => acc + h.intensity * (1 - acc / 100) * 0.85,
    0,
  );

  return {
    hits,
    demandBoost: clamp(Math.round(combined)),
    peakName: hits[0]?.name ?? null,
  };
}
