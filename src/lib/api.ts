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
  board: RouteStop;
  alight: RouteStop;
  stops_between?: number;
  duration_minutes?: number | null;
  classes?: Record<string, ClassChip>;
  requested_class?: {
    class?: string;
    score?: number;
    reason?: string;
  };
};

export type RouteSearchResponse = {
  source_query?: string;
  destination_query?: string;
  trains: RouteTrain[];
};

export type ChatResponse = {
  reply: string;
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
  return (await res.json()) as ChatResponse;
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
