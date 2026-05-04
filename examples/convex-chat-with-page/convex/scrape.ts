// https://github.com/steel-dev/steel-cookbook/tree/main/examples/convex-chat-with-page
// ABOUTME: Internal helpers that read and write the scrapeCache table.
// ABOUTME: The agent's scrapePage tool uses these to avoid re-scraping a URL
// ABOUTME: between chunk requests.

import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export const getCached = internalQuery({
  args: { url: v.string(), ownerId: v.string() },
  handler: async (ctx, { url, ownerId }) => {
    const hit = await ctx.db
      .query("scrapeCache")
      .withIndex("by_url_owner", (q) =>
        q.eq("url", url).eq("ownerId", ownerId),
      )
      .first();
    if (!hit) return null;
    if (Date.now() - hit.createdAt > CACHE_TTL_MS) return null;
    return { title: hit.title, chunks: hit.chunks };
  },
});

export const latestForOwner = query({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    const row = await ctx.db
      .query("scrapeCache")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .order("desc")
      .first();
    if (!row) return null;
    return {
      url: row.url,
      title: row.title,
      markdown: row.chunks.join("\n\n"),
      createdAt: row.createdAt,
    };
  },
});

export const clearForOwner = mutation({
  args: { ownerId: v.string() },
  handler: async (ctx, { ownerId }) => {
    const rows = await ctx.db
      .query("scrapeCache")
      .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
  },
});

export const putCached = internalMutation({
  args: {
    url: v.string(),
    ownerId: v.string(),
    title: v.string(),
    chunks: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("scrapeCache")
      .withIndex("by_url_owner", (q) =>
        q.eq("url", args.url).eq("ownerId", args.ownerId),
      )
      .first();
    if (existing) await ctx.db.delete(existing._id);
    await ctx.db.insert("scrapeCache", {
      url: args.url,
      ownerId: args.ownerId,
      title: args.title,
      chunks: args.chunks,
      createdAt: Date.now(),
    });
  },
});
