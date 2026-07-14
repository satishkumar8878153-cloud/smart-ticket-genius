// Festival Intelligence — detects major Indian festivals near the journey
// date and returns a normalized demand boost. Dates are curated (real
// calendar dates), not random. Extend the CALENDAR map as future years are
// scheduled; a FastAPI backend can override via /intelligence/festivals.

import { clamp } from "../context";

export type FestivalHit = {
  name: string;
  date: string;         // ISO date of the festival peak
  daysAway: number;     // signed: negative = past, positive = upcoming
  intensity: number;    // 0..100 — how strong the demand pull is on this date
  window: number;       // radius in days where the demand pull applies
};

export type FestivalSignal = {
  hits: FestivalHit[];
  demandBoost: number;  // 0..100 additive demand pressure
  peakName: string | null;
};

// Curated peak dates. Sources: DoPT / IRCTC seasonal calendars. Kept concise;
// add years as the app rolls forward.
type Entry = { name: string; date: string; window: number; weight: number };

const CALENDAR: Entry[] = [
  // 2025
  { name: "Holi", date: "2025-03-14", window: 5, weight: 90 },
  { name: "Eid al-Fitr", date: "2025-03-31", window: 4, weight: 75 },
  { name: "Eid al-Adha", date: "2025-06-07", window: 3, weight: 60 },
  { name: "Durga Puja", date: "2025-10-02", window: 6, weight: 92 },
  { name: "Diwali", date: "2025-10-21", window: 7, weight: 100 },
  { name: "Chhath Puja", date: "2025-10-28", window: 6, weight: 98 },
  { name: "Christmas", date: "2025-12-25", window: 5, weight: 70 },
  { name: "New Year", date: "2026-01-01", window: 4, weight: 65 },
  // 2026
  { name: "Holi", date: "2026-03-04", window: 5, weight: 90 },
  { name: "Eid al-Fitr", date: "2026-03-20", window: 4, weight: 75 },
  { name: "Eid al-Adha", date: "2026-05-27", window: 3, weight: 60 },
  { name: "Durga Puja", date: "2026-10-20", window: 6, weight: 92 },
  { name: "Diwali", date: "2026-11-08", window: 7, weight: 100 },
  { name: "Chhath Puja", date: "2026-11-15", window: 6, weight: 98 },
  { name: "Christmas", date: "2026-12-25", window: 5, weight: 70 },
  { name: "New Year", date: "2027-01-01", window: 4, weight: 65 },
  // 2027
  { name: "Holi", date: "2027-03-22", window: 5, weight: 90 },
  { name: "Eid al-Fitr", date: "2027-03-10", window: 4, weight: 75 },
  { name: "Durga Puja", date: "2027-10-09", window: 6, weight: 92 },
  { name: "Diwali", date: "2027-10-29", window: 7, weight: 100 },
  { name: "Chhath Puja", date: "2027-11-05", window: 6, weight: 98 },
  { name: "Christmas", date: "2027-12-25", window: 5, weight: 70 },
];

function toDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

// Triangular decay: peak at date, 0 at ±window days.
function proximityFactor(daysAway: number, window: number): number {
  const abs = Math.abs(daysAway);
  if (abs > window) return 0;
  return 1 - abs / (window + 1);
}

export function detectFestivals(journeyISO: string): FestivalSignal {
  const journey = toDate(journeyISO);
  const hits: FestivalHit[] = [];

  for (const entry of CALENDAR) {
    const d = toDate(entry.date);
    const daysAway = Math.round(
      (d.getTime() - journey.getTime()) / 86_400_000,
    );
    const factor = proximityFactor(daysAway, entry.window);
    if (factor <= 0) continue;
    hits.push({
      name: entry.name,
      date: entry.date,
      daysAway,
      intensity: Math.round(entry.weight * factor),
      window: entry.window,
    });
  }

  hits.sort((a, b) => b.intensity - a.intensity);

  // Combine intensities with diminishing returns so overlapping festivals
  // don't push demand past 100.
  const combined = hits.reduce(
    (acc, h) => acc + h.intensity * (1 - acc / 100) * 0.9,
    0,
  );

  return {
    hits,
    demandBoost: clamp(Math.round(combined)),
    peakName: hits[0]?.name ?? null,
  };
}
