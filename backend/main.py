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
