"use client";

import { useChat } from "@ai-sdk/react";
import { useMemo, useState } from "react";

export default function Page() {
  const { messages, sendMessage, status } = useChat();
  const [input, setInput] = useState("");

  // The Steel Live View URL lives inside the openSession tool's output.
  // We walk every message part and pluck it out so the iframe updates
  // the moment the agent opens a session.
  const liveViewUrl = useMemo(() => {
    for (const m of messages) {
      for (const part of (m.parts ?? []) as any[]) {
        if (
          part?.type === "tool-openSession" &&
          part?.output?.liveViewUrl
        ) {
          return part.output.liveViewUrl as string;
        }
      }
    }
    return null;
  }, [messages]);

  return (
    <main
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(360px, 1fr) 1.3fr",
        height: "100vh",
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
            fontSize: 14,
          }}
        >
          <strong>Steel + AI SDK v6</strong>
          <span style={{ opacity: 0.6, marginLeft: 8 }}>
            browser agent • {status}
          </span>
        </header>

        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {messages.length === 0 && (
            <div style={{ opacity: 0.6, fontSize: 14 }}>
              <p>
                Try:{" "}
                <em>
                  Go to https://github.com/trending/python and tell me the top
                  3 AI/ML repos.
                </em>
              </p>
            </div>
          )}
          {messages.map((m) => (
            <Message key={m.id} message={m} />
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim()) return;
            sendMessage({ text: input });
            setInput("");
          }}
          style={{
            padding: 12,
            borderTop: "1px solid #1f1f1f",
            display: "flex",
            gap: 8,
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the agent to visit a page and extract something..."
            style={{
              flex: 1,
              padding: "10px 12px",
              borderRadius: 6,
              border: "1px solid #333",
              background: "#111",
              color: "#e5e5e5",
            }}
          />
          <button
            type="submit"
            disabled={status === "streaming" || status === "submitted"}
            style={{
              padding: "10px 16px",
              borderRadius: 6,
              border: "1px solid #333",
              background: "#e5e5e5",
              color: "#0a0a0a",
              fontWeight: 600,
              opacity:
                status === "streaming" || status === "submitted" ? 0.5 : 1,
            }}
          >
            Send
          </button>
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
            fontSize: 14,
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <strong>Live View</strong>
          {liveViewUrl && (
            <a href={liveViewUrl} target="_blank" rel="noreferrer">
              open in new tab ↗
            </a>
          )}
        </header>
        <div style={{ flex: 1, background: "#050505", position: "relative" }}>
          {liveViewUrl ? (
            <iframe
              src={liveViewUrl}
              sandbox="allow-same-origin allow-scripts"
              style={{
                border: 0,
                width: "100%",
                height: "100%",
              }}
            />
          ) : (
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "grid",
                placeItems: "center",
                color: "#555",
                fontSize: 14,
              }}
            >
              The live browser appears here once the agent opens a session.
            </div>
          )}
        </div>
      </aside>
    </main>
  );
}

function Message({ message }: { message: any }) {
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
      <div style={{ fontSize: 11, opacity: 0.5, marginBottom: 4 }}>
        {isUser ? "you" : "agent"}
      </div>
      <div
        style={{
          maxWidth: "90%",
          background: isUser ? "#1e293b" : "#111",
          border: "1px solid #1f1f1f",
          padding: "10px 12px",
          borderRadius: 8,
          fontSize: 14,
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
        }}
      >
        {(message.parts ?? []).map((part: any, i: number) => {
          if (part.type === "text") {
            return <span key={i}>{part.text}</span>;
          }
          if (typeof part.type === "string" && part.type.startsWith("tool-")) {
            return <ToolCall key={i} part={part} />;
          }
          return null;
        })}
      </div>
    </div>
  );
}

function ToolCall({ part }: { part: any }) {
  const name = String(part.type).replace(/^tool-/, "");
  const state = part.state ?? "done";
  return (
    <div
      style={{
        marginTop: 6,
        padding: "6px 8px",
        background: "#0a0a0a",
        border: "1px solid #222",
        borderRadius: 6,
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
        fontSize: 12,
      }}
    >
      <div style={{ opacity: 0.7 }}>
        <strong>{name}</strong> · {state}
      </div>
      {part.input && (
        <pre style={{ margin: "4px 0 0", whiteSpace: "pre-wrap" }}>
          {JSON.stringify(part.input, null, 2)}
        </pre>
      )}
      {part.output && (
        <pre
          style={{
            margin: "4px 0 0",
            whiteSpace: "pre-wrap",
            color: "#86efac",
          }}
        >
          {JSON.stringify(part.output, null, 2)}
        </pre>
      )}
    </div>
  );
}
