"""
Scrape a page to markdown, screenshot, and PDF with Steel, saving each to disk.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/scrape-py
"""

import os
import sys
import urllib.request
from pathlib import Path
from dotenv import load_dotenv
from steel import Steel

load_dotenv()

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"

TARGET_URL = os.getenv("TARGET_URL") or "https://news.ycombinator.com"

OUTPUT_DIR = Path(__file__).parent / "output"

client = Steel(
    steel_api_key=STEEL_API_KEY,
)


def download(url: str, dest: Path) -> int:
    with urllib.request.urlopen(url) as response:
        data = response.read()
    dest.write_bytes(data)
    return len(data)


def main():
    print("Steel Scrape API (Python)")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("WARNING: Set STEEL_API_KEY in .env before running.")
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        sys.exit(1)

    OUTPUT_DIR.mkdir(exist_ok=True)

    print(f"Scraping {TARGET_URL} ...")

    # One server-side call returns markdown inline plus hosted screenshot and PDF.
    # No session to create, connect to, or release: the API runs the browser for you.
    result = client.scrape(
        url=TARGET_URL,
        format=["markdown"],
        screenshot=True,
        pdf=True,
    )

    title = result.metadata.title or "(untitled)"
    status = result.metadata.status_code
    markdown = result.content.markdown or ""

    print(f"Fetched \"{title}\" (HTTP {status})")
    print(f"Markdown: {len(markdown)} chars, {len(result.links)} links")

    # The markdown comes back inline, so write it straight to disk.
    markdown_path = OUTPUT_DIR / "page.md"
    markdown_path.write_text(markdown, encoding="utf-8")
    print(f"Saved {markdown_path.name} ({len(markdown)} chars)")

    # Screenshot and PDF come back as hosted URLs. Fetch the bytes and save them.
    if result.screenshot:
        screenshot_path = OUTPUT_DIR / "screenshot.png"
        size = download(result.screenshot.url, screenshot_path)
        print(f"Saved {screenshot_path.name} ({size} bytes)")

    if result.pdf:
        pdf_path = OUTPUT_DIR / "page.pdf"
        size = download(result.pdf.url, pdf_path)
        print(f"Saved {pdf_path.name} ({size} bytes)")

    print(f"\nArtifacts written to {OUTPUT_DIR}")
    print("Done!")


if __name__ == "__main__":
    main()
