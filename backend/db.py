import os
from datetime import date as _date
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

_client: Client | None = None

STATION_ALIASES: dict[str, str] = {
    "patna": "pnbe",
    "patna junction": "pnbe",
    "paharpur": "prp",
    "new delhi": "ndls",
    "delhi": "ndls",
    "mumbai": "mmct",
    "mumbai central": "mmct",
    "mumbai csmt": "csmt",
    "siliguri": "sguj",
    "siliguri junction": "sguj",
    "new jalpaiguri": "njp",
    "kamakhya": "kyq",
    "kamakhya junction": "kyq",
    "guwahati": "kyq",
}

def _normalize_station(value: str) -> str:
    v = value.strip().lower()
    return STATION_ALIASES.get(v, v)


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
    nothing, fall back to the Supabase demo dataset with bidirectional
    substring matching (using station aliases). Never fabricates an
    unrelated match."""
    try:
        from irctc_provider import fetch_trains_between

        live = fetch_trains_between(source, destination, _date.today().isoformat())
        if live:
            return live
    except Exception:
        pass

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

    src = _normalize_station(source)
    dst = _normalize_station(destination)

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
    """Real stations table lookup, with an autocomplete-style match on
    code, name, or city."""
    client = get_client()
    resp = client.table("stations").select("code, name, city").execute()
    rows = resp.data or []

    if query:
        q = query.strip().lower()
        rows = [
            r
            for r in rows
            if q in (r.get("code") or "").lower()
            or q in (r.get("name") or "").lower()
            or q in (r.get("city") or "").lower()
        ]

    return rows


def fetch_pnr_stats(train_number: str, class_code: str, quota: str | None = None) -> dict | None:
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
