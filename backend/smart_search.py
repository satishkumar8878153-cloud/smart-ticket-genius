"""Smart Search Orchestrator — alternative journey discovery (compact)."""
from __future__ import annotations
import logging, time
from datetime import date
from typing import Any
from db import (
    get_client, fetch_stations, fetch_train_stops_for_stations,
    fetch_train_names, fetch_station_names_for_codes, fetch_pnr_stats,
)
from prediction import heuristic_confirmation_score

log = logging.getLogger("smart-ticket-ai.smart-search")

CITY_CLUSTERS = {
    "patna": ["PNBE", "RJPB", "DNR", "PPTA", "PNC"],
    "danapur": ["DNR", "PNBE", "RJPB", "PPTA"],
    "delhi": ["NDLS", "DLI", "NZM", "ANVT"],
    "new delhi": ["NDLS", "DLI", "NZM", "ANVT"],
    "mumbai": ["LTT", "CSMT", "BDTS", "MMCT", "BCT"],
    "kolkata": ["HWH", "SDAH", "KOAA", "SHM"],
    "chennai": ["MAS", "MS"],
    "bengaluru": ["SBC", "BNC", "YPR"],
    "bangalore": ["SBC", "BNC", "YPR"],
    "bhagalpur": ["BGP"], "katihar": ["KIR"], "gaya": ["GAYA"],
    "ranchi": ["RNC"], "varanasi": ["BSB", "DDU"], "lucknow": ["LKO", "LJN"],
    "chhapra": ["CPR"], "chapra": ["CPR"], "buxar": ["BXR"],
    "ara": ["ARA"], "arrah": ["ARA"],
}
NEARBY_HUBS = {
    "patna": ["ARA", "BJU", "GAYA", "DDU", "KIUL", "CPR"],
    "danapur": ["ARA", "BJU", "PNBE", "CPR"],
    "delhi": ["GZB", "MTJ"], "new delhi": ["GZB", "MTJ"],
    "mumbai": ["KYN"], "kolkata": ["DKAE", "BDC"], "chennai": ["TBM"],
    "bengaluru": ["KJM"], "bangalore": ["KJM"],
    "bhagalpur": ["JMP", "KGG"], "katihar": ["KGG", "BJU"],
    "gaya": ["PNBE", "DDU"], "ranchi": ["GAYA"], "varanasi": ["DDU"],
    "lucknow": ["CNB"], "chhapra": ["PNBE", "ARA", "DDU"], "chapra": ["PNBE", "ARA", "DDU"],
    "buxar": ["ARA", "PNBE", "DDU", "MGS"], "ara": ["PNBE", "DNR", "DDU"], "arrah": ["PNBE", "DNR", "DDU"],
}
MAX_ORIGIN_PRIMARY, MAX_DEST_PRIMARY, MAX_HUB_ORIGIN, MAX_HUB_DEST = 5, 5, 4, 2
MAX_DIRECT, MAX_ALT, MAX_STOPS_CODES = 20, 15, 14

def _days_before(jd):
    if not jd: return 7
    try: return max(0, (date.fromisoformat(str(jd)[:10]) - date.today()).days)
    except ValueError: return 7

def _match_cluster_key(query):
    needle = (query or "").strip().lower()
    if not needle: return None
    if needle in CITY_CLUSTERS:
        return needle
    for k in sorted(CITY_CLUSTERS.keys(), key=len, reverse=True):
        if k in needle or needle in k: return k
    return None

def _match_cluster_key_exact(query):
    needle = (query or "").strip().lower()
    if needle in CITY_CLUSTERS:
        return needle
    return None

def _is_explicit_station_code(query):
    raw = (query or "").strip()
    if not raw or any(ch.isspace() for ch in raw):
        return False
    upper = raw.upper()
    if not (2 <= len(upper) <= 5 and upper.isalnum()):
        return False
    city_key = _match_cluster_key_exact(raw)
    if city_key is not None and raw != upper:
        return False
    known_code = False
    for r in fetch_stations(upper, limit=5):
        if str(r.get("code") or "").strip().upper() == upper:
            known_code = True
            break
    if not known_code:
        return False
    if raw == upper:
        return True
    if city_key is None:
        return True
    return False

def _strong_primary_codes(query, limit=5, allow_starts=True):
    needle = (query or "").strip()
    if not needle:
        return []
    rows = fetch_stations(needle, limit=max(30, limit * 4))
    q_upper, q_lower = needle.upper(), needle.lower()
    exact_code, exact_name, exact_city, starts, seen = [], [], [], [], set()
    def push(bucket, code):
        if code and code not in seen:
            seen.add(code)
            bucket.append(code)
    for r in rows:
        c = str(r.get("code") or "").strip().upper()
        name = str(r.get("name") or "").strip().lower()
        city = str(r.get("city") or "").strip().lower()
        if not c:
            continue
        if c == q_upper:
            push(exact_code, c)
        elif name == q_lower or name.rstrip(".") == q_lower:
            push(exact_name, c)
        elif city == q_lower:
            push(exact_city, c)
        elif allow_starts and (
            name.startswith(q_lower)
            or city.startswith(q_lower)
            or (len(q_upper) >= 3 and c.startswith(q_upper))
        ):
            push(starts, c)
    ordered = exact_code + exact_name + exact_city
    if allow_starts:
        ordered = ordered + starts
    return ordered[:limit]

def expand_candidates(query):
    raw = (query or "").strip()
    city_key = _match_cluster_key_exact(raw)
    is_code = _is_explicit_station_code(raw)
    key = None if is_code else (city_key or _match_cluster_key(raw))
    if is_code:
        return {
            "query": raw,
            "cluster_key": None,
            "primary": [raw.upper()],
            "hubs": [],
            "is_code": True,
        }
    if key and CITY_CLUSTERS.get(key):
        primary = list(dict.fromkeys(CITY_CLUSTERS[key]))
        for c in _strong_primary_codes(raw, limit=MAX_ORIGIN_PRIMARY, allow_starts=False):
            if c not in primary:
                primary.append(c)
        primary = primary[:MAX_ORIGIN_PRIMARY]
        hubs = list(NEARBY_HUBS.get(key, []))[:MAX_HUB_ORIGIN]
        return {
            "query": raw,
            "cluster_key": key,
            "primary": primary,
            "hubs": hubs,
            "is_code": False,
        }
    primary = _strong_primary_codes(raw, limit=MAX_ORIGIN_PRIMARY, allow_starts=True)
    hubs = []
    return {
        "query": raw,
        "cluster_key": key,
        "primary": primary,
        "hubs": hubs,
        "is_code": False,
    }

def _parse_time_minutes(t):
    if not t: return None
    parts = str(t).strip().split(":")
    if len(parts) < 2: return None
    try: return int(parts[0]) * 60 + int(parts[1])
    except ValueError: return None

def _duration_minutes(board, alight):
    dep = _parse_time_minutes(board.get("departure_time") or board.get("departure"))
    arr = _parse_time_minutes(alight.get("arrival_time") or alight.get("arrival"))
    if dep is None or arr is None: return None
    day_b, day_a = int(board.get("day_offset") or 0), int(alight.get("day_offset") or 0)
    return (day_a * 1440 + arr) - (day_b * 1440 + dep)

def _build_train_index(stops):
    trains = {}
    for s in stops:
        tn = str(s.get("train_number") or "").strip()
        sc = str(s.get("station_code") or "").strip().upper()
        if tn and sc: trains.setdefault(tn, {})[sc] = s
    return trains

def _pair(train_number, stop_map, sc, dc, names, station_names):
    board, alight = stop_map.get(sc), stop_map.get(dc)
    if not board or not alight: return None
    seq_b, seq_a = board.get("stop_sequence"), alight.get("stop_sequence")
    if seq_b is None or seq_a is None: return None
    try:
        if int(seq_a) <= int(seq_b): return None
    except (TypeError, ValueError): return None
    dur = _duration_minutes(board, alight)
    if dur is not None and dur <= 0: return None
    day_b, day_a = int(board.get("day_offset") or 0), int(alight.get("day_offset") or 0)
    return {
        "train_number": train_number, "train_name": names.get(train_number) or "",
        "board": {"code": sc, "name": station_names.get(sc) or sc,
                  "departure": (board.get("departure_time") or board.get("departure") or "")[:8], "day_offset": day_b},
        "alight": {"code": dc, "name": station_names.get(dc) or dc,
                   "arrival": (alight.get("arrival_time") or alight.get("arrival") or "")[:8], "day_offset": day_a},
        "duration_minutes": dur, "stops_between": max(0, int(seq_a) - int(seq_b) - 1), "day_offset": day_a - day_b,
    }

def _category(sc, dc, op, dp, oh, dh):
    if sc in op and dc in dp: return "direct"
    if sc in oh and dc in dp: return "hub_origin"
    if sc in op and dc in dh: return "hub_destination"
    if sc not in op and dc in dp: return "nearby_origin"
    if sc in op and dc not in dp: return "nearby_destination"
    return "hub"

def _why(cat, sc, dc, oq, dq):
    if cat == "direct": return f"Direct timetable option on {sc} → {dc}"
    if cat == "nearby_origin": return f"Nearby origin: board at {sc} instead of {oq} area"
    if cat == "nearby_destination": return f"Nearby destination: alight at {dc} instead of {dq} area"
    if cat == "hub_origin": return f"Hub alternative: major nearby hub {sc} → {dc}"
    if cat == "hub_destination": return f"Hub destination: {sc} → {dc}"
    return f"Alternative timetable option {sc} → {dc}"

def _rank_score(row):
    cat = row.get("category") or ""
    cat_w = {"direct": 1000, "nearby_origin": 700, "nearby_destination": 650,
             "hub_origin": 500, "hub_destination": 450, "hub": 400}.get(cat, 300)
    dur = row.get("duration_minutes")
    dur_w = 0.0 if dur is None else max(0.0, 400.0 - float(dur) / 5.0)
    stop_w = max(0, 80 - int(row.get("stops_between") or 0))
    rc = row.get("requested_class") or {}
    hist = float(rc["score"]) * 0.05 if isinstance(rc.get("score"), (int, float)) else 0.0
    return cat_w + dur_w + stop_w + hist

def _attach_historical(rows, travel_class, journey_date):
    days = _days_before(journey_date)
    for r in rows:
        score, reason = None, None
        try:
            stats = fetch_pnr_stats(r.get("train_number") or "", travel_class, journey_date)
            if stats and stats.get("sample_size"):
                conf = stats.get("confirm_rate")
                if conf is not None:
                    score = int(round(float(conf) * 100)) if conf <= 1 else int(conf)
                    reason = f"Historical confirmation estimate ~{score}% (limited sample n={stats.get('sample_size')}; not live availability)."
        except Exception:
            pass
        if score is None:
            score = heuristic_confirmation_score(travel_class, journey_date or date.today().isoformat(), days)
            reason = f"~{score}% heuristic estimate only — not live availability (historical PNR sample is too small for reliable prediction)."
        r["requested_class"] = {"class": travel_class, "score": score, "reason": reason}
        r["label"] = "Timetable option"

def run_smart_search(source, destination, journey_date=None, class_code="SL"):
    t0 = time.perf_counter()
    source, destination = (source or "").strip(), (destination or "").strip()
    travel_class = (class_code or "SL").strip().upper() or "SL"
    journey_date = (journey_date or date.today().isoformat())[:10]
    empty = {"request": {"from": source, "to": destination, "journey_date": journey_date, "class_code": travel_class},
             "direct_options": [], "alternative_options": [], "nearby_origin_options": [],
             "nearby_destination_options": [], "hub_options": [], "search_summary": {}, "recommendation": None,
             "suggestions": ["Delhi to Patna", "Bhagalpur to Patna", "Katihar to Patna", "Bengaluru to Chennai"]}
    if not source or not destination:
        empty["search_summary"] = {"error": "from and to are required", "latency_ms": int((time.perf_counter()-t0)*1000)}
        return empty
    if source.lower() == destination.lower():
        empty["search_summary"] = {"error": "origin and destination must differ", "latency_ms": 0}
        return empty
    origin, dest = expand_candidates(source), expand_candidates(destination)
    origin_primary = origin["primary"][:MAX_ORIGIN_PRIMARY]
    dest_primary = dest["primary"][:MAX_DEST_PRIMARY]
    origin_hubs = origin["hubs"][:MAX_HUB_ORIGIN]
    dest_hubs = dest["hubs"][:MAX_HUB_DEST]
    if not origin_primary or not dest_primary:
        empty["search_summary"] = {"resolved_origin": origin, "resolved_destination": dest,
            "error": "could not resolve stations", "latency_ms": int((time.perf_counter()-t0)*1000)}
        return empty
    codes_a = list(dict.fromkeys(origin_primary + dest_primary))[:MAX_STOPS_CODES]
    client = get_client()
    trains_a = _build_train_index(fetch_train_stops_for_stations(client, codes_a))
    names = fetch_train_names(client)
    station_names = fetch_station_names_for_codes(client, codes_a)
    origin_p_set, dest_p_set = set(origin_primary), set(dest_primary)
    origin_h_set, dest_h_set = set(origin_hubs), set(dest_hubs)
    direct, seen_keys = [], set()
    for tn, stop_map in trains_a.items():
        best = best_sc = best_dc = None
        for sc in origin_primary:
            for dc in dest_primary:
                cand = _pair(tn, stop_map, sc, dc, names, station_names)
                if cand and (best is None or (cand["duration_minutes"] or 10**9) < (best["duration_minutes"] or 10**9)):
                    best, best_sc, best_dc = cand, sc, dc
        if best and best_sc and best_dc:
            key = (best["train_number"], best_sc, best_dc)
            if key not in seen_keys:
                seen_keys.add(key)
                cat = _category(best_sc, best_dc, origin_p_set, dest_p_set, origin_h_set, dest_h_set)
                best["category"] = cat
                best["why"] = _why(cat, best_sc, best_dc, source, destination)
                best["alternative_source"] = cat
                if cat == "direct": direct.append(best)
    alternatives, codes_loaded = [], len(codes_a)
    if len(direct) < 3 and (origin_hubs or dest_hubs):
        expand_o = list(dict.fromkeys(origin_primary + origin_hubs))
        expand_d = list(dict.fromkeys(dest_primary + dest_hubs))
        codes_b = list(dict.fromkeys(expand_o + expand_d))[:MAX_STOPS_CODES]
        extra = [c for c in codes_b if c not in codes_a]
        if extra:
            codes_loaded = len(codes_b)
            for tn, sm in _build_train_index(fetch_train_stops_for_stations(client, extra)).items():
                trains_a.setdefault(tn, {}).update(sm)
            station_names.update(fetch_station_names_for_codes(client, extra))
        primary_pairs = {(sc, dc) for sc in origin_primary for dc in dest_primary}
        for tn, stop_map in trains_a.items():
            best = best_sc = best_dc = None
            for sc in expand_o:
                for dc in expand_d:
                    if (sc, dc) in primary_pairs: continue
                    cand = _pair(tn, stop_map, sc, dc, names, station_names)
                    if cand and (best is None or (cand["duration_minutes"] or 10**9) < (best["duration_minutes"] or 10**9)):
                        best, best_sc, best_dc = cand, sc, dc
            if best and best_sc and best_dc:
                key = (best["train_number"], best_sc, best_dc)
                if key in seen_keys: continue
                seen_keys.add(key)
                cat = _category(best_sc, best_dc, origin_p_set, dest_p_set, origin_h_set, dest_h_set)
                best["category"] = cat
                best["why"] = _why(cat, best_sc, best_dc, source, destination)
                best["alternative_source"] = cat
                alternatives.append(best)
    _attach_historical(direct, travel_class, journey_date)
    _attach_historical(alternatives, travel_class, journey_date)
    direct = sorted(direct, key=_rank_score, reverse=True)[:MAX_DIRECT]
    alternatives = sorted(alternatives, key=_rank_score, reverse=True)[:MAX_ALT]
    nearby_origin = [r for r in alternatives if r.get("category") == "nearby_origin"]
    nearby_dest = [r for r in alternatives if r.get("category") == "nearby_destination"]
    hub_opts = [r for r in alternatives if r.get("category") in ("hub_origin", "hub_destination", "hub")]
    recommendation = None
    pool = direct + alternatives
    if pool:
        top = sorted(pool, key=_rank_score, reverse=True)[0]
        recommendation = {
            "train_number": top["train_number"], "train_name": top.get("train_name"),
            "board": top.get("board"), "alight": top.get("alight"),
            "duration_minutes": top.get("duration_minutes"), "category": top.get("category"),
            "why": top.get("why"), "score": int(_rank_score(top)), "label": "Best timetable option",
            "requested_class": top.get("requested_class"),
        }
    return {
        "request": {"from": source, "to": destination, "journey_date": journey_date, "class_code": travel_class},
        "resolved": {"origin": origin, "destination": dest},
        "direct_options": direct, "alternative_options": alternatives,
        "nearby_origin_options": nearby_origin, "nearby_destination_options": nearby_dest,
        "hub_options": hub_opts,
        "search_summary": {
            "origin_primary": origin_primary, "destination_primary": dest_primary,
            "origin_hubs_used": origin_hubs if len(direct) < 3 else [],
            "destination_hubs_used": dest_hubs if len(direct) < 3 else [],
            "station_codes_loaded": codes_loaded, "trains_indexed": len(trains_a),
            "direct_count": len(direct), "alternative_count": len(alternatives),
            "latency_ms": int((time.perf_counter() - t0) * 1000),
            "note": "Timetable options only — not live seat availability.",
        },
        "recommendation": recommendation,
        "suggestions": ["Delhi to Patna", "Bhagalpur to Patna", "Katihar to Patna", "Bengaluru to Chennai"],
    }
