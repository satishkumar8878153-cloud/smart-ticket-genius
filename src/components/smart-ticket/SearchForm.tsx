import { ArrowRightLeft, CalendarDays, Loader2, MapPin, Search, Sparkles } from "lucide-react";
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
import { CLASSES, type SearchQuery, type TicketClass } from "@/lib/mock-data";
import { resolveStations, routeSearch, type RouteSearchResponse, type StationMatch } from "@/lib/api";
import { ResultsList } from "@/components/smart-ticket/ResultsList";

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
    }, 300);
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
    onChange(m.name || m.code);
    setOpen(false);
    setOptions([]);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || options.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => (h + 1) % options.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => (h - 1 + options.length) % options.length);
    } else if (e.key === "Enter" && options[highlight]) {
      e.preventDefault();
      pick(options[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative min-w-0">
      <Label htmlFor={id} className="mb-1.5 block text-xs font-medium text-muted-foreground">
        {label}
      </Label>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => options.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Station or city"
          autoComplete="off"
          className="h-12 rounded-xl border-border/60 bg-background/70 pl-9 text-base font-medium"
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
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(m)}
                className={`flex w-full flex-col rounded-lg px-3 py-2 text-left text-sm ${
                  i === highlight ? "bg-indigo-500/15 text-foreground" : "hover:bg-muted/50"
                }`}
              >
                <span className="font-medium">{m.name || m.code}</span>
                <span className="text-xs text-muted-foreground">
                  {m.code}
                  {m.city ? ` · ${m.city}` : ""}
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
  const [travelClass, setTravelClass] = useState<TicketClass>(
    initialQuery?.travelClass ?? "3A",
  );
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeData, setRouteData] = useState<RouteSearchResponse | null>(null);
  const [routeError, setRouteError] = useState<string | null>(null);
  const lastPayload = useRef<{
    source: string;
    destination: string;
    date?: string;
    travelClass?: string;
  } | null>(null);

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

  const runRouteSearch = useCallback(async () => {
    if (!source || !destination) return;
    const payload = {
      source,
      destination,
      date,
      travelClass,
    };
    lastPayload.current = payload;
    setRouteLoading(true);
    setRouteError(null);
    try {
      const data = await routeSearch(payload);
      setRouteData(data);
    } catch (err) {
      setRouteData(null);
      setRouteError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setRouteLoading(false);
    }
  }, [source, destination, date, travelClass]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!source || !destination || routeLoading || externalLoading) return;
    void runRouteSearch();
    onSearch?.({ source, destination, date, travelClass });
  };

  const busy = routeLoading || externalLoading;

  return (
    <div>
      <form
        onSubmit={submit}
        className="gradient-card relative overflow-hidden rounded-3xl border border-border/60 p-5 shadow-elegant sm:p-6"
      >
        <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-indigo-400" />
          <span>Search live routes from the production timetable</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <StationAutocomplete id="from" label="From" value={source} onChange={setSource} />
          <div className="flex items-end justify-center pb-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={swap}
              className="h-12 w-12 shrink-0 rounded-xl border-border/60"
              aria-label="Swap stations"
            >
              <ArrowRightLeft className="h-4 w-4" />
            </Button>
          </div>
          <StationAutocomplete
            id="to"
            label="To"
            value={destination}
            onChange={setDestination}
          />
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
          <div>
            <Label htmlFor="date" className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Journey date
            </Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="h-12 rounded-xl border-border/60 bg-background/70 pl-9 text-base font-medium"
              />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">Class</Label>
            <Select value={travelClass} onValueChange={(v) => setTravelClass(v as TicketClass)}>
              <SelectTrigger className="h-12 min-w-0 rounded-xl border-border/60 bg-background/70 text-base font-medium">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CLASSES.map((c) => (
                  <SelectItem key={c.code} value={c.code}>
                    <span className="font-semibold">{c.code}</span>
                    <span className="ml-2 text-muted-foreground">{c.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            type="submit"
            disabled={busy}
            className="gradient-primary h-12 rounded-xl px-6 text-base font-semibold text-primary-foreground shadow-elegant transition-transform hover:scale-[1.02] disabled:opacity-70 sm:self-end"
          >
            {busy ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Searching…
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" /> Search
              </>
            )}
          </Button>
        </div>
      </form>

      <ResultsList
        data={routeData}
        loading={routeLoading}
        error={routeError}
        journeyDate={date}
        onRetry={() => void runRouteSearch()}
        onSuggestion={(from, to) => {
          setSource(from);
          setDestination(to);
          window.setTimeout(() => {
            void (async () => {
              const payload = { source: from, destination: to, date, travelClass };
              lastPayload.current = payload;
              setRouteLoading(true);
              setRouteError(null);
              try {
                const data = await routeSearch(payload);
                setRouteData(data);
              } catch (err) {
                setRouteData(null);
                setRouteError(err instanceof Error ? err.message : "Search failed");
              } finally {
                setRouteLoading(false);
              }
            })();
          }, 0);
        }}
      />
    </div>
  );
}
