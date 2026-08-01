import { supabase } from "@/integrations/supabase/client";
import { apiFetch, USE_FASTAPI, ApiError } from "./api-client";
import type { Station } from "./types";

async function fetchStationsFromDb(): Promise<Station[]> {
  const { data, error } = await supabase
    .from("stations")
    .select("code, name, city, is_popular")
    .order("is_popular", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw new ApiError(error.message);
  return (data ?? []) as Station[];
}

export async function fetchStations(): Promise<Station[]> {
  if (USE_FASTAPI) {
    try {
      const rows = await apiFetch<Station[]>("/stations");
      if (Array.isArray(rows) && rows.length > 0) return rows;
    } catch (err) {
      console.warn("FastAPI /stations unavailable, falling back to database", err);
    }
  }
  return fetchStationsFromDb();
}
