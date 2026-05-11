// https://github.com/steel-dev/steel-cookbook/tree/main/examples/convex-price-watch
// ABOUTME: Fetches claude.com/pricing via Steel's proxy from multiple countries
// ABOUTME: and persists one row per detected tier into priceSnapshots.

import { v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
} from "./_generated/server";
import { components, internal } from "./_generated/api";
import { SteelComponent } from "@steel-dev/convex";

const TARGET_URL = "https://claude.com/pricing";

// Steel's available deployment regions (airport codes). Each probe also goes
// through a random residential proxy IP, so parallel probes exercise
// different IPs and catch A/B variance.
const REGIONS = ["lax", "iad"] as const;

// Tier labels we look for on the pricing page. Order doesn't matter — we
// search for each one independently in the scraped markdown. Team/Enterprise
// are omitted: the page's pricing section only lists Free/Pro/Max with a
// dollar amount. Enterprise shows "Contact sales", Team isn't on this page.
const TIERS = ["Free", "Pro", "Max"] as const;

const steel = new SteelComponent(components.steel, {
  STEEL_API_KEY: process.env.STEEL_API_KEY,
});

// Extracts { priceText, amount, currency } from markdown for a given tier by
// looking for the nearest "$N" (or "€N") after the tier's name. Fragile to
// layout changes but good enough for a demo against a known page.
function extractTierPrice(
  markdown: string,
  tier: string,
): { priceText: string; amount?: number; currency?: string } | null {
  // Find the first mention of the tier name, case-insensitive.
  const tierIdx = markdown.toLowerCase().indexOf(tier.toLowerCase());
  if (tierIdx === -1) return null;

  // Search a window of the next 600 chars for a price.
  const window = markdown.slice(tierIdx, tierIdx + 600);
  const priceMatch = window.match(/([$€£])\s*(\d+(?:[.,]\d{1,2})?)/);
  if (!priceMatch) return null;

  const currency = priceMatch[1];
  const amount = Number(priceMatch[2].replace(",", "."));
  return {
    priceText: `${currency}${priceMatch[2]}`,
    amount: Number.isFinite(amount) ? amount : undefined,
    currency,
  };
}

export const insertSnapshots = internalMutation({
  args: {
    region: v.string(),
    capturedAt: v.number(),
    rawMarkdown: v.string(),
    rows: v.array(
      v.object({
        tier: v.string(),
        priceText: v.string(),
        amount: v.optional(v.number()),
        currency: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    for (const row of args.rows) {
      await ctx.db.insert("priceSnapshots", {
        region: args.region,
        tier: row.tier,
        priceText: row.priceText,
        amount: row.amount,
        currency: row.currency,
        rawMarkdown: args.rawMarkdown,
        capturedAt: args.capturedAt,
      });
    }
  },
});

export const captureFromRegion = internalAction({
  args: { region: v.string() },
  handler: async (ctx, { region }) => {
    // Each probe runs in one of Steel's deployment regions (lax/ord/iad) with
    // useProxy: true so the actual page request exits through a random
    // residential IP. delay waits for the page's JS to hydrate — without it
    // the scrape returns a stub with just the error-banner + nav links.
    const scrape = async (): Promise<string> => {
      const result = (await steel.steel.scrape(
        ctx,
        {
          url: TARGET_URL,
          delay: 5000,
          commandArgs: {
            format: ["markdown"],
            useProxy: true,
            region,
          },
        },
        { ownerId: "monitor" },
      )) as { content?: { markdown?: string } } | null;
      return result?.content?.markdown ?? "";
    };

    // Residential proxies occasionally return an un-hydrated page with no
    // tier text. One retry catches most of those without adding real latency
    // on good runs.
    let markdown = await scrape();
    const hasTiers = (md: string) =>
      TIERS.some((t) => md.toLowerCase().includes(t.toLowerCase()));
    if (!markdown || !hasTiers(markdown)) {
      console.log(
        `[${region}] first scrape ${markdown.length} chars, no tiers — retrying`,
      );
      markdown = await scrape();
    }
    console.log(
      `[${region}] final markdown ${markdown.length} chars, hasTiers=${hasTiers(markdown)}; preview=${JSON.stringify(markdown.slice(0, 400))}`,
    );
    if (!markdown) return { region, inserted: 0 };

    const capturedAt = Date.now();
    const rows = TIERS.map((tier) => {
      const extracted = extractTierPrice(markdown, tier);
      return extracted ? { tier, ...extracted } : null;
    }).filter((r): r is NonNullable<typeof r> => r !== null);

    if (rows.length > 0) {
      await ctx.runMutation(internal.scraper.insertSnapshots, {
        region,
        capturedAt,
        rawMarkdown: markdown,
        rows,
      });
    }
    return { region, inserted: rows.length };
  },
});

export const captureAll = internalAction({
  args: {},
  handler: async (
    ctx,
  ): Promise<Array<{ region: string; inserted: number; error?: string }>> => {
    // Wrap each probe so a transient 503 from one Steel region doesn't blank
    // the others — we still want the UI to update with whatever landed.
    return await Promise.all(
      REGIONS.map(async (region) => {
        try {
          return await ctx.runAction(internal.scraper.captureFromRegion, {
            region,
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          console.log(`[${region}] captureFromRegion failed: ${message}`);
          return { region, inserted: 0, error: message };
        }
      }),
    );
  },
});

// Public trigger used by the "Snapshot now" button in the UI.
export const snapshotNow = action({
  args: {},
  handler: async (ctx): Promise<
    Array<{ region: string; inserted: number }>
  > => {
    return await ctx.runAction(internal.scraper.captureAll, {});
  },
});
