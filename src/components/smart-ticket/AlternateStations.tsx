import { MapPin, Route } from "lucide-react";
import type { AlternateStation } from "@/lib/mock-data";
import { SectionHeader } from "./ClassMatrix";
import { StatusBadge } from "./StatusBadge";

export function AlternateStations({ stations }: { stations: AlternateStation[] }) {
  return (
    <section className="gradient-card rounded-3xl border border-border/60 p-5 shadow-card sm:p-6">
      <SectionHeader
        icon={<Route className="h-4 w-4" />}
        title="Nearby boarding stations"
        subtitle="Better availability by starting a little farther"
      />
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {stations.map((s) => (
          <div
            key={s.code}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-border/60 bg-background/60 p-4 transition-colors hover:bg-accent/40"
          >
            <div className="flex min-w-0 items-center gap-3">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <MapPin className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-semibold">{s.name}</div>
                <div className="text-xs text-muted-foreground">
                  {s.code} · {s.distanceKm} km · +{s.extraTravel} travel
                </div>
              </div>
            </div>
            <StatusBadge status={s.availability} />
          </div>
        ))}
      </div>
    </section>
  );
}
