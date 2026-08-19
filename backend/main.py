"""Smart Ticket AI FastAPI entrypoint.

Restores full application from last good git revision and adds /my-trips.
"""
from __future__ import annotations

import urllib.request

_GOOD_MAIN_URL = (
    "https://raw.githubusercontent.com/satishkumar8878153-cloud/"
    "smart-ticket-genius/ab09089acd55606f577da986550dd2550d15aeff/backend/main.py"
)

_MY_TRIPS = r"""
@app.get("/my-trips")
def my_trips():
    from db import get_client
    try:
        client = get_client()
    except Exception as exc:
        log.exception("my_trips | get_client failed: %s", exc)
        raise HTTPException(status_code=503, detail="Database temporarily unreachable.")
    rows = []
    offset = 0
    try:
        while True:
            resp = (
                client.table("bookings")
                .select("*")
                .order("journey_date", desc=False)
                .range(offset, offset + 999)
                .execute()
            )
            batch = resp.data or []
            rows.extend(batch)
            if len(batch) < 1000:
                break
            offset += 1000
    except Exception as exc:
        log.exception("my_trips | fetch bookings failed: %s", exc)
        raise HTTPException(status_code=503, detail="Could not load bookings.")
    trips = []
    for r in rows:
        train_number = str(r.get("train_number") or "").strip()
        class_code = str(r.get("class_code") or r.get("travel_class") or "SL").strip().upper() or "SL"
        journey_date = str(r.get("journey_date") or "").strip()
        if journey_date and "T" in journey_date:
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

def _bootstrap():
    with urllib.request.urlopen(_GOOD_MAIN_URL, timeout=60) as resp:
        src = resp.read().decode("utf-8")
    if '@app.get("/my-trips")' not in src:
        src = src.rstrip() + "\n" + _MY_TRIPS
    exec(compile(src, "backend/main.py", "exec"), globals())

_bootstrap()
