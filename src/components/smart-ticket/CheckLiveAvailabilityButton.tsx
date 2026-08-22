import { ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Official IRCTC train search — no undocumented query params. */
export const IRCTC_TRAIN_SEARCH_URL = "https://www.irctc.co.in/nget/train-search";

export type LiveAvailabilityJourney = {
  trainNumber?: string | null;
  trainName?: string | null;
  fromCode?: string | null;
  toCode?: string | null;
  journeyDate?: string | null;
  travelClass?: string | null;
};

/** Build clipboard text from available fields only — never invent values. */
export function buildJourneyClipboardText(j: LiveAvailabilityJourney): string {
  const parts: string[] = [];
  const tn = (j.trainNumber || "").trim();
  if (tn) parts.push(tn);

  const name = (j.trainName || "").trim();
  if (name) parts.push(name);

  const from = (j.fromCode || "").trim().toUpperCase();
  const to = (j.toCode || "").trim().toUpperCase();
  if (from && to) parts.push(`${from} → ${to}`);
  else if (from) parts.push(from);
  else if (to) parts.push(to);

  const date = (j.journeyDate || "").trim().slice(0, 10);
  if (date) parts.push(date);

  const cls = (j.travelClass || "").trim().toUpperCase();
  if (cls) parts.push(cls);

  return parts.join(" | ");
}

async function copyText(text: string): Promise<boolean> {
  if (!text) return false;
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

function openIrctc(): void {
  window.open(IRCTC_TRAIN_SEARCH_URL, "_blank", "noopener,noreferrer");
}

export function CheckLiveAvailabilityButton({
  journey,
  className,
  compact = false,
}: {
  journey: LiveAvailabilityJourney;
  className?: string;
  compact?: boolean;
}) {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    const text = buildJourneyClipboardText(journey);
    let copied = false;
    try {
      if (text) copied = await copyText(text);
    } finally {
      openIrctc();
      if (copied) {
        toast.success("Journey details copied. Paste them on IRCTC to check live availability.");
      } else {
        toast.message("IRCTC opened. Please enter your journey details manually.");
      }
      setBusy(false);
    }
  };

  return (
    <div className={cn("w-full min-w-0", className)}>
      <Button
        type="button"
        variant="outline"
        size={compact ? "sm" : "default"}
        disabled={busy}
        onClick={onClick}
        className={cn(
          "h-9 w-full max-w-full gap-1.5 rounded-xl border-border/70 bg-background/50 text-xs font-medium text-foreground hover:bg-muted/50 sm:w-auto sm:min-w-0",
          compact && "h-8 px-2.5 text-[11px]",
        )}
      >
        <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-80" />
        <span className="truncate">Check Live Availability</span>
      </Button>
      <p className="mt-1 text-[10px] leading-snug text-muted-foreground/80">
        Opens official IRCTC — not live data inside this app
      </p>
    </div>
  );
}
