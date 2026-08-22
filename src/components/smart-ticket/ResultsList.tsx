import { AlertCircle, Loader2, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { RouteSearchResponse, RouteTrain } from "@/lib/api";
import { TrainResultCard } from "@/components/TrainResultCard";
import { CheckLiveAvailabilityButton } from "@/components/smart-ticket/CheckLiveAvailabilityButton";
import { cn } from "@/lib/utils";

const DEFAULT_SUGGESTIONS = [
  "Delhi to Patna",
  "Bhagalpur to Patna",
  "Katihar to Patna",
  "Bengaluru to Chennai",
];

const CLASS_FILTERS = ["All", "SL", "3A", "2A", "1A", "CC", "EC"] as const;
type ClassFilter = (typeof CLASS_FILTERS)[number];
type SortKey = "recommended" | "departure" | "duration" | "least_stops";

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

function collectTrains(data: RouteSearchResponse | null): {
  trains: RouteTrain[];
  isNearbyOnly: boolean;
} {
  if (!data) return { trains: [], isNearbyOnly: false };
  const direct = data.direct_trains?.length ? data.direct_trains : [];
  const nearby = data.nearby_options || [];
  const all = data.trains?.length ? data.trains : [...direct, ...nearby];
  if (direct.length > 0 || all.length > 0) {
    const merged = all.length ? all : [...direct, ...nearby];
    const seen = new Set<string>();
    const trains: RouteTrain[] = [];
    for (const t of merged) {
      const k = `${t.train_number}|${t.board?.code}|${t.alight?.code}`;
      if (seen.has(k)) continue;
      seen.add(k);
      trains.push(t);
    }
    return { trains, isNearbyOnly: direct.length === 0 && nearby.length > 0 };
  }
  return { trains: nearby, isNearbyOnly: nearby.length > 0 };
}

function categoryLabel(cat?: string | null): string | null {
  if (!cat) return null;
  const c = cat.toLowerCase();
  if (c === "direct") return "DIRECT";
  if (c === "nearby_origin") return "NEARBY ORIGIN";
  if (c === "nearby_destination") return "NEARBY DESTINATION";
  if (c.startsWith("hub")) return "HUB";
  if (c === "alternative") return "ALTERNATIVE";
  return cat.replace(/_/g, " ").toUpperCase();
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl border border-border/60 bg-card/40 p-4 sm:p-5">
      <div className="h-5 w-28 rounded bg-muted/50" />
      <div className="mt-1 h-3 w-40 rounded bg-muted/30" />
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="h-14 rounded bg-muted/40" />
        <div className="h-4 self-center rounded bg-muted/30" />
        <div className="h-14 rounded bg-muted/40" />
      </div>
      <div className="mt-3 h-4 w-36 rounded bg-muted/40" />
      <div className="mt-3 flex gap-2">
        <div className="h-6 w-14 rounded-full bg-muted/40" />
        <div className="h-6 w-14 rounded-full bg-muted/40" />
      </div>
    </div>
  );
}

function parseSuggestion(s: string): { from: string; to: string } | null {
  const m = s.match(/^(.+?)\s+to\s+(.+)$/i);
  if (!m) return null;
  return { from: m[1].trim(), to: m[2].trim() };
}

export function ResultsList({
  data,
  loading = false,
  error = null,
  journeyDate,
  onRetry,
  onSuggestion,
  compact = false,
}: {
  data: RouteSearchResponse | null;
  loading?: boolean;
  error?: string | null;
  journeyDate?: string;
  onRetry?: () => void;
  onSuggestion?: (from: string, to: string) => void;
  compact?: boolean;
}) {
  const [classFilter, setClassFilter] = useState<ClassFilter>("All");
  const [sortKey, setSortKey] = useState<SortKey>("recommended");
  const [visible, setVisible] = useState(PAGE_SIZE);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [data]);

  const { trains, isNearbyOnly } = useMemo(() => collectTrains(data), [data]);
  const recommendedNumber = data?.recommendation?.train_number ?? null;

  const filtered = useMemo(() => {
    let list = [...trains];
    if (classFilter !== "All") {
      list = list.filter((t) => {
        if (t.requested_class?.class === classFilter) return true;
        if (t.classes && classFilter in t.classes) return true;
        return false;
      });
    }
    list.sort((a, b) => {
      if (sortKey === "departure") {
        const am = parseTimeToMinutes(a.board?.departure) ?? 9999;
        const bm = parseTimeToMinutes(b.board?.departure) ?? 9999;
        return am - bm;
      }
      if (sortKey === "duration") {
        return (a.duration_minutes ?? 999999) - (b.duration_minutes ?? 999999);
      }
      if (sortKey === "least_stops") {
        return (a.stops_between ?? 999) - (b.stops_between ?? 999);
      }
      if (recommendedNumber) {
        if (a.train_number === recommendedNumber) return -1;
        if (b.train_number === recommendedNumber) return 1;
      }
      return (a.duration_minutes ?? 999999) - (b.duration_minutes ?? 999999);
    });
    return list;
  }, [trains, classFilter, sortKey, recommendedNumber]);

  const shown = filtered.slice(0, visible);
  const hasMore = filtered.length > visible;

  const earliestNumber = useMemo(() => {
    if (trains.length === 0) return null;
    let best: RouteTrain | null = null;
    for (const t of trains) {
      const m = parseTimeToMinutes(t.board?.departure);
      if (m == null) continue;
      const bm = best ? parseTimeToMinutes(best.board?.departure) : null;
      if (best == null || (bm != null && m < bm)) best = t;
    }
    return best?.train_number ?? null;
  }, [trains]);

  const fastestNumber = useMemo(() => {
    if (trains.length === 0) return null;
    let best: RouteTrain | null = null;
    for (const t of trains) {
      if (t.duration_minutes == null) continue;
      if (best == null || t.duration_minutes < (best.duration_minutes ?? 999999)) best = t;
    }
    return best?.train_number ?? null;
  }, [trains]);

  function rankLabelFor(t: RouteTrain): string | null {
    if (recommendedNumber && t.train_number === recommendedNumber) return null;
    if (fastestNumber && t.train_number === fastestNumber) return "Shortest";
    if (earliestNumber && t.train_number === earliestNumber) return "Earliest";
    return null;
  }

  if (loading) {
    return (
      <div className={cn("space-y-3", compact ? "mt-2" : "mt-6")}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
          Searching trains…
        </div>
        <SkeletonCard />
        <SkeletonCard />
        {!compact ? <SkeletonCard /> : null}
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={cn(
          "flex flex-col gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-4 text-sm",
          compact ? "mt-2" : "mt-6",
        )}
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0">
            <p className="font-medium text-foreground">Unable to search trains right now.</p>
            <p className="mt-1 text-xs text-muted-foreground">Please try again in a moment.</p>
          </div>
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-border/60 bg-background/50 text-sm font-medium hover:bg-muted/40 sm:w-auto sm:px-4"
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }

  if (!data) return null;

  const suggestions =
    data.suggestions && data.suggestions.length > 0 ? data.suggestions : DEFAULT_SUGGESTIONS;
  const dateLabel = formatJourneyDate(journeyDate);
  const src = data.source_query || "";
  const dst = data.destination_query || "";

  if (trains.length === 0) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-border/60 bg-card/40 p-5",
          compact ? "mt-2" : "mt-6",
        )}
      >
        <p className="text-base font-semibold text-foreground">No direct trains found.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {src && dst
            ? `We could not find a direct train for ${src} → ${dst} in the timetable.`
            : "Try a different pair of stations or date."}
        </p>
        <p className="mt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Try nearby major stations
        </p>
        <ul className="mt-2 flex flex-wrap gap-2">
          {suggestions.map((s) => {
            const parsed = parseSuggestion(s);
            return (
              <li key={s}>
                <button
                  type="button"
                  disabled={!onSuggestion || !parsed}
                  onClick={() => {
                    if (parsed && onSuggestion) onSuggestion(parsed.from, parsed.to);
                  }}
                  className="min-h-9 rounded-full border border-border/60 bg-background/50 px-3 text-xs font-medium hover:bg-muted/40 disabled:opacity-50"
                >
                  {s}
                </button>
              </li>
            );
          })}
        </ul>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-4 inline-flex min-h-10 items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-4 text-sm font-medium hover:bg-muted/40"
          >
            <Search className="h-4 w-4" />
            Search Again
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", compact ? "mt-2" : "mt-6")}>
      {!compact ? (
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold sm:text-lg">
              {isNearbyOnly ? "Nearby alternatives" : "Trains found"}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {filtered.length}
                {filtered.length !== trains.length ? ` of ${trains.length}` : ""}
              </span>
            </h2>
            {(src || dst || dateLabel) && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[src && dst ? `${src} → ${dst}` : null, dateLabel].filter(Boolean).join(" · ")}
              </p>
            )}
            {data.search_summary ? (
              <div className="mt-2 rounded-xl border border-border/50 bg-background/40 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
                <p className="font-medium text-foreground/90">Smart Search checked:</p>
                <ul className="mt-1 list-inside list-disc space-y-0.5">
                  {(data.search_summary.origin_primary?.length ?? 0) > 0 ? (
                    <li>{data.search_summary.origin_primary!.length} origin stations</li>
                  ) : null}
                  {(data.search_summary.destination_primary?.length ?? 0) > 0 ? (
                    <li>{data.search_summary.destination_primary!.length} destination stations</li>
                  ) : null}
                  {((data.search_summary.origin_hubs_used?.length ?? 0) +
                    (data.search_summary.destination_hubs_used?.length ?? 0)) > 0 ? (
                    <li>
                      {(data.search_summary.origin_hubs_used?.length ?? 0) +
                        (data.search_summary.destination_hubs_used?.length ?? 0)} nearby hubs
                    </li>
                  ) : null}
                </ul>
                <p className="mt-1.5">
                  Found: {data.search_summary.direct_count ?? 0} direct
                  {(data.search_summary.alternative_count ?? 0) > 0
                    ? ` · ${data.search_summary.alternative_count} alternatives`
                    : ""}
                </p>
              </div>
            ) : null}
            {isNearbyOnly ? (
              <p className="mt-1 text-xs text-amber-300/90">
                Showing nearby boarding or alighting options — not only the exact stations you typed.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

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
                {c === "All" ? "All classes" : c}
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
              <option value="least_stops">Fewest stops</option>
            </select>
          </label>
        </div>
      ) : null}

      <div className="space-y-3">
        {data.recommendation && !compact ? (
          <div className="rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-indigo-300">
              {data.recommendation.label || "Best timetable option"}
            </p>
            <p className="mt-1 text-sm font-semibold text-foreground">
              {data.recommendation.train_number}
              {data.recommendation.board?.code && data.recommendation.alight?.code
                ? ` · ${data.recommendation.board.code} → ${data.recommendation.alight.code}`
                : ""}
            </p>
            {(data.recommendation.why || data.recommendation.reason) && (
              <p className="mt-1 text-xs text-muted-foreground">
                Why: {data.recommendation.why || data.recommendation.reason}
              </p>
            )}
            <p className="mt-1 text-[10px] text-muted-foreground/80">
              Timetable ranking only — not live seat availability.
            </p>
            <div className="mt-2">
              <CheckLiveAvailabilityButton
                compact
                journey={{
                  trainNumber: data.recommendation.train_number,
                  trainName: data.recommendation.train_name,
                  fromCode: data.recommendation.board?.code,
                  toCode: data.recommendation.alight?.code,
                  journeyDate,
                  travelClass: data.recommendation.requested_class?.class,
                }}
              />
            </div>
          </div>
        ) : null}
        {shown.map((train) => (
          <TrainResultCard
            key={`${train.train_number}-${train.board?.code}-${train.alight?.code}`}
            train={train}
            recommended={!!recommendedNumber && train.train_number === recommendedNumber}
            rankLabel={rankLabelFor(train)}
            categoryLabel={categoryLabel(train.category)}
            journeyDate={journeyDate}
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

      {!compact ? (
        <p className="text-[11px] leading-relaxed text-muted-foreground/80">
          Timetable data is not live seat inventory. Any confirmation figures are historical
          estimates from limited records — not live availability.
        </p>
      ) : null}
    </div>
  );
}
