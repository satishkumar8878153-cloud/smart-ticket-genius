"""Smart Search temporary stub — full V2 restore in next commit."""
from __future__ import annotations
from datetime import date

def run_smart_search(source, destination, journey_date=None, class_code="SL"):
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
            "error": "Smart Search is being restored. Please retry in a minute.",
            "latency_ms": 0,
            "operating_day_filter": "unavailable",
        },
        "recommendation": None,
        "suggestions": [
            "Delhi to Patna",
            "Bhagalpur to Patna",
            "Katihar to Patna",
            "Bengaluru to Chennai",
        ],
    }
