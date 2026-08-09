import os
import httpx

RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY", "")
RAPIDAPI_HOST = "irctc1.p.rapidapi.com"
BASE_URL = "https://irctc1.p.rapidapi.com/api/v3"

_HEADERS = {
    "x-rapidapi-host": RAPIDAPI_HOST,
    "x-rapidapi-key": RAPIDAPI_KEY,
}


def _get(path: str, params: dict) -> dict:
    if not RAPIDAPI_KEY:
        raise RuntimeError("RAPIDAPI_KEY is not set as an environment variable.")
    with httpx.Client(timeout=10.0) as client:
        resp = client.get(f"{BASE_URL}{path}", headers=_HEADERS, params=params)
        resp.raise_for_status()
        return resp.json()


def resolve_station_code(name_or_code: str) -> str | None:
    """Convert a free-text station name (e.g. 'New Delhi') into its
    IRCTC station code (e.g. 'NDLS'). Returns None if nothing matches."""
    query = name_or_code.strip()
    if not query:
        return None
    # If it already looks like a 2-5 letter code, try it as-is first.
    try:
        data = _get("/searchStation", {"query": query})
    except Exception:
        return None

    rows = data.get("data") or []
    if not rows:
        return None
    # Prefer an exact name match, else take the first result.
    for r in rows:
        if str(r.get("station_name", "")).strip().lower() == query.lower():
            return r.get("station_code")
    return rows[0].get("station_code")


def fetch_trains_between(source: str, destination: str, date_iso: str) -> list[dict]:
    """Fetch real trains between two stations from the IRCTC (RapidAPI) provider.
    `source`/`destination` can be full names or codes — both get resolved to codes.
    Returns a list shaped like the existing TrainRow dicts used by main.py.
    Returns [] on any failure or if nothing is found (never fabricates data).
    """
    src_code = resolve_station_code(source)
    dst_code = resolve_station_code(destination)
    if not src_code or not dst_code:
        return []

    try:
        data = _get(
            "/trainBetweenStations",
            {
                "fromStationCode": src_code,
                "toStationCode": dst_code,
                "dateOfJourney": date_iso,
            },
        )
    except Exception:
        return []

    rows = data.get("data") or []
    trains = []
    for r in rows:
        trains.append(
            {
                "train_number": r.get("train_number", ""),
                "train_name": r.get("train_name", ""),
                "source_code": r.get("train_src") or src_code,
                "destination_code": r.get("train_dstn") or dst_code,
                "departure_time": r.get("from_std", ""),
                "arrival_time": r.get("to_std", ""),
                "duration": r.get("duration", ""),
            }
        )
    return trains
