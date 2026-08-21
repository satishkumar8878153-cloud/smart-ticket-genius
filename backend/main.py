"""Smart Ticket AI - plain Mission AI orchestration bootstrap.

Fetches known-good main (ab09089) and applies human-readable source patches.
Plain readable source patches only.
"""
from __future__ import annotations
import urllib.request

_GOOD = (
    "https://raw.githubusercontent.com/satishkumar8878153-cloud/"
    "smart-ticket-genius/ab09089acd55606f577da986550dd2550d15aeff/backend/main.py"
)

_CONSTANTS = r"""
CITY_CLUSTERS = {
    "patna": ["PNBE", "RJPB", "DNR", "PPTA", "PNC"],
    "danapur": ["DNR", "PNBE", "RJPB", "PPTA"],
    "delhi": ["NDLS", "DLI", "NZM", "ANVT"],
    "mumbai": ["MMCT", "BCT", "CSMT", "LTT", "BDTS"],
    "kolkata": ["HWH", "SDAH", "KOAA", "SHM"],
    "chennai": ["MAS", "MS"],
    "bengaluru": ["SBC", "BNC", "YPR"],
    "bangalore": ["SBC", "BNC", "YPR"],
    "bhagalpur": ["BGP"],
    "katihar": ["KIR"],
    "gaya": ["GAYA"],
    "ranchi": ["RNC"],
    "varanasi": ["BSB", "DDU"],
    "lucknow": ["LKO", "LJN"],
    "chhapra": ["CPR"],
    "chapra": ["CPR"],
    "buxar": ["BXR"],
    "ara": ["ARA"],
    "arrah": ["ARA"],
}
NEARBY_HUBS = {
    "patna": ["ARA", "BJU", "GAYA", "DDU", "MGS", "KIUL"],
    "danapur": ["ARA", "BJU", "PNBE"],
    "delhi": ["GZB", "MTJ", "AGC", "TDL"],
    "mumbai": ["KYN", "PUNE", "SURAT"],
    "kolkata": ["DKAE", "BDC", "KGP"],
    "chennai": ["TBM", "AJJ"],
    "bengaluru": ["KJM", "JTJ"],
    "bangalore": ["KJM", "JTJ"],
    "bhagalpur": ["JMP", "KGG"],
    "katihar": ["KGG", "BJU"],
    "gaya": ["PNBE", "DDU"],
    "ranchi": ["GAYA", "PNBE"],
    "varanasi": ["PNBE"],
    "lucknow": ["CNB"],
    "chhapra": ["PNBE", "ARA", "DDU"],
    "chapra": ["PNBE", "ARA", "DDU"],
    "buxar": ["ARA", "PNBE", "DDU", "MGS"],
    "ara": ["PNBE", "DNR", "DDU"],
    "arrah": ["PNBE", "DNR", "DDU"],
}
"""

# HELPER loaded from sibling module file to keep main.py small and push-safe.
import pathlib as _pathlib
_HELPER_PATH = _pathlib.Path(__file__).resolve().parent / "_route_helper_src.py"
if _HELPER_PATH.exists():
    _HELPER_AND_CORE = _HELPER_PATH.read_text()
else:
    _HELPER_AND_CORE = ""

_CHAT_BLOCK = r"""
    try:
        route_result = _route_search_core(
            intent["source"],
            intent["destination"],
            intent.get("travelClass") or "SL",
            intent.get("date"),
        )
        direct = route_result.get("direct_trains") or route_result.get("trains") or []
        nearby = route_result.get("nearby_options") or []
        candidates = direct + nearby
        if candidates:
            lines = []
            show = (direct or nearby)[:5]
            label = "Direct trains" if direct else "Nearby alternatives"
            lines.append(f"{label}: {len(direct or nearby)} found (showing top {len(show)}).")
            for n in show:
                board = n.get("board") or {}
                alight = n.get("alight") or {}
                dur = n.get("duration_minutes")
                hm = f"{dur // 60}h {dur % 60}m" if dur is not None else "n/a"
                dep = board.get("departure") or "?"
                arr = alight.get("arrival") or "?"
                tn = n.get("train_number") or "?"
                tname = n.get("train_name") or ""
                title = f"{tn} {tname}".strip()
                bcode = board.get("code") or "?"
                acode = alight.get("code") or "?"
                lines.append(f"• {title}: {bcode} {dep} → {acode} {arr} ({hm})")
            reply = "\n".join(lines)
            return {"reply": reply, "route": route_result, "result": route_result}
        tracked = route_result.get("tracked_trains_count") or 0
        reply = (
            f"No direct train in our tracked network yet (we track {tracked} trains today).\n"
            "Try: Delhi to Patna, Bhagalpur to Patna, Katihar to Patna, or Bengaluru to Chennai."
        )
        return {"reply": reply, "route": route_result, "result": route_result}
    except Exception as exp:
        log.exception("chat | route-search path failed: %s", exp)
"""

_MY_TRIPS = r"""
@app.get("/my-trips")
def my_trips(limit: int = 20, offset: int = 0):
    from datetime import date
    from db import get_client
    client = get_client()
    try:
        resp = (
            client.table("bookings")
            .select("*")
            .order("created_at", desc=True)
            .range(offset, offset + max(1, min(limit, 50)) - 1)
            .execute()
        )
        rows = resp.data or []
    except Exception as exc:
        log.exception("my_trips | fetch failed: %s", exc)
        return {"trips": []}
    trips = []
    for r in rows:
        train_number = str(r.get("train_number") or "").strip()
        class_code = str(r.get("class_code") or r.get("travel_class") or "SL").strip().upper() or "SL"
        journey_date = r.get("journey_date") or r.get("date")
        if isinstance(journey_date, str):
            journey_date = journey_date.split("T")[0]
        try:
            if journey_date:
                date.fromisoformat(journey_date)
            else:
                journey_date = date.today().isoformat()
        except ValueError:
            journey_date = date.today().isoformat()
        days_before = _days_before(journey_date)
        try:
            score, reason = _confirmation_score_and_reason(
                train_number, class_code, journey_date, days_before
            )
        except Exception as exc:
            log.exception("my_trips | risk score failed for %s: %s", train_number, exc)
            score, reason = 50, "Risk estimate unavailable right now."
        trips.append({
            "id": r.get("id"),
            "pnr": r.get("pnr"),
            "train_number": train_number,
            "train_name": r.get("train_name") or train_number,
            "class_code": class_code,
            "quota": r.get("quota") or "GN",
            "journey_date": journey_date,
            "boarding_code": r.get("boarding_code") or r.get("from_code") or r.get("source_code"),
            "destination_code": r.get("destination_code") or r.get("to_code"),
            "passengers": r.get("passengers") if r.get("passengers") is not None else r.get("pax"),
            "current_status": r.get("current_status") or r.get("status") or "UNKNOWN",
            "risk": {"score": score, "reason": reason},
        })
    return {"trips": trips}
"""

_SMART_SEARCH_ROUTE = r"""

@app.post("/smart-search")
def smart_search(payload: dict):
    from smart_search import run_smart_search
    src = str(payload.get("source") or payload.get("from") or "").strip()
    dst = str(payload.get("destination") or payload.get("to") or "").strip()
    jd = str(payload.get("journey_date") or payload.get("date") or "").strip() or None
    cls = str(payload.get("class_code") or payload.get("travelClass") or "SL").strip() or "SL"
    if not src or not dst:
        raise HTTPException(status_code=400, detail="from/source and to/destination are required")
    return run_smart_search(src, dst, jd, cls)
"""


def _patch(src: str) -> str:
    _old_db = "from db import fetch_trains_for_route, fetch_pnr_stats, fetch_stations"
    _new_db = (
        "from db import (fetch_trains_for_route, fetch_pnr_stats, fetch_stations, "
        "get_client, fetch_train_stops_for_stations, fetch_train_names, "
        "fetch_station_names_for_codes)"
    )
    if _old_db in src and "get_client" not in src[:3000]:
        src = src.replace(_old_db, _new_db, 1)
    marker = 'log = logging.getLogger("smart-ticket-ai")'
    idx = src.find(marker)
    if idx >= 0:
        idx = src.find("\n", idx) + 1
        src = src[:idx] + "\n" + _CONSTANTS + src[idx:]
    start = src.find("def _route_search_core")
    end = src.find('@app.post("/route-search")')
    if start >= 0 and end >= 0 and _HELPER_AND_CORE:
        src = src[:start] + _HELPER_AND_CORE + "\n\n" + src[end:]
    cstart = src.find("    try:\n        route_result = _route_search_core(")
    if cstart < 0:
        cstart = src.find("    try:\r\n        route_result = _route_search_core(")
    cend = src.find(
        "    # Fallback: existing endpoint-based search flow",
        cstart if cstart >= 0 else 0,
    )
    if cstart >= 0 and cend >= 0:
        src = src[:cstart] + _CHAT_BLOCK + "\n" + src[cend:]
    if '@app.get("/my-trips")' not in src:
        src = src.rstrip() + "\n" + _MY_TRIPS
    if '@app.post("/smart-search")' not in src:
        src = src.rstrip() + "\n" + _SMART_SEARCH_ROUTE
    return src


def bootstrap() -> None:
    with urllib.request.urlopen(_GOOD, timeout=60) as resp:
        src = resp.read().decode("utf-8")
    src = _patch(src)
    exec(compile(src, "backend/main.py", "exec"), globals())


bootstrap()
