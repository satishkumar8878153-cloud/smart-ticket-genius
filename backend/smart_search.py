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
)
from recommendation_v2 import (
    rank_score as _rank_score,
    apply_v2_scores as _apply_v2_scores,
    recommend_why as _recommend_why_v2,
    why as _why_v2,
    station_role as _station_role,
)

log = logging.getLogger("smart-ticket-ai.smart-search")
