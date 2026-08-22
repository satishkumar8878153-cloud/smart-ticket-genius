import { LayoutGrid } from "lucide-react";
import { CLASSES, type TrainRecommendation } from "@/lib/mock-data";
import { StatusBadge } from "./StatusBadge";

export function ClassMatrix({ trains }: { trains: TrainRecommendation[] }) {
  return (
    <section className="gradient-card rounded-3xl border border-border/60 p-5 shadow-card sm:p-6">
      <SectionHeader
        icon={<LayoutGrid className="h-4 w-4" />}
        title="All class availability"
        subtitle="Class labels from timetable data — not live seat inventory"
      />

      <div className="mt-5 overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-y-2">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2 font-medium">Train</th>
              {CLASSES.map((c) => (
                <th key={c.code} className="px-3 py-2 font-medium">
                  {c.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {trains.map((t) => (
              <tr
                key={t.trainNumber}
                className="rounded-xl bg-background/60 text-sm ring-1 ring-border/60 transition-colors hover:bg-accent/40"
              >
                <td className="rounded-l-xl px-3 py-3">
                  <div className="font-semibold">{t.trainName}</div>
                  <div className="text-xs text-muted-foreground">
                    #{t.trainNumber} · {t.departure} → {t.arrival}
                  </div>
                </td>
                {CLASSES.map((c, i) => (
                  <td
                    key={c.code}
                    className={i === CLASSES.length - 1 ? "rounded-r-xl px-3 py-3" : "px-3 py-3"}
                  >
                    <StatusBadge status={t.availability[c.code]} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <h3 className="truncate text-base font-semibold sm:text-lg">{title}</h3>
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground sm:text-sm">{subtitle}</p>
        ) : null}
      </div>
    </div>
  );
}
