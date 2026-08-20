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
}
"""

_HELPER_AND_CORE = r"""
def resolve_stations(q: str = "", limit: int = 20):
    # Resolve against production stations (ranked DB search, not first-N rows).
    needle = (q or "").strip()
    if not needle:
        return {"query": q, "matches": []}
    rows = fetch_stations(needle, limit=max(limit, 30))
    matches = []
    seen = set()
    for r in rows:
        c = r.get("code")
        if c and c not in seen:
            seen.add(c)
            matches.append({"code": c, "name": r.get("name"), "city": r.get("city")})
        if len(matches) >= limit:
            break
    return {"query": q, "matches": matches}


def _cluster_and_hubs(query):
    raw = (query or "").strip()
    needle = raw.lower()
    # Exact station-code query: do not expand full city cluster (major latency win)
    is_code = 2 <= len(raw) <= 5 and raw.replace(" ", "").isalnum()
    key = None
    if not is_code:
        for k in CITY_CLUSTERS:
            if k in needle or needle in k:
                key = k
                break
    primary = [m["code"] for m in resolve_stations(query)["matches"]]
    if is_code and primary:
        upper = raw.upper()
        if upper in {p.upper() for p in primary}:
            primary = [upper]
        else:
            primary = primary[:1]
        return primary, []
    if key:
        primary = list(dict.fromkeys(primary + CITY_CLUSTERS[key]))
    # Bound city expansion to keep stop loading practical on Render
    primary = primary[:5]
    hubs = NEARBY_HUBS.get(key, []) if key else []
    return primary, hubs


def _route_search_core(source_q, dest_q, travel_class="SL", date_str=None) -> dict:
    from datetime import date as _date
    journey_date = (date_str or _date.today().isoformat())[:10]
    days_before = _days_before(journey_date)
    primary_s, hubs_s = _cluster_and_hubs(source_q)
    primary_d, hubs_d = _cluster_and_hubs(dest_q)
    suggestions = [
        "Delhi to Patna",
        "Bhagalpur to Patna",
        "Katihar to Patna",
        "Bengaluru to Chennai",
    ]
    if not primary_s or not primary_d:
        return {
            "source_query": source_q,
            "destination_query": dest_q,
            "trains": [],
            "direct_trains": [],
            "nearby_options": [],
            "alternative_dates": [],
            "class_alternatives": [],
            "recommendation": None,
            "suggestions": suggestions,
            "tracked_trains_count": 0,
        }
    client = get_client()
    primary_codes = list(dict.fromkeys(primary_s + primary_d))
    stops = fetch_train_stops_for_stations(client, primary_codes)
    trains = {}
    for s in stops:
        trains.setdefault(s["train_number"], {})[s["station_code"]] = s
    tracked = len(trains)
    names = fetch_train_names(client)
    station_names = fetch_station_names_for_codes(client, primary_codes)

    def _pair_candidate(train_number, stop_map, sc, dc, nearby=False, note=None):
        board = stop_map.get(sc)
        alight = stop_map.get(dc)
        if not board or not alight:
            return None
        try:
            if int(alight["stop_sequence"]) <= int(board["stop_sequence"]):
                return None
        except (TypeError, ValueError, KeyError):
            return None
        def _mins(t):
            if not t:
                return None
            p = str(t).split(":")
            if len(p) < 2:
                return None
            try:
                return int(p[0]) * 60 + int(p[1])
            except ValueError:
                return None
        dep = _mins(board.get("departure_time"))
        arr = _mins(alight.get("arrival_time"))
        dur = None
        if dep is not None and arr is not None:
            day_b = int(board.get("day_offset") or 0)
            day_a = int(alight.get("day_offset") or 0)
            dur = (day_a * 1440 + arr) - (day_b * 1440 + dep)
            if dur <= 0:
                return None
        stops_between = max(0, int(alight["stop_sequence"]) - int(board["stop_sequence"]) - 1)
        return {
            "train_number": train_number,
            "train_name": names.get(train_number) or "",
            "board": {
                "code": sc,
                "name": station_names.get(sc) or sc,
                "departure": (board.get("departure_time") or "")[:8],
                "day_offset": int(board.get("day_offset") or 0),
            },
            "alight": {
                "code": dc,
                "name": station_names.get(dc) or dc,
                "arrival": (alight.get("arrival_time") or "")[:8],
                "day_offset": int(alight.get("day_offset") or 0),
            },
            "duration_minutes": dur,
            "stops_between": stops_between,
            "has_nearby": nearby,
            "note": note,
        }

    direct = []
    for train_number, stop_map in trains.items():
        best = None
        for sc in primary_s:
            for dc in primary_d:
                cand = _pair_candidate(train_number, stop_map, sc, dc)
                if cand is None:
                    continue
                if best is None or (cand["duration_minutes"] or 10**9) < (best["duration_minutes"] or 10**9):
                    best = cand
        if best:
            direct.append(best)
    direct.sort(key=lambda r: (r["duration_minutes"] is None, r["duration_minutes"] or 0))

    expand_s = list(dict.fromkeys(primary_s + hubs_s))
    expand_d = list(dict.fromkeys(primary_d + hubs_d))
    primary_pairs = {(sc, dc) for sc in primary_s for dc in primary_d}
    nearby = []
    if not direct and (hubs_s or hubs_d):
        hub_only = [c for c in (hubs_s + hubs_d) if c not in primary_codes]
        if hub_only:
            for s in fetch_train_stops_for_stations(client, hub_only + primary_codes):
                trains.setdefault(s["train_number"], {})[s["station_code"]] = s
    for train_number, stop_map in trains.items():
        best = None
        for sc in expand_s:
            for dc in expand_d:
                if (sc, dc) in primary_pairs:
                    continue
                note = None
                if sc not in primary_s:
                    note = f"Board at {sc} instead of {source_q} area"
                elif dc not in primary_d:
                    note = f"Alight at {dc} instead of {dest_q} area"
                cand = _pair_candidate(train_number, stop_map, sc, dc, nearby=True, note=note)
                if cand is None:
                    continue
                if best is None or (cand["duration_minutes"] or 10**9) < (best["duration_minutes"] or 10**9):
                    best = cand
        if best:
            nearby.append(best)
    nearby.sort(key=lambda r: (r["duration_minutes"] is None, r["duration_minutes"] or 0))
    nearby = nearby[:3]

    def _attach_scores(rows, limit=15):
        for c in rows[:limit]:
            score, reason = _confirmation_score_and_reason(
                c["train_number"], travel_class, journey_date, days_before
            )
            c["requested_class"] = {
                "class": travel_class,
                "score": score,
                "reason": reason,
            }
        for c in rows[limit:]:
            score = heuristic_confirmation_score(travel_class, journey_date, days_before)
            c["requested_class"] = {
                "class": travel_class,
                "score": score,
                "reason": f"{score}% estimated (not historically scored).",
            }
        return rows

    direct = _attach_scores(direct, limit=15)
    nearby = _attach_scores(nearby, limit=5)
    candidates = direct + nearby

    recommendation = None
    if candidates:
        scored = []
        for c in candidates:
            hist = (c.get("requested_class") or {}).get("score") or 50
            reason = (c.get("requested_class") or {}).get("reason") or ""
            dur = c.get("duration_minutes")
            if dur is None:
                dur = 1440
            has_nearby = bool(c.get("has_nearby"))
            total = int(0.6 * hist + 0.2 * max(0, 100 - dur / 20) + 0.2 * (100 if not has_nearby else 60))
            h, mm = dur // 60, dur % 60
            board = c.get("board") or {}
            scored.append((total, {
                "train_number": c["train_number"],
                "board": board,
                "alight": c.get("alight"),
                "duration_minutes": c.get("duration_minutes"),
                "score": total,
                "reason": reason or f"~{h}h {mm}m journey",
            }))
        scored.sort(key=lambda x: -x[0])
        recommendation = scored[0][1]

    out = {
        "source_query": source_q,
        "destination_query": dest_q,
        "trains": direct,
        "direct_trains": direct,
        "nearby_options": nearby if not direct else [],
        "alternative_dates": [],
        "class_alternatives": [],
        "recommendation": recommendation,
        "suggestions": suggestions,
        "tracked_trains_count": tracked,
    }
    return out
"""

_CHAT_BLOCK = r"""
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
        else:
            tracked = route_result.get("tracked_trains_count") or 0
            reply = (
                f"No direct train in our tracked network yet (we track {tracked} trains today).\n"
                "Try: Delhi to Patna, Bhagalpur to Patna, Katihar to Patna, or Bengaluru to Chennai."
            )
        return {
            "reply": reply,
            "route": route_result,
            "result": route_result,
        }
"""

_MY_TRIPS = r"""
@app.get("/my-trips")
def my_trips(limit: int = 20, offset: int = 0):
    from datetime import date
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


def _patch(src: str) -> str:
    marker = 'log = logging.getLogger("smart-ticket-ai")'
    idx = src.find(marker)
    if idx >= 0:
        idx = src.find("\n", idx) + 1
        src = src[:idx] + "\n" + _CONSTANTS + src[idx:]
    start = src.find("def _route_search_core")
    end = src.find('@app.post("/route-search")')
    if start >= 0 and end >= 0:
        src = src[:start] + _HELPER_AND_CORE + "\n\n" + src[end:]
    cstart = src.find("        route_result = _route_search_core(")
    cend = src.find(
        "    # Fallback: existing endpoint-based search flow",
        cstart if cstart >= 0 else 0,
    )
    if cstart >= 0 and cend >= 0:
        src = src[:cstart] + _CHAT_BLOCK + "\n" + src[cend:]
    if '@app.get("/my-trips")' not in src:
        src = src.rstrip() + "\n" + _MY_TRIPS
    return src


def bootstrap() -> None:
    with urllib.request.urlopen(_GOOD, timeout=60) as resp:
        src = resp.read().decode("utf-8")
    src = _patch(src)
    exec(compile(src, "backend/main.py", "exec"), globals())


bootstrap()


# ---------------------------------------------------------------------------
# Smart Search Orchestrator (alternative journey discovery)
# Registered after bootstrap so it uses the live FastAPI app instance.
# ---------------------------------------------------------------------------

def _register_smart_search_route() -> None:
    """Attach POST /smart-search without altering bootstrap-patched core."""
    from fastapi import HTTPException
    from pydantic import BaseModel, Field
    from typing import Optional

    class SmartSearchBody(BaseModel):
        source: Optional[str] = Field(None, description="Origin city or station")
        destination: Optional[str] = Field(None, description="Destination city or station")
        from_: Optional[str] = Field(None, alias="from")
        to: Optional[str] = None
        journey_date: Optional[str] = None
        date: Optional[str] = None
        class_code: Optional[str] = None
        travelClass: Optional[str] = None

        class Config:
            populate_by_name = True

    @app.post("/smart-search")
    def smart_search(body: SmartSearchBody):
        from smart_search import run_smart_search
        src = (body.source or body.from_ or "").strip()
        dst = (body.destination or body.to or "").strip()
        jd = (body.journey_date or body.date or "").strip() or None
        cls = (body.class_code or body.travelClass or "SL").strip() or "SL"
        if not src or not dst:
            raise HTTPException(status_code=400, detail="from/source and to/destination are required")
        return run_smart_search(src, dst, jd, cls)

    log.info("smart-search | POST /smart-search registered")


try:
    _register_smart_search_route()
except Exception as _ss_exc:
    import logging as _logging
    _logging.getLogger("smart-ticket-ai").exception(
        "smart-search registration failed: %s", _ss_exc
    )
