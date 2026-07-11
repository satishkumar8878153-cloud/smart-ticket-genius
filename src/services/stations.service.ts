import { supabase } from "@/integrations/supabase/client";
import { apiFetch, USE_FASTAPI, ApiError } from "./api-client";
import type { Station } from "./types";

export async function fetchStations(): Promise<Station[]> {
  if (USE_FASTAPI) {
    return apiFetch<Station[]>("/stations");
  }
  const { data, error } = await supabase
    .from("stations")
    .select("code, name, city, is_popular")
    .order("is_popular", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw new ApiError(error.message);
  return (data ?? []) as Station[];
}
