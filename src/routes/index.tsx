import { createFileRoute } from "@tanstack/react-router";
import { AlertCircle, LayoutGrid, Loader2, MessageSquare, Route as RouteIcon, ShieldCheck, Sparkles, Train } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AIInsightsPanel } from "@/components/smart-ticket/AIInsightsPanel";
import { AlternateDates } from "@/components/smart-ticket/AlternateDates";
import { AlternateStations } from "@/components/smart-ticket/AlternateStations";
import { BestRecommendationCard } from "@/components/smart-ticket/BestRecommendationCard";
import { ClassMatrix } from "@/components/smart-ticket/ClassMatrix";
import { SearchForm } from "@/components/smart-ticket/SearchForm";
import { MissionChat } from "@/components/smart-ticket/MissionChat";
import { ThemeToggle } from "@/components/smart-ticket/ThemeToggle";
import type { SearchQuery, SearchResult, TicketClass } from "@/lib/mock-data";
import { searchTrains } from "@/services/search.service";
import { generateMissionConfirm, type MissionConfirmResult } from "@/services/mission.service";
import { MissionConfirm } from "@/components/smart-ticket/MissionConfirm";
import { TatkalStrategy } from "@/components/smart-ticket/TatkalStrategy";
import { JourneyGuardian } from "@/components/smart-ticket/JourneyGuardian";

type HomeSearch = {
  from?: string;
  to?: string;
  date?: string;
  cls?: TicketClass;
};

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): HomeSearch => ({
    from: typeof search.from === "string" ? search.from : undefined,
    to: typeof search.to === "string" ? search.to : undefined,
    date: typeof search.date === "string" ? search.date : undefined,
    cls: typeof search.cls === "string" ? (search.cls as TicketClass) : undefined,
  }),
  component: Home,
});

function Home() {
  const { from, to, date, cls } = Route.useSearch();
  const [result, setResult] = useState<SearchResult | null>(null);
  const [mission, setMission] = useState<MissionConfirmResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missionOpen, setMissionOpen] = useState(false);
  const autoRan = useRef<string | null>(null);

  const handleSearch = useCallback(async function handleSearch(query: SearchQuery) {
    setLoading(true);
    setError(null);
    try {
      const res = await searchTrains(query);
      setResult(res);
      const missionRes = await generateMissionConfirm(query, res);
      setMission(missionRes);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setResult(null);
      setMission(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const prefill =
    from && to
      ? {
          source: from,
          destination: to,
          date: date ?? new Date().toISOString().slice(0, 10),
          travelClass: (cls ?? "3A") as TicketClass,
        }
      : undefined;

  useEffect(() => {
    if (!prefill) return;
    const key = `${prefill.source}|${prefill.destination}|${prefill.date}|${prefill.travelClass}`;
    if (autoRan.current === key) return;
    autoRan.current = key;
    void handleSearch(prefill);
  }, [prefill?.source, prefill?.destination, prefill?.date, prefill?.travelClass, handleSearch]);


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
          <div className="mx-auto mt-5 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-center">
            <div className="px-2">
              <span className="font-semibold text-white">8,993</span>
              <span className="ml-1.5 text-sm text-muted-foreground">stations</span>
            </div>
            <div className="hidden h-4 w-px bg-border/60 sm:block" aria-hidden />
            <div className="px-2">
              <span className="font-semibold text-white">1,065</span>
              <span className="ml-1.5 text-sm text-muted-foreground">route stops</span>
            </div>
            <div className="hidden h-4 w-px bg-border/60 sm:block" aria-hidden />
            <div className="px-2">
              <span className="font-semibold text-white">62</span>
              <span className="ml-1.5 text-sm text-muted-foreground">real booking outcomes</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMissionOpen(true)}
            className="gradient-primary mt-6 inline-flex w-full max-w-md items-center justify-center gap-2 rounded-full px-10 py-4 text-lg font-semibold text-primary-foreground shadow-lg shadow-indigo-500/40 transition-transform hover:scale-105 sm:w-auto"
          >
            <MessageSquare className="h-5 w-5" />
            Ask Mission AI
          </button>
        </section>

        <SearchForm onSearch={handleSearch} loading={loading} initialQuery={prefill} />

        {error && (
          <div className="mt-6 flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <div className="font-semibold">Search failed</div>
              <p className="mt-0.5 text-destructive/90">{error}</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="mt-10 grid place-items-center rounded-3xl border border-border/60 bg-card/40 p-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="mt-4 text-sm font-medium text-muted-foreground">
              Analyzing trains, availability and predictions…
            </div>
          </div>
        )}

        {!loading && result ? (
          <div className="mt-10 space-y-6">
            <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
              <BestRecommendationCard train={result.best} />
              <AIInsightsPanel
                insights={
                  mission?.advice?.insights.length
                    ? [...mission.advice!.insights, ...result.aiInsights].slice(0, 6)
                    : result.aiInsights
                }
              />
            </div>
            <ClassMatrix trains={[result.best, ...result.otherTrains]} />
            {mission ? <MissionConfirm plans={mission.plans} /> : null}
            <div className="grid gap-6 lg:grid-cols-2">
              <AlternateStations stations={result.alternateStations} />
              <AlternateDates dates={result.alternateDates} />
            </div>
            {mission ? (
              <>
                <TatkalStrategy tatkal={mission.tatkal} />
                <JourneyGuardian tasks={mission.guardian} />
              </>
            ) : null}
          </div>
        ) : !loading && !error ? (
          <div className="mt-14 grid gap-4 text-center sm:grid-cols-3">
            {[
              { t: "Confirm probability", d: "See the chance your ticket will confirm before booking.", Icon: ShieldCheck },
              { t: "All-class matrix", d: "Compare seat status across SL, 3A, 2A, 1A, CC and EC at a glance.", Icon: LayoutGrid },
              { t: "Smarter alternatives", d: "Nearby stations and flexible dates unlock better seats.", Icon: RouteIcon },
            ].map((f) => (
              <div
                key={f.t}
                className="gradient-card rounded-3xl border border-border/60 p-6 text-left shadow-card"
              >
                <f.Icon className="mb-3 h-5 w-5 text-indigo-400" />
                <div className="text-sm font-semibold">{f.t}</div>
                <p className="mt-1.5 text-sm text-muted-foreground">{f.d}</p>
              </div>
            ))}
          </div>
        ) : null}

        <footer className="mt-16 border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
          Smart Ticket AI · Predict · Compare · Confirm — insights from real
          IRCTC booking history
        </footer>
      </main>

      <MissionChat open={missionOpen} onOpenChange={setMissionOpen} />
    </div>
  );
}
