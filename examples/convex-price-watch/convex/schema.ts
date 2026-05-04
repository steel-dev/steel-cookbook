// https://github.com/steel-dev/steel-cookbook/tree/main/examples/convex-price-watch
// ABOUTME: Stores one price snapshot per (region, tier, capturedAt) so the
// ABOUTME: dashboard can show current values, divergences, and history.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  priceSnapshots: defineTable({
    region: v.string(), // Steel deployment region airport code, e.g. "lax", "iad"
    tier: v.string(), // "Free" | "Pro" | "Max"
    priceText: v.string(), // raw as scraped, e.g. "$20"
    amount: v.optional(v.number()), // parsed numeric amount
    currency: v.optional(v.string()), // parsed currency symbol
    rawMarkdown: v.string(), // full page markdown for audit
    capturedAt: v.number(),
  })
    .index("by_region_tier_time", ["region", "tier", "capturedAt"])
    .index("by_time", ["capturedAt"]),
});
