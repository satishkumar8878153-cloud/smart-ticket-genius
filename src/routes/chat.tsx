import { createFileRoute, Link } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Bot, RefreshCw, Send, Train, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { ThemeToggle } from "@/components/smart-ticket/ThemeToggle";
import { ChatRecommendationCards } from "@/components/smart-ticket/ChatRecommendationCards";
import {
  SUGGESTED_PROMPTS,
  sendChatMessage,
  type ChatMessage,
} from "@/services/chat.service";

export const Route = createFileRoute("/chat")({
  head: () => ({
    meta: [
      { title: "Ask Mission AI — Smart Ticket AI Chat Assistant" },
      {
        name: "description",
        content:
          "Chat with Mission AI to find trains, confirmation chances and Tatkal strategies in plain language.",
      },
      { property: "og:title", content: "Ask Mission AI — Smart Ticket AI" },
      {
        property: "og:description",
        content:
          "Ask about routes, dates and seat confirmation chances and get AI-ranked train recommendations.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ChatPage,
});

function uid() {
  return Math.random().toString(36).slice(2);
}

function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  async function run(text: string, history: ChatMessage[]) {
    setPending(true);
    setError(null);
    setLastAttempt(text);
    try {
      const { reply, result, recommendation } = await sendChatMessage(text, history);
      setMessages((prev) => [
        ...prev,
        { id: uid(), role: "assistant", content: reply, result, recommendation, createdAt: Date.now() },
      ]);
      setLastAttempt(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Mission AI is unavailable right now. Please try again.",
      );
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    const userMsg: ChatMessage = {
      id: uid(),
      role: "user",
      content: trimmed,
      createdAt: Date.now(),
    };
    const history = messages;
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    await run(trimmed, history);
  }

  function retry() {
    if (!lastAttempt) return;
    const history = messages.slice(0, -1);
    void run(lastAttempt, history);
  }

  return (
    <div className="flex h-[100dvh] flex-col bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-32 top-0 h-96 w-96 rounded-full bg-primary/10 blur-3xl" />
        <div className="absolute right-0 top-40 h-96 w-96 rounded-full bg-[color:var(--primary-glow)]/10 blur-3xl" />
      </div>

      <header className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-2.5">
          <Link
            to="/"
            className="grid h-9 w-9 place-items-center rounded-2xl border border-border/60 bg-card/60 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Back to search"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="gradient-primary grid h-10 w-10 place-items-center rounded-2xl text-primary-foreground shadow-elegant">
            <Train className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold leading-tight">Ask Mission AI</h1>
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Chat · Plan · Confirm
            </div>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-3xl space-y-5">
          {messages.length === 0 && (
            <div className="gradient-card rounded-3xl border border-border/60 p-6 shadow-card">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 place-items-center rounded-2xl bg-primary/15 text-primary">
                  <Bot className="h-4.5 w-4.5" />
                </div>
                <div className="text-sm font-semibold">Tell me about your journey</div>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Ask in plain English or Hinglish — I'll find the trains with the best
                confirmation chances.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {SUGGESTED_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => void submit(p)}
                    className="rounded-2xl border border-border/60 bg-card/70 p-3 text-left text-sm text-foreground/90 transition-colors hover:border-primary/50 hover:bg-accent/40"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <div key={m.id} className="space-y-3">
              <div
                className={`flex items-start gap-3 ${m.role === "user" ? "justify-end" : ""}`}
              >
                {m.role === "assistant" && (
                  <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
                    <Bot className="h-4 w-4" />
                  </div>
                )}
                <div
                  className={
                    m.role === "user"
                      ? "max-w-[80%] rounded-3xl rounded-tr-md bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground shadow-elegant"
                      : "max-w-[85%] text-sm leading-relaxed text-foreground/90"
                  }
                >
                  {m.content}
                </div>
                {m.role === "user" && (
                  <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-2xl border border-border/60 bg-card/70 text-muted-foreground">
                    <User className="h-4 w-4" />
                  </div>
                )}
              </div>
              {m.recommendation?.best ? (
                <div className="pl-11">
                  <ChatRecommendationCards data={m.recommendation} />
                </div>
              ) : null}
            </div>
          ))}

          {pending && (
            <div className="flex items-center gap-3">
              <div className="grid h-8 w-8 shrink-0 place-items-center rounded-2xl bg-primary/15 text-primary">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-border/60 bg-card/60 px-3 py-2">
                <Dot delay="0ms" />
                <Dot delay="150ms" />
                <Dot delay="300ms" />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1">
                <div className="font-semibold">Mission AI is unavailable</div>
                <p className="mt-0.5 text-destructive/90">{error}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={retry}
                    disabled={pending || !lastAttempt}
                    className="inline-flex items-center gap-1.5 rounded-full bg-destructive px-3 py-1.5 text-xs font-semibold text-destructive-foreground disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </button>
                  <Link
                    to="/"
                    className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 px-3 py-1.5 text-xs font-semibold text-destructive"
                  >
                    Use search instead
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 border-t border-border/60 bg-background/80 px-4 py-4 backdrop-blur sm:px-6">
        <form
          className="mx-auto flex max-w-3xl items-end gap-2 rounded-3xl border border-border/60 bg-card/70 p-2 shadow-card"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(input);
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            rows={1}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void submit(input);
              }
            }}
            placeholder="e.g. Delhi to Mumbai tomorrow in 3A"
            className="max-h-32 flex-1 resize-none bg-transparent px-3 py-2.5 text-sm outline-none placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={pending || input.trim().length === 0}
            className="gradient-primary grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-primary-foreground shadow-elegant transition-opacity disabled:opacity-40"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function Dot({ delay }: { delay: string }) {
  return (
    <span
      className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted-foreground/70"
      style={{ animationDelay: delay, animationDuration: "1s" }}
    />
  );
}
