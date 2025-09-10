"""
Web automation using Selenium with Steel's cloud browsers.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-selenium-starter
"""

import os
import sys
from dotenv import load_dotenv
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium import webdriver
from selenium.webdriver.remote.remote_connection import RemoteConnection
from steel import Steel

# Load environment variables from .env file
load_dotenv()

# Replace with your own API key
STEEL_API_KEY = os.getenv('STEEL_API_KEY') or "your-steel-api-key-here"

# Helper Class: Custom Remote Connection class to include Steel-specific headers
class CustomRemoteConnection(RemoteConnection):
    _session_id = None

    def __init__(self, remote_server_addr: str, session_id: str):
        super().__init__(remote_server_addr)
        self._session_id = session_id

    def get_remote_connection_headers(self, parsed_url, keep_alive=False):
        headers = super().get_remote_connection_headers(parsed_url, keep_alive)
        headers.update({'steel-api-key': os.environ.get("STEEL_API_KEY")})
        headers.update({'session-id': self._session_id})
        return headers

# Initialize Steel client with the API key from environment variables
client = Steel(steel_api_key=STEEL_API_KEY)

def main():
    print("🚀 Steel + Selenium Python Starter")
    print("=" * 60)
    
    if STEEL_API_KEY == "your-steel-api-key-here":
        print("⚠️  WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key")
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        sys.exit(1)
    session = None
    driver = None

    try:
        print("Creating Steel session...")

        # Create a new Steel session with is_selenium=True
        session = client.sessions.create(
            is_selenium=True,              # Enable Selenium mode (required)
            # session_timeout=1800000,     # Session timeout in ms (default: 5 mins)
        )
        print(session)

        print(f"""Session created successfully with Session ID: {session.id}.
You can view the session live at {session.session_viewer_url}
        """)

        # Connect to the session via Selenium's WebDriver using the CustomRemoteConnection class
        driver = webdriver.Remote(
            command_executor=CustomRemoteConnection(
                remote_server_addr='http://connect.steelbrowser.com/selenium',
                session_id=session.id
            ),
            options=webdriver.ChromeOptions()
        )
        print("Connected to browser via Selenium")

        # ============================================================
        # Your Automations Go Here!
        # ============================================================

        # Example script - Navigate to Hacker News and extract the top 5 stories
        print("Navigating to Hacker News...")
        driver.get("https://news.ycombinator.com")

        # Wait for the story elements to load
        WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.CLASS_NAME, "titleline"))
        )

        # Extract the top 5 stories
        stories = []
        story_elements = driver.find_elements(By.CLASS_NAME, "athing")[:5]

        for element in story_elements:
            title_element = element.find_element(
                By.CLASS_NAME, "titleline").find_element(By.TAG_NAME, "a")
            subtext = element.find_element(
                By.XPATH, "following-sibling::tr[1]")
            score = subtext.find_element(By.CLASS_NAME, "score") if subtext.find_elements(
                By.CLASS_NAME, "score") else None

            stories.append({
                'title': title_element.text,
                'link': title_element.get_attribute('href'),
                'points': score.text.split()[0] if score else "0"
            })

        # Print the results
        print("\nTop 5 Hacker News Stories:")
        for i, story in enumerate(stories, 1):
            print(f"\n{i}. {story['title']}")
            print(f"   Link: {story['link']}")
            print(f"   Points: {story['points']}")

        # ============================================================
        # End of Automations
        # ============================================================

    except Exception as error:
        print("An error occurred:", error)
        raise
    finally:
        if session:
            print("Releasing session...")
            client.sessions.release(session.id)
            print("Session released")

        print("Done!")


if __name__ == "__main__":
    main()
