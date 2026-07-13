// Demand Engine — estimates travel demand from calendar signals.
// Deterministic, no random values. Pluggable via IDemandEngine.

import { DEMAND_LEVEL_THRESHOLDS, DEMAND_WEIGHTS } from "./config";
import type {
  DemandContext,
  DemandLevel,
  DemandSignal,
  IDemandEngine,
} from "./types";
import { clamp, parseDate } from "./utils";

// Indian public holiday & festival windows (approximate, month/day-based).
// Kept as data — a FastAPI backend can override with a live calendar service.
const FESTIVAL_WINDOWS: Array<{ from: [number, number]; to: [number, number]; name: string }> = [
  { from: [10, 20], to: [11, 15], name: "Diwali window" },
  { from: [3, 25], to: [4, 5], name: "Holi window" },
  { from: [8, 10], to: [8, 20], name: "Independence Day" },
  { from: [12, 20], to: [1, 5], name: "Christmas / New Year" },
  { from: [9, 20], to: [10, 15], name: "Navratri / Dussehra" },
];

const VACATION_WINDOWS: Array<{ from: [number, number]; to: [number, number]; kind: string }> = [
  { from: [5, 1],  to: [6, 30], kind: "Summer vacation" },
  { from: [12, 15], to: [1, 10], kind: "Winter vacation" },
];

const EXAM_WINDOWS: Array<{ from: [number, number]; to: [number, number] }> = [
  { from: [2, 15], to: [3, 31] }, // Board exam season
  { from: [11, 15], to: [12, 15] }, // Semester exams
];

function inWindow(m: number, d: number, from: [number, number], to: [number, number]): boolean {
  const a = from[0] * 100 + from[1];
  const b = to[0] * 100 + to[1];
  const x = m * 100 + d;
  return a <= b ? x >= a && x <= b : x >= a || x <= b;
}

export class DefaultDemandEngine implements IDemandEngine {
  estimate(ctx: DemandContext): DemandSignal {
    const date = parseDate(ctx.journeyDate);
    const dow = date.getUTCDay(); // 0 Sun .. 6 Sat
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate();
    const reasons: string[] = [];
    let score = DEMAND_WEIGHTS.baseline;

    if (dow === 0 || dow === 6) {
      score += DEMAND_WEIGHTS.weekend;
      reasons.push("Weekend travel");
    }
    if (dow === 5) {
      score += DEMAND_WEIGHTS.friday;
      reasons.push("Friday outbound rush");
    }
    if (dow === 1) {
      score += DEMAND_WEIGHTS.monday;
      reasons.push("Monday return rush");
    }

    for (const w of FESTIVAL_WINDOWS) {
      if (inWindow(m, d, w.from, w.to)) {
        score += DEMAND_WEIGHTS.festival;
        reasons.push(w.name);
        break;
      }
    }
    for (const w of VACATION_WINDOWS) {
      if (inWindow(m, d, w.from, w.to)) {
        score += DEMAND_WEIGHTS.vacation;
        reasons.push(`${w.kind} period`);
        break;
      }
    }
    for (const w of EXAM_WINDOWS) {
      if (inWindow(m, d, w.from, w.to)) {
        score += DEMAND_WEIGHTS.exam;
        reasons.push("Exam season travel");
        break;
      }
    }

    // Long weekend: Fri+Sat+Sun or Sat+Sun+Mon.
    if (dow === 5 || dow === 1) {
      score += DEMAND_WEIGHTS.longWeekend / 2;
      reasons.push("Adjacent to long weekend");
    }

    // Month-end special rush (salary week travel).
    if (d >= 28 || d <= 3) {
      score += DEMAND_WEIGHTS.specialRush / 2;
      reasons.push("Month-end travel spike");
    }

    const final = clamp(Math.round(score));
    return { score: final, level: this.levelOf(final), reasons };
  }

  private levelOf(score: number): DemandLevel {
    const t = DEMAND_LEVEL_THRESHOLDS;
    if (score < t.veryLow) return "very-low";
    if (score < t.low) return "low";
    if (score < t.medium) return "medium";
    if (score < t.high) return "high";
    return "extreme";
  }
}
