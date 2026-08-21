import { ArrowRightLeft, CalendarDays, Clock, Loader2, MapPin, Search } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SearchQuery, TicketClass } from "@/lib/mock-data";
import {
  resolveStations,
  smartSearch,
  type RouteSearchResponse,
  type StationMatch,
} from "@/lib/api";
import { ResultsList } from "@/components/smart-ticket/ResultsList";

const CLASS_OPTIONS: { code: string; label: string }[] = [
  { code: "ALL", label: "All classes" },
  { code: "SL", label: "Sleeper" },
  { code: "3A", label: "AC 3-Tier" },
  { code: "2A", label: "AC 2-Tier" },
  { code: "1A", label: "AC First" },
  { code: "CC", label: "Chair Car" },
  { code: "EC", label: "Executive" },
];

const RECENT_KEY = "stg_recent_searches_v1";
const MAX_RECENT = 5;

type RecentItem = {
  from: string;
  to: string;
  date: string;
  classCode: string;
};

function loadRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentItem[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((x) => x && typeof x.from === "string" && typeof x.to === "string")
      .slice(0, MAX_RECENT);
  } catch {
    return [];
  }
}

function saveRecent(item: RecentItem) {
  try {
    const prev = loadRecent().filter(
      (r) =>
        !(
          r.from === item.from &&
          r.to === item.to &&
          r.date === item.date &&
          r.classCode === item.classCode
        ),
    );
    const next = [item, ...prev].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore quota */
  }
}

function StationAutocomplete({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<StationMatch[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = value.trim();
    if (q.length < 2) {
      setOptions([]);
      setOpen(false);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        const matches = await resolveStations(q);
        setOptions(matches.slice(0, 6));
        setOpen(matches.length > 0);
        setHighlight(0);
      } catch {
        setOptions([]);
        setOpen(false);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const pick = (m: StationMatch) => {
    onChange(m.code);
    setOpen(false);
  };

  return (
    <div ref={wrapRef} className="relative min-w-0 flex-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <div className="relative mt-1">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => options.length > 0 && setOpen(true)}
          onKeyDown={(e) => {
            if (!open || options.length === 0) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => (h + 1) % options.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => (h - 1 + options.length) % options.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(options[highlight]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
          autoComplete="off"
          placeholder="Station or city"
          className="h-12 rounded-xl border-border/60 bg-background/70 pl-9"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      {open && options.length > 0 ? (
        <ul className="absolute z-30 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-border/60 bg-popover p-1 shadow-lg">
          {options.map((m, i) => (
            <li key={`${m.code}-${i}`}>
              <button
                type="button"
                className={`flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left text-sm ${
                  i === highlight ? "bg-muted" : "hover:bg-muted/60"
                }`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(m)}
              >
                <span className="font-semibold tabular-nums text-foreground">{m.code}</span>
                <span className="min-w-0 truncate text-muted-foreground">
                  {m.name || m.city || ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function SearchForm({
  onSearch,
  loading: externalLoading = false,
  initialQuery,
}: {
  onSearch?: (q: SearchQuery) => void;
  loading?: boolean;
  initialQuery?: Partial<SearchQuery>;
}) {
  const [source, setSource] = useState(initialQuery?.source ?? "New Delhi");
  const [destination, setDestination] = useState(initialQuery?.destination ?? "Patna");
  const [date, setDate] = useState(
    () => initialQuery?.date ?? new Date().toISOString().slice(0, 10),
  );
  const [travelClass, setTravelClass] = useState<string>(initialQuery?.travelClass ?? "ALL");
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeData, setRouteData] = useState<RouteSearchResponse | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);

  useEffect(() => {
    setRecent(loadRecent());
  }, []);

  useEffect(() => {
    if (!initialQuery) return;
    if (initialQuery.source) setSource(initialQuery.source);
    if (initialQuery.destination) setDestination(initialQuery.destination);
    if (initialQuery.date) setDate(initialQuery.date);
    if (initialQuery.travelClass) setTravelClass(initialQuery.travelClass);
  }, [
    initialQuery?.source,
    initialQuery?.destination,
    initialQuery?.date,
    initialQuery?.travelClass,
  ]);

  const swap = () => {
    setSource(destination);
    setDestination(source);
  };

  const runRouteSearch = useCallback(
    async (override?: {
      source?: string;
      destination?: string;
      date?: string;
      classCode?: string;
    }) => {
      const src = (override?.source ?? source).trim();
      const dst = (override?.destination ?? destination).trim();
      const d = override?.date ?? date;
      const cls = override?.classCode ?? travelClass;
      if (!src || !dst) return;

      const apiClass = cls === "ALL" ? "SL" : cls;
      setRouteLoading(true);
      setRouteError(null);
      try {
        const data = await smartSearch({
          from: src,
          to: dst,
          journey_date: d,
          class_code: apiClass,
        });
        setRouteData(data);
        const item: RecentItem = {
          from: src,
          to: dst,
          date: d,
          classCode: cls,
        };
        saveRecent(item);
        setRecent(loadRecent());
        onSearch?.({
          source: src,
          destination: dst,
          date: d,
          travelClass: (apiClass as TicketClass) || "SL",
        });
      } catch (err) {
        setRouteData(null);
        setRouteError(err instanceof Error ? err.message : "Search failed");
      } finally {
        setRouteLoading(false);
      }
    },
    [source, destination, date, travelClass, onSearch],
  );

  const busy = routeLoading || externalLoading;

  return (
    <div className="w-full max-w-full overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-4 shadow-sm sm:p-5">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          void runRouteSearch();
        }}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <StationAutocomplete id="from" label="From" value={source} onChange={setSource} />
          <button
            type="button"
            onClick={swap}
            className="mx-auto inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/60 bg-background/50 text-muted-foreground hover:bg-muted/40 sm:mb-1"
            aria-label="Swap stations"
          >
            <ArrowRightLeft className="h-4 w-4" />
          </button>
          <StationAutocomplete
            id="to"
            label="To"
            value={destination}
            onChange={setDestination}
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <Label htmlFor="date" className="text-xs text-muted-foreground">
              Journey date
            </Label>
            <div className="relative mt-1">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-12 rounded-xl border-border/60 bg-background/70 pl-9"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="class" className="text-xs text-muted-foreground">
              Class
            </Label>
            <Select value={travelClass} onValueChange={setTravelClass}>
              <SelectTrigger id="class" className="mt-1 h-12 rounded-xl border-border/60 bg-background/70">
                <SelectValue placeholder="Class" />
              </SelectTrigger>
              <SelectContent>
                {CLASS_OPTIONS.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    <span className="font-semibold">{c.code === "ALL" ? "All" : c.code}</span>
                    <span className="ml-2 text-muted-foreground">{c.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="submit"
            disabled={busy}
            className="h-12 rounded-xl bg-indigo-600 px-6 text-base font-semibold text-white hover:bg-indigo-500 disabled:opacity-70 sm:self-end"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching…
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" /> Search Trains
              </>
            )}
          </Button>
        </div>
      </form>

      {recent.length > 0 && !routeData && !routeLoading ? (
        <div className="mt-4">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            Recent searches
          </p>
          <ul className="flex flex-wrap gap-2">
            {recent.map((r) => (
              <li key={`${r.from}-${r.to}-${r.date}-${r.classCode}`}>
                <button
                  type="button"
                  onClick={() => {
                    setSource(r.from);
                    setDestination(r.to);
                    setDate(r.date);
                    setTravelClass(r.classCode);
                    void runRouteSearch({
                      source: r.from,
                      destination: r.to,
                      date: r.date,
                      classCode: r.classCode,
                    });
                  }}
                  className="min-h-9 max-w-full truncate rounded-full border border-border/60 bg-background/40 px-3 text-xs font-medium hover:bg-muted/40"
                >
                  {r.from} → {r.to}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <ResultsList
        data={routeData}
        loading={routeLoading}
        error={routeError}
        journeyDate={date}
        onRetry={() => void runRouteSearch()}
        onSuggestion={(from, to) => {
          setSource(from);
          setDestination(to);
          void runRouteSearch({ source: from, destination: to });
        }}
      />
    </div>
  );
}
