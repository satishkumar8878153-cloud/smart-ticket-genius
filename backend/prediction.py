from datetime import date
from typing import Dict

BASE_CONFIRM_RATE: Dict[str, float] = {
    "SL": 0.72,
    "3A": 0.68,
    "2A": 0.78,
    "1A": 0.90,
    "CC": 0.75,
    "EC": 0.85,
}


def _days_before_multiplier(days_before: int) -> float:
    if days_before >= 30:
        return 1.15
    if days_before >= 15:
        return 1.08
    if days_before >= 7:
        return 1.0
    if days_before >= 3:
        return 0.85
    if days_before >= 1:
        return 0.65
    return 0.45


def _weekday_multiplier(journey_date_str: str) -> float:
    try:
        d = date.fromisoformat(journey_date_str)
    except ValueError:
        return 1.0
    weekday = d.weekday()
    if weekday in (4, 6):
        return 0.90
    if weekday in (5,):
        return 0.95
    return 1.05


def heuristic_confirmation_score(
    travel_class: str,
    journey_date_str: str,
    days_before_journey: int,
    train_popularity_factor: float = 1.0,
) -> int:
    base = BASE_CONFIRM_RATE.get(travel_class, 0.70)
    score = (
        base
        * _days_before_multiplier(days_before_journey)
        * _weekday_multiplier(journey_date_str)
        * train_popularity_factor
    )
    return max(2, min(98, round(score * 100)))


def recommendation_score(confirm_probability: int, duration_minutes: int, fare: float) -> int:
    duration_penalty = min(20, duration_minutes / 60)
    fare_penalty = min(15, fare / 500)
    score = confirm_probability - duration_penalty * 0.3 - fare_penalty * 0.3
    return max(0, min(100, round(score)))
