// Enumerates every ranked candidate the engine will score. Combines the
// existing SearchResult (trains, alternate stations, alternate dates, all-class
// matrix) into a flat list of TravelOptions with realistic signal estimates.
//
// The signal values are deterministic derivations from the SearchResult so the
// engine has meaningful inputs before a FastAPI/ML backend is wired in.

import type { AlternateStation, SearchResult, TicketClass, TrainRecommendation } from "../types";
import { parseDurationToMinutes } from "./feature-extractor";
import type { TravelOption } from "./types";

const CLASS_FARE_BASE: Record<TicketClass, number> = {
  SL: 450,
  "3A": 1150,
  "2A": 1750,
  "1A": 2950,
  CC: 780,
  EC: 1550,
};

function toneToAvailability(tone: string, label: string): number {
  if (tone === "success") return 90;
  if (tone === "warning") return 60;
  if (tone === "danger") {
    // Attempt to parse "WL 42" → higher WL = lower availability.
    const wl = /WL\s*(\d+)/i.exec(label);
    if (wl) return Math.max(5, 45 - Number(wl[1]) / 2);
    return 30;
  }
  return 15;
}

function waitlistRiskFromTone(tone: string): number {
  if (tone === "success") return 8;
  if (tone === "warning") return 35;
  if (tone === "danger") return 75;
  return 90;
}

function fareFor(travelClass: TicketClass, durationMin: number, dateFare?: number): number {
  const base = CLASS_FARE_BASE[travelClass] + durationMin * 0.9;
  if (dateFare) return Math.round((base + dateFare) / 2);
  return Math.round(base);
}

type BuildInput = {
  train: TrainRecommendation;
  travelClass: TicketClass;
  journeyDate: string;
  boardingStation: string;
  boardingStationCode: string;
  extraTravelMinutes: number;
  numChanges: number;
  dateFare?: number;
  availabilityLabel?: string;
  availabilityTone?: string;
};

function buildOption(inp: BuildInput): TravelOption {
  const minutes = parseDurationToMinutes(inp.train.duration);
  const avail = inp.train.availability[inp.travelClass];
  const tone = inp.availabilityTone ?? avail.tone;
  const label = inp.availabilityLabel ?? avail.label;

  const seatAvailability = toneToAvailability(tone, label);
  const waitingListRisk = waitlistRiskFromTone(tone);

  // Confirmation probability is anchored on the train's historical rate for the
  // best class, then adjusted by how this specific class currently looks.
  const classDelta =
    inp.travelClass === inp.train.bestClass ? 0 : (seatAvailability - 60) / 4;
  const confirmProbability = Math.max(
    5,
    Math.min(98, Math.round(inp.train.confirmProbability + classDelta)),
  );

  const tatkalSuccessProbability = Math.max(
    10,
    Math.min(95, Math.round(confirmProbability * 0.7 + seatAvailability * 0.2)),
  );

  return {
    id: `${inp.train.trainNumber}-${inp.travelClass}-${inp.journeyDate}-${inp.boardingStationCode}`,
    trainNumber: inp.train.trainNumber,
    trainName: inp.train.trainName,
    departure: inp.train.departure,
    arrival: inp.train.arrival,
    duration: inp.train.duration,
    travelClass: inp.travelClass,
    journeyDate: inp.journeyDate,
    boardingStation: inp.boardingStation,
    boardingStationCode: inp.boardingStationCode,
    extraTravelMinutes: inp.extraTravelMinutes,
    numChanges: inp.numChanges,
    fareEstimate: fareFor(inp.travelClass, minutes, inp.dateFare),
    signals: {
      seatAvailability,
      confirmProbability,
      tatkalSuccessProbability,
      waitingListRisk,
      onTimeReliability: 78, // placeholder — future signal from ML backend
    },
  };
}

function parseExtraMinutes(alt: AlternateStation): number {
  const m = /([0-9]+)\s*min/i.exec(alt.extraTravel);
  return m ? Number(m[1]) : 25;
}

export function enumerateTravelOptions(result: SearchResult): TravelOption[] {
  const trains = [result.best, ...result.otherTrains];
  const classes = Object.keys(result.best.availability) as TicketClass[];
  const dates = result.alternateDates.slice(0, 5);
  const stations = [
    {
      code: (result.query.source.slice(0, 4).toUpperCase()),
      name: result.query.source,
      extraTravelMinutes: 0,
      numChanges: 0,
    },
    ...result.alternateStations.slice(0, 2).map((s) => ({
      code: s.code,
      name: s.name,
      extraTravelMinutes: parseExtraMinutes(s),
      numChanges: 1,
    })),
  ];

  const options: TravelOption[] = [];
  for (const train of trains) {
    for (const cls of classes) {
      for (const date of dates) {
        for (const station of stations) {
          options.push(
            buildOption({
              train,
              travelClass: cls,
              journeyDate: date.date,
              boardingStation: station.name,
              boardingStationCode: station.code,
              extraTravelMinutes: station.extraTravelMinutes,
              numChanges: station.numChanges,
              dateFare: date.fare,
              availabilityLabel: date.status.label,
              availabilityTone: date.status.tone,
            }),
          );
        }
      }
    }
  }
  return options;
}
