import { Loader2, MessageSquare, Send } from "lucide-react";
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
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

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
        className="flex w-full max-w-full flex-col border-border/60 bg-background p-0 sm:max-w-md"
      >
        <SheetHeader className="border-b border-border/60 px-4 py-3">
          <SheetTitle className="flex items-center gap-2 text-base">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
              <MessageSquare className="h-4 w-4" />
            </span>
            Mission AI
          </SheetTitle>
        </SheetHeader>

        <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  msg.role === "user"
                    ? "bg-indigo-600 text-white"
                    : "border border-border/60 bg-muted/40 text-foreground"
                }`}
              >
                <p className="whitespace-pre-wrap">{msg.text}</p>
                {msg.trains ? (
                  <div className="mt-2 w-full min-w-0 max-w-full [&_.mt-6]:mt-2">
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

        <div className="border-t border-border/60 p-3">
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
              placeholder="e.g. Bhagalpur to Patna tomorrow in SL"
              disabled={sending}
              className="h-11 flex-1 rounded-xl border-border/60 bg-background/70"
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
