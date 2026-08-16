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
        "csmt",
        "mumbai",
        "mumbai central",
        "mumbai csmt",
    ],
    "mumbai central": [
        "mmct",
        "mumbai",
        "mumbai central",
    ],
    "mumbai csmt": [
        "csmt",
        "mumbai",
        "mumbai csmt",
    ],

    "bengaluru": [
        "sbc",
        "bengaluru",
        "bengaluru city",
        "bangalore",
        "bangalore city",
    ],
    "bangalore": [
        "sbc",
        "bengaluru",
        "bengaluru city",
        "bangalore",
        "bangalore city",
    ],
    "bengaluru city": [
        "sbc",
        "bengaluru",
        "bengaluru city",
        "bangalore",
        "bangalore city",
    ],
    "bangalore city": [
        "sbc",
        "bengaluru",
        "bengaluru city",
        "bangalore",
        "bangalore city",
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
    "chennai egmore": [
        "ms",
        "chennai egmore",
        "chennai",
    ],

    "kolkata": [
        "koaa",
        "kolkata",
        "howrah",
        "kolkata shalimar",
    ],
    "howrah": [
        "hwh",
        "howrah",
        "kolkata",
    ],

    "siliguri": [
        "sguj",
        "siliguri",
        "siliguri junction",
    ],
    "siliguri junction": [
        "sguj",
        "siliguri",
        "siliguri junction",
    ],

    "new jalpaiguri": [
        "njp",
        "new jalpaiguri",
    ],

    "kamakhya": [
        "kyq",
        "kamakhya",
        "kamakhya junction",
    ],
    "kamakhya junction": [
        "kyq",
        "kamakhya",
        "kamakhya junction",
    ],

    "guwahati": [
        "ghy",
        "guwahati",
    ],
}


def _normalize(value: str | None) -> str:
    """Normalize station text for reliable comparison."""
    if not value:
        return ""

    value = " ".join(
        str(value).strip().lower().split()
    )

    suffixes = (
        " railway station",
        " station",
        " junction",
        " jn",
    )

    for suffix in suffixes:
        if value.endswith(suffix):
            value = value[: -len(suffix)].strip()

    return value


def _candidate_values(value: str | None) -> set[str]:
    """Return all useful aliases for a station/city input."""
    normalized = _normalize(value)

    if not normalized:
        return set()

    candidates = {normalized}

    for alias in STATION_ALIASES.get(
        normalized,
        [],
    ):
        normalized_alias = _normalize(alias)

        if normalized_alias:
            candidates.add(normalized_alias)

    return candidates


def _field_matches(
    value: str | None,
    candidates: set[str],
) -> bool:
    """Check whether a database station code/name matches the candidates."""
    normalized = _normalize(value)

    if not normalized:
        return False

    if normalized in candidates:
        return True

    return any(
        candidate in normalized
        or normalized in candidate
        for candidate in candidates
    )


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
        # Live provider must never crash the whole search.
        pass

    # ---------------------------------------------------------
    # 2. SUPABASE FALLBACK
    # ---------------------------------------------------------
    client = get_client()

    resp = (
        client.table("trains")
        .select(
            "train_number, train_name, source_code, "
            "destination_code, departure_time, "
            "arrival_time, duration"
        )
        .execute()
    )

    rows = resp.data or []

    source_candidates = _candidate_values(source)
    destination_candidates = _candidate_values(destination)

    matches: list[dict] = []

    for row in rows:
        source_code = row.get(
            "source_code"
        )

        destination_code = row.get(
            "destination_code"
        )

        source_match = _field_matches(
            source_code,
            source_candidates,
        )

        destination_match = _field_matches(
            destination_code,
            destination_candidates,
        )

        if source_match and destination_match:
            matches.append(row)

    return matches


def fetch_stations(
    query: str | None = None,
) -> list[dict]:
    """
    Fetch stations from Supabase.

    This remains the fallback station database.
    Query matching supports:
    - station code
    - station name
    - city
    - common aliases
    """

    client = get_client()

        all_rows = []
    offset = 0

    while True:
        resp = (
            client.table("stations")
            .select(
                "code, name, city"
            )
            .range(offset, offset + 999)
            .execute()
        )

        batch = resp.data or []
        all_rows.extend(batch)

        if len(batch) < 1000:
            break

        offset += 1000

    rows = all_rows
    if not query or not query.strip():
        return rows

    candidates = _candidate_values(query)

    return [
        row
        for row in rows
        if (
            _field_matches(
                row.get("code"),
                candidates,
            )
            or _field_matches(
                row.get("name"),
                candidates,
            )
            or _field_matches(
                row.get("city"),
                candidates,
            )
        )
    ]


def fetch_pnr_stats(
    train_number: str,
    class_code: str,
    quota: str | None = None,
) -> dict | None:

    client = get_client()

    query = (
        client.table("pnr_history")
        .select("confirmed")
        .eq(
            "train_number",
            train_number,
        )
        .eq(
            "class_code",
            class_code,
        )
        .eq(
            "verified",
            True,
        )
    )

    if quota:
        query = query.eq(
            "quota",
            quota,
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
