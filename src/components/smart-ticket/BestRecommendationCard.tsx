import { Clock, Sparkles, Star, TrendingUp, Train } from "lucide-react";
import type { TrainRecommendation } from "@/lib/mock-data";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

export function BestRecommendationCard({ train }: { train: TrainRecommendation }) {
  return (
    <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary via-primary to-[color:var(--primary-glow)] p-6 text-primary-foreground shadow-elegant sm:p-8">
      <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-black/10 blur-3xl" />

      <div className="relative">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 sm:flex sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/15 backdrop-blur">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wider text-white/80">
                Best AI recommendation
              </div>
              <div className="mt-0.5 truncate text-xs text-white/70">
                Ranked by confirm probability + on-time record
              </div>
            </div>
          </div>
          <div className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-semibold backdrop-blur">
            <Star className="h-3.5 w-3.5 fill-current" />
            Score {train.recommendationScore}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 sm:flex sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Train className="h-6 w-6 shrink-0 opacity-90" />
            <div className="min-w-0">
              <h2 className="truncate text-2xl font-bold sm:text-3xl">{train.trainName}</h2>
              <div className="mt-0.5 text-sm text-white/80">#{train.trainNumber}</div>
            </div>
          </div>
          <div className="hidden text-right sm:block">
            <div className="text-3xl font-bold tabular-nums">{train.confirmProbability}%</div>
            <div className="text-xs uppercase tracking-wider text-white/80">Confirm prob.</div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-3 gap-3 sm:gap-6">
          <TimePoint label="Depart" value={train.departure} />
          <div className="flex flex-col items-center justify-center">
            <div className="flex items-center gap-1.5 text-xs text-white/80">
              <Clock className="h-3.5 w-3.5" /> {train.duration}
            </div>
            <div className="mt-2 h-px w-full bg-white/30" />
          </div>
          <TimePoint label="Arrive" value={train.arrival} align="right" />
        </div>

        <div className="mt-6 sm:hidden">
          <div className="flex items-baseline gap-2">
            <div className="text-3xl font-bold tabular-nums">{train.confirmProbability}%</div>
            <div className="text-xs uppercase tracking-wider text-white/80">Confirm prob.</div>
          </div>
        </div>

        <div className="mt-6 rounded-2xl bg-white/10 p-4 backdrop-blur">
          <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-white/90">
            <TrendingUp className="h-3.5 w-3.5" /> Why we picked this
          </div>
          <p className="text-sm leading-relaxed text-white/95">{train.reason}</p>
        </div>

        <div className="mt-5 space-y-2">
          <div className="flex justify-between text-xs text-white/80">
            <span>Confirmation probability</span>
            <span className="tabular-nums">{train.confirmProbability}%</span>
          </div>
          <Progress
            value={train.confirmProbability}
            className="h-2 bg-white/20 [&>div]:bg-white"
          />
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            variant="secondary"
            className="rounded-xl bg-white text-primary hover:bg-white/90"
          >
            Book {train.bestClass}
          </Button>
          <Button
            variant="outline"
            className="rounded-xl border-white/40 bg-transparent text-white hover:bg-white/10 hover:text-white"
          >
            View full details
          </Button>
        </div>
      </div>
    </div>
  );
}

function TimePoint({
  label,
  value,
  align = "left",
}: {
  label: string;
  value: string;
  align?: "left" | "right";
}) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="text-2xl font-bold tabular-nums sm:text-3xl">{value}</div>
      <div className="text-xs uppercase tracking-wider text-white/80">{label}</div>
    </div>
  );
}
