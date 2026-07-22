// https://github.com/steel-dev/steel-cookbook/tree/main/examples/stripe-projects-web-agent

"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type ToolPart = {
  type: string;
  state?: string;
  toolCallId?: string;
  input?: Record<string, unknown>;
  output?: Record<string, unknown>;
  errorText?: string;
};

type SessionInfo = {
  sessionId: string;
  liveViewUrl: string;
};

type ReportSource = {
  id: string;
  title: string;
  url: string;
};

type ReportFinding = {
  title: string;
  detail: string;
  sourceIds: string[];
};

type AgentReport = {
  title: string;
  summary: string;
  findings: ReportFinding[];
  sources: ReportSource[];
};

const SAMPLE_TASKS = [
  {
    eyebrow: "Messaging teardown",
    text: "Compare the positioning on the Linear, Notion, and Coda homepages. Give me a concise messaging teardown with sources.",
  },
  {
    eyebrow: "Market pulse",
    text: "Research the top three stories on Hacker News and explain why each is getting attention. Cite every story.",
  },
  {
    eyebrow: "Stack research",
    text: "Visit the Vercel, Supabase, and Clerk pricing pages and build a cited starter-stack cost snapshot.",
  },
];

const TOOL_LABELS: Record<string, string> = {
  openSession: "Opened a Steel browser",
  navigate: "Navigated to a source",
  inspectPage: "Inspected page evidence",
  deliverReport: "Assembled the report",
};

function isToolPart(part: unknown): part is ToolPart {
  return Boolean(
    part &&
      typeof part === "object" &&
      "type" in part &&
      typeof (part as { type?: unknown }).type === "string" &&
      (part as { type: string }).type.startsWith("tool-")
  );
}

function toolName(part: ToolPart): string {
  return part.type.slice("tool-".length);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function reportFromPart(part: ToolPart): AgentReport | null {
  if (toolName(part) !== "deliverReport" || part.state !== "output-available") {
    return null;
  }
  const output = part.output;
  if (!isRecord(output)) return null;

  const title = asText(output.title);
  const summary = asText(output.summary);
  if (!title || !summary || !Array.isArray(output.findings) || !Array.isArray(output.sources)) {
    return null;
  }

  const findings = output.findings.flatMap((finding): ReportFinding[] => {
    if (!isRecord(finding)) return [];
    const findingTitle = asText(finding.title);
    const detail = asText(finding.detail);
    if (!findingTitle || !detail) return [];
    return [
      {
        title: findingTitle,
        detail,
        sourceIds: Array.isArray(finding.sourceIds)
          ? finding.sourceIds.filter((id): id is string => typeof id === "string")
          : [],
      },
    ];
  });

  const sources = output.sources.flatMap((source): ReportSource[] => {
    if (!isRecord(source)) return [];
    const id = asText(source.id);
    const sourceTitle = asText(source.title);
    const url = asText(source.url);
    return id && sourceTitle && url ? [{ id, title: sourceTitle, url }] : [];
  });

  return { title, summary, findings, sources };
}

function textFromMessage(message: { parts?: unknown[] }): string {
  return (message.parts ?? [])
    .flatMap((part) => {
      if (!isRecord(part) || part.type !== "text") return [];
      return typeof part.text === "string" ? [part.text] : [];
    })
    .join("\n");
}

function compactUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return `${url.hostname}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return rawUrl;
  }
}

function friendlyErrorMessage(message: string): string {
  try {
    const parsed = JSON.parse(message) as { error?: unknown };
    return typeof parsed.error === "string" ? parsed.error : message;
  } catch {
    return message;
  }
}

function toolDetail(part: ToolPart): string | null {
  const name = toolName(part);
  const output = part.output;
  const input = part.input;

  if (name === "openSession") {
    const id = asText(output?.sessionId);
    return id ? `Session ${id.slice(0, 8)}` : null;
  }
  if (name === "navigate") {
    const url = asText(output?.url) ?? asText(input?.url);
    return url ? compactUrl(url) : null;
  }
  if (name === "inspectPage") {
    return asText(output?.title) ?? "Reading visible content and links";
  }
  if (name === "deliverReport") {
    return asText(output?.title) ?? "Structuring findings and citations";
  }
  return null;
}

function stateLabel(state?: string): string {
  if (state === "output-available") return "done";
  if (state === "output-error" || state === "input-error") return "failed";
  return "running";
}

export default function Page() {
  const transport = useMemo(
    () => new DefaultChatTransport({ api: "/api/chat" }),
    []
  );
  const {
    messages,
    sendMessage,
    status,
    stop,
    error,
    setMessages,
    clearError,
  } = useChat({ transport });
  const [input, setInput] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const activityRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isBusy = status === "submitted" || status === "streaming";
  const hasRun = messages.length > 0;

  const sessions = useMemo<SessionInfo[]>(() => {
    const seen = new Set<string>();
    const result: SessionInfo[] = [];
    for (const message of messages) {
      for (const part of message.parts ?? []) {
        if (!isToolPart(part) || toolName(part) !== "openSession") continue;
        const sessionId = asText(part.output?.sessionId);
        const liveViewUrl = asText(part.output?.liveViewUrl);
        if (!sessionId || !liveViewUrl || seen.has(sessionId)) continue;
        seen.add(sessionId);
        result.push({ sessionId, liveViewUrl });
      }
    }
    return result;
  }, [messages]);

  const toolParts = useMemo<ToolPart[]>(
    () =>
      messages.flatMap((message) =>
        (message.parts ?? []).flatMap((part) =>
          isToolPart(part) ? [part] : []
        )
      ),
    [messages]
  );

  const report = useMemo(() => {
    for (let messageIndex = messages.length - 1; messageIndex >= 0; messageIndex -= 1) {
      const parts = messages[messageIndex]?.parts ?? [];
      for (let partIndex = parts.length - 1; partIndex >= 0; partIndex -= 1) {
        const part = parts[partIndex];
        if (!isToolPart(part)) continue;
        const parsed = reportFromPart(part);
        if (parsed) return parsed;
      }
    }
    return null;
  }, [messages]);

  const userTask = useMemo(() => {
    const message = messages.find((candidate) => candidate.role === "user");
    return message ? textFromMessage(message) : null;
  }, [messages]);

  const activeSession =
    sessions.find((session) => session.sessionId === activeSessionId) ??
    sessions.at(-1) ??
    null;

  useEffect(() => {
    const newest = sessions.at(-1);
    if (newest && !sessions.some((session) => session.sessionId === activeSessionId)) {
      setActiveSessionId(newest.sessionId);
    }
  }, [activeSessionId, sessions]);

  useEffect(() => {
    const element = activityRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [messages, status]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 144)}px`;
  }, [input]);

  function runTask(task: string) {
    const trimmed = task.trim();
    if (!trimmed || isBusy || hasRun) return;
    clearError();
    void sendMessage({ text: trimmed });
    setInput("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runTask(input);
  }

  function handleComposerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      runTask(input);
    }
  }

  function reset() {
    if (isBusy) return;
    setMessages([]);
    clearError();
    setInput("");
    setActiveSessionId(null);
    textareaRef.current?.focus();
  }

  return (
    <main className="studio-shell">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="studio-header">
        <div className="brand-lockup">
          <SteelMark />
          <div>
            <div className="brand-name">Web Agent Studio</div>
            <div className="brand-subtitle">Live research, grounded in the browser</div>
          </div>
        </div>

        <div className="provisioned-stack" aria-label="Provisioned by Stripe Projects">
          <span className="stack-kicker">Provisioned by</span>
          <ProviderPill name="Stripe Projects" tone="stripe" />
          <span className="stack-connector">/</span>
          <ProviderPill name="Steel" />
          <ProviderPill name="OpenRouter" />
          <ProviderPill name="Vercel" />
        </div>

        <div className={`run-status status-${status}`} role="status">
          <span className="status-orbit"><span /></span>
          {status === "error" || error
            ? "Needs attention"
            : isBusy
              ? "Agent running"
              : report
                ? "Report ready"
                : "Ready"}
        </div>
      </header>

      <div className="studio-grid">
        <section className="research-console" aria-label="Research console">
          <div className="console-topline">
            <div>
              <span className="section-index">01</span>
              <span className="section-label">Research brief</span>
            </div>
            {messages.length > 0 && !isBusy ? (
              <button className="text-button" type="button" onClick={reset}>
                New run <ResetIcon />
              </button>
            ) : null}
          </div>

          <div className="activity-scroll" ref={activityRef}>
            {messages.length === 0 ? (
              <Welcome onSelect={runTask} />
            ) : (
              <>
                {userTask ? (
                  <article className="task-card">
                    <div className="task-card-label">Your brief</div>
                    <p>{userTask}</p>
                  </article>
                ) : null}

                <div className="agent-trace" aria-live="polite">
                  <div className="trace-heading">
                    <span>Agent trace</span>
                    <span>{toolParts.length} events</span>
                  </div>
                  {toolParts.map((part, index) => (
                    <ToolEvent
                      key={part.toolCallId ?? `${part.type}-${index}`}
                      part={part}
                      index={index}
                    />
                  ))}
                  {isBusy && toolParts.length === 0 ? <TraceSkeleton /> : null}
                </div>

                {report ? <ReportCard report={report} /> : null}
                {error ? (
                  <div className="error-card" role="alert">
                    <span>Error</span>
                    <p>{friendlyErrorMessage(error.message)}</p>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <form className="composer-wrap" onSubmit={submit}>
            <div className="composer">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={handleComposerKeyDown}
                placeholder={
                  hasRun
                    ? "Start a new run to enter another brief"
                    : "Give the agent a research brief..."
                }
                rows={1}
                maxLength={4_000}
                disabled={isBusy || hasRun}
                aria-label="Research brief"
              />
              {isBusy ? (
                <button
                  type="button"
                  className="composer-action stop-action"
                  onClick={() => void stop()}
                  aria-label="Stop agent"
                >
                  <StopIcon />
                </button>
              ) : hasRun ? (
                <button
                  type="button"
                  className="composer-action run-action"
                  onClick={reset}
                  aria-label="Start new run"
                >
                  <ResetIcon />
                </button>
              ) : (
                <button
                  type="submit"
                  className="composer-action run-action"
                  disabled={!input.trim()}
                  aria-label="Run agent"
                >
                  <ArrowIcon />
                </button>
              )}
            </div>
            <div className="composer-meta">
              <span>
                {isBusy
                  ? "Stop releases every browser session"
                  : hasRun
                    ? "Start a new run to research another brief"
                    : "Enter to run · Shift + Enter for a new line"}
              </span>
              <span>12 steps · 4 browsers · read-only</span>
            </div>
          </form>
        </section>

        <section className="browser-stage" aria-label="Steel Live View">
          <div className="browser-toolbar">
            <div className="browser-title">
              <span className="section-index">02</span>
              <span className="section-label">Steel Live View</span>
              {sessions.length > 0 ? (
                <span className="session-count">{sessions.length}/4</span>
              ) : null}
            </div>
            <div className="session-tabs" role="tablist" aria-label="Browser sessions">
              {sessions.map((session, index) => (
                <button
                  key={session.sessionId}
                  type="button"
                  role="tab"
                  aria-selected={activeSession?.sessionId === session.sessionId}
                  className={activeSession?.sessionId === session.sessionId ? "session-tab active" : "session-tab"}
                  onClick={() => setActiveSessionId(session.sessionId)}
                >
                  <span>{index + 1}</span>
                  {session.sessionId.slice(0, 6)}
                </button>
              ))}
            </div>
            {activeSession ? (
              <a
                className="open-live-view"
                href={activeSession.liveViewUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open Live View in a new tab"
              >
                Open <ExternalIcon />
              </a>
            ) : null}
          </div>

          <div className="browser-viewport">
            <div className="browser-chrome" aria-hidden>
              <div className="traffic-lights"><span /><span /><span /></div>
              <div className="address-ghost">
                <LockIcon />
                {activeSession ? `steel.dev/session/${activeSession.sessionId.slice(0, 10)}` : "Waiting for a browser session"}
              </div>
              <div
                className={`live-indicator ${
                  activeSession ? (isBusy ? "indicator-live" : "indicator-released") : "indicator-standby"
                }`}
              >
                <span />
                {activeSession ? (isBusy ? "LIVE" : "RELEASED") : "STANDBY"}
              </div>
            </div>
            <div className="live-canvas">
              {activeSession ? (
                <iframe
                  key={activeSession.sessionId}
                  src={activeSession.liveViewUrl}
                  title={`Steel Live View session ${activeSession.sessionId.slice(0, 8)}`}
                  sandbox="allow-same-origin allow-scripts"
                />
              ) : (
                <EmptyBrowser isBusy={isBusy} />
              )}
              {activeSession && !isBusy ? (
                <div className="released-overlay">
                  <ShieldIcon />
                  <span>Session released</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="stage-footer">
            <span><ShieldIcon /> Public web only</span>
            <span>Sessions are released when the run ends</span>
          </div>
        </section>
      </div>
    </main>
  );
}

function Welcome({ onSelect }: { onSelect: (task: string) => void }) {
  return (
    <div className="welcome">
      <div className="welcome-kicker"><SparkIcon /> Browser-native research agent</div>
      <h1>Watch the research.<br /><span>Trust the result.</span></h1>
      <p className="welcome-copy">
        Give the agent a brief. It opens real Steel browsers, shows every move live,
        and returns a report tied to the pages it inspected.
      </p>
      <div className="sample-grid">
        {SAMPLE_TASKS.map((task, index) => (
          <button key={task.eyebrow} type="button" onClick={() => onSelect(task.text)}>
            <span className="sample-number">0{index + 1}</span>
            <span className="sample-content">
              <strong>{task.eyebrow}</strong>
              <span>{task.text}</span>
            </span>
            <ArrowIcon />
          </button>
        ))}
      </div>
    </div>
  );
}

function ToolEvent({ part, index }: { part: ToolPart; index: number }) {
  const name = toolName(part);
  const state = stateLabel(part.state);
  const detail = toolDetail(part);
  const expandable = Boolean(part.input || part.output || part.errorText);
  return (
    <div className={`tool-event tool-${state}`}>
      <div className="trace-line" aria-hidden><span /></div>
      <div className="tool-marker"><ToolIcon name={name} /></div>
      <div className="tool-copy">
        <div className="tool-title-row">
          <strong>{TOOL_LABELS[name] ?? name}</strong>
          <span className={`event-state event-${state}`}>{state}</span>
        </div>
        {detail ? <div className="tool-detail">{detail}</div> : null}
        {expandable ? (
          <details className="tool-payload">
            <summary>Event {String(index + 1).padStart(2, "0")} details</summary>
            <pre>{JSON.stringify(part.output ?? part.input ?? part.errorText, null, 2)}</pre>
          </details>
        ) : null}
      </div>
    </div>
  );
}

function TraceSkeleton() {
  return (
    <div className="tool-event tool-running">
      <div className="trace-line" aria-hidden><span /></div>
      <div className="tool-marker"><SpinnerIcon /></div>
      <div className="tool-copy skeleton-copy">
        <strong>Planning the browser run</strong>
        <span />
      </div>
    </div>
  );
}

function ReportCard({ report }: { report: AgentReport }) {
  const sources = new Map(report.sources.map((source) => [source.id, source]));
  return (
    <article className="report-card">
      <div className="report-glow" />
      <header>
        <div className="report-kicker"><CheckIcon /> Grounded report</div>
        <h2>{report.title}</h2>
        <p>{report.summary}</p>
      </header>
      <div className="findings-list">
        {report.findings.map((finding, index) => (
          <section key={`${finding.title}-${index}`}>
            <span className="finding-number">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3>{finding.title}</h3>
              <p>{finding.detail}</p>
              <div className="finding-citations">
                {finding.sourceIds.flatMap((id) => {
                  const source = sources.get(id);
                  return source ? [
                    <a key={id} href={source.url} target="_blank" rel="noreferrer">
                      {id} <ExternalIcon />
                    </a>,
                  ] : [];
                })}
              </div>
            </div>
          </section>
        ))}
      </div>
      <footer className="source-list">
        <div className="source-list-title">Inspected sources</div>
        {report.sources.map((source) => (
          <a key={source.id} href={source.url} target="_blank" rel="noreferrer">
            <span>{source.id}</span>
            <span>{source.title}</span>
            <span>{compactUrl(source.url)}</span>
            <ExternalIcon />
          </a>
        ))}
      </footer>
    </article>
  );
}

function EmptyBrowser({ isBusy }: { isBusy: boolean }) {
  return (
    <div className="empty-browser">
      <div className="radar">
        <span className="radar-ring ring-one" />
        <span className="radar-ring ring-two" />
        <span className="radar-ring ring-three" />
        <span className="radar-sweep" />
        <span className="radar-core"><BrowserIcon /></span>
      </div>
      <div>
        <strong>{isBusy ? "Launching a managed browser" : "Your browser feed starts here"}</strong>
        <p>{isBusy ? "Steel is preparing an isolated session." : "Pick a brief or write your own to watch the agent work."}</p>
      </div>
      <div className="empty-browser-tags">
        <span>Anti-bot ready</span><span>Proxy capable</span><span>Session isolated</span>
      </div>
    </div>
  );
}

function ProviderPill({ name, tone }: { name: string; tone?: string }) {
  return <span className={`provider-pill ${tone ? `provider-${tone}` : ""}`}>{name}</span>;
}

function ToolIcon({ name }: { name: string }) {
  if (name === "openSession") return <BrowserIcon />;
  if (name === "navigate") return <CompassIcon />;
  if (name === "inspectPage") return <ScanIcon />;
  if (name === "deliverReport") return <ReportIcon />;
  return <SparkIcon />;
}

function SteelMark() {
  return <div className="steel-mark" aria-hidden><span>S</span><i /></div>;
}

function ArrowIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden><path d="M4 10h11M11 5l5 5-5 5" /></svg>;
}

function ExternalIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden><path d="M6 3h7v7M13 3 5 11M11 9v4H3V5h4" /></svg>;
}

function ResetIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden><path d="M3 5V2m0 3h3M3.5 5A5.5 5.5 0 1 1 3 10" /></svg>;
}

function StopIcon() {
  return <svg viewBox="0 0 18 18" aria-hidden><rect x="5" y="5" width="8" height="8" rx="1" /></svg>;
}

function SparkIcon() {
  return <svg viewBox="0 0 18 18" aria-hidden><path d="m9 2 1.4 4.6L15 8l-4.6 1.4L9 14l-1.4-4.6L3 8l4.6-1.4L9 2Z" /></svg>;
}

function BrowserIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden><rect x="2.5" y="3.5" width="15" height="13" rx="2" /><path d="M2.5 7h15M6 5.25h.01M8.5 5.25h.01" /></svg>;
}

function CompassIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden><circle cx="10" cy="10" r="7.5" /><path d="m12.8 7.2-1.5 4.1-4.1 1.5 1.5-4.1 4.1-1.5Z" /></svg>;
}

function ScanIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden><path d="M7 3H4a1 1 0 0 0-1 1v3M13 3h3a1 1 0 0 1 1 1v3M7 17H4a1 1 0 0 1-1-1v-3M13 17h3a1 1 0 0 0 1-1v-3M6 10h8" /></svg>;
}

function ReportIcon() {
  return <svg viewBox="0 0 20 20" aria-hidden><path d="M5 2.5h7l3 3V17.5H5v-15Z" /><path d="M12 2.5v3h3M7.5 9h5M7.5 12h5M7.5 15h3" /></svg>;
}

function SpinnerIcon() {
  return <svg className="spinner" viewBox="0 0 20 20" aria-hidden><path d="M17 10a7 7 0 1 1-2.05-4.95" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 18 18" aria-hidden><circle cx="9" cy="9" r="7" /><path d="m6 9 2 2 4-4" /></svg>;
}

function LockIcon() {
  return <svg viewBox="0 0 16 16" aria-hidden><rect x="3.5" y="7" width="9" height="6.5" rx="1.5" /><path d="M5.5 7V5.5a2.5 2.5 0 0 1 5 0V7" /></svg>;
}

function ShieldIcon() {
  return <svg viewBox="0 0 18 18" aria-hidden><path d="M9 2.5 15 5v4.2c0 3.2-2.5 5.3-6 6.3-3.5-1-6-3.1-6-6.3V5l6-2.5Z" /><path d="m6.5 9 1.5 1.5 3.5-3.5" /></svg>;
}
