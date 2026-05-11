// https://github.com/steel-dev/steel-cookbook/tree/main/examples/convex-chat-with-page
// ABOUTME: App-level Convex schema. Holds a scrapeCache table so the
// ABOUTME: scrapePage tool can serve chunks without re-scraping on each call.

import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  scrapeCache: defineTable({
    url: v.string(),
    ownerId: v.string(),
    title: v.string(),
    chunks: v.array(v.string()),
    createdAt: v.number(),
  })
    .index("by_url_owner", ["url", "ownerId"])
    .index("by_owner", ["ownerId"]),
});
