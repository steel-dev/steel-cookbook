"""
Persist authentication state across Steel sessions by capturing and restoring an auth context.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/auth-context-py
"""

import os
import sys

from dotenv import load_dotenv
from playwright.sync_api import Page, sync_playwright
from steel import Steel

load_dotenv()

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"

client = Steel(steel_api_key=STEEL_API_KEY)


def login(page: Page):
    page.goto("https://practice.expandtesting.com/login")
    page.fill('input[name="username"]', "practice")
    page.fill('input[name="password"]', "SuperSecretPassword!")
    page.click('button[type="submit"]')


def verify_auth(page: Page) -> bool:
    page.goto("https://practice.expandtesting.com/secure")
    welcome_text = page.text_content("#username")
    return welcome_text is not None and "Hi, practice!" in welcome_text


def main():
    print("Steel + Reuse Auth Context Example")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key")
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        sys.exit(1)

    session = None
    playwright = sync_playwright().start()

    try:
        print("\nCreating initial Steel session...")
        session = client.sessions.create()
        print(f"\033[1;93mSteel Session #1 created!\033[0m")
        print(f"View session at \033[1;37m{session.session_viewer_url}\033[0m")

        browser = playwright.chromium.connect_over_cdp(
            f"{session.websocket_url}&apiKey={STEEL_API_KEY}"
        )
        page = browser.contexts[0].pages[0]
        login(page)

        if verify_auth(page):
            print("Initial authentication successful")

        session_context = client.sessions.context(session.id)
        browser.close()

        client.sessions.release(session.id)
        print("Session #1 released")

        print("\nCreating second Steel session with the captured context...")
        session = client.sessions.create(session_context=session_context)
        print(f"\033[1;93mSteel Session #2 created!\033[0m")
        print(f"View session at \033[1;37m{session.session_viewer_url}\033[0m")

        browser = playwright.chromium.connect_over_cdp(
            f"{session.websocket_url}&apiKey={STEEL_API_KEY}"
        )
        new_page = browser.contexts[0].pages[0]

        if verify_auth(new_page):
            print("\033[32mAuthentication successfully transferred!\033[0m")

        browser.close()

    except Exception as e:
        print(f"Error: {e}")
        raise
    finally:
        if session:
            client.sessions.release(session.id)
            print("Session #2 released")
        playwright.stop()


if __name__ == "__main__":
    main()
