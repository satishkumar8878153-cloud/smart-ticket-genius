import { Brain, Check } from "lucide-react";
import { SectionHeader } from "./ClassMatrix";

export function AIInsightsPanel({ insights }: { insights: string[] }) {
  return (
    <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-accent/40 via-background to-primary/10 p-5 shadow-card sm:p-6">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative">
        <SectionHeader
          icon={<Brain className="h-4 w-4" />}
          title="AI recommendation panel"
          subtitle="Why this journey plan is optimal for you"
        />
        <ul className="mt-5 space-y-3">
          {insights.map((text, i) => (
            <li
              key={i}
              className="flex items-start gap-3 rounded-2xl border border-border/60 bg-card/70 p-4 backdrop-blur"
            >
              <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-3.5 w-3.5" />
              </div>
              <p className="text-sm leading-relaxed text-foreground/90">{text}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
