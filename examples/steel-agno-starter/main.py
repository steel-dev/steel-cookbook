import json
import os
from typing import Any, Dict, List, Optional

from agno.tools import Toolkit
from agno.utils.log import log_debug, logger
from agno.agent import Agent
from playwright.sync_api import sync_playwright
from steel import Steel

from dotenv import load_dotenv

load_dotenv()

# Replace with your own API keys
STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or "your-openai-api-key-here";

# Replace with your own task
TASK = os.getenv("TASK") or "Go to https://quotes.toscrape.com and: 1. Get the first 3 quotes with authors 2. Navigate to page 2 3. Get 2 more quotes from page 2"

class SteelTools(Toolkit):
    def __init__(
        self,
        api_key: Optional[str] = None,
        **kwargs,
    ):
        """Initialize SteelTools.

        Args:
            api_key (str, optional): Steel API key (defaults to STEEL_API_KEY env var).
        """
        self.api_key = api_key or os.getenv("STEEL_API_KEY")
        if not self.api_key:
            raise ValueError(
                "STEEL_API_KEY is required. Please set the STEEL_API_KEY environment variable."
            )

        self.client = Steel(steel_api_key=self.api_key)

        self._playwright = None
        self._browser = None
        self._page = None
        self._session = None
        self._connect_url = None

        tools: List[Any] = []
        tools.append(self.navigate_to)
        tools.append(self.screenshot)
        tools.append(self.get_page_content)
        tools.append(self.close_session)

        super().__init__(name="steel_tools", tools=tools, **kwargs)

    def _ensure_session(self):
        """Ensures a Steel session exists, creating one if needed."""
        if not self._session:
            try:
                self._session = self.client.sessions.create()  # type: ignore
                if self._session:
                    self._connect_url = f"{self._session.websocket_url}&apiKey={self.api_key}"  # type: ignore
                    log_debug(f"Created new Steel session with ID: {self._session.id}")
            except Exception as e:
                logger.error(f"Failed to create Steel session: {str(e)}")
                raise

    def _initialize_browser(self, connect_url: Optional[str] = None):
        """
        Initialize browser connection if not already initialized.
        Use provided connect_url or ensure we have a session with a connect_url
        """
        if connect_url:
            self._connect_url = connect_url if connect_url else ""  # type: ignore
        elif not self._connect_url:
            self._ensure_session()

        if not self._playwright:
            self._playwright = sync_playwright().start()  # type: ignore
            if self._playwright:
                self._browser = self._playwright.chromium.connect_over_cdp(self._connect_url)
            context = self._browser.contexts[0] if self._browser else ""
            self._page = context.pages[0] or context.new_page()  # type: ignore

    def _cleanup(self):
        """Clean up browser resources."""
        if self._browser:
            self._browser.close()
            self._browser = None
        if self._playwright:
            self._playwright.stop()
            self._playwright = None
        self._page = None

    def _create_session(self) -> Dict[str, str]:
        """Creates a new Steel browser session.

        Returns:
            Dictionary containing session details including session_id and connect_url.
        """
        self._ensure_session()
        return {
            "session_id": self._session.id if self._session else "",
            "connect_url": self._connect_url or "",
        }

    def navigate_to(self, url: str, connect_url: Optional[str] = None) -> str:
        """Navigates to a URL.

        Args:
            url (str): The URL to navigate to
            connect_url (str, optional): The connection URL from an existing session

        Returns:
            JSON string with navigation status
        """
        try:
            self._initialize_browser(connect_url)
            if self._page:
                self._page.goto(url, wait_until="networkidle")
            result = {"status": "complete", "title": self._page.title() if self._page else "", "url": url}
            return json.dumps(result)
        except Exception as e:
            self._cleanup()
            raise e

    def screenshot(self, path: str, full_page: bool = True, connect_url: Optional[str] = None) -> str:
        """Takes a screenshot of the current page.

        Args:
            path (str): Where to save the screenshot
            full_page (bool): Whether to capture the full page
            connect_url (str, optional): The connection URL from an existing session

        Returns:
            JSON string confirming screenshot was saved
        """
        try:
            self._initialize_browser(connect_url)
            if self._page:
                self._page.screenshot(path=path, full_page=full_page)
            return json.dumps({"status": "success", "path": path})
        except Exception as e:
            self._cleanup()
            raise e

    def get_page_content(self, connect_url: Optional[str] = None) -> str:
        """Gets the HTML content of the current page.

        Args:
            connect_url (str, optional): The connection URL from an existing session

        Returns:
            The page HTML content
        """
        try:
            self._initialize_browser(connect_url)
            return self._page.content() if self._page else ""
        except Exception as e:
            self._cleanup()
            raise e

    def close_session(self) -> str:
        """Closes the current Steel browser session and cleans up resources.

        Returns:
            JSON string with closure status
        """
        try:
            self._cleanup()

            try:
                if self._session:
                    self.client.sessions.release(self._session.id)  # type: ignore
            except Exception as release_error:
                logger.warning(f"Failed to release Steel session: {str(release_error)}")

            self._session = None
            self._connect_url = None

            return json.dumps(
                {
                    "status": "closed",
                    "message": "Browser resources cleaned up. Steel session released if active.",
                }
            )
        except Exception as e:
            return json.dumps({"status": "warning", "message": f"Cleanup completed with warning: {str(e)}"})

            
def main():
    print("🚀 Steel + Agno Starter")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("⚠️  WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key")
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        return

    if OPENAI_API_KEY == "your-openai-api-key-here":
        print("⚠️  WARNING: Please replace 'your-openai-api-key-here' with your actual OpenAI API key")
        print("   Get your API key at: https://platform.openai.com/api-keys")
        return

    tools = SteelTools(api_key=STEEL_API_KEY)
    agent = Agent(
        name="Web Scraper",
        tools=[tools],
        instructions=[
            "Extract content clearly and format nicely",
            "Always close sessions when done",
        ],
        markdown=True,
    )

    try:
        response = agent.run(TASK)
        print("\nResults:\n")
        print(response.content)
    except Exception as e:
        print(f"An error occurred: {e}")
    finally:
        tools.close_session()
        print("Done!")


if __name__ == "__main__":
    main()