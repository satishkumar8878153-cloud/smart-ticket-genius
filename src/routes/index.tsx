import { createFileRoute } from "@tanstack/react-router";
import { MessageSquare, Train } from "lucide-react";
import { useMemo, useState } from "react";
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

  const initialQuery = useMemo((): Partial<SearchQuery> | undefined => {
    if (!from && !to && !date && !cls) return undefined;
    return {
      source: from,
      destination: to,
      date,
      travelClass: cls,
    };
  }, [from, to, date, cls]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2">
            <Train className="h-5 w-5 text-indigo-400" />
            <span className="text-base font-semibold tracking-tight">Smart Ticket Genius</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16 pt-8 sm:px-6">
        <section className="text-center">
          <h1 className="text-balance text-2xl font-bold tracking-tight sm:text-3xl">
            Find the right train, faster.
          </h1>
          <p className="mx-auto mt-2 max-w-lg text-pretty text-sm text-muted-foreground sm:text-base">
            Search the railway timetable across major stations and trains. Live seat availability is
            not connected yet — check official IRCTC for current availability.
          </p>

          <button
            type="button"
            onClick={() => setMissionOpen(true)}
            className="mt-6 inline-flex w-full max-w-md items-center justify-center gap-2 rounded-full bg-indigo-600 px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-500/25 transition hover:bg-indigo-500 hover:scale-[1.02] sm:w-auto"
          >
            <MessageSquare className="h-5 w-5" />
            Ask Mission AI
          </button>
        </section>

        <section className="mt-8">
          <SearchForm initialQuery={initialQuery} />
        </section>

        <footer className="mt-14 border-t border-border/50 pt-5 text-center text-[11px] text-muted-foreground">
          Smart Ticket Genius · Timetable search · Historical estimates only (limited records)
        </footer>
      </main>

      <MissionChat open={missionOpen} onOpenChange={setMissionOpen} />
    </div>
  );
}
