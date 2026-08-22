"""Recommendation Engine V2 scoring (pure functions)."""
from __future__ import annotations
from typing import Any

def parse_time_minutes(t: Any) -> int | None:
    if not t:
        return None
    parts = str(t).strip().split(":")
    if len(parts) < 2:
        return None
    try:
        return int(parts[0]) * 60 + int(parts[1])
    except ValueError:
        return None

def station_role(code: str, primary: set, sibling: set, hub: set) -> str:
    c = (code or "").strip().upper()
    if c in primary:
        return "primary"
    if c in sibling:
        return "sibling"
    if c in hub:
        return "hub"
    return "other"

def dur_text(dur: int | None) -> str:
    if not isinstance(dur, int) or dur <= 0:
        return ""
    h, m = divmod(dur, 60)
    return f"~{h}h {m:02d}m"

def why(cat: str, sc: str, dc: str, oq: str, dq: str, dur: int | None) -> str:
    dt = dur_text(dur)
    dur_txt = f" ({dt} timetable)" if dt else ""
    if cat == "direct":
        return f"Direct timetable option {sc} → {dc}{dur_txt}"
    if cat == "nearby_origin":
        return f'Alternative: board at {sc}, a nearby station for "{oq}", to {dc}{dur_txt}'
    if cat == "nearby_destination":
        return f'Alternative: {sc} → alight at {dc}, a nearby terminal for "{dq}"{dur_txt}'
    if cat == "hub_origin":
        return f"Alternative: regional hub {sc} → {dc}{dur_txt} (useful when strong directs are limited)"
    if cat == "hub_destination":
        return f"Alternative: {sc} → hub terminal {dc}{dur_txt}"
    return f"Alternative timetable path {sc} → {dc}{dur_txt}"

def recommend_why(row: dict, oq: str, dq: str) -> str:
    cat = row.get("category") or "direct"
    sc = (row.get("board") or {}).get("code") or ""
    dc = (row.get("alight") or {}).get("code") or ""
    dur = row.get("duration_minutes")
    dt = dur_text(dur if isinstance(dur, int) else None)
    rel = row.get("station_relation") or {}
    o_role = rel.get("origin_role") or "other"
    d_role = rel.get("dest_role") or "other"
    honesty = (
        " Timetable only — live availability is not connected; "
        "operating day is not verified."
    )
    if cat == "direct" and o_role == "primary" and d_role == "primary":
        core = (
            f"Recommended because it is a direct train {sc} → {dc}"
            + (
                f" with one of the shortest journey times ({dt})."
                if dt
                else "."
            )
        )
    elif o_role == "sibling" or cat == "nearby_origin":
        core = (
            f'Alternative: boarding from {sc} (nearby station for "{oq}") '
            f"to {dc}"
            + (f" ({dt})." if dt else ".")
        )
    elif d_role == "sibling" or cat == "nearby_destination":
        core = (
            f"Alternative: {sc} → {dc} "
            f'(nearby destination for "{dq}")'
            + (f", {dt}." if dt else ".")
        )
    elif o_role == "hub" or cat in ("hub_origin", "hub", "hub_destination"):
        core = (
            f"Major junction alternative: {sc} → {dc} — "
            f"direct options were limited"
            + (f" ({dt})." if dt else ".")
        )
    else:
        core = (
            f"Recommended: {sc} → {dc}"
            + (f" ({dt})." if dt else ".")
        )
    return core + honesty

def score_v2(row: dict) -> tuple[float, dict]:
    cat = row.get("category") or ""
    s_category = {
        "direct": 400.0,
        "nearby_origin": 320.0,
        "nearby_destination": 300.0,
        "hub_origin": 180.0,
        "hub_destination": 160.0,
        "hub": 140.0,
    }.get(cat, 100.0)
    dur = row.get("duration_minutes")
    s_duration = 0.0 if dur is None else max(0.0, 300.0 - float(dur) / 8.0)
    s_stops = max(0.0, 50.0 - float(row.get("stops_between") or 0))
    dep = parse_time_minutes((row.get("board") or {}).get("departure"))
    arr = parse_time_minutes((row.get("alight") or {}).get("arrival"))
    s_timeband = 0.0
    if dep is not None and 360 <= dep <= 1260:
        s_timeband += 25.0
    if arr is not None and 300 <= arr <= 1380:
        s_timeband += 15.0
    rel = row.get("station_relation") or {}
    o_role = rel.get("origin_role") or "other"
    d_role = rel.get("dest_role") or "other"
    role_pts = {"primary": 40.0, "sibling": 25.0, "hub": 10.0, "other": 0.0}
    s_station_fit = role_pts.get(o_role, 0.0) + role_pts.get(d_role, 0.0)
    if o_role == "primary" and d_role == "primary":
        s_relation = 30.0
    elif {o_role, d_role} <= {"primary", "sibling"} and (
        o_role == "primary" or d_role == "primary"
    ):
        s_relation = 20.0
    elif o_role == "hub" or d_role == "hub":
        s_relation = 5.0
    else:
        s_relation = 0.0
    rc = row.get("requested_class") or {}
    raw_hist = float(rc["score"]) if isinstance(rc.get("score"), (int, float)) else 0.0
    s_hist = min(5.0, max(0.0, raw_hist * 0.05))
    s_operating = 0.0
    s_live = 0.0
    # Data-quality: incomplete timetable should not outrank clean rows
    s_data_quality = 0.0
    if dep is None:
        s_data_quality -= 35.0
    if arr is None:
        s_data_quality -= 35.0
    if dur is None or (isinstance(dur, (int, float)) and dur <= 0):
        s_data_quality -= 60.0
    board = row.get("board") or {}
    alight = row.get("alight") or {}
    if not (board.get("code") or "").strip():
        s_data_quality -= 25.0
    if not (alight.get("code") or "").strip():
        s_data_quality -= 25.0
    total = (
        s_category
        + s_duration
        + s_stops
        + s_timeband
        + s_station_fit
        + s_relation
        + s_hist
        + s_operating
        + s_live
        + s_data_quality
    )
    breakdown = {
        "category": round(s_category, 2),
        "duration": round(s_duration, 2),
        "stops": round(s_stops, 2),
        "timeband": round(s_timeband, 2),
        "station_fit": round(s_station_fit, 2),
        "relation": round(s_relation, 2),
        "historical": round(s_hist, 2),
        "operating": round(s_operating, 2),
        "live": round(s_live, 2),
        "data_quality": round(s_data_quality, 2),
        "total": round(total, 2),
    }
    return total, breakdown

def rank_score(row: dict) -> float:
    bd = row.get("score_breakdown")
    if isinstance(bd, dict) and "total" in bd:
        try:
            return float(bd["total"])
        except (TypeError, ValueError):
            pass
    total, breakdown = score_v2(row)
    row["score_breakdown"] = breakdown
    row["score"] = round(total, 2)
    return total

def apply_v2_scores(rows: list[dict]) -> None:
    for r in rows:
        total, breakdown = score_v2(r)
        r["score_breakdown"] = breakdown
        r["score"] = round(total, 2)
        r["operating_day_verified"] = False
        r["operating_day_status"] = "unknown"
        r.setdefault("live", None)
