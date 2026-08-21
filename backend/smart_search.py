"""Smart Search Orchestrator — advanced alternative journey discovery.

Timetable / alternative boarding-destination engine only.
Does NOT: multi-train connections, live availability, operating-day verification,
or invent confirmation probabilities from thin PNR samples.
"""
from __future__ import annotations

import logging
import time
from datetime import date
from typing import Any

from db import (
    get_client,
    fetch_stations,
    fetch_train_stops_for_stations,
    fetch_train_names,
    fetch_station_names_for_codes,
    fetch_pnr_stats,
)
from prediction import heuristic_confirmation_score

log = logging.getLogger("smart-ticket-ai.smart-search")

# ---------------------------------------------------------------------------
# Station candidate strategy (generic, not route-hardcoded)
# Primary = practical passenger terminals for a city/region.
# Hubs = major regional alternatives used only when direct options are sparse.
# ---------------------------------------------------------------------------
CITY_CLUSTERS: dict[str, list[str]] = {
    # Bihar / East
    "patna": ["PNBE", "RJPB", "DNR", "PPTA", "PNC"],
    "danapur": ["DNR", "PNBE", "RJPB", "PPTA"],
    "gaya": ["GAYA"],
    "bhagalpur": ["BGP"],
    "katihar": ["KIR"],
    "chhapra": ["CPR"],
    "chapra": ["CPR"],
    "buxar": ["BXR"],
    "ara": ["ARA"],
    "arrah": ["ARA"],
    "muzaffarpur": ["MFP"],
    "darbhanga": ["DBG"],
    # Delhi NCR
    "delhi": ["NDLS", "DLI", "NZM", "ANVT"],
    "new delhi": ["NDLS", "DLI", "NZM", "ANVT"],
    # Mumbai
    "mumbai": ["LTT", "CSMT", "BDTS", "MMCT", "BCT"],
    "bombay": ["LTT", "CSMT", "BDTS", "MMCT", "BCT"],
    # Kolkata
    "kolkata": ["HWH", "SDAH", "KOAA", "SHM"],
    "calcutta": ["HWH", "SDAH", "KOAA", "SHM"],
    # South
    "chennai": ["MAS", "MS"],
    "madras": ["MAS", "MS"],
    "bengaluru": ["SBC", "BNC", "YPR"],
    "bangalore": ["SBC", "BNC", "YPR"],
    "hyderabad": ["HYB", "SC", "KCG"],
    "secunderabad": ["SC", "HYB", "KCG"],
    "mysore": ["MYS"],
    "mysuru": ["MYS"],
    "coimbatore": ["CBE"],
    "madurai": ["MDU"],
    "thiruvananthapuram": ["TVC"],
    "trivandrum": ["TVC"],
    "kochi": ["ERS", "ERN"],
    "ernakulam": ["ERS", "ERN"],
    "vijayawada": ["BZA"],
    "visakhapatnam": ["VSKP"],
    # West / Central
    "pune": ["PUNE"],
    "ahmedabad": ["ADI"],
    "surat": ["ST"],
    "nagpur": ["NGP"],
    "bhopal": ["BPL"],
    "indore": ["INDB"],
    "jaipur": ["JP"],
    "jodhpur": ["JU"],
    "udaipur": ["UDZ"],
    # North
    "lucknow": ["LKO", "LJN"],
    "kanpur": ["CNB"],
    "varanasi": ["BSB", "DDU"],
    "prayagraj": ["PRYJ", "ALD"],
    "allahabad": ["PRYJ", "ALD"],
    "agra": ["AGC", "AF"],
    "chandigarh": ["CDG"],
    "amritsar": ["ASR"],
    "jammu": ["JAT"],
    "dehradun": ["DDN"],
    # East coast / others
    "bhubaneswar": ["BBS"],
    "guwahati": ["GHY"],
    "ranchi": ["RNC"],
    "jamshedpur": ["TATA"],
}

NEARBY_HUBS: dict[str, list[str]] = {
    # Bihar corridor hubs (practical passenger junctions)
    "patna": ["ARA", "BXR", "CPR", "GAYA", "DDU", "BJU"],
    "danapur": ["ARA", "CPR", "PNBE", "DDU"],
    "gaya": ["PNBE", "DDU"],
    "chhapra": ["PNBE", "ARA", "DDU"],
    "chapra": ["PNBE", "ARA", "DDU"],
    "buxar": ["ARA", "PNBE", "DDU"],
    "ara": ["PNBE", "DNR", "DDU"],
    "arrah": ["PNBE", "DNR", "DDU"],
    "bhagalpur": ["JMP", "KGG"],
    "katihar": ["KGG", "BJU"],
    "muzaffarpur": ["PNBE", "BJU"],
    "darbhanga": ["MFP", "BJU"],
    # Metro / major city hubs
    "delhi": ["GZB"],
    "new delhi": ["GZB"],
    "mumbai": ["KYN", "TNA"],
    "kolkata": ["BDC"],
    "calcutta": ["BDC"],
    "chennai": ["TBM"],
    "madras": ["TBM"],
    "bengaluru": ["KJM"],
    "bangalore": ["KJM"],
    "hyderabad": ["SC"],
    "secunderabad": ["HYB"],
    "lucknow": ["CNB"],
    "varanasi": ["DDU"],
    "prayagraj": ["CNB", "DDU"],
    "allahabad": ["CNB", "DDU"],
    "ranchi": ["GAYA"],
}

# Caps — preserve warm latency budget
MAX_ORIGIN_PRIMARY = 5
MAX_DEST_PRIMARY = 5
MAX_HUB_ORIGIN = 4
MAX_HUB_DEST = 3
MAX_SIBLINGS = 4
MAX_DIRECT = 20
MAX_ALT = 18
MAX_STOPS_CODES = 16
# Expand hubs when direct options are fewer than this
HUB_EXPAND_THRESHOLD = 5

# Reverse index: station code → cluster key (first match wins for primary membership)
_CODE_TO_CLUSTER: dict[str, str] = {}
for _ck, _codes in CITY_CLUSTERS.items():
    for _c in _codes:
        _CODE_TO_CLUSTER.setdefault(_c.upper(), _ck)


def _days_before(jd: str | None) -> int:
    if not jd:
        return 7
    try:
        return max(0, (date.fromisoformat(str(jd)[:10]) - date.today()).days)
    except ValueError:
        return 7


def _match_cluster_key(query: str) -> str | None:
    needle = (query or "").strip().lower()
    if not needle:
        return None
    if needle in CITY_CLUSTERS:
        return needle
    for k in sorted(CITY_CLUSTERS.keys(), key=len, reverse=True):
        if k in needle or needle in k:
            return k
    return None


def _match_cluster_key_exact(query: str) -> str | None:
    needle = (query or "").strip().lower()
    return needle if needle in CITY_CLUSTERS else None


def _is_explicit_station_code(query: str) -> bool:
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


def _strong_primary_codes(query: str, limit: int = 5, allow_starts: bool = True) -> list[str]:
    needle = (query or "").strip()
    if not needle:
        return []
    rows = fetch_stations(needle, limit=max(30, limit * 4))
    q_upper, q_lower = needle.upper(), needle.lower()
    exact_code, exact_name, exact_city, starts, seen = [], [], [], [], set()

    def push(bucket: list[str], code: str) -> None:
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


def _siblings_and_hubs_for_code(code: str) -> tuple[list[str], list[str]]:
    """For an explicit station code, attach practical siblings (same city) + hubs."""
    upper = (code or "").strip().upper()
    cluster_key = _CODE_TO_CLUSTER.get(upper)
    siblings: list[str] = []
    hubs: list[str] = []
    if cluster_key:
        for c in CITY_CLUSTERS.get(cluster_key, []):
            cu = c.upper()
            if cu != upper and cu not in siblings:
                siblings.append(cu)
        hubs = [h.upper() for h in NEARBY_HUBS.get(cluster_key, []) if h.upper() != upper]
    return siblings[:MAX_SIBLINGS], hubs[:MAX_HUB_ORIGIN]


def expand_candidates(query: str) -> dict[str, Any]:
    """Resolve a user query into primary stations + optional hubs/siblings.

    Levels:
      primary  — city cluster terminals OR exact code
      siblings — other practical stations in the same city (for code queries)
      hubs     — regional major stations (used when direct options are sparse)
    """
    raw = (query or "").strip()
    city_key = _match_cluster_key_exact(raw)
    is_code = _is_explicit_station_code(raw)

    if is_code:
        code = raw.upper()
        siblings, hubs = _siblings_and_hubs_for_code(code)
        return {
            "query": raw,
            "cluster_key": _CODE_TO_CLUSTER.get(code),
            "primary": [code],
            "siblings": siblings,
            "hubs": hubs,
            "is_code": True,
        }

    key = city_key or _match_cluster_key(raw)
    if key and CITY_CLUSTERS.get(key):
        primary = list(dict.fromkeys(CITY_CLUSTERS[key]))
        for c in _strong_primary_codes(raw, limit=MAX_ORIGIN_PRIMARY, allow_starts=False):
            if c not in primary:
                primary.append(c)
        primary = primary[:MAX_ORIGIN_PRIMARY]
        hubs = list(dict.fromkeys(NEARBY_HUBS.get(key, [])))[:MAX_HUB_ORIGIN]
        return {
            "query": raw,
            "cluster_key": key,
            "primary": primary,
            "siblings": [],
            "hubs": hubs,
            "is_code": False,
        }

    primary = _strong_primary_codes(raw, limit=MAX_ORIGIN_PRIMARY, allow_starts=True)
    return {
        "query": raw,
        "cluster_key": key,
        "primary": primary,
        "siblings": [],
        "hubs": [],
        "is_code": False,
    }


def _parse_time_minutes(t: Any) -> int | None:
    if not t:
        return None
    parts = str(t).strip().split(":")
    if len(parts) < 2:
        return None
    try:
        return int(parts[0]) * 60 + int(parts[1])
    except ValueError:
        return None


def _duration_minutes(board: dict, alight: dict) -> int | None:
    dep = _parse_time_minutes(board.get("departure_time") or board.get("departure"))
    arr = _parse_time_minutes(alight.get("arrival_time") or alight.get("arrival"))
    if dep is None or arr is None:
        return None
    day_b = int(board.get("day_offset") or 0)
    day_a = int(alight.get("day_offset") or 0)
    return (day_a * 1440 + arr) - (day_b * 1440 + dep)


def _build_train_index(stops: list) -> dict[str, dict[str, dict]]:
    trains: dict[str, dict[str, dict]] = {}
    for s in stops:
        tn = str(s.get("train_number") or "").strip()
        sc = str(s.get("station_code") or "").strip().upper()
        if tn and sc:
            trains.setdefault(tn, {})[sc] = s
    return trains


def _pair(
    train_number: str,
    stop_map: dict,
    sc: str,
    dc: str,
    names: dict,
    station_names: dict,
) -> dict | None:
    board, alight = stop_map.get(sc), stop_map.get(dc)
    if not board or not alight:
        return None
    seq_b, seq_a = board.get("stop_sequence"), alight.get("stop_sequence")
    if seq_b is None or seq_a is None:
        return None
    try:
        if int(seq_a) <= int(seq_b):
            return None
    except (TypeError, ValueError):
        return None
    dur = _duration_minutes(board, alight)
    if dur is not None and dur <= 0:
        return None
    day_b = int(board.get("day_offset") or 0)
    day_a = int(alight.get("day_offset") or 0)
    return {
        "train_number": train_number,
        "train_name": names.get(train_number) or "",
        "board": {
            "code": sc,
            "name": station_names.get(sc) or sc,
            "departure": (board.get("departure_time") or board.get("departure") or "")[:8],
            "day_offset": day_b,
        },
        "alight": {
            "code": dc,
            "name": station_names.get(dc) or dc,
            "arrival": (alight.get("arrival_time") or alight.get("arrival") or "")[:8],
            "day_offset": day_a,
        },
        "duration_minutes": dur,
        "stops_between": max(0, int(seq_a) - int(seq_b) - 1),
        "day_offset": day_a - day_b,
        "operating_day_verified": False,
    }


def _category(sc: str, dc: str, op: set, dp: set, oh: set, dh: set, osib: set, dsib: set) -> str:
    if sc in op and dc in dp:
        return "direct"
    if sc in osib and dc in dp:
        return "nearby_origin"
    if sc in op and dc in dsib:
        return "nearby_destination"
    if sc in osib and dc in dsib:
        return "nearby_origin"  # both sides alternate; prefer origin label
    if sc in oh and dc in dp:
        return "hub_origin"
    if sc in op and dc in dh:
        return "hub_destination"
    if sc in oh or dc in dh:
        return "hub"
    if sc not in op and dc in dp:
        return "nearby_origin"
    if sc in op and dc not in dp:
        return "nearby_destination"
    return "hub"


def _why(cat: str, sc: str, dc: str, oq: str, dq: str, dur: int | None) -> str:
    dur_txt = ""
    if isinstance(dur, int) and dur > 0:
        h, m = divmod(dur, 60)
        dur_txt = f" (~{h}h {m:02d}m timetable)"
    if cat == "direct":
        return f"Direct timetable option {sc} → {dc}{dur_txt}"
    if cat == "nearby_origin":
        return f"Nearby origin: board at {sc} instead of {oq} area → {dc}{dur_txt}"
    if cat == "nearby_destination":
        return f"Nearby destination: {sc} → alight at {dc} instead of {dq} area{dur_txt}"
    if cat == "hub_origin":
        return f"Regional hub origin: major hub {sc} → {dc}{dur_txt}"
    if cat == "hub_destination":
        return f"Regional hub destination: {sc} → hub {dc}{dur_txt}"
    return f"Alternative timetable path {sc} → {dc}{dur_txt}"


def _recommend_why(row: dict, oq: str, dq: str) -> str:
    cat = row.get("category") or "direct"
    sc = (row.get("board") or {}).get("code") or ""
    dc = (row.get("alight") or {}).get("code") or ""
    dur = row.get("duration_minutes")
    base = _why(cat, sc, dc, oq, dq, dur if isinstance(dur, int) else None)
    if cat == "direct":
        return (
            f"Recommended: direct option from a primary boarding station for "
            f"“{oq}” to a primary terminal for “{dq}”"
            + (f"; shortest among top direct options (~{dur // 60}h {dur % 60:02d}m)." if isinstance(dur, int) else ".")
        )
    return f"Recommended alternative: {base}. Timetable only — operating day not verified; not live availability."


def _rank_score(row: dict) -> float:
    """Transparent ranking. Historical PNR is an extremely weak signal only."""
    cat = row.get("category") or ""
    cat_w = {
        "direct": 1000.0,
        "nearby_origin": 720.0,
        "nearby_destination": 680.0,
        "hub_origin": 480.0,
        "hub_destination": 450.0,
        "hub": 400.0,
    }.get(cat, 300.0)
    dur = row.get("duration_minutes")
    # Prefer shorter journeys (cap contribution)
    dur_w = 0.0 if dur is None else max(0.0, 350.0 - float(dur) / 6.0)
    stop_w = max(0.0, 60.0 - float(row.get("stops_between") or 0))
    # Prefer daytime departures slightly (06:00–22:00)
    dep = _parse_time_minutes((row.get("board") or {}).get("departure"))
    dep_w = 25.0 if dep is not None and 360 <= dep <= 1320 else 0.0
    rc = row.get("requested_class") or {}
    hist = float(rc["score"]) * 0.02 if isinstance(rc.get("score"), (int, float)) else 0.0
    return cat_w + dur_w + stop_w + dep_w + hist


def _attach_class_preference(rows: list[dict], travel_class: str, journey_date: str) -> None:
    """Attach class preference metadata. Never claim live CNF/RAC/WL."""
    days = _days_before(journey_date)
    for r in rows:
        score, reason = None, None
        try:
            stats = fetch_pnr_stats(r.get("train_number") or "", travel_class, journey_date)
            if stats and stats.get("sample_size"):
                conf = stats.get("confirm_rate")
                if conf is not None:
                    score = int(round(float(conf) * 100)) if conf <= 1 else int(conf)
                    reason = (
                        f"Very limited historical sample (n={stats.get('sample_size')}) — "
                        f"not live availability; class preference only."
                    )
        except Exception:
            pass
        if score is None:
            score = heuristic_confirmation_score(
                travel_class, journey_date or date.today().isoformat(), days
            )
            reason = (
                f"Class preference {travel_class} noted; ~{score}% is a weak heuristic only — "
                f"not live availability or confirmation."
            )
        r["requested_class"] = {"class": travel_class, "score": score, "reason": reason}
        r["label"] = "Timetable option"
        r["operating_day_verified"] = False


def _dedupe_best(rows: list[dict]) -> list[dict]:
    """Keep best option per (train_number) preferring higher rank score."""
    best: dict[str, dict] = {}
    for r in rows:
        tn = str(r.get("train_number") or "")
        if not tn:
            continue
        prev = best.get(tn)
        if prev is None or _rank_score(r) > _rank_score(prev):
            best[tn] = r
    return list(best.values())


def _collect_pairs(
    trains_idx: dict,
    origin_codes: list[str],
    dest_codes: list[str],
    names: dict,
    station_names: dict,
    origin_p_set: set,
    dest_p_set: set,
    origin_h_set: set,
    dest_h_set: set,
    origin_sib_set: set,
    dest_sib_set: set,
    oq: str,
    dq: str,
    skip_pairs: set[tuple[str, str]] | None = None,
) -> list[dict]:
    skip_pairs = skip_pairs or set()
    found: list[dict] = []
    seen_local: set[tuple[str, str, str]] = set()
    for tn, stop_map in trains_idx.items():
        best = best_sc = best_dc = None
        for sc in origin_codes:
            for dc in dest_codes:
                if (sc, dc) in skip_pairs:
                    continue
                cand = _pair(tn, stop_map, sc, dc, names, station_names)
                if cand and (
                    best is None
                    or (cand["duration_minutes"] or 10**9)
                    < (best["duration_minutes"] or 10**9)
                ):
                    best, best_sc, best_dc = cand, sc, dc
        if best and best_sc and best_dc:
            key = (best["train_number"], best_sc, best_dc)
            if key in seen_local:
                continue
            seen_local.add(key)
            cat = _category(
                best_sc, best_dc,
                origin_p_set, dest_p_set,
                origin_h_set, dest_h_set,
                origin_sib_set, dest_sib_set,
            )
            best["category"] = cat
            best["why"] = _why(
                cat, best_sc, best_dc, oq, dq,
                best["duration_minutes"] if isinstance(best.get("duration_minutes"), int) else None,
            )
            best["alternative_source"] = cat
            found.append(best)
    return found


def run_smart_search(
    source: str,
    destination: str,
    journey_date: str | None = None,
    class_code: str = "SL",
) -> dict:
    t0 = time.perf_counter()
    source = (source or "").strip()
    destination = (destination or "").strip()
    travel_class = (class_code or "SL").strip().upper() or "SL"
    journey_date = (journey_date or date.today().isoformat())[:10]

    empty = {
        "request": {
            "from": source,
            "to": destination,
            "journey_date": journey_date,
            "class_code": travel_class,
        },
        "direct_options": [],
        "alternative_options": [],
        "nearby_origin_options": [],
        "nearby_destination_options": [],
        "hub_options": [],
        "search_summary": {},
        "recommendation": None,
        "suggestions": [
            "Delhi to Patna",
            "Bhagalpur to Patna",
            "Katihar to Patna",
            "Bengaluru to Chennai",
        ],
    }
    if not source or not destination:
        empty["search_summary"] = {
            "error": "from and to are required",
            "latency_ms": int((time.perf_counter() - t0) * 1000),
            "operating_day_filter": "unavailable",
            "note": "Timetable options only — operating day not verified; not live seat availability.",
        }
        return empty
    if source.lower() == destination.lower():
        empty["search_summary"] = {
            "error": "origin and destination must differ",
            "latency_ms": 0,
            "operating_day_filter": "unavailable",
        }
        return empty

    origin = expand_candidates(source)
    dest = expand_candidates(destination)
    origin_primary = origin["primary"][:MAX_ORIGIN_PRIMARY]
    dest_primary = dest["primary"][:MAX_DEST_PRIMARY]
    origin_siblings = list(origin.get("siblings") or [])[:MAX_SIBLINGS]
    dest_siblings = list(dest.get("siblings") or [])[:MAX_SIBLINGS]
    origin_hubs = origin["hubs"][:MAX_HUB_ORIGIN]
    dest_hubs = dest["hubs"][:MAX_HUB_DEST]

    if not origin_primary or not dest_primary:
        empty["search_summary"] = {
            "resolved_origin": origin,
            "resolved_destination": dest,
            "error": "could not resolve stations",
            "latency_ms": int((time.perf_counter() - t0) * 1000),
            "operating_day_filter": "unavailable",
        }
        return empty

    # ---- Level 1: primary × primary (always) ----
    codes_a = list(dict.fromkeys(origin_primary + dest_primary))[:MAX_STOPS_CODES]
    client = get_client()
    trains_a = _build_train_index(fetch_train_stops_for_stations(client, codes_a))
    names = fetch_train_names(client)
    station_names = fetch_station_names_for_codes(client, codes_a)

    origin_p_set = set(origin_primary)
    dest_p_set = set(dest_primary)
    origin_sib_set = set(origin_siblings)
    dest_sib_set = set(dest_siblings)
    origin_h_set = set(origin_hubs)
    dest_h_set = set(dest_hubs)

    level1 = _collect_pairs(
        trains_a,
        origin_primary,
        dest_primary,
        names,
        station_names,
        origin_p_set,
        dest_p_set,
        origin_h_set,
        dest_h_set,
        origin_sib_set,
        dest_sib_set,
        source,
        destination,
    )
    direct = [r for r in level1 if r.get("category") == "direct"]

    # ---- Levels 2–3: siblings (same city other terminals) ----
    alternatives: list[dict] = []
    codes_loaded = len(codes_a)
    primary_pairs = {(sc, dc) for sc in origin_primary for dc in dest_primary}

    expand_o_near = list(dict.fromkeys(origin_primary + origin_siblings))
    expand_d_near = list(dict.fromkeys(dest_primary + dest_siblings))
    need_sibling_codes = [
        c for c in (origin_siblings + dest_siblings) if c not in codes_a
    ]
    if need_sibling_codes:
        extra_stops = fetch_train_stops_for_stations(client, need_sibling_codes)
        for tn, sm in _build_train_index(extra_stops).items():
            trains_a.setdefault(tn, {}).update(sm)
        station_names.update(fetch_station_names_for_codes(client, need_sibling_codes))
        codes_loaded = len(set(codes_a) | set(need_sibling_codes))

    if origin_siblings or dest_siblings:
        near_rows = _collect_pairs(
            trains_a,
            expand_o_near,
            expand_d_near,
            names,
            station_names,
            origin_p_set,
            dest_p_set,
            origin_h_set,
            dest_h_set,
            origin_sib_set,
            dest_sib_set,
            source,
            destination,
            skip_pairs=primary_pairs,
        )
        alternatives.extend(near_rows)

    # ---- Levels 4–5: regional hubs when direct is sparse ----
    hubs_used_o: list[str] = []
    hubs_used_d: list[str] = []
    if len(direct) < HUB_EXPAND_THRESHOLD and (origin_hubs or dest_hubs):
        hubs_used_o = list(origin_hubs)
        hubs_used_d = list(dest_hubs)
        expand_o = list(dict.fromkeys(origin_primary + origin_siblings + origin_hubs))
        expand_d = list(dict.fromkeys(dest_primary + dest_siblings + dest_hubs))
        codes_b = list(dict.fromkeys(expand_o + expand_d))[:MAX_STOPS_CODES]
        extra = [c for c in codes_b if c not in codes_a and c not in need_sibling_codes]
        if extra:
            for tn, sm in _build_train_index(
                fetch_train_stops_for_stations(client, extra)
            ).items():
                trains_a.setdefault(tn, {}).update(sm)
            station_names.update(fetch_station_names_for_codes(client, extra))
            codes_loaded = len(set(codes_a) | set(need_sibling_codes) | set(extra))
        skip = {(sc, dc) for sc in expand_o_near for dc in expand_d_near}
        hub_rows = _collect_pairs(
            trains_a,
            expand_o,
            expand_d,
            names,
            station_names,
            origin_p_set,
            dest_p_set,
            origin_h_set,
            dest_h_set,
            origin_sib_set,
            dest_sib_set,
            source,
            destination,
            skip_pairs=skip,
        )
        alternatives.extend(hub_rows)

    # Soft historical attach + honesty fields
    _attach_class_preference(direct, travel_class, journey_date)
    _attach_class_preference(alternatives, travel_class, journey_date)

    # Deduplicate: one best path per train_number across direct+alt
    direct = _dedupe_best(direct)
    # Remove alts that duplicate a direct train_number (prefer direct)
    direct_tns = {r["train_number"] for r in direct}
    alternatives = [r for r in alternatives if r.get("train_number") not in direct_tns]
    alternatives = _dedupe_best(alternatives)

    direct = sorted(direct, key=_rank_score, reverse=True)[:MAX_DIRECT]
    alternatives = sorted(alternatives, key=_rank_score, reverse=True)[:MAX_ALT]

    nearby_origin = [r for r in alternatives if r.get("category") == "nearby_origin"]
    nearby_dest = [r for r in alternatives if r.get("category") == "nearby_destination"]
    hub_opts = [
        r
        for r in alternatives
        if r.get("category") in ("hub_origin", "hub_destination", "hub")
    ]

    recommendation = None
    pool = direct + alternatives
    if pool:
        top = sorted(pool, key=_rank_score, reverse=True)[0]
        recommendation = {
            "train_number": top["train_number"],
            "train_name": top.get("train_name"),
            "board": top.get("board"),
            "alight": top.get("alight"),
            "duration_minutes": top.get("duration_minutes"),
            "category": top.get("category"),
            "why": _recommend_why(top, source, destination),
            "score": int(_rank_score(top)),
            "label": "Best timetable option",
            "requested_class": top.get("requested_class"),
            "operating_day_verified": False,
        }

    return {
        "request": {
            "from": source,
            "to": destination,
            "journey_date": journey_date,
            "class_code": travel_class,
        },
        "resolved": {"origin": origin, "destination": dest},
        "direct_options": direct,
        "alternative_options": alternatives,
        "nearby_origin_options": nearby_origin,
        "nearby_destination_options": nearby_dest,
        "hub_options": hub_opts,
        "search_summary": {
            "origin_primary": origin_primary,
            "destination_primary": dest_primary,
            "origin_siblings": origin_siblings,
            "destination_siblings": dest_siblings,
            "origin_hubs_used": hubs_used_o,
            "destination_hubs_used": hubs_used_d,
            "station_codes_loaded": codes_loaded,
            "trains_indexed": len(trains_a),
            "direct_count": len(direct),
            "alternative_count": len(alternatives),
            "nearby_origin_count": len(nearby_origin),
            "nearby_destination_count": len(nearby_dest),
            "hub_count": len(hub_opts),
            "latency_ms": int((time.perf_counter() - t0) * 1000),
            "operating_day_filter": "unavailable",
            "operating_day_verified": False,
            "connection_planning": "out_of_scope",
            "note": (
                "Timetable / alternative boarding-destination options only. "
                "Operating day not verified. Not live seat availability. "
                "No multi-train connections."
            ),
        },
        "recommendation": recommendation,
        "suggestions": [
            "Delhi to Patna",
            "Bhagalpur to Patna",
            "Katihar to Patna",
            "Bengaluru to Chennai",
        ],
    }
