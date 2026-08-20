import { ArrowRight, ExternalLink } from "lucide-react";
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
  if (minutes == null || Number.isNaN(minutes)) return "duration n/a";
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const mins = m % 60;
  if (h <= 0) return `~${mins}m`;
  return `~${h}h ${mins}m`;
}

export type TrainResultCardProps = {
  train: RouteTrain;
  recommended?: boolean;
  compact?: boolean;
  className?: string;
};

export function TrainResultCard({
  train,
  recommended = false,
  compact = false,
  className,
}: TrainResultCardProps) {
  const [feedback, setFeedback] = useState<string | null>(null);
  const board = train.board || { code: "?", name: null };
  const alight = train.alight || { code: "?", name: null };
  const dayPlus = (alight.day_offset || 0) > (board.day_offset || 0);
  const stops = train.stops_between ?? 0;
  const classes = train.classes || {};
  const travelClass = train.requested_class?.class;
  const score = train.requested_class?.score;
  const reason = train.requested_class?.reason;

  const bookOnIrctc = async () => {
    const parts = [train.train_number, `${board.code} → ${alight.code}`];
    if (travelClass) parts.push(travelClass);
    try {
      await navigator.clipboard.writeText(parts.join(" | "));
    } catch {
      /* clipboard may be blocked */
    }
    setFeedback("Copied! Opening IRCTC…");
    window.open("https://www.irctc.co.in/nget/train-search", "_blank", "noopener");
    window.setTimeout(() => setFeedback(null), 2500);
  };

  return (
    <article
      className={cn(
        "gradient-card w-full max-w-full overflow-hidden rounded-2xl border p-4 shadow-card sm:p-5",
        recommended
          ? "border-indigo-500/50 shadow-[0_0_24px_-6px_rgba(99,102,241,0.45)]"
          : "border-border/60",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-base font-semibold tracking-tight sm:text-lg">
              {train.train_number}
            </h3>
            {train.train_name ? (
              <span className="truncate text-sm text-muted-foreground">{train.train_name}</span>
            ) : null}
          </div>
        </div>
        {recommended ? (
          <span className="shrink-0 rounded-full border border-indigo-500/40 bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-semibold text-indigo-300">
            Recommended
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">{board.name || board.code}</div>
          <div className="text-xs text-muted-foreground">{board.code}</div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums">{formatTime(board.departure)}</div>
        </div>
        <div className="flex flex-col items-center gap-0.5 px-1 text-muted-foreground">
          <ArrowRight className="h-4 w-4 shrink-0" />
          {dayPlus ? (
            <span className="rounded-full border border-indigo-500/40 bg-indigo-500/15 px-1.5 py-px text-[10px] font-semibold text-indigo-300">
              +1 day
            </span>
          ) : null}
        </div>
        <div className="min-w-0 text-right">
          <div className="truncate text-sm font-medium">{alight.name || alight.code}</div>
          <div className="text-xs text-muted-foreground">{alight.code}</div>
          <div className="mt-0.5 text-sm font-semibold tabular-nums">{formatTime(alight.arrival)}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
        <span>{formatDuration(train.duration_minutes)}</span>
        <span aria-hidden>·</span>
        <span>
          {stops} {stops === 1 ? "stop" : "stops"}
        </span>
        {train.note ? (
          <>
            <span aria-hidden>·</span>
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
                  isRequested && "ring-1 ring-indigo-400/50",
                )}
                title="Confirmation estimate (not live availability)"
              >
                {cls} · {chip?.label ?? "—"}
              </span>
            );
          })}
        </div>
      ) : null}

      {score != null ? (
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground/80">Confirmation estimate</span>
          {travelClass ? ` (${travelClass})` : ""}: ~{score}%
        </p>
      ) : null}
      {reason ? (
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground/90">{reason}</p>
      ) : null}

      {!compact ? (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => void bookOnIrctc()}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-border/60 bg-background/40 px-4 py-2.5 text-sm font-medium transition hover:bg-muted/40 sm:w-auto"
          >
            <ExternalLink className="h-4 w-4 shrink-0 text-indigo-400" />
            Book on IRCTC
          </button>
          {feedback ? (
            <p className="mt-2 text-xs font-medium text-emerald-400">{feedback}</p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
