// https://github.com/steel-dev/steel-cookbook/tree/main/examples/convex-price-watch
// ABOUTME: Claude pricing watch dashboard — tiers × regions grid, divergences
// ABOUTME: callout, and a "Snapshot now" button that triggers an on-demand scrape.

import { useState } from "react";
import { useAction, useQuery } from "convex/react";
import { api } from "../convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/Spinner";

// Steel's deployment regions (airport codes). Each probe also goes through
// a random residential proxy IP, which is what actually catches A/B variance.
const REGION_LABELS: Record<string, string> = {
  lax: "LAX",
  iad: "IAD",
};

function formatTime(ms: number) {
  const delta = Date.now() - ms;
  const mins = Math.round(delta / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(ms).toISOString().slice(0, 10);
}

export default function App() {
  const [snapshotting, setSnapshotting] = useState(false);
  const current = useQuery(api.prices.current);
  const divergences = useQuery(api.prices.recentDivergences);
  const recent = useQuery(api.prices.recent, { limit: 60 });
  const snapshotNow = useAction(api.scraper.snapshotNow);

  const handleSnapshot = async () => {
    if (snapshotting) return;
    setSnapshotting(true);
    try {
      await snapshotNow();
    } finally {
      setSnapshotting(false);
    }
  };

  const regions = current?.regions ?? [];
  const tiers = current?.tiers ?? [];
  const cells = current?.cells ?? [];
  const cellFor = (region: string, tier: string) =>
    cells.find((c) => c.region === region && c.tier === tier);

  // Group recent rows into "ticks" (captureAll runs both probes in parallel
  // so their capturedAt values cluster within a few seconds of each other).
  // Rows within a 60s window go into the same tick, and we keep only the
  // newest row per (region, tier) to avoid duplicates when a single cron
  // tick produces retries or multiple snapshots land close in time.
  type Tick = {
    capturedAt: number;
    byRegion: Record<string, Record<string, { priceText: string; amount?: number }>>;
  };
  const activeRegions = new Set<string>(regions);
  const ticks: Tick[] = [];
  for (const row of recent ?? []) {
    // Skip rows for regions no longer in the active set (e.g. retired "ord").
    if (!activeRegions.has(row.region)) continue;
    const last = ticks[ticks.length - 1];
    const inSameTick = last && last.capturedAt - row.capturedAt < 60_000;
    const target = inSameTick ? last : undefined;
    const tick: Tick = target ?? {
      capturedAt: row.capturedAt,
      byRegion: {},
    };
    const perRegion = (tick.byRegion[row.region] ??= {});
    // Rows arrive newest-first (desc by capturedAt). First write wins,
    // so we don't overwrite the freshest snapshot with an older duplicate.
    if (!perRegion[row.tier]) {
      perRegion[row.tier] = { priceText: row.priceText, amount: row.amount };
    }
    if (!target) ticks.push(tick);
  }
  // Tier ordering for stable rendering inside each tick.
  const TIER_ORDER = ["Free", "Pro", "Max"] as const;

  // Compute the most-common ("typical") amount per tier across all recent
  // snapshots — this is our baseline. A tick is divergent when any row in it
  // disagrees with that baseline, even if only one region is present in the
  // tick (e.g. a historical seed from before the other probe existed).
  const modeByTier = new Map<string, number>();
  for (const tier of TIER_ORDER) {
    const counts = new Map<number, number>();
    for (const row of recent ?? []) {
      if (row.tier !== tier || typeof row.amount !== "number") continue;
      counts.set(row.amount, (counts.get(row.amount) ?? 0) + 1);
    }
    const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (top) modeByTier.set(tier, top[0]);
  }

  const isTickDivergent = (tick: Tick) => {
    for (const tier of TIER_ORDER) {
      const mode = modeByTier.get(tier);
      if (typeof mode !== "number") continue;
      for (const perTier of Object.values(tick.byRegion)) {
        const amt = perTier?.[tier]?.amount;
        if (typeof amt === "number" && amt !== mode) return true;
      }
    }
    return false;
  };

  // For each tier, compute majority amount across regions so divergent cells
  // can be tinted. A tier has a majority when >1 region shares the same value.
  const majorityByTier = new Map<string, number | undefined>();
  for (const tier of tiers) {
    const amounts = regions
      .map((r) => cellFor(r, tier)?.amount)
      .filter((a): a is number => typeof a === "number");
    if (amounts.length === 0) {
      majorityByTier.set(tier, undefined);
      continue;
    }
    const counts = new Map<number, number>();
    for (const a of amounts) counts.set(a, (counts.get(a) ?? 0) + 1);
    const [top] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    majorityByTier.set(tier, top?.[0]);
  }

  return (
    <div className="min-h-full w-full px-6 py-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Claude pricing watch
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Scrapes{" "}
              <a
                className="text-primary underline underline-offset-2 hover:text-primary/80"
                href="https://claude.com/pricing"
                target="_blank"
                rel="noreferrer"
              >
                claude.com/pricing
              </a>{" "}
              every 10 minutes from multiple proxy regions. Catches A/B and
              geo-targeted pricing experiments.
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={handleSnapshot}
            disabled={snapshotting}
            className="shrink-0"
          >
            {snapshotting ? (
              <span className="flex items-center gap-2">
                <Spinner /> snapshotting…
              </span>
            ) : (
              "Snapshot now"
            )}
          </Button>
        </header>

        {divergences && divergences.length > 0 && (
          <div className="mb-6 rounded-md border border-primary bg-primary/10 p-4">
            <div className="text-sm font-semibold text-primary">
              Divergence detected — different regions seeing different prices
            </div>
            <ul className="mt-2 space-y-1 text-sm text-foreground">
              {divergences.map((d) => (
                <li key={d.tier} className="font-mono">
                  <span className="font-sans font-medium">{d.tier}</span>
                  {" — "}
                  {d.perRegion
                    .map((p) => `${p.region}: ${p.priceText}`)
                    .join(" · ")}
                </li>
              ))}
            </ul>
          </div>
        )}

        <section className="rounded-md border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Tier</th>
                {regions.map((r) => (
                  <th
                    key={r}
                    className="px-4 py-2 text-left font-medium"
                  >
                    {REGION_LABELS[r] ?? r}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => {
                const majority = majorityByTier.get(tier);
                return (
                  <tr key={tier} className="border-t border-border">
                    <td className="px-4 py-3 font-medium">{tier}</td>
                    {regions.map((region) => {
                      const cell = cellFor(region, tier);
                      const divergent =
                        typeof cell?.amount === "number" &&
                        typeof majority === "number" &&
                        cell.amount !== majority;
                      return (
                        <td
                          key={region}
                          className={
                            divergent
                              ? "px-4 py-3 bg-primary/20 text-primary font-mono"
                              : "px-4 py-3 font-mono"
                          }
                        >
                          {cell ? (
                            <div>
                              <div>{cell.priceText}</div>
                              <div className="text-xs text-muted-foreground font-sans">
                                {formatTime(cell.capturedAt)}
                              </div>
                            </div>
                          ) : snapshotting ? (
                            <Spinner />
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {tiers.length === 0 && (
                <tr>
                  <td
                    colSpan={regions.length + 1}
                    className="px-4 py-12 text-center text-sm text-muted-foreground"
                  >
                    No snapshots yet. Click <strong>Snapshot now</strong> to
                    capture the current prices.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>

        {ticks.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-sm font-semibold tracking-tight">
              History
            </h2>
            <ul className="rounded-md border border-border divide-y divide-border overflow-hidden">
              {ticks.map((tick) => {
                const divergent = isTickDivergent(tick);
                return (
                <li
                  key={tick.capturedAt}
                  className="flex items-start gap-4 px-4 py-3 text-xs"
                >
                  <span className="flex shrink-0 w-36 items-center gap-2 font-mono text-muted-foreground">
                    <span>{formatTime(tick.capturedAt)}</span>
                    {divergent && (
                      <span className="rounded-full bg-primary/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                        divergent
                      </span>
                    )}
                  </span>
                  <div className="flex flex-1 flex-wrap gap-x-6 gap-y-1">
                    {regions.map((region) => {
                      const perTier = tick.byRegion[region];
                      const ordered = TIER_ORDER.filter(
                        (t) => perTier && perTier[t],
                      );
                      if (!perTier || ordered.length === 0) {
                        return (
                          <span key={region} className="text-muted-foreground">
                            <span className="font-medium text-foreground">
                              {REGION_LABELS[region] ?? region}
                            </span>{" "}
                            —
                          </span>
                        );
                      }
                      return (
                        <span key={region} className="font-mono">
                          <span className="font-sans font-medium text-foreground">
                            {REGION_LABELS[region] ?? region}
                          </span>{" "}
                          {ordered
                            .map((t) => `${t} ${perTier[t].priceText}`)
                            .join(" · ")}
                        </span>
                      );
                    })}
                  </div>
                </li>
                );
              })}
            </ul>
          </section>
        )}

        <p className="mt-6 text-xs text-muted-foreground">
          Proxy-routed via Steel. Cron runs every 10 minutes — the dashboard
          updates live as new rows land.
        </p>
      </div>
    </div>
  );
}
