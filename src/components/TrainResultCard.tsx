import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { RouteTrain } from "@/lib/api";
import { cn } from "@/lib/utils";

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

/** Format "20:27:00" → "20:27" */
export function formatTime(t?: string | null): string {
  if (!t) return "—";
  const parts = String(t).trim().split(":");
  if (parts.length >= 2) return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
  return String(t);
}

export function formatDuration(minutes?: number | null): string {
  if (minutes == null || Number.isNaN(minutes)) return "Duration n/a";
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (h <= 0) return `${mins}m`;
  return `${h}h ${mins}m`;
}

export type TrainResultCardProps = {
  train: RouteTrain;
  recommended?: boolean;
  /** Optional rank badge from client sort, e.g. "Earliest" */
  rankLabel?: string | null;
  compact?: boolean;
  className?: string;
};

export function TrainResultCard({
  train,
  recommended = false,
  rankLabel = null,
  compact = false,
  className,
}: TrainResultCardProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const board = train.board || { code: "?", name: null };
  const alight = train.alight || { code: "?", name: null };
  const dayPlus = (alight.day_offset || 0) > (board.day_offset || 0);
  const stops = train.stops_between ?? 0;
  const classes = train.classes || {};
  const travelClass = train.requested_class?.class;
  const score = train.requested_class?.score;
  const reason = train.requested_class?.reason;
  const trainName = (train.train_name || "").trim() || null;

  return (
    <article
      className={cn(
        "w-full max-w-full overflow-hidden rounded-2xl border bg-card/60 p-4 shadow-sm sm:p-5",
        recommended
          ? "border-indigo-500/45 ring-1 ring-indigo-500/20"
          : "border-border/60",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight tabular-nums sm:text-lg">
              {train.train_number}
            </h3>
            {recommended ? (
              <span className="rounded-full border border-indigo-500/40 bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium text-indigo-200">
                Recommended
              </span>
            ) : null}
            {rankLabel ? (
              <span className="rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                {rankLabel}
              </span>
            ) : null}
          </div>
          {trainName ? (
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{trainName}</p>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-start gap-2 sm:gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            From
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
            {board.name || board.code}
          </p>
          <p className="text-xs text-muted-foreground">{board.code}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight">
            {formatTime(board.departure)}
          </p>
        </div>

        <div className="flex flex-col items-center justify-center pt-6 text-muted-foreground">
          <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
          {dayPlus ? (
            <span className="mt-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-200">
              +1 day
            </span>
          ) : null}
        </div>

        <div className="min-w-0 text-right">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            To
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-foreground">
            {alight.name || alight.code}
          </p>
          <p className="text-xs text-muted-foreground">{alight.code}</p>
          <p className="mt-1 text-lg font-semibold tabular-nums tracking-tight">
            {formatTime(alight.arrival)}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span className="font-medium text-foreground/80">
          {formatDuration(train.duration_minutes)}
        </span>
        <span aria-hidden className="text-border">
          ·
        </span>
        <span>
          {stops} {stops === 1 ? "stop" : "stops"}
        </span>
        {train.note ? (
          <>
            <span aria-hidden className="text-border">
              ·
            </span>
            <span className="text-amber-300/90">{train.note}</span>
          </>
        ) : null}
      </div>

      {!compact && Object.keys(classes).length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(classes).map(([cls, chip]) => {
            const isRequested =
              travelClass && cls.toUpperCase() === String(travelClass).toUpperCase();
            return (
              <span
                key={cls}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  toneClass(chip?.tone),
                  isRequested && "ring-1 ring-indigo-400/40",
                )}
                title="Historical estimate — not live availability"
              >
                {cls}
                {chip?.label ? ` · ${chip.label}` : ""}
              </span>
            );
          })}
        </div>
      ) : null}

      {score != null ? (
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Historical confirmation estimate</span>
          {travelClass ? ` (${travelClass})` : ""}: ~{score}%
        </p>
      ) : null}

      {!compact ? (
        <div className="mt-4 border-t border-border/50 pt-3">
          <button
            type="button"
            onClick={() => setDetailsOpen((v) => !v)}
            className="inline-flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-background/40 px-3 text-sm font-medium transition hover:bg-muted/40 sm:w-auto"
            aria-expanded={detailsOpen}
          >
            View Details
            {detailsOpen ? (
              <ChevronUp className="h-4 w-4 opacity-70" />
            ) : (
              <ChevronDown className="h-4 w-4 opacity-70" />
            )}
          </button>

          {detailsOpen ? (
            <div className="mt-3 space-y-3 rounded-xl border border-border/50 bg-background/30 p-3 text-sm">
              <dl className="grid gap-2 sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-muted-foreground">Train</dt>
                  <dd className="font-medium">
                    {train.train_number}
                    {trainName ? ` · ${trainName}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Duration</dt>
                  <dd className="font-medium">{formatDuration(train.duration_minutes)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Boarding</dt>
                  <dd className="font-medium">
                    {board.name || board.code} ({board.code}) · {formatTime(board.departure)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Destination</dt>
                  <dd className="font-medium">
                    {alight.name || alight.code} ({alight.code}) · {formatTime(alight.arrival)}
                    {dayPlus ? " · +1 day" : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Stops between</dt>
                  <dd className="font-medium">{stops}</dd>
                </div>
                {travelClass ? (
                  <div>
                    <dt className="text-xs text-muted-foreground">Requested class</dt>
                    <dd className="font-medium">{travelClass}</dd>
                  </div>
                ) : null}
              </dl>

              {score != null || reason ? (
                <div className="rounded-lg border border-border/50 bg-muted/20 p-2.5">
                  <p className="text-xs font-medium text-foreground/90">
                    Historical confirmation estimate
                  </p>
                  {score != null ? (
                    <p className="mt-0.5 text-sm">~{score}%</p>
                  ) : null}
                  {reason ? (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{reason}</p>
                  ) : null}
                  <p className="mt-1.5 text-[11px] text-muted-foreground/90">
                    Based on limited historical records — not live seat availability.
                  </p>
                </div>
              ) : null}

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Live availability is not connected yet. Timetable data is not live inventory.
              </p>
            </div>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
