import {
  ArrowRight,
  Check,
  Clock,
  Minus,
  Rocket,
  Route,
  Shield,
  Sparkles,
  Target,
  Train,
} from "lucide-react";
import type { MissionPlan } from "@/services/mission.service";
import { SectionHeader } from "./ClassMatrix";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const PLAN_STYLES: Record<
  MissionPlan["kind"],
  { chip: string; ring: string; glow: string; icon: React.ReactNode }
> = {
  A: {
    chip: "bg-primary/15 text-primary ring-primary/30",
    ring: "ring-primary/40",
    glow: "from-primary/15 via-transparent to-transparent",
    icon: <Target className="h-4 w-4" />,
  },
  B: {
    chip: "bg-[color:var(--warning)]/15 text-[color:var(--warning)] ring-[color:var(--warning)]/30",
    ring: "ring-[color:var(--warning)]/40",
    glow: "from-[color:var(--warning)]/15 via-transparent to-transparent",
    icon: <Rocket className="h-4 w-4" />,
  },
  C: {
    chip: "bg-muted text-foreground ring-border",
    ring: "ring-border",
    glow: "from-muted/40 via-transparent to-transparent",
    icon: <Shield className="h-4 w-4" />,
  },
};

export function MissionConfirm({ plans }: { plans: MissionPlan[] }) {
  return (
    <section className="gradient-card rounded-3xl border border-border/60 p-5 shadow-card sm:p-6">
      <SectionHeader
        icon={<Sparkles className="h-4 w-4" />}
        title="Mission Confirm"
        subtitle="Three AI-generated strategies to lock in your seat"
      />
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <PlanCard key={p.kind} plan={p} />
        ))}
      </div>
    </section>
  );
}

function PlanCard({ plan }: { plan: MissionPlan }) {
  const s = PLAN_STYLES[plan.kind];
  return (
    <article
      className={cn(
        "relative flex flex-col overflow-hidden rounded-2xl border border-border/60 bg-background/60 p-5 ring-1 backdrop-blur",
        s.ring,
      )}
    >
      <div
        className={cn("pointer-events-none absolute inset-0 -z-0 bg-gradient-to-br", s.glow)}
      />
      <div className="relative flex flex-col gap-4">
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset",
              s.chip,
            )}
          >
            {s.icon} Plan {plan.kind}
          </div>
          <ConfidenceDial value={plan.aiConfidence} />
        </div>

        <div>
          <h4 className="text-base font-semibold sm:text-lg">{plan.title}</h4>
          <p className="mt-0.5 text-xs text-muted-foreground">{plan.tagline}</p>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/70 p-3">
          <div className="flex items-center gap-2">
            <Train className="h-4 w-4 text-primary" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{plan.train.name}</div>
              <div className="text-[11px] text-muted-foreground">
                #{plan.train.number} · {plan.train.duration}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm tabular-nums">
            <span className="font-semibold">{plan.train.departure}</span>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-semibold">{plan.train.arrival}</span>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 text-xs">
          <Meta label="Boarding" value={plan.boardingStation} />
          <Meta label="Class" value={plan.travelClass} />
          <Meta label="Date" value={plan.journeyDate} />
          <Meta label="Fare est." value={`₹${plan.fareEstimate}`} />
          {plan.extraTravel ? <Meta label="Extra travel" value={plan.extraTravel} /> : null}
          <Meta label="Confirm" value={`${plan.confirmProbability}%`} />
        </dl>

        <div className="space-y-1.5">
          <div className="flex justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
            <span>Confirm probability</span>
            <span className="tabular-nums">{plan.confirmProbability}%</span>
          </div>
          <Progress value={plan.confirmProbability} className="h-1.5" />
        </div>

        <div className="rounded-xl bg-accent/40 p-3 text-xs leading-relaxed text-foreground/90">
          <div className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-primary">
            <Sparkles className="h-3 w-3" /> AI explanation
          </div>
          {plan.aiExplanation}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          <ProsList
            tone="pos"
            title="Advantages"
            items={plan.pros.advantages}
          />
          <ProsList
            tone="neg"
            title="Trade-offs"
            items={plan.pros.disadvantages}
          />
        </div>

        <Button className="mt-1 w-full rounded-xl" variant={plan.kind === "A" ? "default" : "outline"}>
          Activate Plan {plan.kind}
        </Button>
      </div>
    </article>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-card/60 px-2.5 py-1.5">
      <dt className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 truncate text-xs font-semibold">{value}</dd>
    </div>
  );
}

function ProsList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: "pos" | "neg";
}) {
  const Icon = tone === "pos" ? Check : Minus;
  const color =
    tone === "pos"
      ? "text-[color:var(--success)] bg-[color:var(--success)]/15"
      : "text-destructive bg-destructive/10";
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <ul className="space-y-1.5">
        {items.map((it) => (
          <li key={it} className="flex items-start gap-2 text-xs leading-relaxed">
            <span className={cn("mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full", color)}>
              <Icon className="h-2.5 w-2.5" />
            </span>
            <span className="text-foreground/90">{it}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConfidenceDial({ value }: { value: number }) {
  const tone =
    value >= 80
      ? "text-[color:var(--success)]"
      : value >= 60
        ? "text-[color:var(--warning)]"
        : "text-destructive";
  return (
    <div className="flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-2.5 py-1 text-xs">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Route className="h-3 w-3" /> AI conf.
      </div>
      <span className={cn("text-sm font-bold tabular-nums", tone)}>{value}</span>
    </div>
  );
}

// Re-exports so the parent can render one shared "results" block without
// pulling extra icons at the call site.
export { Clock };
