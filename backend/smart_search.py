"""Smart Search Orchestrator — advanced alternative journey discovery.

Timetable / alternative boarding-destination engine only.
Does NOT: multi-train connections, live availability, operating-day verification,
or invent confirmation percentages from thin PNR samples.

STUB: full Phase 13B implementation pending full-file push.
"""
from __future__ import annotations

from datetime import date
from typing import Any


def run_smart_search(
    source: str,
    destination: str,
    journey_date: str | None = None,
    class_code: str = "SL",
) -> dict:
    source = (source or "").strip()
    destination = (destination or "").strip()
    travel_class = (class_code or "SL").strip().upper() or "SL"
    journey_date = (journey_date or date.today().isoformat())[:10]
    return {
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
        "search_summary": {
            "error": "smart_search full body restore pending",
            "ranking_version": "v2",
            "operating_day_filter": "unavailable",
            "operating_day_verified": False,
            "note": "Timetable options only — operating day not verified; not live seat availability.",
        },
        "recommendation": None,
        "suggestions": [
            "Delhi to Patna",
            "Bhagalpur to Patna",
            "Katihar to Patna",
            "Bengaluru to Chennai",
        ],
    }
