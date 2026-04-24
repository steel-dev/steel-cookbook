// https://github.com/steel-dev/steel-cookbook/tree/main/examples/vercel-ai-sdk-nextjs

"use client";

import { useChat } from "@ai-sdk/react";
import DOMPurify from "isomorphic-dompurify";
import { marked } from "marked";
import { useEffect, useMemo, useRef, useState } from "react";

marked.setOptions({ gfm: true, breaks: true });

function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false }) as string;
  return DOMPurify.sanitize(html);
}

const mono =
  "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

const kbdStyle: React.CSSProperties = {
  fontFamily: mono,
  fontSize: 10,
  padding: "1px 5px",
  borderRadius: 4,
  border: "1px solid #2a2a2a",
  background: "#141414",
  color: "#a3a3a3",
};

// One color per parallel session slot. Order of session appearance maps
// 1:1 to this palette, so a session's badge, grid cell, and every tool-call
// card that operates on it share the same accent.
const SESSION_COLORS = [
  "#f59e0b", // amber
  "#38bdf8", // sky
  "#a78bfa", // violet
  "#34d399", // emerald
];

function colorForSession(index: number): string {
  return SESSION_COLORS[index % SESSION_COLORS.length];
}

function sessionGridStyle(n: number): React.CSSProperties {
  if (n <= 1)
    return { gridTemplateColumns: "1fr", gridTemplateRows: "1fr" };
  if (n === 2)
    return { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr" };
  return { gridTemplateColumns: "1fr 1fr", gridTemplateRows: "1fr 1fr" };
}

type SessionInfo = {
  sessionId: string;
  debugUrl: string | null;
  liveViewUrl: string | null;
};

const examples = [
  "Go to https://github.com/trending/python and tell me the top 3 AI/ML repos.",
  "Visit https://news.ycombinator.com and list the top 5 front-page stories.",
  "Navigate to https://vercel.com and summarize their homepage in 2 sentences.",
  "Compare trending repos in parallel: one each from github.com/trending/python, github.com/trending/javascript, github.com/trending/rust, and github.com/trending/go. List the top 3 per language.",
];

type DurationEntry = { start: number; end?: number };

export default function Page() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const durationsRef = useRef<Record<string, DurationEntry>>({});

  // Every openSession tool-call emits an iframe-ready debugUrl. We collect
  // them in order of appearance so the live-view grid can render each one
  // with a stable slot index (S1, S2, ...). Dedup by sessionId in case the
  // same part is visited twice as it streams.
  const sessions = useMemo<SessionInfo[]>(() => {
    const seen = new Set<string>();
    const out: SessionInfo[] = [];
    for (const m of messages) {
      for (const part of (m.parts ?? []) as any[]) {
        if (part?.type === "tool-openSession" && part?.output) {
          const id = part.output.sessionId as string | undefined;
          if (!id || seen.has(id)) continue;
          seen.add(id);
          out.push({
            sessionId: id,
            debugUrl: (part.output.debugUrl ?? null) as string | null,
            liveViewUrl: (part.output.liveViewUrl ?? null) as string | null,
          });
        }
      }
    }
    return out;
  }, [messages]);

  // sessionId -> display slot, so tool-call cards can pick the matching
  // accent color without having to know the grid layout.
  const sessionIndex = useMemo(() => {
    const m = new Map<string, number>();
    sessions.forEach((s, i) => m.set(s.sessionId, i));
    return m;
  }, [sessions]);

  // Auto-scroll to bottom whenever messages update or status changes.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, status]);

  // Track tool-call wall-clock time: record start on first sighting,
  // end when the part transitions to output-available / output-error.
  useEffect(() => {
    const d = durationsRef.current;
    for (const m of messages) {
      for (const part of (m.parts ?? []) as any[]) {
        const id = part?.toolCallId as string | undefined;
        if (!id) continue;
        if (!d[id]) d[id] = { start: Date.now() };
        if (
          !d[id].end &&
          (part.state === "output-available" || part.state === "output-error")
        ) {
          d[id].end = Date.now();
        }
      }
    }
  }, [messages]);

  const isBusy = status === "submitted" || status === "streaming";

  const handleSubmit = (text: string) => {
    const t = text.trim();
    if (!t || isBusy) return;
    sendMessage({ text: t });
    setInput("");
  };

  // Auto-grow the textarea up to the CSS max-height.
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${ta.scrollHeight}px`;
  }, [input]);

  return (
    <main
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(360px, 1fr) 1.3fr",
        gridTemplateRows: "minmax(0, 1fr)",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      <section
        style={{
          borderRight: "1px solid #1f1f1f",
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <header
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #1f1f1f",
            fontSize: 13,
            fontFamily: mono,
            letterSpacing: "-0.01em",
            display: "flex",
            alignItems: "center",
          }}
        >
          <StatusDot status={status} />
          <strong>steel × ai-sdk v6</strong>
          <span style={{ opacity: 0.55, marginLeft: 8 }}>
            browser agent · {status}
          </span>
        </header>

        <div
          ref={scrollRef}
          style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}
        >
          {messages.length === 0 && (
            <EmptyState onPick={handleSubmit} />
          )}
          {messages.map((m) => (
            <Message
              key={m.id}
              message={m}
              durations={durationsRef.current}
              sessionIndex={sessionIndex}
            />
          ))}
          {isBusy && <ThinkingIndicator />}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSubmit(input);
          }}
          style={{
            padding: 16,
            borderTop: "1px solid #1f1f1f",
          }}
        >
          <div className="chat-composer">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  handleSubmit(input);
                }
              }}
              placeholder="Ask the agent to visit a page..."
              rows={1}
            />
            <button
              type="submit"
              className="chat-send"
              disabled={isBusy || !input.trim()}
              aria-label="Send"
            >
              {isBusy ? <SpinnerIcon /> : <ArrowUpIcon />}
            </button>
          </div>
          <div
            style={{
              marginTop: 8,
              fontSize: 11,
              opacity: 0.4,
              fontFamily: mono,
              textAlign: "center",
            }}
          >
            <kbd style={kbdStyle}>↵</kbd> to send
            <span style={{ margin: "0 8px", opacity: 0.6 }}>·</span>
            <kbd style={kbdStyle}>⇧</kbd>
            <kbd style={{ ...kbdStyle, marginLeft: 2 }}>↵</kbd> for newline
          </div>
        </form>
      </section>

      <aside
        style={{
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <header
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid #1f1f1f",
            fontSize: 13,
            fontFamily: mono,
            letterSpacing: "-0.01em",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <strong>live view</strong>
          <span style={{ opacity: 0.55, fontSize: 11 }}>
            {sessions.length === 0
              ? "no session"
              : `${sessions.length} session${sessions.length > 1 ? "s" : ""}`}
          </span>
        </header>
        <div
          style={{
            flex: 1,
            display: "grid",
            // Grid gap + container bg = seam lines between cells for free.
            background: sessions.length > 1 ? "#1f1f1f" : "#050505",
            gap: sessions.length > 1 ? 1 : 0,
            minHeight: 0,
            ...sessionGridStyle(sessions.length),
          }}
        >
          {sessions.length === 0 ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#555",
                fontSize: 14,
                padding: 24,
                textAlign: "center",
              }}
            >
              The live browser appears here once the agent opens a session.
            </div>
          ) : (
            sessions.map((s, i) => (
              <SessionCell key={s.sessionId} session={s} index={i} />
            ))
          )}
        </div>
      </aside>
    </main>
  );
}

function ArrowUpIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
    >
      <path
        d="M7 11.5V2.5M7 2.5L3 6.5M7 2.5L11 6.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function SpinnerIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden
      style={{ animation: "steel-spin 0.9s linear infinite" }}
    >
      <path
        d="M7 1.5a5.5 5.5 0 1 1-5.5 5.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === "error"
      ? "#ef4444"
      : status === "submitted" || status === "streaming"
        ? "#f59e0b"
        : "#22c55e";
  const pulse = status === "submitted" || status === "streaming";
  return (
    <span
      aria-hidden
      style={{
        width: 8,
        height: 8,
        borderRadius: "50%",
        background: color,
        display: "inline-block",
        marginRight: 10,
        flexShrink: 0,
        animation: pulse ? "steel-pulse 1.4s ease-in-out infinite" : undefined,
        boxShadow: pulse ? `0 0 8px ${color}` : undefined,
      }}
    />
  );
}

function ThinkingIndicator() {
  return (
    <div
      style={{
        fontFamily: mono,
        fontSize: 12,
        opacity: 0.55,
        padding: "4px 2px",
      }}
    >
      agent is thinking
      <span className="thinking-dots">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div style={{ maxWidth: 520 }}>
      <p
        style={{
          opacity: 0.55,
          fontSize: 12,
          marginBottom: 12,
          fontFamily: mono,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
        }}
      >
        try one of these
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {examples.map((text) => (
          <button
            key={text}
            onClick={() => onPick(text)}
            style={{
              textAlign: "left",
              padding: "10px 12px",
              background: "#0f0f0f",
              border: "1px solid #1f1f1f",
              borderRadius: 8,
              color: "#d4d4d4",
              fontSize: 13,
              lineHeight: 1.5,
              cursor: "pointer",
              transition: "background 120ms, border-color 120ms",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "#141414";
              e.currentTarget.style.borderColor = "#2a2a2a";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "#0f0f0f";
              e.currentTarget.style.borderColor = "#1f1f1f";
            }}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function Message({
  message,
  durations,
  sessionIndex,
}: {
  message: any;
  durations: Record<string, DurationEntry>;
  sessionIndex: Map<string, number>;
}) {
  const isUser = message.role === "user";
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: isUser ? "flex-end" : "flex-start",
        marginBottom: 16,
      }}
    >
      <div
        style={{
          fontSize: 11,
          opacity: 0.5,
          marginBottom: 4,
          fontFamily: mono,
          letterSpacing: "0.02em",
          textTransform: "uppercase",
        }}
      >
        {isUser ? "you" : "agent"}
      </div>
      <div
        style={{
          maxWidth: "90%",
          minWidth: 0,
          background: isUser ? "#1e293b" : "#111",
          border: "1px solid #1f1f1f",
          padding: "10px 12px",
          borderRadius: 8,
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: isUser ? "pre-wrap" : "normal",
          overflowWrap: "anywhere",
        }}
      >
        {(message.parts ?? []).map((part: any, i: number) => {
          if (part.type === "text") {
            if (isUser) return <span key={i}>{part.text}</span>;
            return (
              <div
                key={i}
                className="md"
                dangerouslySetInnerHTML={{
                  __html: renderMarkdown(part.text),
                }}
              />
            );
          }
          if (typeof part.type === "string" && part.type.startsWith("tool-")) {
            return (
              <ToolCall
                key={i}
                part={part}
                durations={durations}
                sessionIndex={sessionIndex}
              />
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function toolStateColor(state: string): string {
  if (state === "output-error" || state === "input-error") return "#ef4444";
  if (state === "output-available") return "#22c55e";
  if (state === "input-streaming" || state === "input-available")
    return "#f59e0b";
  return "#6b7280";
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function ToolCall({
  part,
  durations,
  sessionIndex,
}: {
  part: any;
  durations: Record<string, DurationEntry>;
  sessionIndex: Map<string, number>;
}) {
  const name = String(part.type).replace(/^tool-/, "");
  const state = part.state ?? "done";
  const [expanded, setExpanded] = useState(false);

  const hasBody = Boolean(part.input || part.output);
  const entry = part.toolCallId ? durations[part.toolCallId] : undefined;
  const durationMs = entry?.end ? entry.end - entry.start : null;

  const stateColor = toolStateColor(state);
  const isPending = state === "input-streaming" || state === "input-available";

  // navigate/snapshot/extract carry sessionId in input; openSession emits
  // it in output. Either way, look it up to pick the session accent color.
  const toolSessionId: string | undefined =
    part.input?.sessionId ?? part.output?.sessionId;
  const sIdx =
    toolSessionId != null ? sessionIndex.get(toolSessionId) : undefined;
  const sColor = sIdx != null ? colorForSession(sIdx) : null;

  return (
    <div
      style={{
        marginTop: 6,
        padding: "6px 8px",
        background: "#0a0a0a",
        border: "1px solid #222",
        borderLeft: sColor ? `2px solid ${sColor}` : "1px solid #222",
        borderRadius: 6,
        fontFamily: mono,
        fontSize: 12,
        minWidth: 0,
      }}
    >
      <div
        onClick={() => hasBody && setExpanded((v) => !v)}
        style={{
          cursor: hasBody ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          gap: 6,
          userSelect: "none",
        }}
      >
        {hasBody && (
          <span
            style={{
              fontSize: 10,
              width: 10,
              display: "inline-block",
              opacity: 0.6,
            }}
          >
            {expanded ? "▼" : "▶"}
          </span>
        )}
        <span
          aria-hidden
          style={{
            width: 6,
            height: 6,
            borderRadius: "50%",
            background: stateColor,
            display: "inline-block",
            flexShrink: 0,
            animation: isPending
              ? "steel-pulse 1.4s ease-in-out infinite"
              : undefined,
          }}
        />
        <strong>{name}</strong>
        {sIdx != null && (
          <span
            style={{
              fontSize: 10,
              fontWeight: 600,
              color: sColor ?? undefined,
              opacity: 0.85,
              letterSpacing: "0.02em",
            }}
          >
            S{sIdx + 1}
          </span>
        )}
        <span style={{ opacity: 0.55 }}>· {state}</span>
        {durationMs != null && (
          <span style={{ opacity: 0.45, marginLeft: "auto" }}>
            {formatDuration(durationMs)}
          </span>
        )}
      </div>
      {expanded && part.input && (
        <pre
          style={{
            margin: "4px 0 0",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            maxHeight: 240,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {JSON.stringify(part.input, null, 2)}
        </pre>
      )}
      {expanded && part.output && (
        <pre
          style={{
            margin: "4px 0 0",
            whiteSpace: "pre-wrap",
            overflowWrap: "anywhere",
            color: "#86efac",
            maxHeight: 320,
            overflowY: "auto",
            overflowX: "hidden",
          }}
        >
          {JSON.stringify(part.output, null, 2)}
        </pre>
      )}
    </div>
  );
}

function SessionCell({
  session,
  index,
}: {
  session: SessionInfo;
  index: number;
}) {
  const color = colorForSession(index);
  return (
    <div
      style={{
        background: "#050505",
        display: "flex",
        flexDirection: "column",
        minWidth: 0,
        minHeight: 0,
      }}
    >
      <div
        style={{
          padding: "6px 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 11,
          fontFamily: mono,
          background: "#0a0a0a",
          borderBottom: "1px solid #1a1a1a",
        }}
      >
        <SessionBadge index={index} />
        <span
          style={{
            opacity: 0.5,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {session.sessionId.slice(0, 8)}
        </span>
        {(session.liveViewUrl || session.debugUrl) && (
          <a
            href={session.liveViewUrl ?? session.debugUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            style={{
              marginLeft: "auto",
              fontSize: 11,
              flexShrink: 0,
              color,
              opacity: 0.75,
            }}
            aria-label="Open session in new tab"
          >
            ↗
          </a>
        )}
      </div>
      <div style={{ flex: 1, position: "relative", minHeight: 0 }}>
        {session.debugUrl ? (
          <iframe
            src={session.debugUrl}
            sandbox="allow-same-origin allow-scripts"
            style={{ border: 0, width: "100%", height: "100%" }}
          />
        ) : (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "grid",
              placeItems: "center",
              color: "#555",
              fontSize: 12,
              fontFamily: mono,
            }}
          >
            opening…
          </div>
        )}
      </div>
    </div>
  );
}

function SessionBadge({ index }: { index: number }) {
  const color = colorForSession(index);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 22,
        height: 18,
        padding: "0 6px",
        borderRadius: 4,
        background: `${color}22`,
        color,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: mono,
        letterSpacing: "0.02em",
        flexShrink: 0,
      }}
    >
      S{index + 1}
    </span>
  );
}
