import { ArrowRightLeft, CalendarDays, Loader2, MapPin, Search, Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
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
import { fetchStations } from "@/services/stations.service";
import type { Station } from "@/services/types";

export function SearchForm({
  onSearch,
  loading = false,
}: {
  onSearch: (q: SearchQuery) => void;
  loading?: boolean;
}) {
  const [source, setSource] = useState("New Delhi");
  const [destination, setDestination] = useState("Mumbai Central");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [travelClass, setTravelClass] = useState<TicketClass>("3A");
  const [stations, setStations] = useState<Station[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchStations()
      .then((rows) => {
        if (!cancelled) setStations(rows);
      })
      .catch((err) => {
        console.error("Failed to load stations", err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const swap = () => {
    setSource(destination);
    setDestination(source);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!source || !destination || loading) return;
    onSearch({ source, destination, date, travelClass });
  };

  return (
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
        <div>
          <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">
            From
          </Label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              list="stations"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Source station"
              className="h-12 rounded-xl border-border/60 bg-background/70 pl-9 text-base font-medium"
            />
          </div>
        </div>

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

        <div>
          <Label className="mb-1.5 block text-xs font-medium text-muted-foreground">To</Label>
          <div className="relative">
            <MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              list="stations"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              placeholder="Destination station"
              className="h-12 rounded-xl border-border/60 bg-background/70 pl-9 text-base font-medium"
            />
          </div>
        </div>

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
          disabled={loading}
          className="gradient-primary h-12 rounded-xl px-6 text-base font-semibold text-primary-foreground shadow-elegant transition-transform hover:scale-[1.02] disabled:opacity-70"
        >
          {loading ? (
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

      <datalist id="stations">
        {stations.map((s) => (
          <option key={s.code} value={s.name} />
        ))}
      </datalist>
    </form>
  );
}
