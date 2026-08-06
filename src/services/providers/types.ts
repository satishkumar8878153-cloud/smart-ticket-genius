// Provider interfaces (adapter pattern).
//
// Every external data source the product will eventually depend on (a live
// railway API, an IRCTC partner, an SMS/push vendor) is expressed here as a
// narrow interface. The app only ever talks to these interfaces, so a live
// provider can be registered later without touching feature code.

import type {
  SearchQuery,
  SearchResult,
  Station,
  TicketClass,
  TrainRow,
} from "../types";

export type ProviderMeta = {
  /** Stable id, e.g. "supabase", "irctc-partner", "fastapi". */
  readonly id: string;
  /** True when the data is synthesised/demo rather than live railway data. */
  readonly isLive: boolean;
};

// ---------------------------------------------------------------- schedules
export interface TrainScheduleProvider extends ProviderMeta {
  listStations(): Promise<Station[]>;
  listTrainsForRoute(source: string, destination: string): Promise<TrainRow[]>;
}

// ------------------------------------------------------------- availability
export type AvailabilityQuery = SearchQuery;

export interface SeatAvailabilityProvider extends ProviderMeta {
  /** Full journey snapshot: trains + per-class availability + alternates. */
  getAvailability(query: AvailabilityQuery): Promise<SearchResult>;
}

// ---------------------------------------------------------------------- PNR
export type PnrConfirmStats = {
  total: number;
  confirmed: number;
  confirmRate: number; // 0..100
};

export type PnrStatus = {
  pnr: string;
  bookingStatus: string;
  currentStatus: string;
  confirmed: boolean;
  chartPrepared: boolean;
};

export interface PnrProvider extends ProviderMeta {
  /** Aggregate confirmation history for a train/class/quota combination. */
  getConfirmStats(input: {
    trainNumber: string;
    classCode: TicketClass | string;
    quota?: string | null;
  }): Promise<PnrConfirmStats>;
  /** Live PNR lookup. Demo providers may return null. */
  getPnrStatus(pnr: string): Promise<PnrStatus | null>;
}

// --------------------------------------------------------------------- fare
export type FareQuote = {
  trainNumber: string;
  travelClass: TicketClass;
  baseFare: number;
  totalFare: number;
  currency: "INR";
  breakdown: Array<{ label: string; amount: number }>;
};

export interface FareProvider extends ProviderMeta {
  quote(input: {
    trainNumber: string;
    travelClass: TicketClass;
    journeyDate: string;
    source: string;
    destination: string;
  }): Promise<FareQuote>;
}

// ------------------------------------------------------------- notification
export type NotificationChannel = "in-app" | "push" | "email" | "sms";

export type NotificationMessage = {
  channel: NotificationChannel;
  title: string;
  body: string;
  /** Free-form payload for deep-linking (pnr, trainNumber, route...). */
  data?: Record<string, string | number | boolean>;
};

export interface NotificationProvider extends ProviderMeta {
  send(message: NotificationMessage): Promise<{ delivered: boolean; id: string }>;
}

// ------------------------------------------------------------------ bundle
export type ProviderBundle = {
  schedule: TrainScheduleProvider;
  availability: SeatAvailabilityProvider;
  pnr: PnrProvider;
  fare: FareProvider;
  notification: NotificationProvider;
};
