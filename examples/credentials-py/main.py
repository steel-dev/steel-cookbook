"""
Managing and using stored credentials with Steel for automated authentication.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/credentials-py
"""

import os
import sys
import time
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
from steel import Steel, APIError

load_dotenv()

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"

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
        print("\nCreating credential...")
        try:
            client.credentials.create(
                origin="https://demo.testfire.net",
                value={"username": "admin", "password": "admin"},
            )
        except APIError as err:
            if "Credential already exists" in str(getattr(err, "message", err)):
                print("Credential already exists, moving on.")
            else:
                raise

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
            f"{session.websocket_url}&apiKey={STEEL_API_KEY}"
        )

        print("Connected to browser via Playwright")

        current_context = browser.contexts[0]
        page = current_context.pages[0]

        # ============================================================
        # Your Automations Go Here!
        # ============================================================

        page.goto("https://demo.testfire.net", wait_until="networkidle")

        page.click("#AccountLink")

        time.sleep(2)

        heading_text = page.text_content("h1")
        if heading_text and heading_text.strip() == "Hello Admin User":
            print("Success, you are logged in")
        else:
            print("Uh oh, something went wrong!")

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
