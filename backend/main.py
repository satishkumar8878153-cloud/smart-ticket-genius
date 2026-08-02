import logging
import traceback
from datetime import date, timedelta
from fastapi import FastAPI, HTTPException, Request
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

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
log = logging.getLogger("smart-ticket-ai")

app = FastAPI(title="Smart Ticket AI — Phase 1 API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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
            "Database credentials are missing — /stations and /search will "
            "return empty results. Set SUPABASE_URL and SUPABASE_KEY."
        )


@app.middleware("http")
async def request_logger(request: Request, call_next):
    log.info("--> %s %s", request.method, request.url.path)
    response = await call_next(request)
    log.info("<-- %s %s %s", request.method, request.url.path, response.status_code)
    return response


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Log the traceback and always return a CORS-safe JSON error."""
    log.error("Unhandled error on %s", request.url.path)
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"detail": f"Internal error in {request.url.path}: {exc}"},
        headers={"Access-Control-Allow-Origin": "*"},
    )


@app.get("/stations")
def stations(q: str | None = None, limit: int = 100) -> list[dict]:
    """All stations, popular first. Optional `q` filters by code, name or city."""
    try:
        rows = fetch_stations()
    except Exception as exc:
        log.exception("fetch_stations failed: %s", exc)
        rows = []

    if q:
        needle = q.strip().lower()
        rows = [
            r
            for r in rows
            if needle in str(r.get("code") or "").lower()
            or needle in str(r.get("name") or "").lower()
            or needle in str(r.get("city") or "").lower()
        ]

    log.info("stations | q=%r matched=%d", q, len(rows))
    return [
        {
            "code": r.get("code"),
            "name": r.get("name"),
            "city": r.get("city"),
            "is_popular": bool(r.get("is_popular", False)),
        }
        for r in rows[: max(1, limit)]
    ]


def _days_before(journey_date_str: str) -> int:
    try:
        d = date.fromisoformat(journey_date_str)
    except ValueError:
        return 7
    return max(0, (d - date.today()).days)



def _seat_status(confirm_probability: int) -> SeatStatus:
    if confirm_probability >= 80:
        return SeatStatus(label=f"AVL {confirm_probability}", tone="success")
    if confirm_probability >= 55:
        return SeatStatus(label=f"WL {100 - confirm_probability}", tone="warning")
    return SeatStatus(label=f"WL {100 - confirm_probability}", tone="danger")


def _build_availability(journey_date: str, days_before: int) -> dict:
    return {
        cls: _seat_status(heuristic_confirmation_score(cls, journey_date, days_before))
        for cls in ALL_CLASSES
    }


def _confirmation_score_and_reason(
    train_number: str, travel_class: str, journey_date: str, days_before: int
) -> tuple[int, str]:
    stats = fetch_pnr_stats(train_number, travel_class)
    if stats and stats["total"] > 0:
        score = round(stats["confirm_rate"] * 100)
        score = max(2, min(98, score))
        sample_note = (
            "small sample" if stats["total"] < 10 else f"{stats['total']} bookings"
        )
        reason = (
            f"{stats['confirmed']}/{stats['total']} historically confirmed on this "
            f"train/class ({sample_note})."
        )
        return score, reason

    score = heuristic_confirmation_score(travel_class, journey_date, days_before)
    reason = (
        f"{score}% estimated confirmation chance in {travel_class} "
        f"based on booking {days_before} day(s) before journey. "
        f"(Estimated — no historical data for this train yet.)"
    )
    return score, reason


@app.post("/search", response_model=SearchResult)
def search(query: SearchQuery) -> SearchResult:
    log.info(
        "search | %s -> %s on %s (%s)",
        query.source, query.destination, query.date, query.travelClass,
    )
    try:
        train_rows = fetch_trains_for_route(query.source, query.destination)
    except Exception as exc:
        log.exception("fetch_trains_for_route failed: %s", exc)
        raise HTTPException(
            status_code=503,
            detail="Train database is temporarily unreachable. Please retry.",
        )

    if not train_rows:
        log.warning("search | no trains for %s -> %s", query.source, query.destination)
        raise HTTPException(
            status_code=404,
            detail="No trains found for this route yet. Try nearby major stations.",
        )

    days_before = _days_before(query.date)


    recommendations = []
    for t in train_rows:
        confirm, reason = _confirmation_score_and_reason(
            t["train_number"], query.travelClass, query.date, days_before
        )
        try:
            h, m = t["duration"].lower().replace("h", "").replace("m", "").split()
            duration_minutes = int(h) * 60 + int(m)
        except Exception:
            duration_minutes = 300

        rec = TrainRecommendation(
            trainName=t["train_name"],
            trainNumber=t["train_number"],
            departure=t["departure_time"],
            arrival=t["arrival_time"],
            duration=t["duration"],
            confirmProbability=confirm,
            recommendationScore=recommendation_score(confirm, duration_minutes, fare=800),
            bestClass=query.travelClass,
            reason=reason,
            availability=_build_availability(query.date, days_before),
        )
        recommendations.append(rec)

    recommendations.sort(
        key=lambda r: r.recommendationScore * 0.6 + r.confirmProbability * 0.4,
        reverse=True,
    )
    best, *rest = recommendations

    alternate_stations = [
        AlternateStation(
            code=f"{query.source[:3].upper()}{i+1}",
            name=f"{query.source} {name}",
            distanceKm=10 + i * 12,
            extraTravel=f"{20 + i * 10} min",
            availability=_seat_status(
                heuristic_confirmation_score(query.travelClass, query.date, days_before + 1)
            ),
        )
        for i, name in enumerate(["Central Jn", "Cantt", "City Jn", "Terminus"])
    ]

    try:
        today = date.fromisoformat(query.date) if query.date else date.today()
    except ValueError:
        today = date.today()

    alternate_dates = []
    for i in range(7):
        d = today + timedelta(days=i)
        db_ = max(0, (d - date.today()).days)
        confirm = heuristic_confirmation_score(query.travelClass, d.isoformat(), db_)
        alternate_dates.append(
            AlternateDate(
                date=d.isoformat(),
                weekday=d.strftime("%a"),
                status=_seat_status(confirm),
                fare=950 + i * 120,
            )
        )

    ai_insights = [
        f"Historical patterns suggest {best.trainName} confirms ~{best.confirmProbability}% "
        f"of {query.travelClass} bookings this far before departure.",
        "Booking earlier generally raises confirmation probability — see the date "
        "comparison below.",
        f"{alternate_stations[0].name} shows comparable availability with only "
        f"{alternate_stations[0].extraTravel} extra travel time.",
    ]

    return SearchResult(
        query=query,
        best=best,
        otherTrains=rest,
        alternateStations=alternate_stations,
        alternateDates=alternate_dates,
        aiInsights=ai_insights,
    )


@app.get("/health")
def health():
    return {"status": "ok"}


from chat import parse_intent, explain_result

@app.post("/chat")
def chat(payload: dict):
    message = payload.get("message", "")
    intent = parse_intent(message)

    missing = [k for k in ("source", "destination", "date") if not intent.get(k)]
    if missing:
        return {
            "reply": f"I need a bit more info — could you tell me your {', '.join(missing)}?",
            "result": None,
        }

    query = SearchQuery(
        source=intent["source"],
        destination=intent["destination"],
        date=intent["date"],
        travelClass=intent.get("travelClass") or "SL",
    )
    result = search(query)
    reply = explain_result(message, result.model_dump())
    return {"reply": reply, "result": result.model_dump()}
