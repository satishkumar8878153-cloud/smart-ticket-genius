import os
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

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


def fetch_trains_for_route(source: str, destination: str) -> list[dict]:
    """Try the live IRCTC provider first (real data). If it fails or finds
    nothing, fall back to the Supabase demo dataset — never fabricate an
    unrelated match."""
    from irctc_provider import fetch_trains_between
    from datetime import date as _date

    try:
        live = fetch_trains_between(source, destination, _date.today().isoformat())
        if live:
            return live
    except Exception:
        pass

    # --- Demo dataset fallback (Supabase) ---
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

    src = source.strip().lower()
    dst = destination.strip().lower()

    matches = [
        r
        for r in rows
        if (
            r["source_code"]
            and (
                r["source_code"].lower() == src
                or src in r["source_code"].lower()
                or r["source_code"].lower() in src
            )
        )
        and (
            r["destination_code"]
            and (
                r["destination_code"].lower() == dst
                or dst in r["destination_code"].lower()
                or r["destination_code"].lower() in dst
            )
        )
    ]
    return matches
def fetch_stations(query: str | None = None) -> list[dict]:
    """No separate 'stations' table exists yet — derive the station list
    directly from the trains table's source/destination codes, since that's
    the only place station data currently lives.
    """
    client = get_client()
    resp = (
        client.table("trains")
        .select("source_code, destination_code")
        .execute()
    )
    rows = resp.data or []

    seen: dict[str, dict] = {}
    for r in rows:
        for code in (r.get("source_code"), r.get("destination_code")):
            if not code:
                continue
            key = code.strip().lower()
            if key not in seen:
                seen[key] = {"code": code.strip(), "name": code.strip(), "city": None}

    stations = list(seen.values())

    if query:
        q = query.strip().lower()
        stations = [
            s
            for s in stations
            if q in s["code"].lower() or q in (s["name"] or "").lower()
        ]

    return stations


def fetch_pnr_stats(train_number: str, class_code: str, quota: str | None = None) -> dict | None:
    """
    Looks up real, verified PNR history for this exact train + class
    (optionally + quota). Returns None if we have no real data yet, so the
    caller can fall back to the heuristic model.

    Returns: {"confirmed": int, "total": int, "confirm_rate": float}
    """
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
    if not rows:
        return None

    total = len(rows)
    confirmed = sum(1 for r in rows if r["confirmed"])
    return {
        "confirmed": confirmed,
        "total": total,
        "confirm_rate": confirmed / total,
    }
