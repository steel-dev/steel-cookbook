"""
Run a Temporal workflow whose activities capture pages with Steel.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/temporal-browser-workflow-py
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
import urllib.request
from contextlib import suppress
from dataclasses import asdict
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv
from steel import Steel
from temporalio import activity
from temporalio.client import Client
from temporalio.worker import Worker

from workflows import (
    BrowserWorkflow,
    BrowserWorkflowInput,
    CapturePageInput,
    PageCapture,
    PageLink,
)

load_dotenv()

DEFAULT_URLS = ["https://news.ycombinator.com", "https://example.com"]


def env_or(key: str, fallback: str) -> str:
    return os.getenv(key) or fallback


def require_env(key: str) -> str:
    value = os.getenv(key)
    if not value:
        raise RuntimeError(f"Set {key} in .env before running this recipe")
    return value


def read_urls() -> list[str]:
    raw = os.getenv("TARGET_URLS")
    if not raw:
        return DEFAULT_URLS
    urls = [part.strip() for part in raw.split(",") if part.strip()]
    return urls or DEFAULT_URLS


def read_link_limit() -> int:
    value = int(os.getenv("LINK_LIMIT") or "8")
    if value < 1 or value > 25:
        raise RuntimeError("LINK_LIMIT must be an integer between 1 and 25")
    return value


def artifact_base_name(url: str) -> str:
    host = urlparse(url).netloc.replace(":", "-") or "page"
    stamp = time.strftime("%Y-%m-%dT%H-%M-%S", time.gmtime())
    return f"{host}-{stamp}"


def markdown_preview(markdown: str) -> str:
    return " ".join(markdown.split())[:800]


def download(url: str, dest: Path) -> None:
    with urllib.request.urlopen(url) as response:
        dest.write_bytes(response.read())


def link_value(link: object, name: str) -> str:
    value = getattr(link, name, "")
    return value if isinstance(value, str) else ""


def render_markdown(page: PageCapture, markdown: str) -> str:
    links = "\n".join(
        f"{index}. [{link.text}]({link.url})"
        for index, link in enumerate(page.links, start=1)
    )
    return "\n".join(
        [
            f"# {page.title or 'Untitled page'}",
            "",
            f"Requested URL: {page.url}",
            f"Final URL: {page.final_url}",
            f"HTTP status: {page.status_code}",
            f"Screenshot URL: {page.screenshot_url}",
            "",
            "## Markdown",
            "",
            markdown or "(no markdown returned)",
            "",
            "## Links",
            "",
            links or "(no links found)",
            "",
        ]
    )


def capture_page_sync(data: CapturePageInput) -> PageCapture:
    started = time.monotonic()
    steel = Steel(steel_api_key=require_env("STEEL_API_KEY"))
    artifact_dir = Path(env_or("ARTIFACT_DIR", "artifacts")).resolve()
    artifact_dir.mkdir(parents=True, exist_ok=True)

    scraped = steel.scrape(url=data.url, format=["markdown"])
    screenshot = steel.screenshot(
        url=data.url,
        full_page=data.full_page_screenshot,
    )

    metadata = scraped.metadata
    markdown = scraped.content.markdown or ""
    final_url = (
        getattr(metadata, "url_source", "")
        or getattr(metadata, "canonical", "")
        or data.url
    )
    base = artifact_base_name(final_url)
    screenshot_path = artifact_dir / f"{base}.png"
    markdown_path = artifact_dir / f"{base}.md"

    links = []
    for link in scraped.links[: data.link_limit]:
        url = link_value(link, "url")
        links.append(PageLink(text=link_value(link, "text") or url, url=url))

    page = PageCapture(
        url=data.url,
        final_url=final_url,
        title=getattr(metadata, "title", "") or "(untitled)",
        status_code=int(getattr(metadata, "status_code", 0) or 0),
        markdown_preview=markdown_preview(markdown),
        links=links,
        screenshot_url=screenshot.url,
        screenshot_path=str(screenshot_path),
        markdown_path=str(markdown_path),
        duration_ms=int((time.monotonic() - started) * 1000),
    )

    markdown_path.write_text(render_markdown(page, markdown), encoding="utf-8")
    download(screenshot.url, screenshot_path)

    return page


@activity.defn(name="capture_page")
async def capture_page(data: CapturePageInput) -> PageCapture:
    return await asyncio.to_thread(capture_page_sync, data)


def build_workflow_input() -> BrowserWorkflowInput:
    return BrowserWorkflowInput(
        urls=read_urls(),
        link_limit=read_link_limit(),
        full_page_screenshot=os.getenv("FULL_PAGE_SCREENSHOT") != "false",
    )


async def main() -> None:
    address = env_or("TEMPORAL_ADDRESS", "localhost:7233")
    namespace = env_or("TEMPORAL_NAMESPACE", "default")
    task_queue = env_or("TEMPORAL_TASK_QUEUE", "steel-browser-workflows-py")

    client = await Client.connect(address, namespace=namespace)
    worker = Worker(
        client,
        task_queue=task_queue,
        workflows=[BrowserWorkflow],
        activities=[capture_page],
    )

    worker_task = asyncio.create_task(worker.run())
    try:
        handle = await client.start_workflow(
            BrowserWorkflow.run,
            build_workflow_input(),
            id=f"steel-browser-py-{int(time.time() * 1000)}",
            task_queue=task_queue,
        )
        print(f"Started Temporal workflow: {handle.id}")
        result = await handle.result()
        print("Workflow result:")
        print(json.dumps(asdict(result), indent=2))
    finally:
        worker_task.cancel()
        with suppress(asyncio.CancelledError):
            await worker_task


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as exc:
        print(f"Temporal browser workflow failed: {exc}", file=sys.stderr)
        sys.exit(1)
