/*
 * Durable browser research session with Restate and Steel.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/restate-agent-ts
 */

import * as restate from "@restatedev/restate-sdk";
import dotenv from "dotenv";
import Steel from "steel-sdk";

dotenv.config();

const STEEL_API_KEY = env("STEEL_API_KEY", "your-steel-api-key-here");
const OPENAI_API_KEY = env("OPENAI_API_KEY", "your-openai-api-key-here");
const OPENAI_MODEL = env("OPENAI_MODEL", "gpt-5.5");
const DEFAULT_QUESTION = env(
  "RESEARCH_QUESTION",
  "Summarize the main stories on this page and cite the source URL."
);
const DEFAULT_SEED_URL = env("SEED_URL", "https://news.ycombinator.com");
const DEFAULT_MAX_STEPS = Number(env("MAX_STEPS", "2"));

const steel = new Steel({ steelAPIKey: STEEL_API_KEY });

type ResearchRequest = {
  question?: string;
  seedUrl?: string;
  maxSteps?: number;
};

type Observation = {
  url: string;
  title: string;
  statusCode: number;
  markdown: string;
};

type ResearchResult = {
  answer: string;
  sources: string[];
  observations: number;
};

type PlanStep = {
  action: "scrape_url" | "finish";
  url: string;
  reason: string;
  answer: string;
};

type ResearchState = {
  observations: Observation[];
};

function env(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

function requireEnv() {
  const missing = [];
  if (STEEL_API_KEY === "your-steel-api-key-here") missing.push("STEEL_API_KEY");
  if (OPENAI_API_KEY === "your-openai-api-key-here") missing.push("OPENAI_API_KEY");
  if (missing.length > 0) {
    throw new Error(`Set ${missing.join(" and ")} in .env before invoking the service.`);
  }
}

function trimMarkdown(markdown: string): string {
  return markdown.replace(/\s+/g, " ").slice(0, 5000);
}

function normalizeUrl(url: string): string {
  const parsed = new URL(url);
  parsed.hash = "";
  return parsed.toString();
}

function observationDigest(observations: Observation[]): string {
  if (observations.length === 0) {
    return "No pages have been scraped yet.";
  }

  return observations
    .map(
      (obs, index) =>
        `Observation ${index + 1}
URL: ${obs.url}
Title: ${obs.title}
HTTP: ${obs.statusCode}
Markdown excerpt:
${obs.markdown}`
    )
    .join("\n\n");
}

async function scrapeUrl(url: string): Promise<Observation> {
  const result = await steel.scrape({
    url,
    format: ["markdown"],
  });

  return {
    url,
    title: result.metadata.title ?? "(untitled)",
    statusCode: result.metadata.statusCode ?? 0,
    markdown: trimMarkdown(result.content.markdown ?? ""),
  };
}

async function callOpenAIJson<T>(prompt: string, schemaName: string, schema: object): Promise<T> {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: prompt,
      text: {
        format: {
          type: "json_schema",
          name: schemaName,
          strict: true,
          schema,
        },
      },
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message ?? JSON.stringify(payload);
    throw new Error(`OpenAI request failed: ${message}`);
  }

  const text = extractOutputText(payload);
  return JSON.parse(text) as T;
}

function extractOutputText(payload: any): string {
  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  for (const item of payload.output ?? []) {
    for (const part of item.content ?? []) {
      if (typeof part.text === "string") {
        return part.text;
      }
    }
  }

  throw new Error("OpenAI response did not contain text output.");
}

async function planNext(question: string, seedUrl: string, observations: Observation[]): Promise<PlanStep> {
  const prompt = `You are controlling a durable browser research agent.

Question: ${question}
Seed URL: ${seedUrl}

Already scraped pages:
${observationDigest(observations)}

Choose exactly one next action:
- scrape_url: use this when another page scrape is needed. Prefer the seed URL first.
- finish: use this once the observations are enough to answer.

Return JSON only. If you choose scrape_url, put the absolute URL in url and leave answer empty.
If you choose finish, leave url empty and put the final answer in answer.`;

  return callOpenAIJson<PlanStep>("Plan the next browser research action.\n\n" + prompt, "research_plan", {
    type: "object",
    additionalProperties: false,
    properties: {
      action: { type: "string", enum: ["scrape_url", "finish"] },
      url: { type: "string" },
      reason: { type: "string" },
      answer: { type: "string" },
    },
    required: ["action", "url", "reason", "answer"],
  });
}

async function finalAnswer(question: string, observations: Observation[]): Promise<ResearchResult> {
  const prompt = `Answer the research question using only the scraped observations.

Question: ${question}

Observations:
${observationDigest(observations)}

Return a concise answer. Include source URLs from the observations.`;

  const result = await callOpenAIJson<{ answer: string; sources: string[] }>(
    prompt,
    "research_answer",
    {
      type: "object",
      additionalProperties: false,
      properties: {
        answer: { type: "string" },
        sources: { type: "array", items: { type: "string" } },
      },
      required: ["answer", "sources"],
    }
  );

  return {
    answer: result.answer,
    sources: result.sources,
    observations: observations.length,
  };
}

function durableFinalAnswer(
  ctx: restate.ObjectContext,
  question: string,
  observations: Observation[]
): Promise<ResearchResult> {
  return ctx.run("final answer", () => finalAnswer(question, observations));
}

function coerceRequest(req: ResearchRequest | undefined): Required<ResearchRequest> {
  return {
    question: req?.question || DEFAULT_QUESTION,
    seedUrl: req?.seedUrl || DEFAULT_SEED_URL,
    maxSteps: Math.max(1, Math.min(req?.maxSteps ?? DEFAULT_MAX_STEPS, 4)),
  };
}

const researchSession = restate.object({
  name: "ResearchSession",
  handlers: {
    answer: async (ctx: restate.ObjectContext, req?: ResearchRequest): Promise<ResearchResult> => {
      requireEnv();

      const { question, seedUrl, maxSteps } = coerceRequest(req);
      const normalizedSeed = normalizeUrl(seedUrl);
      const state = (await ctx.get<ResearchState>("state")) ?? { observations: [] };
      const observations = [...state.observations];
      const visited = new Set(observations.map((obs) => obs.url));

      for (let step = 0; step < maxSteps; step++) {
        const plan = await ctx.run(`plan step ${step + 1}`, () =>
          planNext(question, normalizedSeed, observations)
        );

        if (plan.action === "finish" && observations.length > 0) {
          return durableFinalAnswer(ctx, question, observations);
        }

        let url = normalizedSeed;
        try {
          url = normalizeUrl(plan.url || normalizedSeed);
        } catch {
          url = normalizedSeed;
        }

        if (visited.has(url)) {
          return durableFinalAnswer(ctx, question, observations);
        }

        const observation = await ctx.run(`scrape ${url}`, () => scrapeUrl(url));
        observations.push(observation);
        visited.add(url);
        ctx.set("state", { observations });
      }

      return durableFinalAnswer(ctx, question, observations);
    },
    history: restate.handlers.object.shared(async (ctx: restate.ObjectSharedContext) => {
      return (await ctx.get<ResearchState>("state")) ?? { observations: [] };
    }),
  },
});

restate.serve({ services: [researchSession] });
