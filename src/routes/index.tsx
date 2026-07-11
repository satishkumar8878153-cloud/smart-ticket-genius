import { createFileRoute } from "@tanstack/react-router";
import { Sparkles, Train } from "lucide-react";
import { useMemo, useState } from "react";
import { AIInsightsPanel } from "@/components/smart-ticket/AIInsightsPanel";
import { AlternateDates } from "@/components/smart-ticket/AlternateDates";
import { AlternateStations } from "@/components/smart-ticket/AlternateStations";
import { BestRecommendationCard } from "@/components/smart-ticket/BestRecommendationCard";
import { ClassMatrix } from "@/components/smart-ticket/ClassMatrix";
import { SearchForm } from "@/components/smart-ticket/SearchForm";
import { ThemeToggle } from "@/components/smart-ticket/ThemeToggle";
import { generateSearchResult, type SearchQuery, type SearchResult } from "@/lib/mock-data";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  const [query, setQuery] = useState<SearchQuery | null>(null);

  const result: SearchResult | null = useMemo(
    () => (query ? generateSearchResult(query) : null),
    [query],
  );

  return (
    <div className="min-h-screen bg-background text-foreground">
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
            <div className="text-base font-bold leading-tight">Smart Ticket AI</div>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Predict · Compare · Confirm
            </div>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <main className="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
        <section className="pb-8 pt-6 text-center sm:pt-12">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3 py-1 text-xs font-medium text-muted-foreground backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            AI-ranked recommendations, in real time
          </div>
          <h1 className="mt-5 text-balance text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
            Book the train most likely to{" "}
            <span className="bg-gradient-to-r from-primary to-[color:var(--primary-glow)] bg-clip-text text-transparent">
              confirm your seat
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-pretty text-base text-muted-foreground sm:text-lg">
            Smart Ticket AI analyzes historical confirmation rates, availability across classes,
            and nearby stations to suggest your best journey plan.
          </p>
        </section>

        <SearchForm onSearch={setQuery} />

        {result ? (
          <div className="mt-10 space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
              <BestRecommendationCard train={result.best} />
              <AIInsightsPanel insights={result.aiInsights} />
            </div>
            <ClassMatrix trains={[result.best, ...result.otherTrains]} />
            <div className="grid gap-6 lg:grid-cols-2">
              <AlternateStations stations={result.alternateStations} />
              <AlternateDates dates={result.alternateDates} />
            </div>
          </div>
        ) : (
          <div className="mt-14 grid gap-4 text-center sm:grid-cols-3">
            {[
              { t: "Confirm probability", d: "See the chance your ticket will confirm before booking." },
              { t: "All-class matrix", d: "Compare seat status across SL, 3A, 2A, 1A, CC and EC at a glance." },
              { t: "Smarter alternatives", d: "Nearby stations and flexible dates unlock better seats." },
            ].map((f) => (
              <div
                key={f.t}
                className="gradient-card rounded-3xl border border-border/60 p-6 text-left shadow-card"
              >
                <div className="text-sm font-semibold">{f.t}</div>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        )}

        <footer className="mt-16 border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
          Smart Ticket AI · Demo interface with simulated availability data
        </footer>
      </main>
    </div>
  );
}
