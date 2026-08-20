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
    # fetch_stations already ranks exact code/name/city before weak contains
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
    needle = (query or "").strip().lower()
    key = None
    for k in CITY_CLUSTERS:
        if k in needle or needle in k:
            key = k
            break
    primary = [m["code"] for m in resolve_stations(query)["matches"]]
    if key:
        primary = list(dict.fromkeys(primary + CITY_CLUSTERS[key]))
    return primary, NEARBY_HUBS.get(key, [])


def _route_search_core(source_q, dest_q, travel_class="SL", date_str=None) -> dict:
    suggestions = [
        "Delhi to Patna",
        "Bhagalpur to Patna",
        "Katihar to Patna",
        "Bengaluru to Chennai",
    ]
    empty = {
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
    primary_s, hubs_s = _cluster_and_hubs(source_q)
    primary_d, hubs_d = _cluster_and_hubs(dest_q)
    if not primary_s or not primary_d:
        return empty

    from datetime import date, timedelta
    if date_str:
        try:
            journey_date = date.fromisoformat(str(date_str)[:10]).isoformat()
        except ValueError:
            journey_date = (date.today() + timedelta(days=1)).isoformat()
    else:
        journey_date = (date.today() + timedelta(days=1)).isoformat()
    days_before = _days_before(journey_date)
    from db import get_client, fetch_train_stops_for_stations, fetch_train_names, fetch_station_names_for_codes
    client = get_client()
    # Phase 1: primary stations only (keeps Patna↔Delhi under control)
    primary_codes = list(dict.fromkeys(primary_s + primary_d))
    trains = {}
    for s in fetch_train_stops_for_stations(client, primary_codes):
        trains.setdefault(s["train_number"], {})[s["station_code"]] = s
    tracked = 5208
    train_names_map = fetch_train_names(client)
    name_codes = list(dict.fromkeys(primary_s + primary_d + hubs_s + hubs_d))
    station_names = fetch_station_names_for_codes(client, name_codes)

    def _pair_candidate(train_number, stop_map, sc, dc, nearby=False, note=None):
        a = stop_map.get(sc)
        b = stop_map.get(dc)
        if not a or not b or a["stop_sequence"] >= b["stop_sequence"]:
            return None
        dep = _time_to_minutes(a.get("departure_time"))
        arr = _time_to_minutes(b.get("arrival_time"))
        dur = None
        if dep is not None and arr is not None:
            day_diff = (b.get("day_offset") or 0) - (a.get("day_offset") or 0)
            dur = arr + day_diff * 1440 - dep
        score, reason = _confirmation_score_and_reason(
            train_number, travel_class, journey_date, days_before
        )
        cand = {
            "train_number": train_number,
            "train_name": train_names_map.get(train_number),
            "board": {
                "code": sc,
                "name": station_names.get(sc),
                "departure": a.get("departure_time"),
                "day_offset": a.get("day_offset"),
            },
            "alight": {
                "code": dc,
                "name": station_names.get(dc),
                "arrival": b.get("arrival_time"),
                "day_offset": b.get("day_offset"),
            },
            "stops_between": b["stop_sequence"] - a["stop_sequence"],
            "duration_minutes": dur,
            "classes": _build_availability(journey_date, days_before),
            "requested_class": {
                "class": travel_class,
                "score": score,
                "reason": reason,
            },
        }
        if nearby:
            cand["has_nearby"] = True
            cand["note"] = note or f"Board at {sc} instead of {source_q} area"
        return cand

    direct = []
    for train_number, stop_map in trains.items():
        best = None
        for sc in primary_s:
            for dc in primary_d:
                cand = _pair_candidate(train_number, stop_map, sc, dc, nearby=False)
                if cand is None:
                    continue
                if best is None or cand["stops_between"] < best["stops_between"]:
                    best = cand
        if best:
            direct.append(best)
    direct.sort(key=lambda r: (r["duration_minutes"] is None, r["duration_minutes"] or 0))

    expand_s = list(dict.fromkeys(primary_s + hubs_s))
    expand_d = list(dict.fromkeys(primary_d + hubs_d))
    primary_pairs = {(sc, dc) for sc in primary_s for dc in primary_d}
    nearby = []
    # Phase 2: only if no direct trains, load hub stops for nearby options
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
            h, m = dur // 60, dur % 60
            board = c.get("board") or {}
            scored.append((total, {
                "train_number": c["train_number"],
                "board": board,
                "alight": c.get("alight"),
                "duration_minutes": c.get("duration_minutes"),
                "score": total,
                "reason": reason or f"~{h}h {m}m journey",
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
                title = f"{tn}" + (f" {tname}" if tname else "")
                cls = ((n.get("requested_class") or {}).get("class")) or intent.get("travelClass") or "SL"
                score = (n.get("requested_class") or {}).get("score")
                score_bit = f", confirm~{score}%" if score is not None else ""
                lines.append(
                    f"• {title}: "
                    f"{board.get('name') or board.get('code')} {dep} → "
                    f"{alight.get('name') or alight.get('code')} {arr} "
                    f"({hm}, {n.get('stops_between', '?')} stops, {cls}{score_bit})"
                )
            if nearby and not direct:
                lines.append("Note: nearby hub alternatives (not pure direct OD).")
            reply = "\n".join(lines)
            return {"reply": reply, "route": route_result}
        N = route_result.get("tracked_trains_count") or 0
        empty_reply = (
            f"No direct train in our tracked network yet (we track {N} trains today). "
            f"Try: Delhi to Patna, Bhagalpur to Patna, Katihar to Patna, or Bengaluru to Chennai."
        )
        # still fall back to old search() result if it has trains
    except Exception as exp:
        log.exception("chat | route-search path failed: %s", exp)
        empty_reply = None
        route_result = None
"""

_MY_TRIPS = r"""

@app.get("/my-trips")
def my_trips(limit: int = 20, offset: int = 0):
    from db import get_client
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
            log.exception("my_trips | risk score failed for %s: %s", train_number, exp)
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
