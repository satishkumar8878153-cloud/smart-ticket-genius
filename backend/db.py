import os
from datetime import date as _date
from supabase import create_client, Client

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "").strip()

_client: Client | None = None


# Common railway station/city aliases.
# These are used for matching existing database records.
# They do NOT fabricate train data.
STATION_ALIASES: dict[str, list[str]] = {
    "patna": [
        "pnbe",
        "patna",
        "patna junction",
    ],
    "patna junction": [
        "pnbe",
        "patna",
        "patna junction",
    ],
    "paharpur": [
        "prp",
        "paharpur",
    ],

    "new delhi": [
        "ndls",
        "new delhi",
        "delhi",
    ],
    "delhi": [
        "ndls",
        "new delhi",
        "delhi",
    ],
    "mumbai": [
        "mmct",
        "mumbai",
        "mumbai central",
    ],
    "mumbai central": [
        "mmct",
        "mumbai",
        "mumbai central",
    ],
    "chennai": [
        "mas",
        "chennai",
        "chennai central",
    ],
    "chennai central": [
        "mas",
        "chennai",
        "chennai central",
    ],
    "howrah": [
        "hwh",
        "howrah",
        "kolkata",
    ],
    "kolkata": [
        "hwh",
        "howrah",
        "kolkata",
    ],
    "bengaluru": [
        "sbc",
        "bengaluru",
        "bangalore",
    ],
    "bangalore": [
        "sbc",
        "bengaluru",
        "bangalore",
    ],
}


def get_client() -> Client:
    global _client

    if _client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_KEY must be set as environment variables."
            )

        _client = create_client(
            SUPABASE_URL,
            SUPABASE_KEY,
        )

    return _client


def fetch_trains_for_route(
    source: str,
    destination: str,
    journey_date: str | None = None,
) -> list[dict]:
    """
    Try live IRCTC/RapidAPI first.

    If live API is unavailable, including RapidAPI 429 quota errors,
    fall back to the existing Supabase train dataset.

    journey_date is optional for backward compatibility.
    """

    if not journey_date:
        journey_date = _date.today().isoformat()

    # ---------------------------------------------------------
    # 1. LIVE TRAIN DATA
    # ---------------------------------------------------------
    try:
        from irctc_provider import fetch_trains_between

        live = fetch_trains_between(
            source,
            destination,
            journey_date,
        )

        if live:
            return live

    except Exception:
        # Any live-provider failure (network, 429, parse error)
        # falls through to Supabase.
        pass

    # ---------------------------------------------------------
    # 2. SUPABASE FALLBACK
    # ---------------------------------------------------------
    client = get_client()

    response = (
        client.table("trains")
        .select("*")
        .eq("source_code", source.upper())
        .eq("destination_code", destination.upper())
        .execute()
    )

    return response.data or []


def fetch_stations(query: str | None = None, limit: int = 20) -> list[dict]:
    client = get_client()

    q = (query or "").strip()

    if not q:
        response = (
            client.table("stations")
            .select("*")
            .limit(limit)
            .execute()
        )
        return response.data or []

    # Prefer exact code match first
    by_code = (
        client.table("stations")
        .select("*")
        .ilike("code", q)
        .limit(limit)
        .execute()
    )
    if by_code.data:
        return by_code.data

    # Then name / city fuzzy
    response = (
        client.table("stations")
        .select("*")
        .or_(
            f"name.ilike.%{q}%,city.ilike.%{q}%,code.ilike.%{q}%"
        )
        .limit(limit)
        .execute()
    )

    return response.data or []


def fetch_pnr_history_stats(
    train_number: str,
    class_code: str,
    limit: int = 200,
) -> dict | None:
    client = get_client()

    query = (
        client.table("pnr_history")
        .select("confirmed,verified")
        .eq("train_number", train_number)
        .eq("class_code", class_code)
        .eq("verified", True)
        .limit(limit)
    )

    resp = query.execute()

    rows = resp.data or []

    if not rows:
        return None

    total = len(rows)

    confirmed = sum(
        1
        for row in rows
        if row.get("confirmed")
    )

    return {
        "confirmed": confirmed,
        "total": total,
        "confirm_rate": confirmed / total,
    }

_service_client: Client | None = None

SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")


def get_service_client() -> Client:
    """
    SERVICE-ROLE client. Bypasses Row Level Security entirely.
    Use ONLY for specific, deliberate backend-only write operations
    (e.g. the /admin/import-stations endpoint). NEVER use this for
    any user-facing read/search/chat endpoint.
    """
    global _service_client
    if _service_client is None:
        if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set as environment variables."
            )
        _service_client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    return _service_client


def fetch_all_train_stop_keys(client, page_size: int = 1000) -> set[tuple[str, str, int]]:
    """Fetch ALL existing (train_number, station_code, stop_sequence) keys
    from train_stops, paginating past Supabase's default 1000-row limit."""
    keys: set[tuple[str, str, int]] = set()
    start = 0
    while True:
        resp = (
            client.table("train_stops")
            .select("train_number,station_code,stop_sequence")
            .range(start, start + page_size - 1)
            .execute()
        )
        rows = resp.data or []
        for r in rows:
            keys.add((r["train_number"], r["station_code"], r["stop_sequence"]))
        if len(rows) < page_size:
            break
        start += page_size
    return keys


def fetch_all_train_stops(client, page_size: int = 1000) -> list:
    all_rows = []
    offset = 0
    while True:
        resp = (
            client.table("train_stops")
            .select("train_number,station_code,stop_sequence,arrival_time,departure_time,day_offset")
            .range(offset, offset + page_size - 1)
            .execute()
        )
        rows = resp.data or []
        all_rows.extend(rows)
        if len(rows) < page_size:
            break
        offset += page_size
    return all_rows


def fetch_train_stops_for_stations(
    client,
    station_codes: list[str] | set[str],
    page_size: int = 1000,
) -> list:
    """Fetch train_stops rows only for the given station codes (paginated).

    Used by /route-search so we never load the full 417k-row table per request.
    """
    codes = sorted({str(c).strip().upper() for c in station_codes if c})
    if not codes:
        return []
    all_rows: list = []
    chunk_size = 50
    for i in range(0, len(codes), chunk_size):
        chunk = codes[i : i + chunk_size]
        offset = 0
        while True:
            resp = (
                client.table("train_stops")
                .select(
                    "train_number,station_code,stop_sequence,"
                    "arrival_time,departure_time,day_offset"
                )
                .in_("station_code", chunk)
                .range(offset, offset + page_size - 1)
                .execute()
            )
            rows = resp.data or []
            all_rows.extend(rows)
            if len(rows) < page_size:
                break
            offset += page_size
    return all_rows


def fetch_train_names(client) -> dict[str, str]:
    """Map train_number -> train_name from public.trains (seed table; may be sparse)."""
    names: dict[str, str] = {}
    offset = 0
    while True:
        resp = (
            client.table("trains")
            .select("train_number,train_name")
            .range(offset, offset + 999)
            .execute()
        )
        rows = resp.data or []
        for r in rows:
            tn = str(r.get("train_number") or "").strip()
            nm = (r.get("train_name") or "").strip()
            if tn and nm:
                names[tn] = nm
        if len(rows) < 1000:
            break
        offset += 1000
    return names


def fetch_pnr_stats(
    train_number: str,
    class_code: str,
    quota: str | None = None,
) -> dict | None:
    """Historical PNR confirmation stats for a train/class (and optional quota).

    Used by the base main.py heuristic scoring path. Restored for import
    compatibility after the db.py restore accidentally dropped this helper.
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
    confirmed = sum(1 for row in rows if row.get("confirmed"))
    return {
        "confirmed": confirmed,
        "total": total,
        "confirm_rate": confirmed / total,
    }
