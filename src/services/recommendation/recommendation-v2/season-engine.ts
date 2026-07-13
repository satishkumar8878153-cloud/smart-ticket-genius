// Season Engine — infers travel season from the journey date and returns
// multipliers that downstream engines can apply.

import { SEASON_MULTIPLIERS } from "./config";
import type { ISeasonEngine, SeasonImpact, SeasonType } from "./types";
import { parseDate } from "./utils";

export class DefaultSeasonEngine implements ISeasonEngine {
  infer(journeyDate: string): SeasonImpact {
    const d = parseDate(journeyDate);
    const m = d.getUTCMonth() + 1;
    const day = d.getUTCDate();
    const season = this.seasonFor(m, day);
    const mult = SEASON_MULTIPLIERS[season];
    return {
      season,
      demandMultiplier: mult.demand,
      fareMultiplier: mult.fare,
      reliabilityDelta: mult.reliability,
      reasons: [this.reasonFor(season)],
    };
  }

  private seasonFor(m: number, d: number): SeasonType {
    // Festivals (rough overlap with Diwali/Holi/Christmas).
    if ((m === 10 && d >= 20) || (m === 11 && d <= 15)) return "festival";
    if (m === 3 && d >= 25) return "festival";
    if ((m === 12 && d >= 20) || (m === 1 && d <= 5)) return "festival";
    // Vacations.
    if (m === 5 || m === 6) return "summer-vacation";
    if ((m === 12 && d >= 15) || (m === 1 && d <= 10)) return "winter-vacation";
    // Exam season.
    if ((m === 2 && d >= 15) || m === 3) return "exam";
    return "regular";
  }

  private reasonFor(s: SeasonType): string {
    switch (s) {
      case "summer-vacation": return "Summer vacation travel window";
      case "winter-vacation": return "Winter vacation travel window";
      case "festival":        return "Festival season — heavy inbound/outbound flow";
      case "exam":            return "Exam season — student & family travel";
      default:                return "Regular season";
    }
  }
}
