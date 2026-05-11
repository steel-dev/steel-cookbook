# Watch Claude pricing for divergent A/B variants

A scheduled monitor: scrape `https://claude.com/pricing` every 10 minutes from two parallel proxy probes, store one row per (region, tier, capturedAt) in Convex, and surface tiers where the probes disagree. No LLM, no streaming. Just `@steel-dev/convex`, a cron, and a reactive dashboard.

```
convex/
├── convex.config.ts    mounts the steel component
├── schema.ts           priceSnapshots table
├── scraper.ts          captureFromRegion / captureAll / snapshotNow
├── crons.ts            10-minute schedule
└── prices.ts           current / history / recent / recentDivergences
src/
└── App.tsx             tiers × regions grid + divergence callout
```

The scraper fans out across two Steel deployment regions (`lax`, `iad`) with `useProxy: true`. Each scrape exits through a random residential IP from Steel's pool, so two parallel calls exercise different IPs and pick up A/B pricing experiments that depend on the visitor bucket.

## Run it

```bash
cd examples/convex-price-watch
npm install
cp .env.example .env       # fill in STEEL_API_KEY
npx convex dev             # creates a dev deployment on first run
```

In a second terminal:

```bash
npx convex env set STEEL_API_KEY "$STEEL_API_KEY"
npm run dev                # vite frontend
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys).

Open the Vite URL and click **Snapshot now**. Within ~15-30 seconds the grid populates with the latest prices. The cron also runs `captureAll` every 10 minutes once the deployment is live.

```text
Claude pricing watch
            LAX             IAD
Free        $0     just now $0     just now
Pro         $20    just now $20    just now
Max         $100   just now $100   just now

Proxy-routed via Steel. Cron runs every 10 minutes.
```

If the probes disagree, a yellow-bordered "Divergence detected" card appears above the grid. The cell whose amount differs from the per-tier majority gets a yellow tint.

## Why two parallel probes

`useProxy` on `ScrapeParams` is a boolean. Setting it to `true` routes the request through a random residential IP each time, but you don't get to pick the country from the scrape API. The country-pinned form (`{ geolocation: { country } }`) lives on `steel.sessions.create`, not `steel.steel.scrape`.

Two probes running in different deployment regions (`region: "lax"` and `region: "iad"`) give you two different IPs per tick. That's enough to surface visitor-bucket A/B variance: if Anthropic serves $17 to one bucket and $20 to another, the probes have a real chance of landing in different buckets and the grid lights up.

True per-country routing is a one-line extension: open a session with `useProxy: { geolocation: { country: "DE" } }`, then scrape through the session id. Listed under [Make it yours](#make-it-yours).

Each probe is wrapped in `try`/`catch` inside `captureAll`. A 503 from one Steel region doesn't blank the others.

## The delay is load-bearing

`claude.com/pricing` ships a small nav-only stub on the first response and hydrates the actual tier prices client-side. Without `delay: 5000` on the scrape call, the probe grabs the stub, the tier regex finds nothing, and the row count is zero.

`captureFromRegion` retries once if the markdown is empty or doesn't contain any tier name. The retry covers the residual hydration flake on residential IPs without inflating latency on good runs.

```ts
const result = await steel.steel.scrape(
  ctx,
  {
    url: TARGET_URL,
    delay: 5000,
    commandArgs: { format: ["markdown"], useProxy: true, region },
  },
  { ownerId: "monitor" },
);
```

`extractTierPrice` then walks the markdown for each of `Free`, `Pro`, `Max`, finds the first mention case-insensitively, and matches `($|€|£)N` in the next 600 characters. Fragile to layout changes; good enough for a known target.

## Make it yours

- **Country-pinned probes.** Swap `steel.steel.scrape` for `steel.sessions.create({ sessionArgs: { useProxy: { geolocation: { country: "DE" } } } })` and scrape through that session. Repeat for each country you want to watch.
- **Alert on divergence.** Add an HTTP action that posts to Slack or Discord whenever `recentDivergences` returns a non-empty array. Schedule it on the same cron, after `captureAll`.
- **Watch more sites.** `TARGET_URL` and `TIERS` are constants at the top of `scraper.ts`. Add a second target with its own tier list and a second cron.
- **Store screenshots alongside prices.** Pass `format: ["markdown", "screenshot"]` to `commandArgs` and write the screenshot to `ctx.storage`. Useful when a layout change breaks the regex and you want to see what the page actually looked like.
- **Diff Pro/Max/Team additions.** Persist the full `TIERS` array per snapshot and compare the latest captured set against the prior one. New or removed tiers are first-class signal.

## Related

- [`@steel-dev/convex` component](https://www.convex.dev/components/steel-dev)
- [Convex crons](https://docs.convex.dev/scheduling/cron-jobs)
- [Sibling recipe: convex-chat-with-page](../convex-chat-with-page) (interactive agent, streamed)
