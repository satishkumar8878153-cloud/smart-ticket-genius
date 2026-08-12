import os
import logging
from typing import Any

import httpx


log = logging.getLogger("smart-ticket-ai")


RAPIDAPI_KEY = (
    os.environ.get("RAPIDAPI_KEY", "")
    .strip()
    .strip('"')
    .strip("'")
)

RAPIDAPI_HOST = "irctc1.p.rapidapi.com"

BASE_URL = "https://irctc1.p.rapidapi.com/api/v3"
STATION_SEARCH_URL = "https://irctc1.p.rapidapi.com/api/v1/searchStation"


# Common station/city aliases.
# These help when the user types a city name instead of
# the exact railway station name.
STATION_ALIASES: dict[str, list[str]] = {
    "bengaluru": [
        "Bengaluru",
        "Bengaluru City",
        "Bangalore",
        "Bangalore City",
    ],
    "bangalore": [
        "Bangalore",
        "Bengaluru",
        "Bangalore City",
        "Bengaluru City",
    ],
    "bengaluru city": [
        "Bengaluru City",
        "Bangalore City",
        "Bengaluru",
        "Bangalore",
    ],
    "chennai": [
        "Chennai",
        "Chennai Central",
        "Chennai Egmore",
    ],
    "delhi": [
        "Delhi",
        "New Delhi",
        "Delhi Junction",
    ],
    "mumbai": [
        "Mumbai",
        "Mumbai Central",
        "Mumbai CSMT",
    ],
    "patna": [
        "Patna",
        "Patna Junction",
    ],
    "kolkata": [
        "Kolkata",
        "Howrah",
        "Kolkata Shalimar",
    ],
}


def _headers() -> dict[str, str]:
    """
    Build RapidAPI headers at request time so that an environment
    variable configured on Render is always respected.
    """
    return {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": RAPIDAPI_KEY,
        "Content-Type": "application/json",
    }


def _get(url: str, params: dict[str, Any]) -> dict[str, Any]:
    """
    Safe GET request to RapidAPI.

    Important:
    - Never crashes the FastAPI application because RapidAPI is down.
    - Explicitly handles 429 quota/rate-limit responses.
    """

    if not RAPIDAPI_KEY:
        raise RuntimeError(
            "RAPIDAPI_KEY is not set as an environment variable."
        )

    with httpx.Client(
        timeout=12.0,
        follow_redirects=True,
    ) as client:
        response = client.get(
            url,
            headers=_headers(),
            params=params,
        )

    log.info(
        "RapidAPI response | status=%s | url=%s",
        response.status_code,
        response.url,
    )

    # RapidAPI monthly quota / rate limit.
    if response.status_code == 429:
        log.warning(
            "RapidAPI quota/rate limit reached for %s",
            url,
        )
        return {
            "_rapidapi_error": "rate_limit",
            "data": [],
        }

    if response.status_code >= 400:
        log.warning(
            "RapidAPI request failed | status=%s | body=%s",
            response.status_code,
            response.text[:500],
        )
        return {
            "_rapidapi_error": str(response.status_code),
            "data": [],
        }

    try:
        data = response.json()
    except Exception:
        log.warning(
            "RapidAPI returned invalid JSON | body=%s",
            response.text[:500],
        )
        return {
            "_rapidapi_error": "invalid_json",
            "data": [],
        }

    if not isinstance(data, dict):
        log.warning("Unexpected RapidAPI response format.")
        return {
            "_rapidapi_error": "invalid_format",
            "data": [],
        }

    return data


def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_query(value: str) -> str:
    """
    Normalize user station input for matching.
    """
    value = _clean_text(value).lower()

    replacements = {
        " railway station": "",
        " railway": "",
        " station": "",
        " jn": "",
        " junction": "",
        " city": "",
        " central": "",
    }

    for old, new in replacements.items():
        value = value.replace(old, new)

    return " ".join(value.split())


def _station_matches_query(
    row: dict[str, Any],
    query: str,
) -> bool:
    """
    Flexible station matching.

    Example:
        Bengaluru
        Bengaluru City
        Bangalore
        Bangalore City

    can all match the appropriate station.
    """

    query_normalized = _normalize_query(query)

    fields = [
        row.get("code"),
        row.get("name"),
        row.get("eng_name"),
        row.get("city"),
        row.get("state_name"),
    ]

    values = [
        _normalize_query(_clean_text(value))
        for value in fields
        if _clean_text(value)
    ]

    # Direct substring match.
    for value in values:
        if (
            query_normalized == value
            or query_normalized in value
            or value in query_normalized
        ):
            return True

    # Alias matching.
    aliases = STATION_ALIASES.get(
        query.strip().lower(),
        [],
    )

    for alias in aliases:
        alias_normalized = _normalize_query(alias)

        for value in values:
            if (
                alias_normalized == value
                or alias_normalized in value
                or value in alias_normalized
            ):
                return True

    return False


def search_stations(
    query: str,
    limit: int = 100,
) -> list[dict]:
    """
    Search railway stations through RapidAPI.

    Returns a normalized list suitable for /stations.

    If RapidAPI quota is exhausted, returns [].
    main.py will then use the Supabase station database fallback.
    """

    query = _clean_text(query)

    if not query:
        return []

    limit = max(1, min(int(limit), 100))

    search_queries = [query]

    # If the user typed a city name, try known aliases.
    aliases = STATION_ALIASES.get(
        query.lower(),
        [],
    )

    for alias in aliases:
        if alias.lower() not in {
            item.lower() for item in search_queries
        }:
            search_queries.append(alias)

    all_rows: list[dict[str, Any]] = []

    for search_query in search_queries:
        data = _get(
            STATION_SEARCH_URL,
            {
                "query": search_query,
            },
        )

        # Do not keep hammering RapidAPI after quota is exhausted.
        if data.get("_rapidapi_error") == "rate_limit":
            log.warning(
                "Station search skipped because RapidAPI quota is exhausted."
            )
            break

        rows = data.get("data") or []

        if not isinstance(rows, list):
            continue

        for row in rows:
            if not isinstance(row, dict):
                continue

            all_rows.append(row)

        # We already have enough results.
        if len(all_rows) >= limit:
            break

    if not all_rows:
        return []

    # Remove duplicates using station code.
    unique: dict[str, dict[str, Any]] = {}

    for row in all_rows:
        code = _clean_text(
            row.get("code")
            or row.get("station_code")
            or row.get("stationCode")
        ).upper()

        if not code:
            continue

        if code not in unique:
            unique[code] = row

    rows = list(unique.values())

    # Keep only rows that actually match the user's query/aliases.
    matched = [
        row
        for row in rows
        if _station_matches_query(row, query)
    ]

    # If API already returned useful results but our strict matching
    # rejected everything, keep the API's own ranking.
    if not matched:
        matched = rows

    results: list[dict] = []

    for row in matched[:limit]:
        code = _clean_text(
            row.get("code")
            or row.get("station_code")
            or row.get("stationCode")
        ).upper()

        name = _clean_text(
            row.get("name")
            or row.get("eng_name")
            or row.get("station_name")
        )

        city = _clean_text(
            row.get("city")
            or row.get("state_name")
            or row.get("state")
        )

        if not code or not name:
            continue

        results.append(
            {
                "code": code,
                "name": name,
                "city": city,
                "is_popular": bool(
                    row.get("is_popular", False)
                ),
            }
        )

    log.info(
        "RapidAPI station search | query=%r | matched=%d",
        query,
        len(results),
    )

    return results


def resolve_station_code(
    name_or_code: str,
) -> str | None:
    """
    Convert station name/city/code into an IRCTC station code.
    """

    query = _clean_text(name_or_code)

    if not query:
        return None

    # If it already looks like a station code, try it directly.
    if (
        len(query) <= 6
        and query.replace(" ", "").isalnum()
    ):
        possible_code = query.replace(" ", "").upper()

        # Do not blindly accept every short string as a code.
        # First try the station search.
        stations = search_stations(query, limit=10)

        for station in stations:
            if (
                station.get("code", "").upper()
                == possible_code
            ):
                return possible_code

    stations = search_stations(query, limit=20)

    if not stations:
        return None

    query_normalized = _normalize_query(query)

    # Exact normalized name gets highest priority.
    for station in stations:
        name = _normalize_query(
            station.get("name", "")
        )

        city = _normalize_query(
            station.get("city", "")
        )

        code = _clean_text(
            station.get("code")
        ).upper()

        if not code:
            continue

        if (
            name == query_normalized
            or city == query_normalized
        ):
            return code

    # Prefer popular station if available.
    for station in stations:
        if station.get("is_popular"):
            code = _clean_text(
                station.get("code")
            ).upper()

            if code:
                return code

    # Otherwise use the first relevant result.
    first_code = _clean_text(
        stations[0].get("code")
    ).upper()

    return first_code or None


def fetch_trains_between(
    source: str,
    destination: str,
    date_iso: str,
) -> list[dict]:
    """
    Fetch trains between two stations for the selected journey date.

    The date passed by the caller is used directly.
    """

    source = _clean_text(source)
    destination = _clean_text(destination)
    date_iso = _clean_text(date_iso)

    if not source or not destination:
        return []

    if not date_iso:
        return []

    src_code = resolve_station_code(source)
    dst_code = resolve_station_code(destination)

    if not src_code or not dst_code:
        log.warning(
            "Could not resolve station codes | %s -> %s",
            source,
            destination,
        )
        return []

    data = _get(
        f"{BASE_URL}/trainBetweenStations",
        {
            "fromStationCode": src_code,
            "toStationCode": dst_code,
            "dateOfJourney": date_iso,
        },
    )

    if data.get("_rapidapi_error"):
        log.warning(
            "Live train search unavailable | source=%s | destination=%s | error=%s",
            src_code,
            dst_code,
            data.get("_rapidapi_error"),
        )
        return []

    rows = data.get("data") or []

    if not isinstance(rows, list):
        return []

    trains: list[dict] = []

    for row in rows:
        if not isinstance(row, dict):
            continue

        train_number = _clean_text(
            row.get("train_number")
            or row.get("trainNumber")
        )

        train_name = _clean_text(
            row.get("train_name")
            or row.get("trainName")
        )

        departure = _clean_text(
            row.get("from_std")
            or row.get("departure_time")
            or row.get("departureTime")
        )

        arrival = _clean_text(
            row.get("to_std")
            or row.get("arrival_time")
            or row.get("arrivalTime")
        )

        duration = _clean_text(
            row.get("duration")
        )

        if not train_number and not train_name:
            continue

        trains.append(
            {
                "train_number": train_number,
                "train_name": train_name,
                "source_code": _clean_text(
                    row.get("train_src")
                    or row.get("source_code")
                    or src_code
                ),
                "destination_code": _clean_text(
                    row.get("train_dstn")
                    or row.get("destination_code")
                    or dst_code
                ),
                "departure_time": departure,
                "arrival_time": arrival,
                "duration": duration,
            }
        )

    log.info(
        "RapidAPI live trains | %d trains | %s -> %s | date=%s",
        len(trains),
        src_code,
        dst_code,
        date_iso,
    )

    return trains
