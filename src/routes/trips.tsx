import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { RefreshCw, Ticket, Train } from "lucide-react";
import { useState } from "react";
import { MyTrips } from "@/components/smart-ticket/MyTrips";
import { ThemeToggle } from "@/components/smart-ticket/ThemeToggle";

export const Route = createFileRoute("/trips")({
  head: () => ({
    meta: [
      { title: "My Trips — Smart Ticket AI" },
      {
        name: "description",
        content: "Track your bookings and confirmation risk for upcoming journeys.",
      },
    ],
  }),
  component: TripsPage,
});

function TripsPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  const onRefresh = () => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    window.setTimeout(() => setRefreshing(false), 600);
  };

  return (
    <div className="min-h-screen bg-background pb-24 text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute right-0 top-40 h-96 w-96 rounded-full bg-[color:var(--primary-glow)]/10 blur-3xl" />
      </div>

      <header className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="gradient-primary grid h-10 w-10 place-items-center rounded-2xl text-primary-foreground shadow-elegant">
            <Train className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-base font-bold leading-tight">
              <Ticket className="h-4 w-4 text-primary" />
              My Trips
            </div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Bookings · Risk · Alternatives
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            aria-label="Refresh trips"
            className="grid h-9 w-9 place-items-center rounded-2xl border border-border/60 bg-card/60 text-muted-foreground transition hover:text-foreground"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </button>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 sm:px-6">
        <MyTrips
          key={refreshKey}
          onSeeAlternatives={(from, to) => {
            void navigate({
              to: "/",
              search: { from, to },
            });
          }}
        />
      </main>
    </div>
  );
}
