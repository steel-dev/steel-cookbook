import dotenv from "dotenv";
dotenv.config();
import { z } from "zod";
import { chromium } from "playwright";
import Steel from "steel-sdk";
import {
  openai,
  createAgent,
  createNetwork,
  createTool,
} from "@inngest/agent-kit";

// Replace with your own API keys
const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "your-openai-api-key-here";

const client = new Steel({ steelAPIKey: STEEL_API_KEY });

const browseHackerNews = createTool({
  name: "browse_hacker_news",
  description:
    "Fetch Hacker News stories (top/best/new) and optionally filter by topics",
  parameters: z.object({
    section: z.enum(["top", "best", "new"]).default("top"),
    topics: z.array(z.string()).optional(),
    limit: z.number().int().min(1).max(20).default(5),
  }),
  handler: async ({ section, topics, limit }, { step }) => {
    if (STEEL_API_KEY === "your-steel-api-key-here") {
      throw new Error("Set STEEL_API_KEY");
    }
    return await step?.run("browse-hn", async () => {
      const session = await client.sessions.create({});
      const browser = await chromium.connectOverCDP(
        `${session.websocketUrl}&apiKey=${STEEL_API_KEY}`
      );
      try {
        const context = browser.contexts()[0];
        const page = context.pages()[0];
        const base = "https://news.ycombinator.com";
        const url =
          section === "best"
            ? `${base}/best`
            : section === "new"
              ? `${base}/newest`
              : base;
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
        const items = await page.evaluate((maxItems: number) => {
          const rows = Array.from(document.querySelectorAll("tr.athing"));
          const take = Math.min(maxItems * 2, rows.length);
          const out = [] as Array<{
            rank: number;
            title: string;
            url: string;
            site: string | null;
            points: number;
            comments: number;
            itemId: string;
          }>;
          for (let i = 0; i < take; i++) {
            const row = rows[i] as HTMLElement;
            const titleEl = row.querySelector(
              ".titleline > a"
            ) as HTMLAnchorElement | null;
            const sub = row.nextElementSibling as HTMLElement | null;
            const scoreEl = sub?.querySelector(".score");
            const commentsLink = sub?.querySelector(
              'a[href*="item?id="]:last-child'
            ) as HTMLAnchorElement | null;
            const rankText = row.querySelector(".rank")?.textContent || "";
            const rank =
              parseInt(rankText.replace(".", "").trim(), 10) || i + 1;
            const title = titleEl?.textContent?.trim() || "";
            const url = titleEl?.getAttribute("href") || "";
            const site = row.querySelector(".sitestr")?.textContent || null;
            const points = scoreEl?.textContent
              ? parseInt(scoreEl.textContent, 10)
              : 0;
            const commentsText = commentsLink?.textContent || "";
            const commentsNum = /\d+/.test(commentsText)
              ? parseInt((commentsText.match(/\d+/) || ["0"])[0], 10)
              : 0;
            const itemId = row.getAttribute("id") || "";
            out.push({
              rank,
              title,
              url,
              site,
              points,
              comments: commentsNum,
              itemId,
            });
          }
          return out;
        }, limit);
        const filtered =
          topics && topics.length > 0
            ? items.filter((it) => {
                const t = it.title.toLowerCase();
                return topics.some((kw) => t.includes(kw.toLowerCase()));
              })
            : items;
        const deduped = [] as typeof filtered;
        const seen = new Set<string>();
        for (const it of filtered) {
          const key = `${it.title}|${it.url}`;
          if (!seen.has(key)) {
            seen.add(key);
            deduped.push(it);
          }
          if (deduped.length >= limit) break;
        }
        return deduped.slice(0, limit);
      } finally {
        await client.sessions.release(session.id);
      }
    });
  },
});

const hnAgent = createAgent({
  name: "hn_curator",
  description: "Curates interesting Hacker News stories by topic",
  system:
    "Surface novel, high-signal Hacker News stories. Favor technical depth, originality, and relevance to requested topics. Use the tool to browse and return concise picks.",
  tools: [browseHackerNews],
});

const hnNetwork = createNetwork({
  name: "hacker-news-network",
  description: "Network for curating Hacker News stories",
  agents: [hnAgent],
  maxIter: 2,
  defaultModel: openai({
    model: "gpt-4o-mini",
  }),
});

async function main() {
  console.log("🚀 Steel + Agent Kit Starter");
  console.log("=".repeat(60));

  if (STEEL_API_KEY === "your-steel-api-key-here") {
    console.warn(
      "⚠️  WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key"
    );
    console.warn(
      "   Get your API key at: https://app.steel.dev/settings/api-keys"
    );
    process.exit(1);
  }

  if (OPENAI_API_KEY === "your-openai-api-key-here") {
    console.warn(
      "⚠️  WARNING: Please replace 'your-openai-api-key-here' with your actual OpenAI API key"
    );
    console.warn(
      "   Get your API key at: https://platform.openai.com/api-keys"
    );
    process.exit(1);
  }

  try {
    console.log("\nRunning HN curation...");
    const run = await hnNetwork.run(
      "Curate 5 interesting Hacker News stories about AI, TypeScript, and tooling. Prefer 'best' if relevant. Return title, url, points."
    );
    const results = (run as any).state?.results ?? [];
    console.log("\nResults:\n" + JSON.stringify(results, null, 2));
  } catch (err) {
    console.error("An error occurred:", err);
  } finally {
    console.log("Done!");
  }
}

main();
