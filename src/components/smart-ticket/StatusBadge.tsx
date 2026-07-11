import type { SeatStatus } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const TONE = {
  success: "bg-[color:var(--success)]/15 text-[color:var(--success)] ring-[color:var(--success)]/30",
  warning: "bg-[color:var(--warning)]/15 text-[color:var(--warning)] ring-[color:var(--warning)]/30",
  danger: "bg-destructive/15 text-destructive ring-destructive/30",
  muted: "bg-muted text-muted-foreground ring-border",
};

export function StatusBadge({ status, className }: { status: SeatStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset tabular-nums",
        TONE[status.tone],
        className,
      )}
    >
      {status.label}
    </span>
  );
}
