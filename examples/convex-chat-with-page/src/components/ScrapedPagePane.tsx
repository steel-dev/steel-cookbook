// ABOUTME: Right-hand pane that renders the latest page the agent scraped.
// ABOUTME: The split-screen animation is driven by the parent's CSS grid.

import { memo } from "react";
import { Markdown } from "@/components/Markdown";
import { Spinner } from "@/components/Spinner";

export type LatestScrape = {
  url: string;
  title: string;
  markdown: string;
  createdAt: number;
} | null;

function ScrapedPagePaneImpl({
  scrape,
  pending,
}: {
  scrape: LatestScrape;
  pending: boolean;
}) {
  if (!scrape && !pending) return null;

  return (
    <div className="flex h-full flex-col min-w-0 border-l border-border bg-muted/40">
      <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-xs text-muted-foreground">
        {scrape ? (
          <>
            <a
              href={scrape.url}
              target="_blank"
              rel="noreferrer"
              className="truncate text-foreground hover:text-primary"
            >
              {scrape.title || scrape.url}
            </a>
            <span className="shrink-0 font-mono">
              {scrape.markdown.length.toLocaleString()} chars
            </span>
          </>
        ) : (
          <div className="flex items-center gap-2">
            <Spinner />
            <span>fetching page…</span>
          </div>
        )}
      </div>

      <div
        className="flex-1 overflow-y-auto px-5 py-4"
        style={{ contain: "paint" }}
      >
        {scrape ? (
          <Markdown>{scrape.markdown}</Markdown>
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <Spinner className="text-2xl" />
          </div>
        )}
      </div>
    </div>
  );
}

// Memoized: during streaming the parent re-renders on every delta, but the
// pane only cares about the latest scrape + pending flag.
export const ScrapedPagePane = memo(ScrapedPagePaneImpl);
