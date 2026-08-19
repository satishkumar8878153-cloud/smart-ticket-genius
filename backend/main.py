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


CITY_CLUSTERS = {
    "patna": ["PNBE", "RJPB", "DNR", "PPTA", "PNC"],
    "delhi": ["NDLS", "DLI", "NZM", "ANVT"],
    "mumbai": ["MMCT", "CSMT", "LTT", "BDTS"],
    "kolkata": ["HWH", "SDAH", "KOAA", "SHM"],
    "chennai": ["MAS", "MS"],
    "bengaluru": ["SBC", "BNC", "YPR"],
    "bhagalpur": ["BGP"],
    "katihar": ["KIR"],
    "gaya": ["GAYA"],
    "ranchi": ["RNC"],
    "varanasi": ["BSB", "DDU"],
    "lucknow": ["LKO", "LJN"],
}
NEARBY_HUBS = {
    "patna": ["ARA", "BJU", "GAYA", "DDU", "MGS", "KIUL"],
    "delhi": ["GZB", "MTJ", "AGC", "TDL"],
    "mumbai": ["KYN", "PUNE", "SURAT"],
    "kolkata": ["DKAE", "BDC", "KGP"],
    "chennai": ["TBM", "AJJ"],
    "bengaluru": ["KJM", "JTJ"],
    "bhagalpur": ["JMP", "KGG"],
    "katihar": ["KGG", "BJU"],
    "gaya": ["PNBE", "DDU"],
    "ranchi": ["GAYA", "PNBE"],
    "varanasi": ["PNBE"],
    "lucknow": ["CNB"],
}


# LOADER: full main will be completed in follow-up if this succeeds
app = FastAPI(title="Smart Ticket AI — Phase 1 API")
