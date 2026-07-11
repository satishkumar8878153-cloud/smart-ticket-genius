import { CalendarRange } from "lucide-react";
import type { AlternateDate } from "@/lib/mock-data";
import { SectionHeader } from "./ClassMatrix";
import { StatusBadge } from "./StatusBadge";

export function AlternateDates({ dates }: { dates: AlternateDate[] }) {
  return (
    <section className="gradient-card rounded-3xl border border-border/60 p-5 shadow-card sm:p-6">
      <SectionHeader
        icon={<CalendarRange className="h-4 w-4" />}
        title="Next 7 days"
        subtitle="Flex your journey date for better seats or fares"
      />
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {dates.map((d, i) => {
          const dt = new Date(d.date);
          return (
            <div
              key={d.date}
              className={`flex flex-col gap-2 rounded-2xl border p-3 transition-colors ${
                i === 0
                  ? "border-primary/50 bg-primary/5"
                  : "border-border/60 bg-background/60 hover:bg-accent/40"
              }`}
            >
              <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {d.weekday}
              </div>
              <div className="text-2xl font-bold tabular-nums leading-none">
                {dt.getDate()}
              </div>
              <div className="text-xs text-muted-foreground">
                {dt.toLocaleDateString(undefined, { month: "short" })}
              </div>
              <StatusBadge status={d.status} className="mt-1 w-fit" />
              <div className="mt-1 text-xs font-semibold text-foreground/90 tabular-nums">
                ₹{d.fare.toLocaleString()}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
