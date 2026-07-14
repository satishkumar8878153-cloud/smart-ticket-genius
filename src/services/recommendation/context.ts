// Journey context — deterministic derivations from the SearchQuery/date.
// Provides booking window, weekday, weekend, vacation flags, and route id
// helpers used by every intelligence module. No randomness, no I/O.

import type { SearchQuery, TicketClass } from "../types";

export type JourneyContext = {
  journeyDate: Date;
  bookingDate: Date;
  bookingWindowDays: number; // days between today (00:00) and journey (00:00)
  weekday: number;           // 0 = Sunday .. 6 = Saturday
  isWeekend: boolean;
  isMonthEnd: boolean;       // last 3 days of the month (salary + travel spike)
  isMonthStart: boolean;     // first 3 days (return travel spike)
  isSummerVacation: boolean; // May 1 – Jun 30
  isWinterVacation: boolean; // Dec 20 – Jan 5
  routeId: string;           // canonical "SRC->DST"
  travelClass: TicketClass;
};

export function parseJourneyDate(iso: string): Date {
  // Treat as local calendar date to avoid timezone drift on the day-of-week.
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function buildJourneyContext(
  query: SearchQuery,
  now: Date = new Date(),
): JourneyContext {
  const journey = parseJourneyDate(query.date);
  const booking = startOfDay(now);
  const bookingWindowDays = Math.round(
    (journey.getTime() - booking.getTime()) / 86_400_000,
  );
  const weekday = journey.getDay();
  const day = journey.getDate();
  const month = journey.getMonth(); // 0-indexed

  const daysInMonth = new Date(
    journey.getFullYear(),
    month + 1,
    0,
  ).getDate();

  const isSummerVacation = month === 4 || month === 5; // May / June
  const isWinterVacation =
    (month === 11 && day >= 20) || (month === 0 && day <= 5);

  return {
    journeyDate: journey,
    bookingDate: booking,
    bookingWindowDays,
    weekday,
    isWeekend: weekday === 0 || weekday === 6 || weekday === 5, // Fri+Sat+Sun
    isMonthEnd: day >= daysInMonth - 2,
    isMonthStart: day <= 3,
    isSummerVacation,
    isWinterVacation,
    routeId: `${query.source.trim().toUpperCase()}->${query.destination.trim().toUpperCase()}`,
    travelClass: query.travelClass,
  };
}

export function clamp(v: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, v));
}
