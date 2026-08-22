import { ArrowLeft, Loader2, MessageSquare, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  askMission,
  parseJourneyMessage,
  smartSearch,
  type RouteSearchResponse,
} from "@/lib/api";
import { ResultsList } from "@/components/smart-ticket/ResultsList";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  trains?: RouteSearchResponse | null;
};

const GREETING =
  "Namaste! Tell me your journey — e.g. 'Bhagalpur to Patna tomorrow in SL'.";

export function MissionChat({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "greet", role: "assistant", text: GREETING },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      text,
    };
    setMessages((m) => [...m, userMsg]);
    setSending(true);
    try {
      // Prefer Smart Search when journey intent is parseable (same engine as SearchForm)
      const parsed = parseJourneyMessage(text);
      if (parsed?.from && parsed?.to) {
        const data = await smartSearch({
          from: parsed.from,
          to: parsed.to,
          journey_date: parsed.journey_date,
          class_code: parsed.class_code || "SL",
        });
        const directN = data.search_summary?.direct_count ?? data.direct_trains?.length ?? 0;
        const altN = data.search_summary?.alternative_count ?? data.nearby_options?.length ?? 0;
        const rec = data.recommendation;
        let reply =
          directN + altN > 0
            ? `Found ${directN} direct and ${altN} alternative timetable option${directN + altN === 1 ? "" : "s"} for ${parsed.from} → ${parsed.to}.`
            : `No trains found in the timetable for ${parsed.from} → ${parsed.to}. Try nearby cities or another date.`;
        if (rec?.train_number) {
          reply += `\n\nBest timetable option: ${rec.train_number}`;
          if (rec.why || rec.reason) reply += ` — ${rec.why || rec.reason}`;
        }
        reply += "\n\nTimetable only — not live seat availability.";
        setMessages((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: reply,
            trains: data.trains?.length ? data : null,
          },
        ]);
      } else {
        const res = await askMission(text);
        const routePayload = res.route || res.result || null;
        const trainList =
          (routePayload?.direct_trains?.length
            ? routePayload.direct_trains
            : routePayload?.trains) || [];
        const trains =
          routePayload && trainList.length > 0
            ? { ...routePayload, trains: trainList }
            : null;
        setMessages((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: "assistant",
            text: res.reply || "I couldn't find a good answer yet.",
            trains,
          },
        ]);
      }
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          role: "assistant",
          text: err instanceof Error ? err.message : "Something went wrong. Please try again.",
        },
      ]);
    } finally {
      setSending(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className={cn(
          // Base: column layout, no default sheet padding
          "flex flex-col gap-0 overflow-hidden bg-background p-0 shadow-xl",
          // Mobile (<sm): true full-screen — not a partial right drawer
          "inset-0 h-[100dvh] w-screen max-w-none rounded-none border-0",
          // Override sheetVariants w-3/4 / sm:max-w-sm on all breakpoints
          "!w-screen max-w-none",
          // Desktop: polished right panel
          "sm:inset-y-0 sm:left-auto sm:right-0 sm:h-full sm:!w-full sm:max-w-md sm:border-l sm:border-border/60",
          // Hide the default tiny absolute X; we render a larger header close control
          "[&>button.absolute]:hidden",
        )}
      >
        <SheetHeader className="sticky top-0 z-10 shrink-0 border-b border-border/60 bg-background/95 px-3 py-2.5 backdrop-blur-md supports-[backdrop-filter]:bg-background/80">
          <div className="flex items-center gap-2">
            <SheetClose asChild>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                aria-label="Close Mission AI"
              >
                <ArrowLeft className="h-5 w-5 sm:hidden" />
                <X className="hidden h-5 w-5 sm:block" />
              </button>
            </SheetClose>
            <SheetTitle className="flex min-w-0 flex-1 items-center gap-2 text-left text-base font-semibold">
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
                <MessageSquare className="h-4 w-4" />
              </span>
              <span className="truncate">Mission AI</span>
            </SheetTitle>
            {/* Extra close on mobile for easy reach */}
            <SheetClose asChild>
              <button
                type="button"
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-muted-foreground transition hover:bg-muted/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:hidden"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </SheetClose>
          </div>
          <p className="sr-only">Tell Mission AI your journey in plain language.</p>
        </SheetHeader>

        <div
          ref={listRef}
          className="min-h-0 flex-1 space-y-3 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 sm:px-4"
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={cn(
                "flex",
                msg.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "min-w-0 max-w-[min(100%,28rem)] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                  msg.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "w-full max-w-full border border-border/60 bg-muted/40 text-foreground",
                )}
              >
                <p className="whitespace-pre-wrap break-words">{msg.text}</p>
                {msg.trains ? (
                  <div className="mt-2 w-full min-w-0 max-w-full overflow-x-hidden [&_.mt-6]:mt-2">
                    <ResultsList data={msg.trains} compact />
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          {sending ? (
            <div className="flex justify-start">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-border/60 bg-muted/40 px-3.5 py-2.5 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Thinking…
              </div>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div className="shrink-0 border-t border-border/60 bg-background/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-md supports-[backdrop-filter]:bg-background/90">
          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tell me your journey…"
              disabled={sending}
              className="h-11 min-w-0 flex-1 rounded-xl border-border/60 bg-background/70 text-base sm:text-sm"
            />
            <Button
              type="submit"
              disabled={sending || !input.trim()}
              size="icon"
              className="gradient-primary h-11 w-11 shrink-0 rounded-xl text-primary-foreground"
              aria-label="Send"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
