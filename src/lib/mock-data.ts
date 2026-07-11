// Re-exports maintained for backward compatibility. All real data now flows
// through the services layer (src/services/*).
export {
  CLASSES,
  type TicketClass,
  type SeatStatus,
  type ClassAvailability,
  type TrainRecommendation,
  type AlternateStation,
  type AlternateDate,
  type SearchQuery,
  type SearchResult,
  type Station,
} from "@/services/types";
