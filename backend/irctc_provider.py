import os
import httpx

RAPIDAPI_KEY = os.environ.get("RAPIDAPI_KEY", "")
RAPIDAPI_HOST = "irctc1.p.rapidapi.com"
BASE_URL = "https://irctc1.p.rapidapi.com/api/v3"

_HEADERS = {
    "x-rapidapi-host": RAPIDAPI_HOST,
    "x-rapidapi-key": RAPIDAPI_KEY,
    "Content-Type": "application/json",
}

def _get(path: str, params: dict) -> dict:
    if not RAPIDAPI_KEY:
        raise RuntimeError("RAPIDAPI_KEY is not set as an environment variable.")

    with httpx.Client(timeout=10.0, follow_redirects=True) as client:
        resp = client.get(
            f"{BASE_URL}{path}",
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
        return resp.json()


def resolve_station_code(name_or_code: str) -> str | None:
    query = name_or_code.strip()
    if not query:
        return None
    try:
        with httpx.Client(timeout=10.0, follow_redirects=True) as client:
    resp = client.get(
        STATION_SEARCH_URL,
        headers=_HEADERS,
        params={"query": query},
    )
    print(
        "RAPIDAPI DEBUG:",
        "status=", resp.status_code,
        "url=", str(resp.url),
        "body=", resp.text[:1000],
    )
    resp.raise_for_status()
    data = resp.json()
    except Exception:
        return None

    rows = data.get("data") or []
    if not rows:
        return None
    for r in rows:
        if str(r.get("eng_name", "")).strip().lower() == query.lower():
            return r.get("code")
    return rows[0].get("code")


def fetch_trains_between(source: str, destination: str, date_iso: str) -> list[dict]:
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
STATION_SEARCH_URL = "https://irctc1.p.rapidapi.com/api/v1/searchStation"    
