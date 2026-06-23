"""
Upload a Chrome extension once and attach it to a Steel session, then confirm it injects into the page.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/extensions-py
"""

import os
import sys
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
from steel import Steel

load_dotenv()

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"

EXTENSION_NAME = "Github_Isometric_Contribu"
EXTENSION_URL = "https://chromewebstore.google.com/detail/github-isometric-contribu/mjoedlfflcchnleknnceiplgaeoegien"
PROFILE_URL = "https://github.com/junhsss"
INJECTED_SELECTOR = "div.ic-contributions-wrapper"

client = Steel(steel_api_key=STEEL_API_KEY)


def main():
    print("Steel + Extensions (Python)")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key")
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        sys.exit(1)

    session = None
    browser = None
    playwright = None

    try:
        print("\nChecking for an existing extension...")
        existing = next(
            (ext for ext in client.extensions.list().extensions if ext.name == EXTENSION_NAME),
            None,
        )

        if existing:
            print(f"Reusing extension: {existing.id}")
            extension = existing
        else:
            print("Uploading extension...")
            extension = client.extensions.upload(url=EXTENSION_URL)
            print(f"Uploaded extension: {extension.id}")

        print("\nCreating Steel session...")
        session = client.sessions.create(extension_ids=[extension.id])

        print(f"""\033[1;93mSteel Session created!\033[0m
View session at \033[1;37m{session.session_viewer_url}\033[0m
""")

        playwright = sync_playwright().start()
        browser = playwright.chromium.connect_over_cdp(
            f"{session.websocket_url}&apiKey={STEEL_API_KEY}"
        )
        print("Connected to browser via Playwright")

        context = browser.contexts[0]
        page = context.new_page()

        print(f"Navigating to {PROFILE_URL} ...")
        page.goto(PROFILE_URL, wait_until="domcontentloaded")

        print(f"Waiting for injected element: {INJECTED_SELECTOR}")
        try:
            page.wait_for_selector(INJECTED_SELECTOR, timeout=30000)
            print("Injected element appeared: the extension loaded into the page.")
        except Exception:
            print("Injected element never appeared: the extension did not load.")

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
