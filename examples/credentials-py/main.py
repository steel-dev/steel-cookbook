"""
Managing and using stored credentials with Steel for automated authentication.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/credentials-py
"""

import os
import sys
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
from steel import ConflictError, Steel

load_dotenv()

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
ORIGIN = "https://practice.expandtesting.com"

client = Steel(
    steel_api_key=STEEL_API_KEY,
)


def main():
    print("Steel + Credentials Starter")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key")
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        sys.exit(1)

    session = None
    browser = None

    try:
        print("\nStoring credential...")
        try:
            client.credentials.create(
                origin=ORIGIN,
                value={"username": "practice", "password": "SuperSecretPassword!"},
            )
            print("Credential stored.")
        except ConflictError:
            print("Credential already exists, moving on.")

        print("Creating Steel session...")

        session = client.sessions.create(
            credentials={},
        )

        print(
            f"\033[1;93mSteel Session created!\033[0m\n"
            f"View session at \033[1;37m{session.session_viewer_url}\033[0m"
        )

        playwright = sync_playwright().start()
        browser = playwright.chromium.connect_over_cdp(
            session.websocket_url
        )

        print("Connected to browser via Playwright")

        current_context = browser.contexts[0]
        page = current_context.pages[0]

        # ============================================================
        # Your Automations Go Here!
        # ============================================================

        page.goto(f"{ORIGIN}/login")
        page.wait_for_url(f"{ORIGIN}/secure", timeout=20_000)

        message = page.locator("#flash b").inner_text()
        print(f"Steel signed in. The site says: {message}")

        # ============================================================
        # End of Automations
        # ============================================================

    except Exception as e:
        print(f"An error occurred: {e}")
        raise
    finally:
        if session:
            print("Releasing session...")
            client.sessions.release(session.id)
            print("Session released")

        print("Done!")


if __name__ == "__main__":
    main()
