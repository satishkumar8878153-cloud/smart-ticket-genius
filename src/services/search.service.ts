import { supabase } from "@/integrations/supabase/client";
import { apiFetch, USE_FASTAPI, ApiError } from "./api-client";
import type {
  AlternateDate,
  AlternateStation,
  ClassAvailability,
  SearchQuery,
  SearchResult,
  SeatStatus,
  TicketClass,
  TrainRecommendation,
  TrainRow,
} from "./types";

// ------ Availability placeholders (NO live inventory).
// Production SearchForm / Mission AI use POST /smart-search only.
// This module must never invent AVL/RAC/WL numbers.

const CLASS_CODES: TicketClass[] = ["SL", "3A", "2A", "1A", "CC", "EC"];

function seed(str: string) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Live seat inventory is NOT connected. Never synthesise AVL/RAC/WL for production UI.
const STATUS = {
  /** Neutral placeholder — not live railway availability. */
  unknown: (): SeatStatus => ({ label: "Timetable only", tone: "muted" }),
  na: (): SeatStatus => ({ label: "—", tone: "muted" }),
};

function safeStatus(_r?: () => number, _bias = 0): SeatStatus {
  return STATUS.unknown();
}

function buildAvailability(_r?: () => number, _bias = 0): ClassAvailability {
  const out = {} as ClassAvailability;
  CLASS_CODES.forEach((c) => {
    out[c] = STATUS.unknown();
  });
  return out;
}

/** Build the set of lowercase tokens (code / name / city) that identify a station. */
function stationTokens(value: string, stations: { code: string; name: string; city: string | null }[]) {
  const v = value.trim().toLowerCase();
  const tokens = new Set<string>();
  if (v) tokens.add(v);
  for (const s of stations) {
    const fields = [s.code ?? "", s.name ?? "", s.city ?? ""]
      .map((f) => String(f).toLowerCase())
      .filter(Boolean);
    if (v && fields.some((f) => f === v || f.includes(v) || v.includes(f))) {
      fields.forEach((f) => tokens.add(f));
    }
  }
  return tokens;
}

function tokenMatches(code: string, tokens: Set<string>) {
  const c = String(code ?? "").toLowerCase();
  if (!c) return false;
  for (const t of tokens) {
    if (t === c || t.includes(c) || c.includes(t)) return true;
  }
  return false;
}

export async function fetchTrainsForRoute(source: string, destination: string): Promise<TrainRow[]> {
  const [{ data, error }, stationRes] = await Promise.all([
    supabase
      .from("trains")
      .select(
        "train_number, train_name, source_code, destination_code, departure_time, arrival_time, duration",
      ),
    supabase.from("stations").select("code, name, city"),
  ]);
  if (error) throw new ApiError(error.message);
  const rows = (data ?? []) as TrainRow[];
  const stations = (stationRes.data ?? []) as { code: string; name: string; city: string | null }[];

  const srcTokens = stationTokens(source, stations);
  const dstTokens = stationTokens(destination, stations);

  const exact = rows.filter(
    (t) => tokenMatches(t.source_code, srcTokens) && tokenMatches(t.destination_code, dstTokens),
  );
  if (exact.length > 0) return exact;

  const partial = rows.filter((t) => tokenMatches(t.source_code, srcTokens));
  return partial;
}

async function logSearch(query: SearchQuery) {
  try {
    await supabase.from("search_history").insert({
      source: query.source,
      destination: query.destination,
      journey_date: query.date,
      travel_class: query.travelClass,
    });
  } catch {
    /* non-critical */
  }
}

export async function searchTrains(query: SearchQuery): Promise<SearchResult> {
  if (USE_FASTAPI) {
    try {
      const result = await apiFetch<SearchResult>("/search", {
        method: "POST",
        body: JSON.stringify(query),
      });
      void logSearch(query);
      return result;
    } catch (err) {
      console.warn("FastAPI /search unavailable, falling back to database", err);
    }
  }

  const trainRows = await fetchTrainsForRoute(query.source, query.destination);
  if (trainRows.length === 0) {
    throw new ApiError("No trains found for this route yet. Try nearby major stations.", 404);
  }

  const r = seed(
    `${query.source}-${query.destination}-${query.date}-${query.travelClass}`,
  );

  const trains: TrainRecommendation[] = trainRows.map((t, i) => {
    const confirm = 0;
    const score = Math.max(0, 70 - i * 3);
    return {
      trainName: t.train_name,
      trainNumber: t.train_number,
      departure: t.departure_time,
      arrival: t.arrival_time,
      duration: t.duration,
      confirmProbability: confirm,
      recommendationScore: score,
      bestClass: query.travelClass,
      reason:
        i === 0
          ? `Timetable option in ${query.travelClass}. Live seat availability is not connected.`
          : `Additional timetable option on ${query.source} → ${query.destination}. Not live availability.`,
      availability: buildAvailability(r, i === 0 ? -0.15 : 0),
    };
  });

  trains.sort(
    (a, b) =>
      b.recommendationScore * 0.6 +
      b.confirmProbability * 0.4 -
      (a.recommendationScore * 0.6 + a.confirmProbability * 0.4),
  );

  const [best, ...rest] = trains;

  const stationNames = ["Central Jn", "Cantt", "City Jn", "Terminus"];
  const alternateStations: AlternateStation[] = stationNames.map((n, i) => ({
    code: `${query.source.slice(0, 3).toUpperCase()}${i + 1}`,
    name: `${query.source} ${n}`,
    distanceKm: Math.round(8 + r() * 55),
    extraTravel: `${Math.round(15 + r() * 40)} min`,
    availability: safeStatus(r, -0.2),
  }));

  const today = new Date(query.date || Date.now());
  const alternateDates: AlternateDate[] = Array.from({ length: 7 }).map((_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return {
      date: d.toISOString().slice(0, 10),
      weekday: d.toLocaleDateString(undefined, { weekday: "short" }),
      status: safeStatus(r, i === 0 ? 0.1 : -0.1),
      fare: Math.round(950 + r() * 2400),
    };
  });

  const aiInsights = [
    `Showing timetable options only — live seat availability is not connected.`,
    `Use official IRCTC to check current availability for ${query.travelClass}.`,
    `Operating day for the selected date is not verified in this prototype.`,
  ];

  void logSearch(query);

  return {
    query,
    best,
    otherTrains: rest,
    alternateStations,
    alternateDates,
    aiInsights,
  };
}
