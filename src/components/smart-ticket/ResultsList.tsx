import { AlertCircle, Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import type { RouteSearchResponse, RouteTrain } from "@/lib/api";
import { TrainResultCard } from "@/components/TrainResultCard";
import { cn } from "@/lib/utils";

const DEFAULT_SUGGESTIONS = [
  "Delhi to Patna",
  "Bhagalpur to Patna",
  "Katihar to Patna",
  "Bengaluru to Chennai",
];

const CLASS_FILTERS = ["All", "SL", "3A", "2A", "1A"] as const;
type ClassFilter = (typeof CLASS_FILTERS)[number];
type SortKey = "recommended" | "departure" | "duration" | "confirmation";

const PAGE_SIZE = 10;

function parseTimeToMinutes(t?: string | null): number | null {
  if (!t) return null;
  const parts = String(t).trim().split(":");
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

function formatJourneyDate(iso?: string | null): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function collectTrains(data: RouteSearchResponse | null): RouteTrain[] {
  if (!data) return [];
  const direct = data.direct_trains?.length ? data.direct_trains : data.trains || [];
  const nearby = data.nearby_options || [];
  if (direct.length > 0) return direct;
  return nearby;
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-border/60 bg-card/40 p-4 sm:p-5">
      <div className="h-5 w-24 rounded bg-muted/50" />
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="h-12 rounded bg-muted/40" />
        <div className="h-4 self-center rounded bg-muted/30" />
        <div className="h-12 rounded bg-muted/40" />
      </div>
      <div className="mt-3 h-4 w-40 rounded bg-muted/40" />
      <div className="mt-3 flex gap-2">
        <div className="h-6 w-16 rounded-full bg-muted/40" />
        <div className="h-6 w-16 rounded-full bg-muted/40" />
      </div>
    </div>
  );
}

export function ResultsList({
  data,
  loading,
  error,
  onRetry,
  onSuggestion,
  journeyDate,
  compact,
}: {
  data: RouteSearchResponse | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onSuggestion?: (from: string, to: string) => void;
  journeyDate?: string | null;
  compact?: boolean;
}) {
  const [classFilter, setClassFilter] = useState<ClassFilter>("All");
  const [sortKey, setSortKey] = useState<SortKey>("recommended");
  const [visible, setVisible] = useState(PAGE_SIZE);

  const trains = useMemo(() => collectTrains(data), [data]);
  const recommendedNumber = data?.recommendation?.train_number;

  const filtered = useMemo(() => {
    let list = [...trains];
    if (classFilter !== "All") {
      list = list.filter((t) => {
        const keys = Object.keys(t.classes || {});
        if (keys.length === 0) return true;
        return keys.some((k) => k.toUpperCase() === classFilter);
      });
    }
    list.sort((a, b) => {
      if (sortKey === "departure") {
        const ta = parseTimeToMinutes(a.board?.departure) ?? 9999;
        const tb = parseTimeToMinutes(b.board?.departure) ?? 9999;
        return ta - tb;
      }
      if (sortKey === "duration") {
        const da = a.duration_minutes ?? 999999;
        const db = b.duration_minutes ?? 999999;
        return da - db;
      }
      if (sortKey === "confirmation") {
        const sa = a.requested_class?.score ?? -1;
        const sb = b.requested_class?.score ?? -1;
        return sb - sa;
      }
      if (recommendedNumber) {
        if (a.train_number === recommendedNumber) return -1;
        if (b.train_number === recommendedNumber) return 1;
      }
      return 0;
    });
    return list;
  }, [trains, classFilter, sortKey, recommendedNumber]);

  const shown = filtered.slice(0, visible);
  const hasMore = filtered.length > visible;

  if (loading) {
    return (
      <div className="mt-6 space-y-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Searching live routes…
        </div>
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-destructive">Search failed</div>
          <p className="mt-0.5 text-muted-foreground">{error}</p>
          <p className="mt-1 text-muted-foreground">Please try again.</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-border/60 bg-background/50 px-4 text-sm font-medium hover:bg-muted/40"
            >
              Retry
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const suggestions = data.suggestions?.length ? data.suggestions : DEFAULT_SUGGESTIONS;
  const src = data.source_query;
  const dst = data.destination_query;
  const dateLabel = formatJourneyDate(journeyDate);

  if (trains.length === 0) {
    return (
      <div className="mt-6 space-y-4">
        {(src || dst) && (
          <div className="text-sm text-muted-foreground">
            {src && dst ? (
              <span className="font-medium text-foreground">
                {src} → {dst}
              </span>
            ) : null}
            {dateLabel ? <span className="ml-2">· {dateLabel}</span> : null}
          </div>
        )}
        <div className="rounded-2xl border border-border/60 bg-card/40 p-6 text-center">
          <p className="text-sm font-medium">No direct trains found yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Try nearby major stations, or one of these routes:
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {suggestions.map((s) => {
              const [from, to] = s.split(/\s+to\s+/i);
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => onSuggestion?.(from?.trim() || s, to?.trim() || "")}
                  className="rounded-full border border-border/60 bg-background/40 px-3 py-1.5 text-xs font-medium hover:bg-muted/40"
                >
                  {s}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={cn("mt-6 space-y-4", compact && "mt-2 space-y-3")}>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          {src && dst ? (
            <h2 className="truncate text-base font-semibold sm:text-lg">
              {src} → {dst}
            </h2>
          ) : (
            <h2 className="text-base font-semibold sm:text-lg">Search results</h2>
          )}
          <p className="mt-0.5 text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "train" : "trains"} found
            {dateLabel ? <span> · {dateLabel}</span> : null}
            {data.tracked_trains_count ? (
              <span className="hidden sm:inline">
                {" "}
                · network {data.tracked_trains_count.toLocaleString("en-IN")} trains
              </span>
            ) : null}
          </p>
        </div>
      </div>

      {!compact ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-wrap gap-1.5">
            {CLASS_FILTERS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setClassFilter(c);
                  setVisible(PAGE_SIZE);
                }}
                className={cn(
                  "min-h-9 rounded-full border px-3 text-xs font-medium transition",
                  classFilter === c
                    ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-200"
                    : "border-border/60 bg-background/40 text-muted-foreground hover:bg-muted/40",
                )}
              >
                {c}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="shrink-0">Sort</span>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as SortKey)}
              className="min-h-9 max-w-full rounded-xl border border-border/60 bg-background/70 px-2.5 text-xs text-foreground"
            >
              <option value="recommended">Recommended</option>
              <option value="departure">Earliest departure</option>
              <option value="duration">Shortest duration</option>
              <option value="confirmation">Best confirmation estimate</option>
            </select>
          </label>
        </div>
      ) : null}

      <div className="space-y-3">
        {shown.map((train) => (
          <TrainResultCard
            key={`${train.train_number}-${train.board?.code}-${train.alight?.code}`}
            train={train}
            recommended={!!recommendedNumber && train.train_number === recommendedNumber}
            compact={compact}
          />
        ))}
      </div>

      {hasMore ? (
        <button
          type="button"
          onClick={() => setVisible((v) => v + PAGE_SIZE)}
          className="flex min-h-11 w-full items-center justify-center rounded-xl border border-border/60 bg-background/40 text-sm font-medium hover:bg-muted/40"
        >
          Show more ({filtered.length - visible} remaining)
        </button>
      ) : null}

      <p className="text-[11px] leading-relaxed text-muted-foreground/80">
        Class labels are confirmation estimates from historical patterns — not live seat
        availability. Always verify on IRCTC before booking.
      </p>
    </div>
  );
}
