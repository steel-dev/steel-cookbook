// https://github.com/steel-dev/steel-cookbook/tree/main/examples/convex-chat-with-page
// ABOUTME: Defines pageAgent — an AI agent with a single tool, scrapePage,
// ABOUTME: that fetches webpage markdown via Steel and serves it in chunks.

import { Agent, createTool, stepCountIs } from "@convex-dev/agent";
import { openai } from "@ai-sdk/openai";
import { SteelComponent } from "@steel-dev/convex";
import { NodeHtmlMarkdown } from "node-html-markdown";
import { z } from "zod";
import { components, internal } from "./_generated/api";

const steel = new SteelComponent(components.steel, {
  STEEL_API_KEY: process.env.STEEL_API_KEY,
});

const CHUNK_CHARS = 25_000;

// Steel's markdown extractor drops the main article body on some sites
// (e.g. LessWrong returns only title + footnotes). Fetch HTML and convert
// on our side so every site renders consistently.
const htmlToMarkdown = new NodeHtmlMarkdown();

type ScrapeToolResult = {
  title: string;
  chunk: string;
  chunkIndex: number;
  totalChunks: number;
  hasMore: boolean;
  error?: string;
};

// Split markdown into chunks at paragraph boundaries, packing as many
// paragraphs as fit under CHUNK_CHARS per chunk.
function chunkMarkdown(md: string): string[] {
  const paragraphs = md.split(/\n\n+/);
  const chunks: string[] = [];
  let current = "";
  for (const p of paragraphs) {
    if (current.length + p.length + 2 > CHUNK_CHARS && current.length > 0) {
      chunks.push(current);
      current = "";
    }
    current = current.length === 0 ? p : `${current}\n\n${p}`;
  }
  if (current.length > 0) chunks.push(current);
  return chunks.length > 0 ? chunks : [md];
}

const scrapePage = createTool({
  description:
    "Fetch the markdown content of a public webpage via a cloud browser. For long pages the content is served in chunks; call again with chunkIndex to get more. Returns { title, chunk, chunkIndex, totalChunks, hasMore }.",
  inputSchema: z.object({
    url: z.string().url().describe("The URL of the webpage to fetch."),
    chunkIndex: z
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        "0-indexed chunk number. Omit or pass 0 on the first call. Pass higher values to read later parts of the same page.",
      ),
  }),
  execute: async (ctx, { url, chunkIndex }): Promise<ScrapeToolResult> => {
    const index = chunkIndex ?? 0;
    const ownerId = ctx.userId ?? "anonymous";

    let cached: { title: string; chunks: string[] } | null =
      await ctx.runQuery(internal.scrape.getCached, { url, ownerId });

    if (!cached) {
      const result = (await steel.steel.scrape(
        ctx,
        { url, commandArgs: { format: ["html"], delay: 100 } },
        { ownerId },
      )) as {
        content?: { html?: string };
        metadata?: { title?: string };
      } | null;
      const html = result?.content?.html ?? "";
      if (!html) {
        return {
          title: "",
          chunk: "",
          chunkIndex: 0,
          totalChunks: 0,
          hasMore: false,
          error: "Page returned no HTML content.",
        };
      }
      const markdown = htmlToMarkdown.translate(html);
      const title = result?.metadata?.title ?? url;
      const chunks = chunkMarkdown(markdown);
      await ctx.runMutation(internal.scrape.putCached, {
        url,
        ownerId,
        title,
        chunks,
      });
      cached = { title, chunks };
    }

    const total = cached.chunks.length;
    const safeIndex = Math.min(index, total - 1);
    return {
      title: cached.title,
      chunk: cached.chunks[safeIndex] ?? "",
      chunkIndex: safeIndex,
      totalChunks: total,
      hasMore: safeIndex < total - 1,
    };
  },
});

export const pageAgent = new Agent(components.agent, {
  name: "pageAgent",
  languageModel: openai.chat("gpt-5.4-mini"),
  instructions:
    "You help users understand webpages. When the user mentions a URL, call the scrapePage tool to fetch it. If the result has hasMore=true and the first chunk doesn't contain what you need, call scrapePage again with the same URL and the next chunkIndex. Answer using the returned markdown and always include a short direct quote from the page.",
  tools: { scrapePage },
  stopWhen: stepCountIs(8),
});
