// https://github.com/steel-dev/steel-cookbook/tree/main/examples/convex-chat-with-page
// ABOUTME: Split-screen chat app. Left pane is the conversation, right pane
// ABOUTME: slides in with the rendered markdown of whatever page the agent scraped.

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { useThreadMessages, toUIMessages } from "@convex-dev/agent/react";
import { api } from "../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Markdown } from "@/components/Markdown";
import { Spinner } from "@/components/Spinner";
import { ScrapedPagePane } from "@/components/ScrapedPagePane";

const OWNERS = ["alice", "bob"] as const;
type OwnerId = (typeof OWNERS)[number];

export default function App() {
  const [ownerId, setOwnerId] = useState<OwnerId>("alice");
  const [threadsByOwner, setThreadsByOwner] = useState<
    Record<string, string>
  >({});
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const threadId = threadsByOwner[ownerId] ?? null;

  const createThread = useMutation(api.chat.createThreadForOwner);
  const sendMessage = useAction(api.chat.sendMessage);
  const clearForOwner = useMutation(api.scrape.clearForOwner);
  const latestScrape = useQuery(api.scrape.latestForOwner, { ownerId });

  const { results: messages = [] } = useThreadMessages(
    api.chat.listThreadMessages,
    threadId ? { threadId } : "skip",
    { initialNumItems: 50, stream: true },
  );

  useEffect(() => {
    if (!threadId) {
      createThread({ ownerId }).then((id) =>
        setThreadsByOwner((prev) => ({ ...prev, [ownerId]: id })),
      );
    }
  }, [threadId, ownerId, createThread]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!threadId || !input.trim() || sending) return;
    const prompt = input;
    setInput("");
    setSending(true);
    try {
      await sendMessage({ threadId, ownerId, prompt });
    } finally {
      setSending(false);
    }
  };

  const handleClear = async () => {
    setThreadsByOwner((prev) => {
      const next = { ...prev };
      delete next[ownerId];
      return next;
    });
    setInput("");
    setSending(false);
    await clearForOwner({ ownerId });
  };

  // Keep user messages, and only the assistant messages that actually have
  // visible text. An assistant step with just a tool call renders as an empty
  // bubble otherwise.
  const uiMessages = toUIMessages(messages).filter(
    (m) =>
      m.role === "user" ||
      (m.role === "assistant" && (m.text ?? "").trim().length > 0),
  );

  // Only show "thinking…" until the assistant's streamed reply starts
  // landing; once there's visible assistant text at the bottom, the spinner
  // below it is redundant.
  const lastVisible = uiMessages[uiMessages.length - 1];
  const showThinking =
    sending && (!lastVisible || lastVisible.role !== "assistant");

  // Right pane appears once a message is in flight or a scrape exists.
  const paneVisible = sending || !!latestScrape;

  return (
    <div
      className="grid h-full w-full overflow-hidden transition-[grid-template-columns] duration-[450ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
      style={{
        gridTemplateColumns: paneVisible ? "1fr 1fr" : "1fr 0fr",
      }}
    >
      <section className="flex flex-col items-center min-w-0 overflow-hidden">
        <div
          className={
            paneVisible
              ? "flex flex-1 flex-col min-h-0 px-6 py-8 w-full"
              : "flex flex-1 flex-col min-h-0 px-6 py-8 w-full max-w-2xl"
          }
        >
          <header className="mb-6 flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">
                Chat with any webpage
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Paste a URL, ask a question — answered live via a cloud browser.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="text-muted-foreground hover:text-foreground"
            >
              Clear
            </Button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto pb-4">
            {uiMessages.length === 0 && (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Try:{" "}
                <span className="text-foreground">
                  What's on https://en.wikipedia.org/wiki/Steel?
                </span>
              </div>
            )}

            {uiMessages.map((m) => (
              <div
                key={m.key}
                className={
                  m.role === "user"
                    ? "ml-auto max-w-[85%] rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground"
                    : "mr-auto max-w-[95%] rounded-md border border-border bg-muted px-4 py-3"
                }
              >
                {m.role === "assistant" ? (
                  <Markdown>{m.text ?? ""}</Markdown>
                ) : (
                  <span className="whitespace-pre-wrap">{m.text}</span>
                )}
              </div>
            ))}

            {showThinking && (
              <div className="mr-auto flex items-center gap-2 rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground">
                <Spinner />
                <span>thinking…</span>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          <form onSubmit={submit} className="mt-2 flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about https://en.wikipedia.org/wiki/Steel"
              disabled={!threadId || sending}
            />
            <Button
              type="submit"
              disabled={!threadId || !input.trim() || sending}
            >
              Send
            </Button>
          </form>

          <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <span>owner:</span>
            {OWNERS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setOwnerId(id)}
                className={
                  id === ownerId
                    ? "rounded-full bg-primary px-2.5 py-0.5 font-medium text-primary-foreground"
                    : "rounded-full border border-border px-2.5 py-0.5 hover:text-foreground"
                }
              >
                {id}
              </button>
            ))}
          </div>
        </div>
      </section>

      <aside className="overflow-hidden min-w-0">
        <ScrapedPagePane scrape={latestScrape ?? null} pending={sending} />
      </aside>
    </div>
  );
}
