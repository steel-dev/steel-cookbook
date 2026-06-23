"""
Upload a local CSV into a Steel session and feed it to a remote file input over CDP.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/files-py
"""

import os
import sys
from pathlib import Path
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
from steel import Steel

load_dotenv()

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"

client = Steel(
    steel_api_key=STEEL_API_KEY,
)


def main():
    print("Steel + Files API Starter")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key")
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        sys.exit(1)

    session = None
    browser = None
    playwright = None

    try:
        print("\nCreating Steel session...")
        session = client.sessions.create()
        print(f"\033[1;93mSteel Session created!\033[0m")
        print(f"View session at \033[1;37m{session.session_viewer_url}\033[0m")

        csv_path = Path(__file__).parent / "assets" / "stock.csv"
        csv_bytes = csv_path.read_bytes()

        print("Uploading CSV file to the Steel session...")
        uploaded = client.sessions.files.upload(
            session.id,
            file=("stock.csv", csv_bytes, "text/csv"),
        )
        print(f"\033[1;92mCSV file uploaded successfully!\033[0m")
        print(f"File path on Steel session: \033[1;37m{uploaded.path}\033[0m")

        playwright = sync_playwright().start()
        browser = playwright.chromium.connect_over_cdp(
            f"{session.websocket_url}&apiKey={STEEL_API_KEY}"
        )
        print("Connected to browser via Playwright")

        current_context = browser.contexts[0]
        page = current_context.pages[0]

        page.goto("https://www.csvplot.com/")

        cdp = current_context.new_cdp_session(page)
        document = cdp.send("DOM.getDocument")

        input_node = cdp.send(
            "DOM.querySelector",
            {"nodeId": document["root"]["nodeId"], "selector": "#load-file"},
        )

        cdp.send(
            "DOM.setFileInputFiles",
            {"files": [uploaded.path], "nodeId": input_node["nodeId"]},
        )

        svg = page.wait_for_selector("svg.main-svg")
        svg.scroll_into_view_if_needed()
        svg.screenshot(path="stock.png")

    except Exception as e:
        print(f"An error occurred: {e}")
        raise
    finally:
        if browser:
            browser.close()
        if playwright:
            playwright.stop()
        if session:
            print("Releasing session...")
            client.sessions.release(session.id)
            print("Session released")
        print("Done!")


if __name__ == "__main__":
    main()
