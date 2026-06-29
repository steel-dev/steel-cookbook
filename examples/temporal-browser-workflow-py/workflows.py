"""
Deterministic Temporal workflow for batched Steel page captures.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/temporal-browser-workflow-py
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import timedelta

from temporalio import workflow
from temporalio.common import RetryPolicy


@dataclass
class BrowserWorkflowInput:
    urls: list[str] | None = None
    link_limit: int = 8
    full_page_screenshot: bool = True


@dataclass
class CapturePageInput:
    url: str
    link_limit: int
    full_page_screenshot: bool


@dataclass
class PageLink:
    text: str
    url: str


@dataclass
class PageCapture:
    url: str
    final_url: str
    title: str
    status_code: int
    markdown_preview: str
    links: list[PageLink] = field(default_factory=list)
    screenshot_url: str = ""
    screenshot_path: str = ""
    markdown_path: str = ""
    duration_ms: int = 0


@dataclass
class BrowserWorkflowResult:
    pages: list[PageCapture]
    page_count: int


def clamp_link_limit(value: int | None) -> int:
    if value is None:
        return 8
    return max(1, min(int(value), 25))


@workflow.defn
class BrowserWorkflow:
    @workflow.run
    async def run(self, data: BrowserWorkflowInput) -> BrowserWorkflowResult:
        urls = data.urls or ["https://news.ycombinator.com", "https://example.com"]
        link_limit = clamp_link_limit(data.link_limit)
        pages: list[PageCapture] = []

        for url in urls[:10]:
            page = await workflow.execute_activity(
                "capture_page",
                CapturePageInput(
                    url=url,
                    link_limit=link_limit,
                    full_page_screenshot=data.full_page_screenshot,
                ),
                result_type=PageCapture,
                start_to_close_timeout=timedelta(minutes=2),
                retry_policy=RetryPolicy(
                    initial_interval=timedelta(seconds=5),
                    maximum_interval=timedelta(seconds=30),
                    backoff_coefficient=2,
                    maximum_attempts=3,
                ),
            )
            pages.append(page)

        return BrowserWorkflowResult(pages=pages, page_count=len(pages))
