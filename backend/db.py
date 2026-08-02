import os
from supabase import create_client, Client

# Accept the common variable names so the deployment works whether the host
# provides SUPABASE_KEY, SUPABASE_ANON_KEY or SUPABASE_SERVICE_ROLE_KEY.
SUPABASE_URL = (
    os.environ.get("SUPABASE_URL")
    or os.environ.get("VITE_SUPABASE_URL")
    or ""
).strip()
SUPABASE_KEY = (
    os.environ.get("SUPABASE_KEY")
    or os.environ.get("SUPABASE_ANON_KEY")
    or os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    or os.environ.get("VITE_SUPABASE_PUBLISHABLE_KEY")
    or ""
).strip()

_client: Client | None = None


def get_client() -> Client:
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_KEY must be set as environment variables."
            )
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


def fetch_stations() -> list[dict]:
    """All stations, popular ones first. Returns [] when the DB is unreachable."""
    try:
        client = get_client()
        resp = (
            client.table("stations")
            .select("code, name, city, is_popular")
            .order("is_popular", desc=True)
            .order("name", desc=False)
            .execute()
        )
        return resp.data or []
    except Exception as exc:  # pragma: no cover - network/config failures
        print(f"[db] fetch_stations failed: {exc}")
        return []


def _station_tokens(value: str, stations: list[dict]) -> set[str]:
    """Return lowercase tokens (code, name, city) that identify a station."""
    v = value.strip().lower()
    tokens = {v}
    for s in stations:
        fields = [
            str(s.get("code") or "").lower(),
            str(s.get("name") or "").lower(),
            str(s.get("city") or "").lower(),
        ]
        if v and any(f and (v == f or v in f or f in v) for f in fields):
            tokens.update(f for f in fields if f)
    return {t for t in tokens if t}


def fetch_trains_for_route(source: str, destination: str) -> list[dict]:
    """Trains matching the route. Never raises — returns [] on failure."""
    try:
        client = get_client()
        resp = (
            client.table("trains")
            .select(
                "train_number, train_name, source_code, destination_code, "
                "departure_time, arrival_time, duration"
            )
            .execute()
        )
        rows = resp.data or []
    except Exception as exc:  # pragma: no cover
        print(f"[db] fetch_trains_for_route failed: {exc}")
        return []

    stations = fetch_stations()
    src_tokens = _station_tokens(source, stations)
    dst_tokens = _station_tokens(destination, stations)

    def matches(code: str, tokens: set[str]) -> bool:
        c = str(code or "").lower()
        return any(t == c or t in c or c in t for t in tokens)

    exact = [
        r
        for r in rows
        if matches(r.get("source_code", ""), src_tokens)
        and matches(r.get("destination_code", ""), dst_tokens)
    ]
    if exact:
        return exact

    # Partial: at least the origin matches.
    partial = [r for r in rows if matches(r.get("source_code", ""), src_tokens)]
    if partial:
        return partial

    # Unknown / unserved route — let the caller return a clean 404.
    return []



def fetch_pnr_stats(train_number: str, class_code: str, quota: str | None = None) -> dict | None:
    """
    Looks up real, verified PNR history for this exact train + class
    (optionally + quota). Returns None if we have no real data yet (or the
    table does not exist), so the caller falls back to the heuristic model.
    """
    try:
        client = get_client()
        query = (
            client.table("pnr_history")
            .select("confirmed")
            .eq("train_number", train_number)
            .eq("class_code", class_code)
            .eq("verified", True)
        )
        if quota:
            query = query.eq("quota", quota)

        resp = query.execute()
        rows = resp.data or []
    except Exception as exc:  # table missing, RLS, network — all non-fatal
        print(f"[db] fetch_pnr_stats unavailable: {exc}")
        return None

    if not rows:
        return None

    total = len(rows)
    confirmed = sum(1 for r in rows if r.get("confirmed"))
    return {
        "confirmed": confirmed,
        "total": total,
        "confirm_rate": confirmed / total,
    }
