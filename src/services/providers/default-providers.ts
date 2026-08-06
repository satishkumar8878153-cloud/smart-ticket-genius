// Default provider implementations.
//
// These wrap the code the app already uses (Lovable Cloud tables, the demo
// availability synthesiser and the FastAPI seam in ./api-client). They exist so
// feature code depends on interfaces only — swapping in a live railway
// provider later is a registry call, not a rewrite.

import { supabase } from "@/integrations/supabase/client";
import { fetchStations } from "../stations.service";
import { fetchTrainsForRoute, searchTrains } from "../search.service";
import { enumerateTravelOptions } from "../recommendation/option-generator";
import type {
  AvailabilityQuery,
  FareProvider,
  FareQuote,
  NotificationMessage,
  NotificationProvider,
  PnrConfirmStats,
  PnrProvider,
  PnrStatus,
  ProviderBundle,
  SeatAvailabilityProvider,
  TrainScheduleProvider,
} from "./types";
import type { SearchResult, Station, TicketClass, TrainRow } from "../types";

export const supabaseScheduleProvider: TrainScheduleProvider = {
  id: "supabase-schedule",
  isLive: false,
  listStations(): Promise<Station[]> {
    return fetchStations();
  },
  listTrainsForRoute(source: string, destination: string): Promise<TrainRow[]> {
    return fetchTrainsForRoute(source, destination);
  },
};

export const defaultAvailabilityProvider: SeatAvailabilityProvider = {
  id: "supabase-availability",
  isLive: false,
  getAvailability(query: AvailabilityQuery): Promise<SearchResult> {
    return searchTrains(query);
  },
};

export const supabasePnrProvider: PnrProvider = {
  id: "supabase-pnr",
  isLive: false,
  async getConfirmStats(input): Promise<PnrConfirmStats> {
    try {
      const { data, error } = await supabase.rpc("pnr_confirm_stats", {
        _train_number: input.trainNumber,
        _class_code: String(input.classCode),
        _quota: input.quota ?? undefined,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      const total = Number(row?.total ?? 0);
      const confirmed = Number(row?.confirmed ?? 0);
      return {
        total,
        confirmed,
        confirmRate: total > 0 ? Math.round((confirmed / total) * 100) : 0,
      };
    } catch {
      return { total: 0, confirmed: 0, confirmRate: 0 };
    }
  },
  async getPnrStatus(): Promise<PnrStatus | null> {
    // No live PNR source wired yet — a partner provider will implement this.
    return null;
  },
};

export const derivedFareProvider: FareProvider = {
  id: "derived-fare",
  isLive: false,
  async quote(input): Promise<FareQuote> {
    const result = await defaultAvailabilityProvider.getAvailability({
      source: input.source,
      destination: input.destination,
      date: input.journeyDate,
      travelClass: input.travelClass,
    });
    const options = enumerateTravelOptions(result);
    const match =
      options.find(
        (o) =>
          o.trainNumber === input.trainNumber &&
          o.travelClass === input.travelClass &&
          o.journeyDate === input.journeyDate,
      ) ??
      options.find((o) => o.trainNumber === input.trainNumber) ??
      options[0];

    const total = match?.fareEstimate ?? 0;
    const base = Math.round(total * 0.82);
    return {
      trainNumber: input.trainNumber,
      travelClass: input.travelClass as TicketClass,
      baseFare: base,
      totalFare: total,
      currency: "INR",
      breakdown: [
        { label: "Base fare", amount: base },
        { label: "Reservation & GST", amount: total - base },
      ],
    };
  },
};

export const consoleNotificationProvider: NotificationProvider = {
  id: "console-notification",
  isLive: false,
  async send(message: NotificationMessage) {
    const id = `ntf_${Date.now().toString(36)}`;
    console.info("[notification]", message.channel, message.title, message.body, message.data ?? {});
    return { delivered: true, id };
  },
};

export const defaultProviders: ProviderBundle = {
  schedule: supabaseScheduleProvider,
  availability: defaultAvailabilityProvider,
  pnr: supabasePnrProvider,
  fare: derivedFareProvider,
  notification: consoleNotificationProvider,
};
