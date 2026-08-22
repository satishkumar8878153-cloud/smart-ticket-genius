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

/** Normalize class tokens to IRCTC-style codes. */
function normalizeClassCode(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  const u = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!u) return undefined;
  if (u === "SLEEPER" || u === "SL") return "SL";
  if (u === "3AC" || u === "3A") return "3A";
  if (u === "2AC" || u === "2A") return "2A";
  if (u === "1AC" || u === "1A") return "1A";
  if (u === "CC" || u === "EC" || u === "2S") return u;
  return undefined;
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
};

/** Pick ISO date; if year omitted, use current year or next if already past. */
function resolveYmd(y: number | null, month: number, day: number, now = new Date()): string | undefined {
  if (month < 1 || month > 12 || day < 1 || day > 31) return undefined;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let year = y ?? today.getFullYear();
  let candidate = new Date(year, month - 1, day);
  if (candidate.getMonth() !== month - 1 || candidate.getDate() !== day) return undefined;
  if (y == null) {
    const candDay = new Date(candidate.getFullYear(), candidate.getMonth(), candidate.getDate());
    if (candDay < today) {
      year += 1;
      candidate = new Date(year, month - 1, day);
    }
  }
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

function parseNaturalDate(token: string, now = new Date()): string | undefined {
  const raw = token.trim();
  if (!raw) return undefined;
  const lower = raw.toLowerCase();
  if (lower === "today") {
    return now.toISOString().slice(0, 10);
  }
  if (lower === "tomorrow") {
    const t = new Date(now);
    t.setDate(t.getDate() + 1);
    return t.toISOString().slice(0, 10);
  }
  if (lower === "day after tomorrow" || lower === "day-after-tomorrow") {
    const t = new Date(now);
    t.setDate(t.getDate() + 2);
    return t.toISOString().slice(0, 10);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }
  // 25/08/2026 or 25-08-2026 or 25/08/26
  const slash = raw.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    let year: number | null = null;
    if (slash[3]) {
      year = Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3]);
    }
    return resolveYmd(year, month, day, now);
  }
  // 25 August / 25 Aug 2026 / August 25 2026
  const named = raw.match(
    /^(?:(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]+)(?:\s+(\d{4}))?|([A-Za-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?)$/i,
  );
  if (named) {
    if (named[1] && named[2]) {
      const day = Number(named[1]);
      const month = MONTH_MAP[named[2].toLowerCase()];
      const year = named[3] ? Number(named[3]) : null;
      if (month) return resolveYmd(year, month, day, now);
    }
    if (named[4] && named[5]) {
      const month = MONTH_MAP[named[4].toLowerCase()];
      const day = Number(named[5]);
      const year = named[6] ? Number(named[6]) : null;
      if (month) return resolveYmd(year, month, day, now);
    }
  }
  return undefined;
}

/** Lightweight NL parse for Mission AI → smart-search (frontend only). */
export function parseJourneyMessage(message: string): {
  from?: string;
  to?: string;
  journey_date?: string;
  class_code?: string;
} | null {
  let text = (message || "").trim();
  if (!text) return null;

  // Strip trailing class tokens first
  let class_code: string | undefined;
  const classTail = text.match(
    /(?:\s+(?:in\s+)?|\s+)(SL|3A|2A|1A|CC|EC|2S|3AC|2AC|1AC|sleeper)\s*$/i,
  );
  if (classTail) {
    class_code = normalizeClassCode(classTail[1]);
    text = text.slice(0, classTail.index).trim();
  }
  if (!class_code) {
    const cm = text.match(/\b(SL|3A|2A|1A|CC|EC|2S|3AC|2AC|1AC)\b/i);
    if (cm) class_code = normalizeClassCode(cm[1]);
  }

  // Origin / destination: support "to", "→", "->", Hindi/Hinglish "se"
  const od = text.match(
    /^(.+?)\s+(?:to|se|→|->)\s+(.+)$/i,
  );
  if (!od) return null;
  let from = od[1].trim();
  let rest = od[2].trim();

  // Optional leading "on " before date
  rest = rest.replace(/^on\s+/i, "");

  // Try to peel a date from the end of destination side
  let journey_date: string | undefined;
  // ISO at end
  let m = rest.match(/^(.*?)\s+(\d{4}-\d{2}-\d{2})$/);
  if (m && parseNaturalDate(m[2])) {
    journey_date = parseNaturalDate(m[2]);
    rest = m[1].trim();
  }
  if (!journey_date) {
    m = rest.match(
      /^(.*?)\s+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)$/,
    );
    if (m && parseNaturalDate(m[2])) {
      journey_date = parseNaturalDate(m[2]);
      rest = m[1].trim();
    }
  }
  if (!journey_date) {
    m = rest.match(
      /^(.*?)\s+((?:\d{1,2}(?:st|nd|rd|th)?\s+)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{1,2}(?:st|nd|rd|th)?)?(?:\s+\d{4})?)$/i,
    );
    if (m && parseNaturalDate(m[2])) {
      journey_date = parseNaturalDate(m[2]);
      rest = m[1].trim();
    }
  }
  if (!journey_date) {
    m = rest.match(/^(.*?)\s+(today|tomorrow|day after tomorrow)$/i);
    if (m) {
      journey_date = parseNaturalDate(m[2]);
      rest = m[1].trim();
    }
  }

  const to = rest.trim();
  if (!from || !to) return null;
  // Reject if "to" still looks like it swallowed a date fragment poorly
  if (/^\d{1,2}$/.test(to)) return null;

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
