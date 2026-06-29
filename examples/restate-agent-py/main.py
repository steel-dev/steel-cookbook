"""
Durable browser research session with Restate and Steel.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/restate-agent-py
"""

from __future__ import annotations

import asyncio
import json
import os
import urllib.request
from typing import Any
from urllib.parse import urlsplit, urlunsplit

import restate
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from steel import Steel

load_dotenv()

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or "your-openai-api-key-here"
OPENAI_MODEL = os.getenv("OPENAI_MODEL") or "gpt-5.5"
DEFAULT_QUESTION = (
    os.getenv("RESEARCH_QUESTION")
    or "Summarize the main stories on this page and cite the source URL."
)
DEFAULT_SEED_URL = os.getenv("SEED_URL") or "https://news.ycombinator.com"
DEFAULT_MAX_STEPS = int(os.getenv("MAX_STEPS") or "2")

steel = Steel(steel_api_key=STEEL_API_KEY)
research_session = restate.VirtualObject("ResearchSession")


class ResearchRequest(BaseModel):
    question: str = DEFAULT_QUESTION
    seed_url: str = Field(default=DEFAULT_SEED_URL, alias="seedUrl")
    max_steps: int = Field(default=DEFAULT_MAX_STEPS, alias="maxSteps")


class Observation(BaseModel):
    url: str
    title: str
    status_code: int
    markdown: str


class ResearchState(BaseModel):
    observations: list[Observation] = []


class ResearchResult(BaseModel):
    answer: str
    sources: list[str]
    observations: int


class PlanStep(BaseModel):
    action: str
    url: str
    reason: str
    answer: str


def require_env() -> None:
    missing = []
    if STEEL_API_KEY == "your-steel-api-key-here":
        missing.append("STEEL_API_KEY")
    if OPENAI_API_KEY == "your-openai-api-key-here":
        missing.append("OPENAI_API_KEY")
    if missing:
        raise RuntimeError(f"Set {' and '.join(missing)} in .env before invoking the service.")


def normalize_url(url: str) -> str:
    parts = urlsplit(url)
    return urlunsplit((parts.scheme, parts.netloc, parts.path or "", parts.query, ""))


def trim_markdown(markdown: str) -> str:
    return " ".join(markdown.split())[:5000]


def observation_digest(observations: list[Observation]) -> str:
    if not observations:
        return "No pages have been scraped yet."

    chunks = []
    for index, obs in enumerate(observations, start=1):
        chunks.append(
            f"""Observation {index}
URL: {obs.url}
Title: {obs.title}
HTTP: {obs.status_code}
Markdown excerpt:
{obs.markdown}"""
        )
    return "\n\n".join(chunks)


def post_openai(body: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        "https://api.openai.com/v1/responses",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {OPENAI_API_KEY}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    with urllib.request.urlopen(request) as response:
        return json.loads(response.read().decode("utf-8"))


def extract_output_text(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("output_text"), str):
        return payload["output_text"]

    for item in payload.get("output", []):
        for part in item.get("content", []):
            text = part.get("text")
            if isinstance(text, str):
                return text

    raise RuntimeError("OpenAI response did not contain text output.")


async def call_openai_json(prompt: str, schema_name: str, schema: dict[str, Any]) -> dict[str, Any]:
    payload = await asyncio.to_thread(
        post_openai,
        {
            "model": OPENAI_MODEL,
            "input": prompt,
            "text": {
                "format": {
                    "type": "json_schema",
                    "name": schema_name,
                    "strict": True,
                    "schema": schema,
                }
            },
        },
    )
    return json.loads(extract_output_text(payload))


async def scrape_url(url: str) -> Observation:
    result = await asyncio.to_thread(
        steel.scrape,
        url=url,
        format=["markdown"],
    )
    return Observation(
        url=url,
        title=result.metadata.title or "(untitled)",
        status_code=result.metadata.status_code or 0,
        markdown=trim_markdown(result.content.markdown or ""),
    )


async def plan_next(question: str, seed_url: str, observations: list[Observation]) -> PlanStep:
    prompt = f"""Plan the next browser research action.

You are controlling a durable browser research agent.

Question: {question}
Seed URL: {seed_url}

Already scraped pages:
{observation_digest(observations)}

Choose exactly one next action:
- scrape_url: use this when another page scrape is needed. Prefer the seed URL first.
- finish: use this once the observations are enough to answer.

Return JSON only. If you choose scrape_url, put the absolute URL in url and leave answer empty.
If you choose finish, leave url empty and put the final answer in answer."""

    payload = await call_openai_json(
        prompt,
        "research_plan",
        {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "action": {"type": "string", "enum": ["scrape_url", "finish"]},
                "url": {"type": "string"},
                "reason": {"type": "string"},
                "answer": {"type": "string"},
            },
            "required": ["action", "url", "reason", "answer"],
        },
    )
    return PlanStep(**payload)


async def final_answer(question: str, observations: list[Observation]) -> ResearchResult:
    payload = await call_openai_json(
        f"""Answer the research question using only the scraped observations.

Question: {question}

Observations:
{observation_digest(observations)}

Return a concise answer. Include source URLs from the observations.""",
        "research_answer",
        {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "answer": {"type": "string"},
                "sources": {"type": "array", "items": {"type": "string"}},
            },
            "required": ["answer", "sources"],
        },
    )
    return ResearchResult(
        answer=payload["answer"],
        sources=payload["sources"],
        observations=len(observations),
    )


async def durable_final_answer(
    ctx: restate.ObjectContext, question: str, observations: list[Observation]
) -> ResearchResult:
    return await ctx.run_typed(
        "final answer",
        final_answer,
        question=question,
        observations=observations,
    )


@research_session.handler()
async def answer(ctx: restate.ObjectContext, req: ResearchRequest) -> ResearchResult:
    require_env()

    question = req.question or DEFAULT_QUESTION
    seed_url = normalize_url(req.seed_url or DEFAULT_SEED_URL)
    max_steps = max(1, min(req.max_steps or DEFAULT_MAX_STEPS, 4))

    raw_state = await ctx.get("state", type_hint=dict) or {}
    state = ResearchState(**raw_state)
    observations = list(state.observations)
    visited = {obs.url for obs in observations}

    for step in range(max_steps):
        plan = await ctx.run_typed(
            f"plan step {step + 1}",
            plan_next,
            question=question,
            seed_url=seed_url,
            observations=observations,
        )

        if plan.action == "finish" and observations:
            return await durable_final_answer(ctx, question, observations)

        try:
            url = normalize_url(plan.url or seed_url)
        except Exception:
            url = seed_url

        if url in visited:
            return await durable_final_answer(ctx, question, observations)

        observation = await ctx.run_typed(f"scrape {url}", scrape_url, url=url)
        observations.append(observation)
        visited.add(url)
        ctx.set("state", ResearchState(observations=observations).model_dump())

    return await durable_final_answer(ctx, question, observations)


@research_session.handler(kind="shared")
async def history(ctx: restate.ObjectSharedContext) -> dict[str, Any]:
    return await ctx.get("state", type_hint=dict) or {"observations": []}


app = restate.app([research_session])


if __name__ == "__main__":
    import hypercorn
    import hypercorn.asyncio

    config = hypercorn.Config()
    config.bind = ["0.0.0.0:9080"]
    asyncio.run(hypercorn.asyncio.serve(app, config))
