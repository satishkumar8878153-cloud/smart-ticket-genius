import { createFileRoute } from "@tanstack/react-router";
import { LayoutGrid, MessageSquare, Route as RouteIcon, ShieldCheck, Sparkles, Train } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SearchForm } from "@/components/smart-ticket/SearchForm";
import { MissionChat } from "@/components/smart-ticket/MissionChat";
import { ThemeToggle } from "@/components/smart-ticket/ThemeToggle";
import type { SearchQuery, TicketClass } from "@/lib/mock-data";

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
  const [missionOpen, setMissionOpen] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const autoHint = useRef(false);

  const initialQuery = useMemo((): Partial<SearchQuery> | undefined => {
    if (!from && !to && !date && !cls) return undefined;
    return {
      source: from,
      destination: to,
      date,
      travelClass: cls,
    };
  }, [from, to, date, cls]);

  useEffect(() => {
    if (from && to) autoHint.current = true;
  }, [from, to]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Train className="h-6 w-6 text-indigo-400" />
            <span className="text-lg font-bold tracking-tight">Smart Ticket AI</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 sm:px-6">
        <section className="text-center">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-300">
            <Sparkles className="h-3.5 w-3.5" />
            AI-powered IRCTC insights
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
              <span className="font-semibold text-white">5,208</span>
              <span className="ml-1.5 text-sm text-muted-foreground">trains</span>
            </div>
            <div className="hidden h-4 w-px bg-border/60 sm:block" aria-hidden />
            <div className="px-2">
              <span className="font-semibold text-white">417,078</span>
              <span className="ml-1.5 text-sm text-muted-foreground">route stops</span>
            </div>
            <div className="hidden h-4 w-px bg-border/60 sm:block" aria-hidden />
            <div className="px-2">
              <span className="font-semibold text-white">62</span>
              <span className="ml-1.5 text-sm text-muted-foreground">booking outcomes</span>
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

        <section className="mt-10">
          <SearchForm
            initialQuery={initialQuery}
            onSearch={() => setHasSearched(true)}
          />
        </section>

        {!hasSearched && !autoHint.current ? (
          <div className="mt-14 grid gap-4 text-center sm:grid-cols-3">
            {[
              {
                t: "Confirm probability",
                d: "See the chance your ticket will confirm before booking.",
                Icon: ShieldCheck,
              },
              {
                t: "Live route cards",
                d: "Board, alight, duration and stops from the production timetable.",
                Icon: LayoutGrid,
              },
              {
                t: "Smarter alternatives",
                d: "Nearby stations and flexible dates unlock better seats.",
                Icon: RouteIcon,
              },
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
