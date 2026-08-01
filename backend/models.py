from typing import Literal, List, Dict
from pydantic import BaseModel

TicketClass = Literal["SL", "3A", "2A", "1A", "CC", "EC", "2S"]
Tone = Literal["success", "warning", "danger", "muted"]
ALL_CLASSES: List[TicketClass] = ["SL", "3A", "2A", "1A", "CC", "EC", "2S"]


class SeatStatus(BaseModel):
    label: str
    tone: Tone


ClassAvailability = Dict[str, SeatStatus]


class TrainRecommendation(BaseModel):
    trainName: str
    trainNumber: str
    departure: str
    arrival: str
    duration: str
    confirmProbability: int
    recommendationScore: int
    reason: str
    bestClass: TicketClass
    availability: ClassAvailability


class AlternateStation(BaseModel):
    code: str
    name: str
    distanceKm: int
    extraTravel: str
    availability: SeatStatus


class AlternateDate(BaseModel):
    date: str
    weekday: str
    status: SeatStatus
    fare: int


class SearchQuery(BaseModel):
    source: str
    destination: str
    date: str
    travelClass: TicketClass


class SearchResult(BaseModel):
    query: SearchQuery
    best: TrainRecommendation
    otherTrains: List[TrainRecommendation]
    alternateStations: List[AlternateStation]
    alternateDates: List[AlternateDate]
    aiInsights: List[str]
