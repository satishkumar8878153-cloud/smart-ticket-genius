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
        if (r["source_code"].lower() == src or src in r["source_code"].lower())
        and (r["destination_code"].lower() == dst or dst in r["destination_code"].lower())
    ]
    return matches if matches else rows[:5]


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
