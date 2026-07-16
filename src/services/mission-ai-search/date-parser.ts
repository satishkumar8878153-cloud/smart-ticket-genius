// Date Parser — natural language dates for the Mission AI Search layer.
// Deterministic and dependency-free; reuses dictionaries from mission-ai.

import { MONTHS, RELATIVE_DAYS } from "../mission-ai/dictionaries";
import type { DateParser } from "./types";

const WEEKDAYS: Record<string, number> = {
  sun: 0, sunday: 0,
  mon: 1, monday: 1,
  tue: 2, tues: 2, tuesday: 2,
  wed: 3, wednesday: 3,
  thu: 4, thur: 4, thurs: 4, thursday: 4,
  fri: 5, friday: 5,
  sat: 6, saturday: 6,
};

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function nextWeekday(now: Date, target: number, nextExplicit: boolean): Date {
  const d = new Date(now);
  const diff = (target - d.getDay() + 7) % 7;
  const add = diff === 0 ? 7 : diff;
  d.setDate(d.getDate() + (nextExplicit && diff === 0 ? 7 : add));
  return d;
}

export class DefaultDateParser implements DateParser {
  readonly id = "default-date-parser";

  parse(text: string, now: Date = new Date()): string | null {
    // 1) Relative day tokens ("today", "kal", "day after tomorrow").
    for (const [token, offset] of Object.entries(RELATIVE_DAYS)) {
      const re = new RegExp(`(^|\\s)${token}(\\s|$)`);
      if (re.test(text)) {
        const d = new Date(now);
        d.setDate(d.getDate() + offset);
        return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
      }
    }

    // 2) "next friday" / "friday"
    const nextWd = new RegExp(
      `\\bnext\\s+(${Object.keys(WEEKDAYS).join("|")})\\b`,
    ).exec(text);
    if (nextWd) {
      const d = nextWeekday(now, WEEKDAYS[nextWd[1]], true);
      return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }
    const wd = new RegExp(
      `\\b(?:on\\s+)?(${Object.keys(WEEKDAYS).join("|")})\\b`,
    ).exec(text);
    if (wd) {
      const d = nextWeekday(now, WEEKDAYS[wd[1]], false);
      return toISO(d.getFullYear(), d.getMonth() + 1, d.getDate());
    }

    // 3) ISO YYYY-MM-DD
    const iso = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/.exec(text);
    if (iso) return toISO(Number(iso[1]), Number(iso[2]), Number(iso[3]));

    // 4) DD/MM(/YYYY) or DD-MM(-YYYY)
    const dmy = /\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/.exec(text);
    if (dmy) {
      const d = Number(dmy[1]);
      const m = Number(dmy[2]);
      let y = dmy[3] ? Number(dmy[3]) : now.getFullYear();
      if (y < 100) y += 2000;
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return toISO(y, m, d);
    }

    // 5) "15 August" / "15 aug 2026" / "aug 15"
    const monthAlt = Object.keys(MONTHS).join("|");
    const dayMonth = new RegExp(
      `\\b(\\d{1,2})\\s+(${monthAlt})\\b(?:\\s+(\\d{4}))?`,
    ).exec(text);
    const monthDay = new RegExp(
      `\\b(${monthAlt})\\s+(\\d{1,2})\\b(?:\\s+(\\d{4}))?`,
    ).exec(text);

    let day: number | null = null;
    let month: number | null = null;
    let year: number | null = null;
    if (dayMonth) {
      day = Number(dayMonth[1]);
      month = MONTHS[dayMonth[2]];
      year = dayMonth[3] ? Number(dayMonth[3]) : null;
    } else if (monthDay) {
      month = MONTHS[monthDay[1]];
      day = Number(monthDay[2]);
      year = monthDay[3] ? Number(monthDay[3]) : null;
    }

    if (day !== null && month !== null) {
      const y = year ?? now.getFullYear();
      const resolved = new Date(y, month - 1, day);
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (!year && resolved.getTime() < today.getTime()) {
        return toISO(y + 1, month, day);
      }
      return toISO(y, month, day);
    }

    return null;
  }
}

export const defaultDateParser = new DefaultDateParser();
