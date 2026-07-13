// Small pure helpers used across V2 engines. No engine imports another engine
// through this file — utilities only.

export function clamp(v: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, v));
}

export function invertLinear(value: number, best: number, worst: number): number {
  if (worst === best) return 100;
  const t = (value - best) / (worst - best);
  return clamp(Math.round((1 - t) * 100));
}

export function parseDurationMin(d: string): number {
  const m = /([0-9]+)h\s*([0-9]+)?/i.exec(d);
  if (!m) return 600;
  return Number(m[1]) * 60 + Number(m[2] ?? 0);
}

export function weightedSum(
  parts: Array<{ value: number; weight: number }>,
): number {
  const totalW = parts.reduce((a, p) => a + Math.max(0, p.weight), 0);
  if (totalW <= 0) return 0;
  const raw = parts.reduce(
    (a, p) => a + clamp(p.value) * (Math.max(0, p.weight) / totalW),
    0,
  );
  return clamp(Math.round(raw));
}

export function parseDate(iso: string): Date {
  // Accepts YYYY-MM-DD or ISO — always returns a stable UTC date.
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return new Date(`${iso}T00:00:00Z`);
  const d = new Date(iso);
  return isNaN(d.getTime()) ? new Date() : d;
}

// Deterministic hash for lightweight per-train variation (no Math.random).
export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}
