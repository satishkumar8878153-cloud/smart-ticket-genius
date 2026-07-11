// Shared domain types for the Smart Ticket AI backend layer.
// Kept in the services folder so both the API layer and UI import from one place.

export type TicketClass = "SL" | "3A" | "2A" | "1A" | "CC" | "EC";

export const CLASSES: { code: TicketClass; label: string }[] = [
  { code: "SL", label: "Sleeper" },
  { code: "3A", label: "AC 3-Tier" },
  { code: "2A", label: "AC 2-Tier" },
  { code: "1A", label: "AC First" },
  { code: "CC", label: "Chair Car" },
  { code: "EC", label: "Executive" },
];

export type SeatStatus = {
  label: string;
  tone: "success" | "warning" | "danger" | "muted";
};

export type ClassAvailability = Record<TicketClass, SeatStatus>;

export type TrainRecommendation = {
  trainName: string;
  trainNumber: string;
  departure: string;
  arrival: string;
  duration: string;
  confirmProbability: number;
  recommendationScore: number;
  reason: string;
  bestClass: TicketClass;
  availability: ClassAvailability;
};

export type AlternateStation = {
  code: string;
  name: string;
  distanceKm: number;
  extraTravel: string;
  availability: SeatStatus;
};

export type AlternateDate = {
  date: string;
  weekday: string;
  status: SeatStatus;
  fare: number;
};

export type SearchQuery = {
  source: string;
  destination: string;
  date: string;
  travelClass: TicketClass;
};

export type SearchResult = {
  query: SearchQuery;
  best: TrainRecommendation;
  otherTrains: TrainRecommendation[];
  alternateStations: AlternateStation[];
  alternateDates: AlternateDate[];
  aiInsights: string[];
};

export type Station = {
  code: string;
  name: string;
  city: string | null;
  is_popular: boolean;
};

export type TrainRow = {
  train_number: string;
  train_name: string;
  source_code: string;
  destination_code: string;
  departure_time: string;
  arrival_time: string;
  duration: string;
};
