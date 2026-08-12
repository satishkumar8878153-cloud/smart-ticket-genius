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
STATION_SEARCH_URL = (
    "https://irctc1.p.rapidapi.com/api/v1/searchStation"
)

# ---------------------------------------------------------
# IMPORTANT:
# Common city/station aliases.
# These work even when RapidAPI quota is exhausted.
# ---------------------------------------------------------

STATION_ALIASES: dict[str, list[str]] = {
    "bengaluru": [
        "Bengaluru City",
        "Bangalore City",
        "Bengaluru",
        "Bangalore",
    ],
    "bangalore": [
        "Bangalore City",
        "Bengaluru City",
        "Bangalore",
        "Bengaluru",
    ],
    "bengaluru city": [
        "Bengaluru City",
        "Bangalore City",
        "Bengaluru",
        "Bangalore",
    ],
    "chennai": [
        "Chennai Central",
        "Chennai Egmore",
        "Chennai",
    ],
    "chennai central": [
        "Chennai Central",
        "Chennai",
    ],
    "delhi": [
        "New Delhi",
        "Delhi",
        "Delhi Junction",
    ],
    "new delhi": [
        "New Delhi",
        "Delhi",
    ],
    "mumbai": [
        "Mumbai Central",
        "Mumbai CSMT",
        "Mumbai",
    ],
    "mumbai central": [
        "Mumbai Central",
        "Mumbai",
    ],
    "patna": [
        "Patna Junction",
        "Patna",
    ],
    "patna junction": [
        "Patna Junction",
        "Patna",
    ],
    "kolkata": [
        "Howrah",
        "Kolkata",
        "Kolkata Shalimar",
    ],
    "howrah": [
        "Howrah",
        "Kolkata",
    ],
    "siliguri": [
        "Siliguri Junction",
        "New Jalpaiguri",
        "Siliguri",
    ],
    "new jalpaiguri": [
        "New Jalpaiguri",
        "Siliguri Junction",
    ],
    "guwahati": [
        "Guwahati",
        "Kamakhya",
    ],
    "kamakhya": [
        "Kamakhya",
        "Guwahati",
    ],
}


# ---------------------------------------------------------
# Known railway codes.
# These do NOT require RapidAPI.
# ---------------------------------------------------------

KNOWN_STATION_CODES: dict[str, str] = {
    "bengaluru": "SBC",
    "bangalore": "SBC",
    "bengaluru city": "SBC",
    "bangalore city": "SBC",

    "chennai": "MAS",
    "chennai central": "MAS",

    "delhi": "NDLS",
    "new delhi": "NDLS",

    "mumbai": "MMCT",
    "mumbai central": "MMCT",
    "mumbai csmt": "CSMT",

    "patna": "PNBE",
    "patna junction": "PNBE",

    "howrah": "HWH",
    "kolkata": "KOAA",

    "new jalpaiguri": "NJP",
    "siliguri": "SGUJ",

    "guwahati": "GHY",
    "kamakhya": "KYQ",
}


# ---------------------------------------------------------
# RapidAPI headers
# ---------------------------------------------------------

def _headers() -> dict[str, str]:
    return {
        "x-rapidapi-host": RAPIDAPI_HOST,
        "x-rapidapi-key": RAPIDAPI_KEY,
        "Content-Type": "application/json",
    }


# ---------------------------------------------------------
# Safe RapidAPI GET
# ---------------------------------------------------------

def _get(
    url: str,
    params: dict[str, Any],
) -> dict[str, Any]:

    if not RAPIDAPI_KEY:
        return {
            "_rapidapi_error": "missing_key",
            "data": [],
        }

    try:
        with httpx.Client(
            timeout=12.0,
            follow_redirects=True,
        ) as client:

            response = client.get(
                url,
                headers=_headers(),
                params=params,
            )

    except Exception as exc:
        log.warning(
            "RapidAPI connection failed | %s",
            exc,
        )

        return {
            "_rapidapi_error": "connection_error",
            "data": [],
        }

    log.info(
        "RapidAPI response | status=%s | url=%s",
        response.status_code,
        response.url,
    )

    # -----------------------------------------------------
    # 429 = quota/rate limit
    # -----------------------------------------------------

    if response.status_code == 429:
        log.warning(
            "RapidAPI quota/rate limit reached."
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
            "RapidAPI returned invalid JSON."
        )

        return {
            "_rapidapi_error": "invalid_json",
            "data": [],
        }

    if not isinstance(data, dict):
        return {
            "_rapidapi_error": "invalid_format",
            "data": [],
        }

    return data


# ---------------------------------------------------------
# Text helpers
# ---------------------------------------------------------

def _clean_text(value: Any) -> str:
    return str(value or "").strip()


def _normalize_query(value: str) -> str:

    value = _clean_text(value).lower()

    replacements = {
        " railway station": "",
        " railway": "",
        " station": "",
        " junction": "",
        " jn": "",
        " central": "",
        " city": "",
    }

    for old, new in replacements.items():
        value = value.replace(old, new)

    return " ".join(value.split())


# ---------------------------------------------------------
# Supabase station lookup
#
# This is the IMPORTANT fallback.
# It allows all stations stored in Supabase to work even
# when RapidAPI quota is exhausted.
# ---------------------------------------------------------

def _search_supabase_stations(
    query: str,
    limit: int = 100,
) -> list[dict]:

    try:
        from db import fetch_stations

        rows = fetch_stations(query)

        results = []

        for row in rows[:limit]:

            code = _clean_text(
                row.get("code")
            ).upper()

            name = _clean_text(
                row.get("name")
            )

            city = _clean_text(
                row.get("city")
            )

            if not code or not name:
                continue

            results.append(
                {
                    "code": code,
                    "name": name,
                    "city": city,
                    "is_popular": bool(
                        row.get(
                            "is_popular",
                            False,
                        )
                    ),
                }
            )

        if results:
            log.info(
                "Supabase station search | query=%r | matched=%d",
                query,
                len(results),
            )

        return results

    except Exception as exc:

        log.warning(
            "Supabase station search failed | %s",
            exc,
        )

        return []


# ---------------------------------------------------------
# Search stations
#
# ORDER:
# 1. Supabase (your 110+ stations)
# 2. RapidAPI
# ---------------------------------------------------------

def search_stations(
    query: str,
    limit: int = 100,
) -> list[dict]:

    query = _clean_text(query)

    if not query:
        return []

    limit = max(
        1,
        min(int(limit), 100),
    )

    # -----------------------------------------------------
    # FIRST: Supabase station database
    # -----------------------------------------------------

    local_results = _search_supabase_stations(
        query,
        limit,
    )

    if local_results:
        return local_results

    # -----------------------------------------------------
    # SECOND: known aliases
    # -----------------------------------------------------

    query_key = query.lower()

    aliases = STATION_ALIASES.get(
        query_key,
        [],
    )

    for alias in aliases:

        local_results = _search_supabase_stations(
            alias,
            limit,
        )

        if local_results:
            return local_results

    # -----------------------------------------------------
    # THIRD: RapidAPI
    # -----------------------------------------------------

    if not RAPIDAPI_KEY:
        log.warning(
            "RapidAPI unavailable because RAPIDAPI_KEY is missing."
        )
        return []

    search_queries = [query]

    for alias in aliases:

        if alias.lower() not in {
            item.lower()
            for item in search_queries
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

        if data.get("_rapidapi_error") == "rate_limit":

            log.warning(
                "RapidAPI station search stopped because quota is exhausted."
            )

            break

        rows = data.get("data") or []

        if not isinstance(rows, list):
            continue

        for row in rows:

            if isinstance(row, dict):
                all_rows.append(row)

        if len(all_rows) >= limit:
            break

    if not all_rows:
        return []

    unique: dict[str, dict] = {}

    for row in all_rows:

        code = _clean_text(
            row.get("code")
            or row.get("station_code")
            or row.get("stationCode")
        ).upper()

        if code and code not in unique:
            unique[code] = row

    results = []

    for row in list(unique.values())[:limit]:

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
                    row.get(
                        "is_popular",
                        False,
                    )
                ),
            }
        )

    return results


# ---------------------------------------------------------
# Resolve station code
# ---------------------------------------------------------

def resolve_station_code(
    name_or_code: str,
) -> str | None:

    query = _clean_text(name_or_code)

    if not query:
        return None

    normalized = query.lower().strip()

    # -----------------------------------------------------
    # 1. Known station code
    # -----------------------------------------------------

    if normalized in KNOWN_STATION_CODES:

        code = KNOWN_STATION_CODES[
            normalized
        ]

        log.info(
            "Station resolved from local alias | %s -> %s",
            query,
            code,
        )

        return code

    # -----------------------------------------------------
    # 2. Already looks like railway code
    # -----------------------------------------------------

    compact = (
        query
        .replace(" ", "")
        .upper()
    )

    if (
        2 <= len(compact) <= 6
        and compact.isalnum()
    ):

        # Check local database before accepting.
        local = _search_supabase_stations(
            query,
            10,
        )

        for station in local:

            if (
                station.get("code", "").upper()
                == compact
            ):
                return compact

    # -----------------------------------------------------
    # 3. Supabase database
    # -----------------------------------------------------

    stations = _search_supabase_stations(
        query,
        20,
    )

    if not stations:

        for alias in STATION_ALIASES.get(
            normalized,
            [],
        ):

            stations = _search_supabase_stations(
                alias,
                20,
            )

            if stations:
                break

    if stations:

        query_normalized = _normalize_query(
            query
        )

        # Exact station name
        for station in stations:

            code = _clean_text(
                station.get("code")
            ).upper()

            name = _normalize_query(
                station.get("name", "")
            )

            city = _normalize_query(
                station.get("city", "")
            )

            if (
                name == query_normalized
                or city == query_normalized
            ):
                if code:
                    log.info(
                        "Station resolved from Supabase | %s -> %s",
                        query,
                        code,
                    )
                    return code

        # Popular station
        for station in stations:

            if station.get("is_popular"):

                code = _clean_text(
                    station.get("code")
                ).upper()

                if code:
                    return code

        # First result
        code = _clean_text(
            stations[0].get("code")
        ).upper()

        if code:
            return code

    # -----------------------------------------------------
    # 4. RapidAPI last attempt
    # -----------------------------------------------------

    stations = search_stations(
        query,
        limit=20,
    )

    if not stations:
        return None

    query_normalized = _normalize_query(
        query
    )

    for station in stations:

        code = _clean_text(
            station.get("code")
        ).upper()

        name = _normalize_query(
            station.get("name", "")
        )

        city = _normalize_query(
            station.get("city", "")
        )

        if (
            name == query_normalized
            or city == query_normalized
        ):

            if code:
                return code

    for station in stations:

        if station.get("is_popular"):

            code = _clean_text(
                station.get("code")
            ).upper()

            if code:
                return code

    code = _clean_text(
        stations[0].get("code")
    ).upper()

    return code or None


# ---------------------------------------------------------
# Fetch trains between stations
# ---------------------------------------------------------

def fetch_trains_between(
    source: str,
    destination: str,
    date_iso: str,
) -> list[dict]:

    source = _clean_text(source)
    destination = _clean_text(destination)
    date_iso = _clean_text(date_iso)

    if not source or not destination:
        return []

    if not date_iso:
        return []

    # -----------------------------------------------------
    # Resolve stations WITHOUT depending on RapidAPI.
    # -----------------------------------------------------

    src_code = resolve_station_code(
        source
    )

    dst_code = resolve_station_code(
        destination
    )

    if not src_code or not dst_code:

        log.warning(
            "Could not resolve station codes | %s -> %s",
            source,
            destination,
        )

        return []

    log.info(
        "Station codes resolved | %s -> %s | %s -> %s",
        source,
        src_code,
        destination,
        dst_code,
    )

    # -----------------------------------------------------
    # Live train API
    # -----------------------------------------------------

    data = _get(
        f"{BASE_URL}/trainBetweenStations",
        {
            "fromStationCode": src_code,
            "toStationCode": dst_code,
            "dateOfJourney": date_iso,
        },
    )

    # -----------------------------------------------------
    # If RapidAPI quota is exhausted, return [].
    #
    # db.py will then automatically use Supabase
    # train database as fallback.
    # -----------------------------------------------------

    if data.get("_rapidapi_error"):

        log.warning(
            "Live train search unavailable | %s -> %s | error=%s",
            src_code,
            dst_code,
            data.get("_rapidapi_error"),
        )

        return []

    rows = data.get("data") or []

    if not isinstance(rows, list):
        return []

    trains = []

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
