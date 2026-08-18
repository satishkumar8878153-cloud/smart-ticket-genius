import os
import logging
import traceback
from datetime import date, timedelta

from fastapi import FastAPI, HTTPException, Request, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from models import (
    SearchQuery,
    SearchResult,
    TrainRecommendation,
    AlternateStation,
    AlternateDate,
    SeatStatus,
    ALL_CLASSES,
)
from prediction import heuristic_confirmation_score, recommendation_score
from db import fetch_trains_for_route, fetch_pnr_stats, fetch_stations
from irctc_provider import search_stations


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)

log = logging.getLogger("smart-ticket-ai")


app = FastAPI(
    title="Smart Ticket AI — Phase 1 API"
)


# ---------------------------------------------------------
# ADMIN SECURITY
# ---------------------------------------------------------

TRAIN_STOPS_ADMIN_TOKEN = os.environ.get(
    "TRAIN_STOPS_ADMIN_TOKEN",
    "",
)


# ---------------------------------------------------------
# CORS
# ---------------------------------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------
# STARTUP CHECK
# ---------------------------------------------------------

@app.on_event("startup")
def _startup_check() -> None:

    from db import SUPABASE_URL, SUPABASE_KEY

    log.info(
        "startup | supabase_url=%s supabase_key=%s",
        "set" if SUPABASE_URL else "MISSING",
        "set" if SUPABASE_KEY else "MISSING",
    )

    if not SUPABASE_URL or not SUPABASE_KEY:
        log.error(
            "Database credentials are missing — "
            "/stations and /search will return empty results. "
            "Set SUPABASE_URL and SUPABASE_KEY."
        )


# ---------------------------------------------------------
# REQUEST LOGGER
# ---------------------------------------------------------

@app.middleware("http")
async def request_logger(
    request: Request,
    call_next,
):

    log.info(
        "--> %s %s",
        request.method,
        request.url.path,
    )

    response = await call_next(request)

    log.info(
        "<-- %s %s %s",
        request.method,
        request.url.path,
        response.status_code,
    )

    return response


# ---------------------------------------------------------
# GLOBAL ERROR HANDLER
# ---------------------------------------------------------

@app.exception_handler(Exception)
async def unhandled_exception_handler(
    request: Request,
    exc: Exception,
):

    log.error(
        "Unhandled error on %s",
        request.url.path,
    )

    traceback.print_exc()

    return JSONResponse(
        status_code=500,
        content={
            "detail": (
                f"Internal error in "
                f"{request.url.path}: {exc}"
            )
        },
        headers={
            "Access-Control-Allow-Origin": "*"
        },
    )


# ---------------------------------------------------------
# STATION SEARCH
# ---------------------------------------------------------

@app.get("/stations")
def stations(
    q: str | None = None,
    limit: int = 100,
) -> list[dict]:

    """
    Search live railway stations,
    with Supabase fallback.
    """

    limit = max(
        1,
        min(limit, 100),
    )

    # -----------------------------------------------------
    # LIVE RAPIDAPI SEARCH
    # -----------------------------------------------------

    if q and q.strip():

        live_rows = search_stations(
            q.strip(),
            limit=limit,
        )

        if live_rows:

            log.info(
                "stations | live q=%r matched=%d",
                q,
                len(live_rows),
            )

            return [
                {
                    "code": r.get("code"),
                    "name": r.get("name"),
                    "city": r.get("city"),
                    "is_popular": bool(
                        r.get(
                            "is_popular",
                            False,
                        )
                    ),
                }
                for r in live_rows[:limit]
            ]

    # -----------------------------------------------------
    # SUPABASE FALLBACK
    # -----------------------------------------------------

    try:

        rows = fetch_stations()

    except Exception as exc:

        log.exception(
            "fetch_stations failed: %s",
            exc,
        )

        rows = []

    if q:

        needle = q.strip().lower()

        rows = [
            r
            for r in rows
            if needle in str(
                r.get("code") or ""
            ).lower()
            or needle in str(
                r.get("name") or ""
            ).lower()
            or needle in str(
                r.get("city") or ""
            ).lower()
        ]

    log.info(
        "stations | fallback q=%r matched=%d",
        q,
        len(rows),
    )

    return [
        {
            "code": r.get("code"),
            "name": r.get("name"),
            "city": r.get("city"),
            "is_popular": bool(
                r.get(
                    "is_popular",
                    False,
                )
            ),
        }
        for r in rows[:limit]
    ]


# ---------------------------------------------------------
# DATE HELPERS
# ---------------------------------------------------------

def _days_before(
    journey_date_str: str,
) -> int:

    try:

        d = date.fromisoformat(
            journey_date_str
        )

    except ValueError:

        return 7

    return max(
        0,
        (d - date.today()).days,
    )


# ---------------------------------------------------------
# SEAT STATUS
# ---------------------------------------------------------

def _seat_status(
    confirm_probability: int,
) -> SeatStatus:

    if confirm_probability >= 80:

        return SeatStatus(
            label=f"AVL {confirm_probability}",
            tone="success",
        )

    if confirm_probability >= 55:

        return SeatStatus(
            label=f"WL {100 - confirm_probability}",
            tone="warning",
        )

    return SeatStatus(
        label=f"WL {100 - confirm_probability}",
        tone="danger",
    )


# ---------------------------------------------------------
# AVAILABILITY
# ---------------------------------------------------------

def _build_availability(
    journey_date: str,
    days_before: int,
) -> dict:

    return {
        cls: _seat_status(
            heuristic_confirmation_score(
                cls,
                journey_date,
                days_before,
            )
        )
        for cls in ALL_CLASSES
    }


# ---------------------------------------------------------
# CONFIRMATION SCORE
# ---------------------------------------------------------

def _confirmation_score_and_reason(
    train_number: str,
    travel_class: str,
    journey_date: str,
    days_before: int,
) -> tuple[int, str]:

    stats = fetch_pnr_stats(
        train_number,
        travel_class,
    )

    if stats and stats["total"] > 0:

        score = round(
            stats["confirm_rate"] * 100
        )

        score = max(
            2,
            min(98, score),
        )

        sample_note = (
            "small sample"
            if stats["total"] < 10
            else f"{stats['total']} bookings"
        )

        reason = (
            f"{stats['confirmed']}/"
            f"{stats['total']} "
            f"historically confirmed on this "
            f"train/class ({sample_note})."
        )

        return score, reason

    score = heuristic_confirmation_score(
        travel_class,
        journey_date,
        days_before,
    )

    reason = (
        f"{score}% estimated confirmation chance "
        f"in {travel_class} based on booking "
        f"{days_before} day(s) before journey. "
        f"(Estimated — no historical data for "
        f"this train yet.)"
    )

    return score, reason


# ---------------------------------------------------------
# TRAIN SEARCH
# ---------------------------------------------------------

@app.post(
    "/search",
    response_model=SearchResult,
)
def search(
    query: SearchQuery,
) -> SearchResult:

    log.info(
        "search | %s -> %s on %s (%s)",
        query.source,
        query.destination,
        query.date,
        query.travelClass,
    )

    try:

        train_rows = fetch_trains_for_route(
            query.source,
            query.destination,
            query.date,
        )

    except Exception as exc:

        log.exception(
            "fetch_trains_for_route failed: %s",
            exc,
        )

        raise HTTPException(
            status_code=503,
            detail=(
                "Train database is temporarily "
                "unreachable. Please retry."
            ),
        )

    if not train_rows:

        log.warning(
            "search | no trains for %s -> %s",
            query.source,
            query.destination,
        )

        raise HTTPException(
            status_code=404,
            detail=(
                "No trains found for this route yet. "
                "Try nearby major stations."
            ),
        )

    days_before = _days_before(
        query.date
    )

    recommendations = []

    for t in train_rows:

        confirm, reason = (
            _confirmation_score_and_reason(
                t["train_number"],
                query.travelClass,
                query.date,
                days_before,
            )
        )

        try:

            h, m = (
                t["duration"]
                .lower()
                .replace("h", "")
                .replace("m", "")
                .split()
            )

            duration_minutes = (
                int(h) * 60
                + int(m)
            )

        except Exception:

            duration_minutes = 300

        rec = TrainRecommendation(
            trainName=t["train_name"],
            trainNumber=t["train_number"],
            departure=t["departure_time"],
            arrival=t["arrival_time"],
            duration=t["duration"],
            confirmProbability=confirm,
            recommendationScore=(
                recommendation_score(
                    confirm,
                    duration_minutes,
                    fare=800,
                )
            ),
            bestClass=query.travelClass,
            reason=reason,
            availability=_build_availability(
                query.date,
                days_before,
            ),
        )

        recommendations.append(rec)

    recommendations.sort(
        key=lambda r:
        r.recommendationScore * 0.6
        + r.confirmProbability * 0.4,
        reverse=True,
    )

    best, *rest = recommendations

    # -----------------------------------------------------
    # ALTERNATE STATIONS
    # -----------------------------------------------------

    alternate_stations = [

        AlternateStation(
            code=(
                f"{query.source[:3].upper()}"
                f"{i+1}"
            ),
            name=(
                f"{query.source} "
                f"{name}"
            ),
            distanceKm=10 + i * 12,
            extraTravel=f"{20 + i * 10} min",
            availability=_seat_status(
                heuristic_confirmation_score(
                    query.travelClass,
                    query.date,
                    days_before + 1,
                )
            ),
        )

        for i, name in enumerate(
            [
                "Central Jn",
                "Cantt",
                "City Jn",
                "Terminus",
            ]
        )
    ]

    # -----------------------------------------------------
    # ALTERNATE DATES
    # -----------------------------------------------------

    try:

        today = (
            date.fromisoformat(
                query.date
            )
            if query.date
            else date.today()
        )

    except ValueError:

        today = date.today()

    alternate_dates = []

    for i in range(7):

        d = today + timedelta(
            days=i
        )

        db_ = max(
            0,
            (d - date.today()).days,
        )

        confirm = heuristic_confirmation_score(
            query.travelClass,
            d.isoformat(),
            db_,
        )

        alternate_dates.append(
            AlternateDate(
                date=d.isoformat(),
                weekday=d.strftime("%a"),
                status=_seat_status(
                    confirm
                ),
                fare=950 + i * 120,
            )
        )

    # -----------------------------------------------------
    # AI INSIGHTS
    # -----------------------------------------------------

    ai_insights = [

        (
            f"Historical patterns suggest "
            f"{best.trainName} confirms "
            f"~{best.confirmProbability}% of "
            f"{query.travelClass} bookings this far "
            f"before departure."
        ),

        (
            "Booking earlier generally raises "
            "confirmation probability — see the "
            "date comparison below."
        ),

        (
            f"{alternate_stations[0].name} shows "
            f"comparable availability with only "
            f"{alternate_stations[0].extraTravel} "
            f"extra travel time."
        ),
    ]

    return SearchResult(
        query=query,
        best=best,
        otherTrains=rest,
        alternateStations=alternate_stations,
        alternateDates=alternate_dates,
        aiInsights=ai_insights,
    )


# ---------------------------------------------------------
# HEALTH
# ---------------------------------------------------------

@app.get("/health")
def health():

    from db import (
        SUPABASE_URL,
        SUPABASE_KEY,
    )

    configured = bool(
        SUPABASE_URL
        and SUPABASE_KEY
    )

    stations_count = (
        len(fetch_stations())
        if configured
        else 0
    )

    return {
        "status": "ok",
        "database": {
            "configured": configured,
            "reachable": stations_count > 0,
            "stations": stations_count,
        },
    }


# ---------------------------------------------------------
# TRAIN-STOPS DRY-RUN ADMIN ENDPOINT
# ---------------------------------------------------------

@app.get("/admin/dry-run-train-stops")
def dry_run_train_stops(x_admin_token: str = Header(default="")):
    if (
        not TRAIN_STOPS_ADMIN_TOKEN
        or x_admin_token
        != TRAIN_STOPS_ADMIN_TOKEN
    ):

        raise HTTPException(
            status_code=401,
            detail="Unauthorized",
        )

    # Import the dry-run function.
    from scripts.import_train_stops import (
        run_dry_run_report,
        DRY_RUN as SCRIPT_DRY_RUN,
    )

    # Never allow the endpoint to run
    # when the importer is not in dry-run mode.
    if not SCRIPT_DRY_RUN:

        raise HTTPException(
            status_code=403,
            detail=(
                "DRY_RUN is disabled; "
                "refusing to execute."
            ),
        )

    try:

        report = run_dry_run_report()

    except Exception:

        log.exception("dry_run_train_stops failed")

        raise HTTPException(
            status_code=500,
            detail=(
                "Dry run failed. "
                "Check server logs."
            ),
        )

    return report


# ---------------------------------------------------------
# FULL STATIONS IMPORT DRY-RUN ADMIN ENDPOINT
# ---------------------------------------------------------

@app.get("/admin/dry-run-stations-import")
def dry_run_stations_import(x_admin_token: str = Header(default="")):
   if not TRAIN_STOPS_ADMIN_TOKEN or x_admin_token != TRAIN_STOPS_ADMIN_TOKEN:
       raise HTTPException(status_code=401, detail="Unauthorized")

   import httpx

   try:
       response = httpx.get(
           "https://raw.githubusercontent.com/datameet/railways/master/stations.json",
           timeout=60.0,
           follow_redirects=True,
       )
       response.raise_for_status()
       data = response.json()
   except Exception:
       log.exception("dry_run_stations_import failed (fetch)")
       raise HTTPException(
           status_code=500,
           detail="Failed to fetch/parse stations.json. Check server logs."
       )

   features = data.get("features", [])
   total_source_records = len(features)

   invalid_records = []
   code_groups: dict[str, list[dict]] = {}

   for idx, feature in enumerate(features):
       props = feature.get("properties", {}) or {}
       code = (props.get("code") or "").strip().upper()
       name = (props.get("name") or "").strip()

       if not code or not name:
           invalid_records.append({
               "index": idx,
               "reason": "missing code or name",
               "properties": props,
           })
           continue

       code_groups.setdefault(code, []).append({
           "name": name,
           "state": props.get("state"),
           "zone": props.get("zone"),
           "address": props.get("address"),
           "city": props.get("city"),
           "index": idx,
       })

   unique_valid_station_codes = len(code_groups)

   exact_duplicate_records = []
   conflicting_records = []
   duplicate_records_count = 0
   clean_codes = {}

   for code, occurrences in code_groups.items():
       if len(occurrences) == 1:
           clean_codes[code] = occurrences[0]
           continue

       duplicate_records_count += len(occurrences) - 1
       distinct_names = {o["name"] for o in occurrences}

       if len(distinct_names) == 1:
           exact_duplicate_records.append({
               "code": code,
               "name": occurrences[0]["name"],
               "occurrences": len(occurrences),
           })
           clean_codes[code] = occurrences[0]
       else:
           conflicting_records.append({
               "code": code,
               "conflicting_names": list(distinct_names),
               "occurrences": len(occurrences),
           })

   from db import get_client

   supa_client = get_client()
   existing_codes = set()
   offset = 0
   while True:
       resp = (
           supa_client.table("stations")
           .select("code")
           .range(offset, offset + 999)
           .execute()
       )
       rows = resp.data or []
       existing_codes.update(
           r["code"] for r in rows if r.get("code")
       )
       if len(rows) < 1000:
           break
       offset += 1000

   missing_codes = sorted(set(clean_codes.keys()) - existing_codes)
   already_existing = sorted(set(clean_codes.keys()) & existing_codes)

   new_stations = [
       {
           "code": code,
           "name": clean_codes[code]["name"],
           "city": clean_codes[code].get("city"),
           "_reference_only": {
               "state": clean_codes[code].get("state"),
               "zone": clean_codes[code].get("zone"),
               "address": clean_codes[code].get("address"),
           },
       }
       for code in missing_codes
   ]

   return {
       "dry_run": True,
       "database_writes_performed": False,
       "total_source_records": total_source_records,
       "invalid_records_count": len(invalid_records),
       "unique_valid_station_codes": unique_valid_station_codes,
       "duplicate_records_count": duplicate_records_count,
       "exact_duplicate_codes_count": len(exact_duplicate_records),
       "conflicting_codes_count": len(conflicting_records),
       "existing_stations_in_db": len(existing_codes),
       "already_matching_source": len(already_existing),
       "missing_new_stations_count": len(new_stations),
       "sample_invalid_records": invalid_records[:10],
       "sample_exact_duplicates": exact_duplicate_records[:10],
               "sample_conflicting_records": conflicting_records[:10],
        "sample_new_stations": new_stations[:20],
   }


# ---------------------------------------------------------
# CHAT / MISSION AI
from chat import (
    parse_intent,
    explain_result,
)


@app.post("/chat")
def chat(
    payload: dict,
):

    message = str(
        payload.get(
            "message",
            "",
        )
        or ""
    ).strip()

    if not message:

        return {
            "reply": (
                "Tell me where you'd like "
                "to travel and when."
            ),
            "result": None,
        }

    log.info(
        "chat | message=%r",
        message[:120],
    )

    try:

        intent = parse_intent(
            message
        )

    except Exception as exc:

        log.exception(
            "chat | intent parsing failed: %s",
            exc,
        )

        return {
            "reply": (
                "I couldn't understand that right now. "
                "Try the search form above, or rephrase "
                "like: 'Delhi to Mumbai tomorrow in 3A'."
            ),
            "result": None,
        }

    missing = [
        k
        for k in (
            "source",
            "destination",
            "date",
        )
        if not intent.get(k)
    ]

    if missing:

        return {
            "reply": (
                "I need a bit more info — could you "
                f"tell me your "
                f"{', '.join(missing)}?"
            ),
            "result": None,
        }

    query = SearchQuery(
        source=intent["source"],
        destination=intent["destination"],
        date=intent["date"],
        travelClass=(
            intent.get("travelClass")
            or "SL"
        ),
    )

    try:

        result = search(
            query
        )

    except HTTPException as exc:

        return {
            "reply": str(
                exc.detail
            ),
            "result": None,
        }

    try:

        reply = explain_result(
            message,
            result.model_dump(),
        )

    except Exception as exc:

        log.exception(
            "chat | explanation failed: %s",
            exc,
        )

        reply = (
            f"Best option: "
            f"{result.best.trainName} "
            f"({result.best.trainNumber}), "
            f"~{result.best.confirmProbability}% "
            f"confirmation chance."
        )

    return {
        "reply": reply,
        "result": result.model_dump(),
        }
# --------------------------------------------------------------
# STATIONS IMPORT (ACTUAL WRITE) ADMIN ENDPOINT
# --------------------------------------------------------------

STATIONS_IMPORT_ENABLED = os.environ.get("STATIONS_IMPORT_ENABLED", "false").strip().lower() == "true"


@app.post("/admin/import-stations")
def import_stations(x_admin_token: str = Header(default=""), confirm: str = ""):
    if not TRAIN_STOPS_ADMIN_TOKEN or x_admin_token != TRAIN_STOPS_ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")

    if not STATIONS_IMPORT_ENABLED:
        raise HTTPException(
            status_code=403,
            detail="Stations import is disabled. STATIONS_IMPORT_ENABLED must be set to true.",
        )

    if confirm != "yes-import-missing-stations":
        raise HTTPException(
            status_code=400,
            detail="Missing or incorrect confirm parameter. Pass ?confirm=yes-import-missing-stations to proceed.",
        )

    import httpx
    from db import get_service_client

    try:
        response = httpx.get(
            "https://raw.githubusercontent.com/datameet/railways/master/stations.json",
            timeout=60.0,
            follow_redirects=True,
        )
        response.raise_for_status()
        data = response.json()
    except Exception:
        log.exception("import_stations failed (fetch)")
        raise HTTPException(status_code=500, detail="Failed to fetch/parse stations.json. Check server logs.")

    features = data.get("features", [])
    
    invalid_count = 0
    code_groups: dict[str, list[dict]] = {}
    for feature in features:
        props = feature.get("properties", {}) or {}
        code = (props.get("code") or "").strip().upper()
        name = (props.get("name") or "").strip()
        if not code or not name:
            invalid_count += 1
            continue
        code_groups.setdefault(code, []).append({
            "name": name,
            "city": props.get("city"),
        })

    clean_codes = {}
    duplicate_count = 0
    conflicting_count = 0
    for code, occurrences in code_groups.items():
        if len(occurrences) == 1:
            clean_codes[code] = occurrences[0]
            continue
        distinct_names = {o["name"] for o in occurrences}
        if len(distinct_names) == 1:
            clean_codes[code] = occurrences[0]
            duplicate_count += len(occurrences) - 1
        else:
            conflicting_count += 1

    supa_client = get_service_client()

    existing_codes = set()
    offset = 0

    while True:
        resp = (
            supa_client.table("stations")
            .select("code")
            .range(offset, offset + 999)
            .execute()
        )

        rows = resp.data or []

        existing_codes.update(
            r["code"]
            for r in rows
            if r.get("code")
        )

        if len(rows) < 1000:
            break

        offset += 1000
    missing_codes = sorted(set(clean_codes.keys()) - existing_codes)

    rows_to_insert = [
        {
            "code": code,
            "name": clean_codes[code]["name"],
            "city": clean_codes[code].get("city"),
        }
        for code in missing_codes
    ]

    batch_size = 500
    inserted_count = 0
    skipped_count = 0
    failed_batches = []
    batch_reports = []

    for i in range(0, len(rows_to_insert), batch_size):
        batch_index = i // batch_size
        batch = rows_to_insert[i:i + batch_size]
        try:
            result = supa_client.table("stations").insert(batch).execute()
            got = len(result.data) if result.data else 0
            inserted_count += got
            skipped_count += len(batch) - got
            batch_reports.append({
                "batch_index": batch_index,
                "attempted": len(batch),
                "inserted": got,
                "skipped": len(batch) - got,
                "failed": 0,
            })
            log.info(
                "import_stations batch %s | attempted=%s inserted=%s skipped=%s",
                batch_index, len(batch), got, len(batch) - got,
            )
        except Exception as exc:
            log.exception(f"import_stations batch {batch_index} failed")
            failed_batches.append({
                "batch_index": batch_index,
                "batch_start": i,
                "batch_size": len(batch),
                "error": str(exc),
            })
            batch_reports.append({
                "batch_index": batch_index,
                "attempted": len(batch),
                "inserted": 0,
                "skipped": 0,
                "failed": len(batch),
            })
            log.info(
                "import_stations batch %s FAILED | attempted=%s error=%s",
                batch_index, len(batch), str(exc),
            )

    log.info(
        "import_stations complete | inserted=%s skipped=%s failed_batches=%s total_candidates=%s",
        inserted_count, skipped_count, len(failed_batches), len(rows_to_insert),
    )

    return {
        "import_executed": True,
        "total_candidates": len(rows_to_insert),
        "inserted_count": inserted_count,
        "skipped_count": skipped_count,
        "failed_batches_count": len(failed_batches),
        "failed_batches": failed_batches,
        "batch_reports": batch_reports,
        "invalid_records_skipped": invalid_count,
        "duplicate_records_merged": duplicate_count,
        "conflicting_codes_excluded": conflicting_count,
            }


# --------------------------------------------------------------
# TRAIN STOPS IMPORT (ACTUAL WRITE) ADMIN ENDPOINT
# --------------------------------------------------------------

TRAIN_STOPS_IMPORT_ENABLED = os.environ.get("TRAIN_STOPS_IMPORT_ENABLED", "false").strip().lower() == "true"


@app.post("/admin/import-train-stops")
def import_train_stops_endpoint(x_admin_token: str = Header(default=""), confirm: str = ""):
    if not TRAIN_STOPS_ADMIN_TOKEN or x_admin_token != TRAIN_STOPS_ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not TRAIN_STOPS_IMPORT_ENABLED:
        raise HTTPException(status_code=403, detail="Train stops import is disabled. TRAIN_STOPS_IMPORT_ENABLED must be set to true.")
    if confirm != "yes-import-train-stops":
        raise HTTPException(status_code=400, detail="Missing or incorrect confirm parameter. Pass ?confirm=yes-import-train-stops to proceed.")

    from db import get_service_client, fetch_all_train_stop_keys
    from scripts.import_train_stops import (
        SCHEDULES_URL,
        TRAIN_WHITELIST,
        get_valid_station_codes,
        stream_and_validate,
    )

    supa_client = get_service_client()
    try:
        valid_stations = get_valid_station_codes(supa_client)
        valid_rows, errors, stats, per_train_detail = stream_and_validate(
            SCHEDULES_URL, TRAIN_WHITELIST, valid_stations
        )
    except Exception:
        log.exception("import_train_stops failed (fetch/parse)")
        raise HTTPException(status_code=500, detail="Failed to fetch/parse schedules.json. Check server logs.")

    candidate_rows = [
        {
            "train_number": r["train_number"],
            "station_code": r["station_code"],
            "stop_sequence": r["stop_sequence"],
            "arrival_time": r.get("arrival_time"),
            "departure_time": r.get("departure_time"),
            "day_offset": r.get("day_offset", 0),
        }
        for r in valid_rows
    ]
    existing_keys = fetch_all_train_stop_keys(supa_client)
    rows_to_insert = [
        r
        for r in candidate_rows
        if (r["train_number"], r["station_code"], r["stop_sequence"]) not in existing_keys
    ]
    skipped_existing = len(candidate_rows) - len(rows_to_insert)

    batch_size = 500
    inserted_count = 0
    skipped_count = skipped_existing
    failed_batches = []
    batch_reports = []
    for i in range(0, len(rows_to_insert), batch_size):
        batch_index = i // batch_size
        batch = rows_to_insert[i : i + batch_size]
        try:
            result = (
                supa_client.table("train_stops")
                .upsert(
                    batch,
                    on_conflict="train_number,station_code,stop_sequence",
                    ignore_duplicates=True,
                )
                .execute()
            )
            got = len(result.data) if result.data else 0
            inserted_count += got
            skipped_count += len(batch) - got
            batch_reports.append(
                {
                    "batch_index": batch_index,
                    "attempted": len(batch),
                    "inserted": got,
                    "skipped": len(batch) - got,
                    "failed": 0,
                }
            )
        except Exception as exc:
            log.exception(f"import_train_stops batch {batch_index} failed")
            failed_batches.append(
                {
                    "batch_index": batch_index,
                    "batch_start": i,
                    "batch_size": len(batch),
                    "error": str(exc),
                }
            )
            batch_reports.append(
                {
                    "batch_index": batch_index,
                    "attempted": len(batch),
                    "inserted": 0,
                    "skipped": 0,
                    "failed": len(batch),
                }
            )

    return {
        "import_executed": True,
        "total_candidates": len(rows_to_insert),
        "inserted_count": inserted_count,
        "skipped_count": skipped_count,
        "failed_batches_count": len(failed_batches),
        "failed_batches": failed_batches,
        "batch_reports": batch_reports,
        "trains_requested": sorted(TRAIN_WHITELIST),
    }


@app.get("/stations/resolve")
def resolve_stations(q: str = "", limit: int = 20):
    needle = (q or "").strip().lower()
    if not needle:
        return {"query": q, "matches": []}
    rows = fetch_stations()
    exact_code, name_matches, city_matches = [], [], []
    for r in rows:
        code = str(r.get("code") or "").lower()
        name = str(r.get("name") or "").lower()
        city = str(r.get("city") or "").lower()
        if code == needle:
            exact_code.append(r)
        elif needle in name or needle in code:
            name_matches.append(r)
        elif city and needle in city:
            city_matches.append(r)
    seen, matches = set(), []
    for r in exact_code + name_matches + city_matches:
        c = r.get("code")
        if c and c not in seen:
            seen.add(c)
            matches.append({"code": c, "name": r.get("name"), "city": r.get("city")})
        if len(matches) >= limit:
            break
    return {"query": q, "matches": matches}


def _time_to_minutes(t):
    try:
        h, m = str(t).strip().split(":")
        return int(h) * 60 + int(m)
    except Exception:
        return None


@app.post("/route-search")
def route_search(payload: dict):
    source_q = str(payload.get("source") or "").strip()
    dest_q = str(payload.get("destination") or "").strip()
    if not source_q or not dest_q:
        raise HTTPException(status_code=400, detail="Both source and destination are required.")
    src = [m["code"] for m in resolve_stations(source_q)["matches"]]
    dst = [m["code"] for m in resolve_stations(dest_q)["matches"]]
    if not src or not dst:
        raise HTTPException(status_code=404, detail="Could not resolve source or destination.")

    from db import get_client, fetch_all_train_stops
    client = get_client()
    trains = {}
    for s in fetch_all_train_stops(client):
        trains.setdefault(s["train_number"], {})[s["station_code"]] = s
    station_names = {r["code"]: r.get("name") for r in fetch_stations()}

    results = []
    for train_number, stop_map in trains.items():
        best = None
        for sc in src:
            for dc in dst:
                a = stop_map.get(sc)
                b = stop_map.get(dc)
                if a and b and a["stop_sequence"] < b["stop_sequence"]:
                    dep = _time_to_minutes(a.get("departure_time"))
                    arr = _time_to_minutes(b.get("arrival_time"))
                    dur = None
                    if dep is not None and arr is not None:
                        day_diff = (b.get("day_offset") or 0) - (a.get("day_offset") or 0)
                        dur = arr + day_diff * 1440 - dep
                    cand = {
                        "train_number": train_number,
                        "board": {"code": sc, "name": station_names.get(sc),
                                  "departure": a.get("departure_time"),
                                  "day_offset": a.get("day_offset")},
                        "alight": {"code": dc, "name": station_names.get(dc),
                                   "arrival": b.get("arrival_time"),
                                   "day_offset": b.get("day_offset")},
                        "stops_between": b["stop_sequence"] - a["stop_sequence"],
                        "duration_minutes": dur,
                    }
                    if best is None or cand["stops_between"] < best["stops_between"]:
                        best = cand
        if best:
            results.append(best)
    results.sort(key=lambda r: (r["duration_minutes"] is None, r["duration_minutes"] or 0))
    return {"source_query": source_q, "destination_query": dest_q, "trains": results}
