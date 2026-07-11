import { Bell, ListChecks, Radar, ShieldCheck, Waypoints } from "lucide-react";
import type { GuardianTask } from "@/services/mission.service";
import { SectionHeader } from "./ClassMatrix";
import { Button } from "@/components/ui/button";

const ICONS: Record<GuardianTask["id"], React.ReactNode> = {
  waitlist: <ListChecks className="h-4 w-4" />,
  boarding: <Bell className="h-4 w-4" />,
  route: <Waypoints className="h-4 w-4" />,
  notify: <Radar className="h-4 w-4" />,
};

export function JourneyGuardian({ tasks }: { tasks: GuardianTask[] }) {
  return (
    <section className="gradient-card rounded-3xl border border-border/60 p-5 shadow-card sm:p-6">
      <SectionHeader
        icon={<ShieldCheck className="h-4 w-4" />}
        title="Journey Guardian"
        subtitle="Autonomous safeguards that keep watch until arrival"
      />

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tasks.map((task) => (
          <article
            key={task.id}
            className="group flex flex-col rounded-2xl border border-border/60 bg-background/60 p-4 transition-colors hover:bg-accent/40"
          >
            <div className="flex items-center justify-between">
              <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
                {ICONS[task.id]}
              </div>
              <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {task.status}
              </span>
            </div>
            <h4 className="mt-3 text-sm font-semibold">{task.title}</h4>
            <p className="mt-1 flex-1 text-xs leading-relaxed text-muted-foreground">
              {task.description}
            </p>
            <Button variant="outline" size="sm" className="mt-3 rounded-lg" disabled>
              Coming soon
            </Button>
          </article>
        ))}
      </div>
    </section>
  );
}
