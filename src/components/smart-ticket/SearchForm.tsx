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
    } else if (e.key === "Enter") {
      e.preventDefault();
      pick(options[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</Label>
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => options.length > 0 && setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={label === "From" ? "Source station" : "Destination station"}
          autoComplete="off"
          className="h-12 rounded-xl border-border/60 bg-background/70 pl-9 text-base font-medium"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : null}
      </div>
      {open && options.length > 0 ? (
        <ul
          className="absolute z-30 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-border/60 bg-card py-1 shadow-elegant"
          role="listbox"
        >
          {options.map((m, i) => (
            <li key={`${m.code}-${i}`}>
              <button
                type="button"
                role="option"
                aria-selected={i === highlight}
                className={`flex w-full px-3 py-2 text-left text-sm ${
                  i === highlight ? "bg-primary/15 text-foreground" : "text-foreground hover:bg-muted/50"
                }`}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(m)}
              >
                <span className="font-medium">{m.name || m.code}</span>
                <span className="ml-2 text-muted-foreground">({m.code})</span>
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
        className="gradient-card relative overflow-hidden rounded-3xl border border-border/60 p-5 shadow-elegant backdrop-blur-xl sm:p-8"
      >
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-64 w-64 rounded-full bg-[color:var(--primary-glow)]/20 blur-3xl" />

        <div className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-primary">
          <Sparkles className="h-3.5 w-3.5" /> AI-powered search
        </div>

        <div className="relative mt-4 grid gap-4 md:grid-cols-[1fr_auto_1fr_1fr_1fr_auto] md:items-end">
          <StationAutocomplete id="from" label="From" value={source} onChange={setSource} />

          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={swap}
            aria-label="Swap stations"
            className="hidden h-10 w-10 rounded-full border-border/60 bg-background/70 md:inline-flex"
          >
            <ArrowRightLeft className="h-4 w-4" />
          </Button>

          <StationAutocomplete id="to" label="To" value={destination} onChange={setDestination} />

          <div>
            <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
              Journey date
            </Label>
            <div className="relative">
              <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
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
            className="gradient-primary h-12 rounded-xl px-6 text-base font-semibold text-primary-foreground shadow-elegant transition-transform hover:scale-[1.02] disabled:opacity-70"
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
        onRetry={() => void runRouteSearch()}
      />
    </div>
  );
}
