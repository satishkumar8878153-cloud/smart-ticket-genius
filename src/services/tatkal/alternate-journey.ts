// Alternate Journey AI
// Produces ranked alternates across four axes — train, date, station, class —
// from a ranked ScoredOption list. Purely derived; no random values.

import type { ScoredOption } from "../recommendation/types";

export type AlternateKind = "train" | "date" | "station" | "class";

export type AlternateOption = {
  kind: AlternateKind;
  optionId: string;
  label: string;                    // human summary ("12345 Rajdhani · 3A · 15 Nov")
  missionScore: number;
  expectedConfirmChance: number;
  risk: ScoredOption["riskLevel"];
  reason: string;
};

export type AlternateJourneyResult = {
  trains: AlternateOption[];
  dates: AlternateOption[];
  stations: AlternateOption[];
  classes: AlternateOption[];
};

function label(s: ScoredOption): string {
  return `${s.option.trainNumber} ${s.option.trainName} · ${s.option.travelClass} · ${s.option.journeyDate} · ${s.option.boardingStationCode}`;
}

function toAlt(kind: AlternateKind, s: ScoredOption, reason: string): AlternateOption {
  return {
    kind,
    optionId: s.option.id,
    label: label(s),
    missionScore: s.missionScore,
    expectedConfirmChance: s.expectedConfirmChance,
    risk: s.riskLevel,
    reason,
  };
}

function topBy<T>(arr: T[], n: number): T[] {
  return arr.slice(0, n);
}

export function generateAlternateJourneys(
  ranked: ScoredOption[],
): AlternateJourneyResult {
  if (ranked.length === 0) {
    return { trains: [], dates: [], stations: [], classes: [] };
  }
  const primary = ranked[0];

  const trains = topBy(
    ranked
      .filter((s) => s.option.trainNumber !== primary.option.trainNumber)
      .sort((a, b) => b.missionScore - a.missionScore),
    5,
  ).map((s) =>
    toAlt("train", s, `Different train with score ${s.missionScore} and ${s.expectedConfirmChance}% confirm.`),
  );

  const dates = topBy(
    ranked
      .filter((s) => s.option.journeyDate !== primary.option.journeyDate)
      .sort((a, b) => b.missionScore - a.missionScore),
    5,
  ).map((s) =>
    toAlt("date", s, `Alternate date ${s.option.journeyDate} scores ${s.missionScore}.`),
  );

  const stations = topBy(
    ranked
      .filter(
        (s) =>
          s.option.trainNumber === primary.option.trainNumber &&
          s.option.boardingStationCode !== primary.option.boardingStationCode,
      )
      .sort((a, b) => b.expectedConfirmChance - a.expectedConfirmChance),
    5,
  ).map((s) =>
    toAlt(
      "station",
      s,
      `Board at ${s.option.boardingStation} for ${s.expectedConfirmChance}% confirm odds.`,
    ),
  );

  const classes = topBy(
    ranked
      .filter(
        (s) =>
          s.option.trainNumber === primary.option.trainNumber &&
          s.option.journeyDate === primary.option.journeyDate &&
          s.option.travelClass !== primary.option.travelClass,
      )
      .sort((a, b) => b.missionScore - a.missionScore),
    5,
  ).map((s) =>
    toAlt("class", s, `Try ${s.option.travelClass}: score ${s.missionScore}, risk ${s.riskLevel}.`),
  );

  return { trains, dates, stations, classes };
}
