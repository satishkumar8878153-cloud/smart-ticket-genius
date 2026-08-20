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
    upper_raw = raw.upper().replace(" ", "")
    looks_like_code = (
        2 <= len(upper_raw) <= 5
        and upper_raw.isalnum()
        and " " not in raw.strip()
    )
    is_code = False
    if looks_like_code:
        for r in fetch_stations(upper_raw, limit=5):
            if str(r.get("code") or "").strip().upper() == upper_raw:
                is_code = True
                break
    key = None
    if not is_code:
        for k in sorted(CITY_CLUSTERS.keys(), key=len, reverse=True):
            if k in needle or needle in k:
                key = k
                break
    matches = resolve_stations(query)["matches"]
    primary = []
    seen = set()
    for m in matches:
        c = (m.get("code") or "").strip().upper()
        if not c or c in seen:
            continue
        seen.add(c)
        primary.append(c)
    if is_code:
        primary = [upper_raw]
        return primary, []
    if key:
        primary = list(dict.fromkeys(primary + CITY_CLUSTERS[key]))
    primary = primary[:5]
    hubs = NEARBY_HUBS.get(key, []) if key else []
    return primary, hubs


def _route_search_core(source_q, dest_q, travel_class="SL", date_str=None) -> dict:
    from datetime import date as _date
    from db import (
        get_client,
        fetch_train_stops_for_stations,
        fetch_train_names,
        fetch_station_names_for_codes,
    )
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
