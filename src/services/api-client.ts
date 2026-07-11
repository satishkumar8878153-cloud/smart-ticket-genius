// Central place to configure the FastAPI backend base URL.
// When VITE_FASTAPI_URL is set, services will call the FastAPI backend.
// Otherwise services fall back to Lovable Cloud (Supabase) directly.

export const FASTAPI_URL: string =
  (import.meta.env.VITE_FASTAPI_URL as string | undefined)?.replace(/\/$/, "") ?? "";

export const USE_FASTAPI = FASTAPI_URL.length > 0;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!USE_FASTAPI) {
    throw new ApiError("FastAPI backend URL is not configured (VITE_FASTAPI_URL).", 503);
  }
  const url = `${FASTAPI_URL}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    let msg = `Request failed with status ${res.status}`;
    try {
      const body = await res.json();
      if (body?.detail) msg = String(body.detail);
      else if (body?.message) msg = String(body.message);
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, res.status);
  }
  return (await res.json()) as T;
}
