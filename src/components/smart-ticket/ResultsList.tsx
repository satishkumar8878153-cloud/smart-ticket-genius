import { AlertCircle, Loader2 } from "lucide-react";
import type { RouteSearchResponse, RouteTrain } from "@/lib/api";

function toneClass(tone?: string) {
  switch (tone) {
    case "success":
      return "border-emerald-500/40 bg-emerald-500/15 text-emerald-300";
    case "warning":
      return "border-amber-500/40 bg-amber-500/15 text-amber-300";
    case "danger":
      return "border-red-500/40 bg-red-500/15 text-red-300";
    default:
      return "border-border/60 bg-muted/40 text-muted-foreground";
  }
}

function TrainCard({ train }: { train: RouteTrain }) {
  const board = train.board || { code: "?", name: "?" };
  const alight = train.alight || { code: "?", name: "?" };
  const dayPlus =
    (alight.day_offset || 0) > (board.day_offset || 0);
  const dur = train.duration_minutes;
  const durTxt =
    dur != null
      ? `~${Math.floor(dur / 60)}h ${dur % 60}m`
      : "duration n/a";
  const stops = train.stops_between ?? 0;
  const classes = train.classes || {};

  return (
    <div className="gradient-card rounded-2xl border border-border/60 p-4 shadow-card sm:p-5">
      <div className="text-base font-semibold tracking-tight">{train.train_number}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">
          {board.name || board.code} ({board.code})
        </span>
        <span className="text-muted-foreground">{board.departure || "—"}</span>
        <span className="text-muted-foreground">→</span>
        <span className="font-medium">
          {alight.name || alight.code} ({alight.code})
        </span>
        <span className="text-muted-foreground">{alight.arrival || "—"}</span>
        {dayPlus ? (
          <span className="rounded-full border border-indigo-500/40 bg-indigo-500/15 px-2 py-0.5 text-[11px] font-semibold text-indigo-300">
            +1 day
          </span>
        ) : null}
      </div>
      <div className="mt-2 text-sm text-muted-foreground">
        {durTxt} · {stops} stops
      </div>
      {Object.keys(classes).length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(classes).map(([cls, chip]) => (
            <span
              key={cls}
              className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${toneClass(chip?.tone)}`}
            >
              {cls} {chip?.label ?? ""}
            </span>
          ))}
        </div>
      ) : null}
      {train.requested_class?.reason ? (
        <p className="mt-3 text-sm text-muted-foreground">{train.requested_class.reason}</p>
      ) : null}
    </div>
  );
}

export function ResultsList({
  data,
  loading,
  error,
  onRetry,
}: {
  data: RouteSearchResponse | null;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}) {
  if (loading) {
    return (
      <div className="mt-6 grid place-items-center rounded-3xl border border-border/60 bg-card/40 p-10 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
        <div className="mt-3 text-sm text-muted-foreground">Searching live routes…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="flex-1">
          <div className="font-semibold">Search failed</div>
          <p className="mt-0.5 text-destructive/90">{error}</p>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="mt-2 text-xs font-semibold underline underline-offset-2"
            >
              Retry
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  if (!data) return null;

  if (!data.trains || data.trains.length === 0) {
    return (
      <div className="mt-6 rounded-2xl border border-border/60 bg-card/40 p-6 text-center text-sm text-muted-foreground">
        No direct trains found yet — try nearby major stations.
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {data.trains.map((t) => (
        <TrainCard key={`${t.train_number}-${t.board?.code}-${t.alight?.code}`} train={t} />
      ))}
    </div>
  );
}
