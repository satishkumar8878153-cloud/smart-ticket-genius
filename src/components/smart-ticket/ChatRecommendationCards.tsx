import { Link } from "@tanstack/react-router";
import {
  ArrowRightLeft,
  Calendar,
  Clock,
  IndianRupee,
  MapPin,
  Search,
  Sparkles,
  Train,
} from "lucide-react";
import type { ChatRecommendation } from "@/services/chat.service";
import type { RankedTrain } from "@/services/recommendation/advisor";


function Shell({
  icon,
  label,
  tone = "default",
  children,
}: {
  icon: React.ReactNode;
  label: string;
  tone?: "default" | "primary";
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        tone === "primary"
          ? "rounded-3xl border border-primary/40 bg-primary/10 p-4"
          : "gradient-card rounded-3xl border border-border/60 p-4 shadow-card"
      }
    >
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="text-primary">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-sm text-foreground/90">{children}</div>
    </div>
  );
}

function TrainLine({ t }: { t: RankedTrain }) {
  return (
    <div>
      <div className="font-semibold">
        {t.trainName} <span className="text-muted-foreground">#{t.trainNumber}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Clock className="h-3 w-3" /> {t.departure} → {t.arrival} · {t.duration}
        </span>
        <span className="inline-flex items-center gap-1">
          <IndianRupee className="h-3 w-3" />
          {t.fareEstimate}
        </span>
        <span className="tabular-nums">{t.confirmProbability}% confirm</span>
      </div>
    </div>
  );
}

export function ChatRecommendationCards({ data }: { data: ChatRecommendation }) {
  const { best } = data;
  if (!best) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <Shell icon={<Sparkles className="h-3.5 w-3.5" />} label="Best train" tone="primary">
          <TrainLine t={best} />
          <div className="mt-3 flex items-center gap-2">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-border">
              <div
                className="gradient-primary h-full rounded-full"
                style={{ width: `${best.confirmProbability}%` }}
              />
            </div>
            <span className="text-xs font-semibold tabular-nums">
              {best.confirmProbability}%
            </span>
          </div>
          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            {best.reasons.slice(0, 3).map((r) => (
              <li key={r}>• {r}</li>
            ))}
          </ul>
        </Shell>
      </div>

      {data.alternateTrain && (
        <Shell icon={<Train className="h-3.5 w-3.5" />} label="Alternate train">
          <TrainLine t={data.alternateTrain} />
        </Shell>
      )}

      {data.cheapest && (
        <Shell icon={<IndianRupee className="h-3.5 w-3.5" />} label="Cheapest option">
          <TrainLine t={data.cheapest} />
        </Shell>
      )}

      {data.fastest && (
        <Shell icon={<Clock className="h-3.5 w-3.5" />} label="Fastest option">
          <TrainLine t={data.fastest} />
        </Shell>
      )}

      {data.alternateClass && (
        <Shell icon={<ArrowRightLeft className="h-3.5 w-3.5" />} label="Alternate class">
          <div className="font-semibold">
            {data.alternateClass.currentClass} → {data.alternateClass.suggestedClass}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{data.alternateClass.reason}</p>
        </Shell>
      )}

      {data.nearbyStation && (
        <Shell icon={<MapPin className="h-3.5 w-3.5" />} label="Nearby station">
          <div className="font-semibold">{data.nearbyStation.suggestedStation}</div>
          <p className="mt-1 text-xs text-muted-foreground">{data.nearbyStation.reason}</p>
        </Shell>
      )}

      {data.alternateDate && (
        <Shell icon={<Calendar className="h-3.5 w-3.5" />} label="Alternate date">
          <div className="font-semibold">{data.alternateDate.date}</div>
          <p className="mt-1 text-xs text-muted-foreground">{data.alternateDate.reason}</p>
        </Shell>
      )}
    </div>
  );
}
