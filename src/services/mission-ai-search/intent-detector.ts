// Intent Detector — maps normalized text to travel intents.
// Rule-based scoring; pluggable via IntentDetector interface for future ML.

import type {
  DetectedIntent,
  IntentDetector,
  IntentSignal,
  JourneyIntent,
} from "./types";

type Rule = {
  intent: JourneyIntent;
  patterns: RegExp[];
  weight: number;
};

// Curated multilingual (English + Hinglish + Hindi romanised) triggers.
const RULES: Rule[] = [
  {
    intent: "HIGHEST_CONFIRMATION",
    weight: 40,
    patterns: [
      /\bsabse\s+(?:jyada|zyada|adhik)\s+confirm/i,
      /\bhighest\s+confirm/i,
      /\bmost\s+likely\s+to\s+confirm/i,
      /\bconfirm(?:ed|ation)?\s+(?:chance|probability|hone)/i,
      /\bpakka\s+ticket/i,
      /\bguaranteed?\b/i,
    ],
  },
  {
    intent: "CHEAPEST",
    weight: 35,
    patterns: [
      /\bcheapest\b/i,
      /\bsasti\b/i,
      /\bkam\s+(?:paise|rupaye|price|fare)/i,
      /\blowest\s+(?:price|fare)/i,
      /\bbudget\s+ticket/i,
      /\bminimum\s+fare/i,
    ],
  },
  {
    intent: "FASTEST",
    weight: 35,
    patterns: [
      /\bfastest\b/i,
      /\bshortest\s+(?:time|journey|duration)/i,
      /\bjaldi\s+(?:pahunch|pohonch|reach)/i,
      /\bkam\s+time\b/i,
      /\bquickest\b/i,
    ],
  },
  {
    intent: "TATKAL",
    weight: 50,
    patterns: [
      /\btatkal\b/i,
      /\bpremium\s+tatkal\b/i,
      /\blast\s+minute\b/i,
      /\bemergency\s+booking\b/i,
    ],
  },
  {
    intent: "PREMIUM",
    weight: 30,
    patterns: [
      /\bpremium\b/i,
      /\bluxury\b/i,
      /\brajdhani\b/i,
      /\bshatabdi\b/i,
      /\bvande\s*bharat\b/i,
      /\b1a\b|\bfirst\s+ac\b|\bexecutive\b/i,
    ],
  },
  {
    intent: "LOWEST_RISK",
    weight: 30,
    patterns: [
      /\bsafe\s+option\b/i,
      /\bkam\s+risk\b/i,
      /\blow\s+risk\b/i,
      /\breliable\b/i,
      /\bbharosemand\b/i,
    ],
  },
];

export class DefaultIntentDetector implements IntentDetector {
  readonly id = "default-intent-detector";

  detect(text: string): DetectedIntent {
    const hits: IntentSignal[] = [];
    for (const rule of RULES) {
      let matches = 0;
      for (const p of rule.patterns) if (p.test(text)) matches++;
      if (matches > 0) {
        const score = Math.min(100, rule.weight + (matches - 1) * 15);
        hits.push({ intent: rule.intent, score });
      }
    }

    hits.sort((a, b) => b.score - a.score);

    if (hits.length === 0) {
      return {
        primary: "BALANCED",
        secondary: [],
        signals: [{ intent: "BALANCED", score: 50 }],
      };
    }

    return {
      primary: hits[0].intent,
      secondary: hits.slice(1).map((h) => h.intent),
      signals: hits,
    };
  }
}

export const defaultIntentDetector = new DefaultIntentDetector();
