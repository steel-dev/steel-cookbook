import React, { useMemo, useState, useEffect } from "react";
import ReactDOM from "react-dom/client";
import clsx, { type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import "./index.css";

/* ------------------------------- utils/cn -------------------------------- */
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/* ----------------------------- shadcn/ui Card ---------------------------- */
function Card(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return (
    <div
      className={cn(
        "rounded-lg border bg-card text-card-foreground shadow-sm",
        className,
      )}
      {...rest}
    />
  );
}

function CardHeader(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return (
    <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...rest} />
  );
}

function CardTitle(props: React.HTMLAttributes<HTMLHeadingElement>) {
  const { className, ...rest } = props;
  return (
    <h3
      className={cn(
        "text-2xl font-semibold leading-none tracking-tight",
        className,
      )}
      {...rest}
    />
  );
}

function CardDescription(props: React.HTMLAttributes<HTMLParagraphElement>) {
  const { className, ...rest } = props;
  return (
    <p className={cn("text-sm text-muted-foreground", className)} {...rest} />
  );
}

function CardContent(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return <div className={cn("p-6 pt-0", className)} {...rest} />;
}

function CardFooter(props: React.HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return (
    <div className={cn("flex items-center p-6 pt-0", className)} {...rest} />
  );
}

/* ---------------------------------- Chart --------------------------------- */
type Datum = { label: string; value: number; color?: string };

function hashToHue(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 360;
}

function PlaceholderBarChart(props: { data: Datum[]; height?: number }) {
  const { data, height = 280 } = props;
  const max = useMemo(() => Math.max(1, ...data.map((d) => d.value)), [data]);
  const barGap = 12;
  const barW = Math.max(
    12,
    Math.floor((960 - barGap * (data.length - 1)) / Math.max(1, data.length)),
  );

  return (
    <div className="w-full overflow-hidden">
      <svg
        viewBox={`0 0 960 ${height}`}
        role="img"
        aria-label="Placeholder chart"
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
      >
        {/* Axes */}
        <line
          x1="56"
          y1="16"
          x2="56"
          y2={height - 40}
          stroke="hsl(var(--muted-foreground) / 0.4)"
          strokeWidth="1"
        />
        <line
          x1="56"
          y1={height - 40}
          x2="940"
          y2={height - 40}
          stroke="hsl(var(--muted-foreground) / 0.4)"
          strokeWidth="1"
        />

        {/* Horizontal grid and labels */}
        {Array.from({ length: 5 }).map((_, i) => {
          const y = 16 + ((height - 56) / 4) * i; // 16 top padding, 40 bottom + some headroom
          const label = Math.round(((4 - i) / 4) * max);
          return (
            <g key={i}>
              <line
                x1="56"
                y1={y}
                x2="940"
                y2={y}
                stroke="hsl(var(--muted-foreground) / 0.15)"
                strokeWidth="1"
              />
              <text
                x="48"
                y={y + 4}
                textAnchor="end"
                fontSize="11"
                fill="hsl(var(--muted-foreground))"
              >
                {label.toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {data.map((d, i) => {
          const x = 56 + i * (barW + barGap);
          const innerH = height - 56; // top 16, bottom 40
          const h = Math.max(2, Math.round((d.value / max) * innerH));
          const y = 16 + innerH - h;
          const hue = d.color ? undefined : hashToHue(d.label);
          const fill = d.color || `hsl(${hue} 70% 55%)`;
          return (
            <g key={d.label}>
              <rect x={x} y={y} width={barW} height={h} rx="5" fill={fill} />
              <text
                x={x + barW / 2}
                y={y - 6}
                textAnchor="middle"
                fontSize="11"
                fill="hsl(var(--muted-foreground))"
              >
                {Math.round(d.value).toLocaleString()}
              </text>
              <text
                x={x + barW / 2}
                y={height - 20}
                textAnchor="middle"
                fontSize="12"
                fill="hsl(var(--foreground) / 0.9)"
              >
                {d.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ----------------------------------- App ---------------------------------- */
function App() {
  const sample: Datum[] = [
    { label: "chatgpt", value: 82 },
    { label: "gemini", value: 65 },
    { label: "qwen", value: 74 },
    { label: "perplexity", value: 58 },
    { label: "meta", value: 69 },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <h1 className="text-xl font-semibold tracking-tight">
            LLM Results Dashboard
          </h1>
          <p className="text-sm text-muted-foreground">
            Placeholder chart using shadcn/ui Card — wire to your API when
            ready.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8 grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Provider Metrics</CardTitle>
            <CardDescription>
              Default placeholder chart. Replace with live data from /results or
              your preferred chart library.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlaceholderBarChart data={sample} />
          </CardContent>
          <CardFooter>
            <span className="text-sm text-muted-foreground">
              Tip: open two terminals and run the server and this app
              concurrently. Proxy routes are configured in Vite.
            </span>
          </CardFooter>
        </Card>
      </main>
    </div>
  );
}

/* ---------------------------------- Dashboard (new) ------------------------ */
type RankItem = {
  rank: number;
  name: string;
  percent: number; // 0..100
  delta: number; // +/- %
  badge?: string; // optional initial/logo text
};

function MetricDeltaBadge({ delta }: { delta: number }) {
  const up = delta >= 0;
  const color = up
    ? "text-emerald-400 bg-emerald-400/10 border-emerald-400/20"
    : "text-red-400 bg-red-400/10 border-red-400/20";
  const sign = up ? "+" : "";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        color,
      )}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        className={cn("shrink-0", up ? "rotate-0" : "rotate-180")}
      >
        <path d="M12 5l7 7H5l7-7z" fill="currentColor" />
      </svg>
      {sign}
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

function RankRow({ item }: { item: RankItem }) {
  const up = item.delta >= 0;
  return (
    <div className="grid grid-cols-[24px_1fr_auto_auto] items-center gap-3 py-3 border-b last:border-0">
      <div className="text-sm text-muted-foreground">{item.rank}</div>
      <div className="flex items-center gap-2">
        <div className="flex h-6 w-6 items-center justify-center rounded-md border bg-muted text-xs font-semibold">
          {item.badge ?? item.name.charAt(0)}
        </div>
        <div className="text-sm">{item.name}</div>
      </div>
      <div
        className={cn(
          "text-sm font-medium",
          up ? "text-emerald-400" : "text-red-400",
        )}
      >
        {up ? "↑" : "↓"} {Math.abs(item.delta).toFixed(0)}%
      </div>
      <div className="text-sm tabular-nums text-muted-foreground">
        {item.percent.toFixed(1)}%
      </div>
    </div>
  );
}

/* Lightweight line chart with grid + gradient fill (0..100 y-range) */
function LineChartLight({ points }: { points: number[] }) {
  const w = 720;
  const h = 280;
  const pad = { t: 16, r: 16, b: 36, l: 44 };
  const innerW = w - pad.l - pad.r;
  const innerH = h - pad.t - pad.b;

  const xs = points.map(
    (_, i) => (i / Math.max(1, points.length - 1)) * innerW + pad.l,
  );
  const ys = points.map((v) => {
    const clamped = Math.max(0, Math.min(100, v));
    const y = pad.t + (1 - clamped / 100) * innerH;
    return y;
  });

  const d = points
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"} ${xs[i].toFixed(2)} ${ys[i].toFixed(2)}`,
    )
    .join(" ");

  // area path to baseline
  const area =
    `M ${xs[0].toFixed(2)} ${ys[0].toFixed(2)} ` +
    points
      .map((_, i) => `L ${xs[i].toFixed(2)} ${ys[i].toFixed(2)}`)
      .join(" ") +
    ` L ${xs[xs.length - 1].toFixed(2)} ${pad.t + innerH} L ${xs[0].toFixed(2)} ${pad.t + innerH} Z`;

  const ticks = [0, 25, 50, 75, 100];

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="w-full h-auto"
      role="img"
      aria-label="Visibility line chart"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="fillGreen" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(140 70% 45%)" stopOpacity="0.25" />
          <stop offset="100%" stopColor="hsl(140 70% 45%)" stopOpacity="0.02" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="2.5" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* grid */}
      {ticks.map((t) => {
        const y = pad.t + (1 - t / 100) * innerH;
        return (
          <g key={t}>
            <line
              x1={pad.l}
              y1={y}
              x2={pad.l + innerW}
              y2={y}
              stroke="hsl(var(--muted-foreground)/0.15)"
              strokeWidth={1}
              strokeDasharray="4 6"
            />
            <text
              x={pad.l - 8}
              y={y + 4}
              textAnchor="end"
              fontSize="11"
              fill="hsl(var(--muted-foreground))"
            >
              {t}%
            </text>
          </g>
        );
      })}

      {/* axes */}
      <line
        x1={pad.l}
        y1={pad.t}
        x2={pad.l}
        y2={pad.t + innerH}
        stroke="hsl(var(--muted-foreground)/0.35)"
      />
      <line
        x1={pad.l}
        y1={pad.t + innerH}
        x2={pad.l + innerW}
        y2={pad.t + innerH}
        stroke="hsl(var(--muted-foreground)/0.35)"
      />

      {/* area + line */}
      <path d={area} fill="url(#fillGreen)" />
      <path
        d={d}
        fill="none"
        stroke="hsl(140 70% 45%)"
        strokeWidth={2}
        filter="url(#glow)"
      />
    </svg>
  );
}

function Dashboard() {
  const visibility = 89.8;
  const delta = 1.0;

  // Example last-8-days shape (0..100)
  const line = [98, 90, 96, 80, 84, 88, 85, 79];

  const ranks: RankItem[] = [
    { rank: 1, name: "Chase", percent: 92.0, delta: 5.0, badge: "" },
    { rank: 2, name: "Rho", percent: 89.8, delta: 1.0, badge: "R" },
    {
      rank: 3,
      name: "American Express",
      percent: 85.2,
      delta: -1.0,
      badge: "AM",
    },
    { rank: 4, name: "Capital on Tap", percent: 78.0, delta: 5.0, badge: "C" },
    { rank: 5, name: "US bank", percent: 76.9, delta: -2.0, badge: "US" },
    { rank: 6, name: "Bill", percent: 72.3, delta: 1.8, badge: "b" },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto max-w-7xl px-6 py-5">
          <h1 className="text-lg font-semibold tracking-tight">
            Brand visibility
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Percentage of AI answers about Business credit cards that mention
            Rho
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8 grid gap-6 lg:grid-cols-12">
        {/* Left: visibility score + line chart */}
        <Card className="lg:col-span-7">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Visibility score</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex items-baseline justify-between">
              <div className="text-4xl font-semibold">
                {visibility.toFixed(1)}%
              </div>
              <div className="flex items-center gap-2">
                <MetricDeltaBadge delta={delta} />
                <span className="text-xs text-muted-foreground">
                  vs last week
                </span>
              </div>
            </div>
            <div className="mt-4 rounded-md border bg-card">
              <LineChartLight points={line} />
            </div>
          </CardContent>
        </Card>

        {/* Right: ranking */}
        <Card className="lg:col-span-5">
          <CardHeader className="pb-4">
            <CardTitle className="text-base">Brand Industry Ranking</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="divide-y">
              {ranks.map((r) => (
                <RankRow key={r.rank} item={r} />
              ))}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
/* ---------------------------------- Mount --------------------------------- */
const rootEl = document.getElementById("root");
if (!rootEl) {
  const err = document.createElement("pre");
  err.textContent =
    'Missing root element with id="root". Add it to index.html.';
  document.body.appendChild(err);
} else {
  ReactDOM.createRoot(rootEl).render(
    <React.StrictMode>
      <Dashboard />
    </React.StrictMode>,
  );
}
