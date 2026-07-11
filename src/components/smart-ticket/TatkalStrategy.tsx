import { Bolt, Check, Clock3, MapPin, Ticket } from "lucide-react";
import type { TatkalStrategy as TatkalStrategyType } from "@/services/mission.service";
import { Progress } from "@/components/ui/progress";
import { SectionHeader } from "./ClassMatrix";

export function TatkalStrategy({ tatkal }: { tatkal: TatkalStrategyType }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-[color:var(--warning)]/30 bg-gradient-to-br from-[color:var(--warning)]/10 via-background to-background p-5 shadow-card sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[color:var(--warning)]/20 blur-3xl" />
      <div className="relative">
        <SectionHeader
          icon={<Bolt className="h-4 w-4" />}
          title="Tatkal Strategy"
          subtitle="AI-tuned playbook for last-minute booking"
        />

        <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.2fr]">
          <div className="rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Tatkal success probability
            </div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-4xl font-bold tabular-nums text-[color:var(--warning)]">
                {tatkal.successProbability}%
              </span>
              <span className="text-xs text-muted-foreground">based on route demand & class</span>
            </div>
            <Progress
              value={tatkal.successProbability}
              className="mt-3 h-2 [&>div]:bg-[color:var(--warning)]"
            />

            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <Fact icon={<MapPin className="h-3.5 w-3.5" />} label="Best boarding" value={tatkal.bestBoardingStation} />
              <Fact icon={<Ticket className="h-3.5 w-3.5" />} label="Try class first" value={tatkal.bestClass} />
              <Fact icon={<Clock3 className="h-3.5 w-3.5" />} label="Opens" value={tatkal.openingWindow} />
            </div>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              AI booking advice
            </div>
            <ul className="space-y-2.5">
              {tatkal.advice.map((tip) => (
                <li key={tip} className="flex items-start gap-2 text-sm leading-relaxed">
                  <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[color:var(--warning)]/15 text-[color:var(--warning)]">
                    <Check className="h-3 w-3" />
                  </span>
                  <span className="text-foreground/90">{tip}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold">{value}</div>
    </div>
  );
}
