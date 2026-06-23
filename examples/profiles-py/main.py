"""
Persist a browser profile across two Steel sessions so a shopping cart survives the gap.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/profiles-py
"""

import os
import sys
import time
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright
from steel import Steel

load_dotenv()

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"

client = Steel(steel_api_key=STEEL_API_KEY)


def connect(playwright, session):
    browser = playwright.chromium.connect_over_cdp(
        f"{session.websocket_url}&apiKey={STEEL_API_KEY}"
    )
    page = browser.contexts[0].pages[0]
    return browser, page


def add_first_book_to_cart(page):
    page.goto("https://demowebshop.tricentis.com/books", wait_until="networkidle")

    for selector in (".product-box-add-to-cart-button", 'input[value="Add to cart"]'):
        button = page.locator(selector).first
        if button.count() > 0:
            button.click()
            break
    else:
        print("Could not find an add-to-cart button")
        return

    for _ in range(10):
        qty = page.locator(".cart-qty").first.text_content() or ""
        if "(0)" not in qty:
            break
        page.wait_for_timeout(1000)

    print(f"Added a book to the cart (cart shows {qty.strip()})")


def count_cart_rows(page):
    page.goto("https://demowebshop.tricentis.com/cart", wait_until="networkidle")
    return page.locator(".cart tbody tr").count()


def main():
    print("Steel Profiles Demo (Python)")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key")
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        sys.exit(1)

    session = None
    playwright = sync_playwright().start()

    try:
        session = client.sessions.create(persist_profile=True)
        profile_id = session.profile_id
        print(f"Session #1: {session.session_viewer_url}")
        print(f"Profile ID: {profile_id}")

        browser, page = connect(playwright, session)
        add_first_book_to_cart(page)
        browser.close()

        client.sessions.release(session.id)
        print("Session #1 released, snapshotting profile...")
        time.sleep(3)

        session = client.sessions.create(persist_profile=True, profile_id=profile_id)
        print(f"Session #2: {session.session_viewer_url}")
        print(f"Profile ID: {profile_id}")

        browser, page = connect(playwright, session)
        rows = count_cart_rows(page)
        browser.close()

        if rows > 0:
            print(f"Success: cart persisted across sessions with {rows} item(s) via the profile")
        else:
            print("Cart was empty in session #2, profile did not carry the state")

    except Exception as e:
        print(f"An error occurred: {e}")
        raise
    finally:
        if session:
            print("Releasing session...")
            client.sessions.release(session.id)
            print("Session released")
        playwright.stop()
        print("Done!")


if __name__ == "__main__":
    main()
