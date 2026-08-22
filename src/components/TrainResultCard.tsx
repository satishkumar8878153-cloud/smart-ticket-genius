import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { RouteTrain } from "@/lib/api";
import { CheckLiveAvailabilityButton } from "@/components/smart-ticket/CheckLiveAvailabilityButton";
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
  /** Smart Search category badge: Direct / Nearby boarding / Major junction … */
  categoryLabel?: string | null;
  /** Journey date (YYYY-MM-DD) from search — used only for IRCTC clipboard helper */
  journeyDate?: string | null;
  compact?: boolean;
  className?: string;
};

export function TrainResultCard({
  train,
  recommended = false,
  rankLabel = null,
  categoryLabel = null,
  journeyDate = null,
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
            {categoryLabel ? (
              <span
                className={
                  categoryLabel === "Direct"
                    ? "rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-300"
                    : categoryLabel === "Major junction alternative"
                      ? "rounded-full border border-violet-500/40 bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-200"
                      : "rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-200"
                }
              >
                {categoryLabel}
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

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
        <span className="font-medium tabular-nums">
          {formatTime(board.departure)}
        </span>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-medium tabular-nums">
          {formatTime(alight.arrival)}
          {dayPlus ? <span className="ml-1 text-xs text-amber-300">+1</span> : null}
        </span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{formatDuration(train.duration_minutes)}</span>
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          {stops} stop{stops === 1 ? "" : "s"}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span>
          {board.code}
          {board.name ? ` · ${board.name}` : ""}
        </span>
        <span>→</span>
        <span>
          {alight.code}
          {alight.name ? ` · ${alight.name}` : ""}
        </span>
      </div>

      {train.why && train.why !== train.note ? (
        <p className="mt-2 text-xs leading-snug text-muted-foreground">
          <span className="font-medium text-foreground/80">Why: </span>
          <span className="text-muted-foreground">{train.why}</span>
        </p>
      ) : null}

      {!compact && Object.keys(classes).length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Object.entries(classes).map(([code, chip]) => (
            <span
              key={code}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                toneClass(chip.tone),
              )}
            >
              {code}
              {chip.label ? ` · ${chip.label}` : ""}
            </span>
          ))}
        </div>
      ) : null}

      {travelClass ? (
        <div className="mt-3 rounded-xl border border-border/50 bg-background/40 px-3 py-2">
          <p className="text-[11px] font-medium text-muted-foreground">
            Preferred class: {travelClass}
          </p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            Timetable option only — live seat availability is not connected. Check official
            IRCTC for current availability.
          </p>
        </div>
      ) : null}

      {!compact ? (
        <button
          type="button"
          onClick={() => setDetailsOpen((o) => !o)}
          className="mt-3 inline-flex min-h-9 items-center gap-1 text-xs font-medium text-indigo-300 hover:text-indigo-200"
        >
          {detailsOpen ? (
            <>
              Hide details <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              View details <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      ) : null}

      {detailsOpen && !compact ? (
        <div className="mt-2 space-y-1 rounded-xl border border-border/40 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
          <p>
            Board: {board.name || board.code} ({board.code}) · dep {formatTime(board.departure)}
          </p>
          <p>
            Alight: {alight.name || alight.code} ({alight.code}) · arr {formatTime(alight.arrival)}
          </p>
          {train.category ? <p>Category: {train.category}</p> : null}
        </div>
      ) : null}

      <div className="mt-3">
        <CheckLiveAvailabilityButton
          compact={compact}
          journey={{
            trainNumber: train.train_number,
            trainName,
            fromCode: board.code && board.code !== "?" ? board.code : null,
            toCode: alight.code && alight.code !== "?" ? alight.code : null,
            journeyDate,
            travelClass: travelClass || null,
          }}
        />
      </div>
    </article>
  );
}
