export const API_BASE = "https://smart-ticket-genius.onrender.com";

export type StationMatch = {
  code: string;
  name?: string | null;
  city?: string | null;
};

export type RouteStop = {
  code: string;
  name?: string | null;
  departure?: string | null;
  arrival?: string | null;
  day_offset?: number | null;
};

export type ClassChip = {
  label: string;
  tone: "success" | "warning" | "danger" | string;
};

export type RouteTrain = {
  train_number: string;
  train_name?: string | null;
  board: RouteStop;
  alight: RouteStop;
  stops_between?: number;
  duration_minutes?: number | null;
  day_offset?: number | null;
  classes?: Record<string, ClassChip>;
  requested_class?: {
    class?: string;
    score?: number | null;
    reason?: string;
  };
  has_nearby?: boolean;
  note?: string;
  /** Smart Search category: direct | nearby_origin | nearby_destination | hub_* */
  category?: string | null;
  why?: string | null;
  alternative_source?: string | null;
  label?: string | null;
};

export type RouteRecommendation = {
  train_number?: string;
  train_name?: string | null;
  board?: RouteStop;
  alight?: RouteStop;
  duration_minutes?: number | null;
  score?: number;
  reason?: string;
  why?: string;
  category?: string | null;
  label?: string | null;
  requested_class?: {
    class?: string;
    score?: number | null;
    reason?: string;
  };
};

export type SmartSearchSummary = {
  origin_primary?: string[];
  destination_primary?: string[];
  origin_hubs_used?: string[];
  destination_hubs_used?: string[];
  station_codes_loaded?: number;
  trains_indexed?: number;
  direct_count?: number;
  alternative_count?: number;
  latency_ms?: number;
  note?: string;
  error?: string;
};

export type RouteSearchResponse = {
  source_query?: string;
  destination_query?: string;
  trains: RouteTrain[];
  direct_trains?: RouteTrain[];
  nearby_options?: RouteTrain[];
  recommendation?: RouteRecommendation | null;
  suggestions?: string[];
  tracked_trains_count?: number;
  /** Present when response came from POST /smart-search */
  search_summary?: SmartSearchSummary | null;
  resolved?: {
    origin?: {
      query?: string;
      cluster_key?: string | null;
      primary?: string[];
      hubs?: string[];
      is_code?: boolean;
    };
    destination?: {
      query?: string;
      cluster_key?: string | null;
      primary?: string[];
      hubs?: string[];
      is_code?: boolean;
    };
  } | null;
  engine?: "smart-search" | "route-search";
};

export type ChatResponse = {
  reply: string;
  /** Preferred key from /chat */
  route?: RouteSearchResponse | null;
  /** Legacy alias */
  result?: RouteSearchResponse | null;
};

export async function resolveStations(q: string): Promise<StationMatch[]> {
  const query = (q || "").trim();
  if (!query) return [];
  const url = `${API_BASE}/stations/resolve?q=${encodeURIComponent(query)}&limit=6`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Station resolve failed (${res.status})`);
  }
  const json = await res.json();
  return (json.matches || []) as StationMatch[];
}

export async function routeSearch(payload: {
  source: string;
  destination: string;
  date?: string;
  travelClass?: string;
}): Promise<RouteSearchResponse> {
  const res = await fetch(`${API_BASE}/route-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = `Route search failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.detail) detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return (await res.json()) as RouteSearchResponse;
}

/** Normalize POST /smart-search payload into the UI RouteSearchResponse shape. */
export function normalizeSmartSearch(raw: Record<string, unknown>): RouteSearchResponse {
  const direct = (Array.isArray(raw.direct_options) ? raw.direct_options : []) as RouteTrain[];
  const alt = (Array.isArray(raw.alternative_options) ? raw.alternative_options : []) as RouteTrain[];
  const summary = (raw.search_summary || null) as SmartSearchSummary | null;
  const recRaw = (raw.recommendation || null) as RouteRecommendation | null;
  const request = (raw.request || {}) as Record<string, string>;
  const resolved = (raw.resolved || null) as RouteSearchResponse["resolved"];

  const tag = (t: RouteTrain): RouteTrain => ({
    ...t,
    category: t.category || "direct",
    has_nearby: t.category ? t.category !== "direct" : !!t.has_nearby,
  });

  const directTagged = direct.map(tag);
  const altTagged = alt.map(tag);
  const all = [...directTagged, ...altTagged];

  let recommendation: RouteRecommendation | null = null;
  if (recRaw && (recRaw.train_number || recRaw.why || recRaw.reason)) {
    recommendation = {
      train_number: recRaw.train_number,
      train_name: recRaw.train_name,
      board: recRaw.board,
      alight: recRaw.alight,
      duration_minutes: recRaw.duration_minutes,
      score: recRaw.score,
      reason: recRaw.why || recRaw.reason,
      why: recRaw.why || recRaw.reason,
      category: recRaw.category,
      label: recRaw.label || "Best timetable option",
      requested_class: recRaw.requested_class,
    };
  }

  return {
    source_query: request.from || resolved?.origin?.query,
    destination_query: request.to || resolved?.destination?.query,
    trains: all,
    direct_trains: directTagged,
    nearby_options: altTagged,
    recommendation,
    suggestions: Array.isArray(raw.suggestions) ? (raw.suggestions as string[]) : undefined,
    search_summary: summary,
    resolved,
    engine: "smart-search",
  };
}

export async function smartSearch(payload: {
  from: string;
  to: string;
  journey_date?: string;
  class_code?: string;
}): Promise<RouteSearchResponse> {
  const res = await fetch(`${API_BASE}/smart-search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      from: payload.from,
      to: payload.to,
      journey_date: payload.journey_date,
      class_code: payload.class_code || "SL",
    }),
  });
  if (!res.ok) {
    let detail = `Smart search failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.detail) detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const raw = (await res.json()) as Record<string, unknown>;
  return normalizeSmartSearch(raw);
}

/** Lightweight NL parse for Mission AI → smart-search (frontend only). */
export function parseJourneyMessage(message: string): {
  from?: string;
  to?: string;
  journey_date?: string;
  class_code?: string;
} | null {
  const text = (message || "").trim();
  if (!text) return null;
  const m = text.match(
    /^(.+?)\s+(?:to|→|->)\s+(.+?)(?:\s+(?:on\s+)?(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|\d{4}-\d{2}-\d{2}|tomorrow|today))?(?:\s+(?:in\s+)?(SL|3A|2A|1A|CC|EC|3AC|2AC|1AC|sleeper))?\s*$/i,
  );
  if (!m) return null;
  let from = m[1].trim();
  let to = m[2].trim();
  to = to.replace(/\s+(in\s+)?(SL|3A|2A|1A|CC|EC|3AC|2AC|1AC|sleeper)\s*$/i, "").trim();
  let journey_date: string | undefined;
  const rawDate = m[3]?.trim();
  if (rawDate) {
    const lower = rawDate.toLowerCase();
    const today = new Date();
    if (lower === "today") {
      journey_date = today.toISOString().slice(0, 10);
    } else if (lower === "tomorrow") {
      const t = new Date(today);
      t.setDate(t.getDate() + 1);
      journey_date = t.toISOString().slice(0, 10);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      journey_date = rawDate;
    } else {
      const parts = rawDate.split(/[\/\-]/);
      if (parts.length >= 2) {
        const d = parts[0].padStart(2, "0");
        const mo = parts[1].padStart(2, "0");
        const y = parts[2]
          ? parts[2].length === 2
            ? `20${parts[2]}`
            : parts[2]
          : String(today.getFullYear());
        journey_date = `${y}-${mo}-${d}`;
      }
    }
  }
  let class_code = m[4]?.toUpperCase();
  if (class_code === "3AC") class_code = "3A";
  if (class_code === "2AC") class_code = "2A";
  if (class_code === "1AC") class_code = "1A";
  if (class_code === "SLEEPER") class_code = "SL";
  if (!class_code) {
    const cm = text.match(/\b(SL|3A|2A|1A|CC|EC|3AC|2AC|1AC)\b/i);
    if (cm) {
      class_code = cm[1]
        .toUpperCase()
        .replace("3AC", "3A")
        .replace("2AC", "2A")
        .replace("1AC", "1A");
    }
  }
  if (!from || !to) return null;
  return { from, to, journey_date, class_code };
}

export async function askMission(message: string): Promise<ChatResponse> {
  const res = await fetch(`${API_BASE}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) {
    let detail = `Chat failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.detail) detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  const json = (await res.json()) as ChatResponse;
  if (!json.result && json.route) {
    json.result = json.route;
  }
  return json;
}

export type TripRisk = {
  score: number;
  reason: string;
};

export type Trip = {
  id?: string | number | null;
  pnr?: string | null;
  train_number: string;
  train_name?: string | null;
  class_code?: string | null;
  quota?: string | null;
  journey_date?: string | null;
  boarding_code?: string | null;
  destination_code?: string | null;
  passengers?: number | null;
  current_status?: string | null;
  risk?: TripRisk | null;
};

export type MyTripsResponse = {
  trips: Trip[];
};

export async function myTrips(): Promise<MyTripsResponse> {
  const res = await fetch(`${API_BASE}/my-trips`);
  if (!res.ok) {
    let detail = `My trips failed (${res.status})`;
    try {
      const j = await res.json();
      if (j?.detail) detail = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return (await res.json()) as MyTripsResponse;
}
