import os
import httpx

RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY", "").strip().strip('"').strip("'")
RAPIDAPI_HOST = "irctc1.p.rapidapi.com"

BASE_URL = "https://irctc1.p.rapidapi.com/api/v3"
STATION_SEARCH_URL = "https://irctc1.p.rapidapi.com/api/v1/searchStation"

_HEADERS = {
    "x-rapidapi-host": RAPIDAPI_HOST,
    "x-rapidapi-key": RAPIDAPI_KEY,
    "Content-Type": "application/json",
}


def _get(url: str, params: dict) -> dict:
    if not RAPIDAPI_KEY:
        raise RuntimeError("RAPIDAPI_KEY is not set as an environment variable.")

    with httpx.Client(timeout=10.0, follow_redirects=True) as client:
        resp = client.get(
            url,
            headers=_HEADERS,
            params=params,
        )

    print(
        "RAPIDAPI DEBUG:",
        "status=", resp.status_code,
        "url=", str(resp.url),
        "body=", resp.text[:1000],
    )

    resp.raise_for_status()

    data = resp.json()

    if not isinstance(data, dict):
        raise RuntimeError("Unexpected RapidAPI response format.")

    return data


def resolve_station_code(name_or_code: str) -> str | None:
    query = name_or_code.strip()

    if not query:
        return None

    try:
        data = _get(
            STATION_SEARCH_URL,
            {"query": query},
        )
    except Exception as exc:
        print(
            "RAPIDAPI station search failed:",
            type(exc).__name__,
            str(exc),
        )
        return None

    rows = data.get("data") or []

    if not isinstance(rows, list) or not rows:
        return None

    query_lower = query.lower()

    for row in rows:
        if not isinstance(row, dict):
            continue

        eng_name = str(
            row.get("eng_name", "")
        ).strip().lower()

        code = row.get("code")

        if eng_name == query_lower and code:
            return str(code)

    first = rows[0]

    if isinstance(first, dict) and first.get("code"):
        return str(first.get("code"))

    return None


def fetch_trains_between(
    source: str,
    destination: str,
    date_iso: str,
) -> list[dict]:

    src_code = resolve_station_code(source)
    dst_code = resolve_station_code(destination)

    if not src_code or not dst_code:
        return []

    try:
        data = _get(
            f"{BASE_URL}/trainBetweenStations",
            {
                "fromStationCode": src_code,
                "toStationCode": dst_code,
                "dateOfJourney": date_iso,
            },
        )
    except Exception as exc:
        print(
            "RAPIDAPI train search failed:",
            type(exc).__name__,
            str(exc),
        )
        return []

    rows = data.get("data") or []

    if not isinstance(rows, list):
        return []

    trains: list[dict] = []

    for row in rows:
        if not isinstance(row, dict):
            continue

        trains.append(
            {
                "train_number": row.get(
                    "train_number",
                    "",
                ),
                "train_name": row.get(
                    "train_name",
                    "",
                ),
                "source_code": row.get(
                    "train_src"
                ) or src_code,
                "destination_code": row.get(
                    "train_dstn"
                ) or dst_code,
                "departure_time": row.get(
                    "from_std",
                    "",
                ),
                "arrival_time": row.get(
                    "to_std",
                    "",
                ),
                "duration": row.get(
                    "duration",
                    "",
                ),
            }
        )

    print(
        "RAPIDAPI live trains:",
        len(trains),
        "for",
        src_code,
        "->",
        dst_code,
        "on",
        date_iso,
    )

    return trains
