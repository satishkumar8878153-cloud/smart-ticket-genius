import { Link, useRouterState } from "@tanstack/react-router";
import { House, Ticket } from "lucide-react";

const items = [
  { to: "/", label: "Home", Icon: House },
  { to: "/trips", label: "My Trips", Icon: Ticket },
] as const;

export function BottomNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Full-screen chat has its own footer controls
  if (pathname.startsWith("/chat")) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/85 backdrop-blur-xl"
      aria-label="Primary"
    >
      <div className="mx-auto flex h-16 max-w-lg items-stretch justify-around px-2">
        {items.map(({ to, label, Icon }) => {
          const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
          return (
            <Link
              key={to}
              to={to}
              className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors ${
                active ? "text-indigo-400" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "text-indigo-400" : ""}`} />
              <span>{label}</span>
            </Link>
          );
        })}
      </div>
      {/* safe area spacer for notched phones */}
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
