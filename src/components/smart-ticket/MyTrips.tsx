import { AlertCircle, Loader2, MapPin, Train } from "lucide-react";
import { useEffect, useState } from "react";
import { myTrips, type Trip } from "@/lib/api";

function riskBadge(score: number) {
  if (score >= 80) {
    return {
      label: "Likely to confirm",
      className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300",
    };
  }
  if (score >= 55) {
    return {
      label: "Moderate",
      className: "border-amber-500/40 bg-amber-500/15 text-amber-300",
    };
  }
  return {
    label: "High risk — see alternatives",
    className: "border-red-500/40 bg-red-500/15 text-red-300",
  };
}

export function MyTrips({
  onSeeAlternatives,
}: {
  onSeeAlternatives?: (from: string, to: string) => void;
}) {
  const [trips, setTrips] = useState<Trip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    myTrips()
      .then((res) => {
        if (!cancelled) {
          setTrips(res.trips || []);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load trips");
          setTrips([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold tracking-tight">My Trips</h2>

      {loading ? (
        <div className="mt-4 grid place-items-center rounded-2xl border border-border/60 bg-card/40 p-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="mt-4 flex items-start gap-2 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : !trips || trips.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-border/60 bg-card/40 p-6 text-center text-sm text-muted-foreground">
          No trips yet.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {trips.map((t, i) => {
            const score = t.risk?.score ?? 0;
            const badge = riskBadge(score);
            const key = String(t.id ?? t.pnr ?? i);
            return (
              <div
                key={key}
                className="gradient-card rounded-2xl border border-border/60 p-4 shadow-card sm:p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-base font-semibold">
                      <Train className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate">
                        {t.train_name || t.train_number}{" "}
                        <span className="font-normal text-muted-foreground">
                          ({t.train_number})
                        </span>
                      </span>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {[t.class_code, t.quota].filter(Boolean).join(" · ")}
                      {t.pnr ? ` · PNR ${t.pnr}` : ""}
                    </div>
                  </div>
                  <span className="rounded-full border border-border/60 bg-muted/40 px-2.5 py-0.5 text-xs font-medium">
                    {t.current_status || "UNKNOWN"}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                  <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium">{t.boarding_code || "—"}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium">{t.destination_code || "—"}</span>
                  {t.journey_date ? (
                    <span className="text-muted-foreground">· {t.journey_date}</span>
                  ) : null}
                  {t.passengers != null ? (
                    <span className="text-muted-foreground">· {t.passengers} pax</span>
                  ) : null}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badge.className}`}
                  >
                    {badge.label}
                  </span>
                  {t.risk?.reason ? (
                    <span className="text-xs text-muted-foreground">{t.risk.reason}</span>
                  ) : null}
                </div>

                {onSeeAlternatives && t.boarding_code && t.destination_code ? (
                  <button
                    type="button"
                    className="mt-4 inline-flex w-full items-center justify-center rounded-xl border border-border/60 bg-background/40 px-4 py-2.5 text-sm font-medium transition hover:bg-muted/40 sm:w-auto"
                    onClick={() =>
                      onSeeAlternatives(String(t.boarding_code), String(t.destination_code))
                    }
                  >
                    See alternatives
                  </button>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
