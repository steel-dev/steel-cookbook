import os
import time
import base64
import json
from typing import List, Dict, Callable
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, Error as PlaywrightError
from steel import Steel
from PIL import Image
from io import BytesIO

# Load environment variables
load_dotenv(override=True)

# Blocked domains for security
BLOCKED_DOMAINS = [
    "maliciousbook.com",
    "evilvideos.com", 
    "darkwebforum.com",
    "shadytok.com",
    "suspiciouspins.com",
    "ilanbigio.com",
]

# Key mapping for CUA to Playwright
CUA_KEY_TO_PLAYWRIGHT_KEY = {
    "/": "Divide",
    "\\": "Backslash",
    "alt": "Alt",
    "arrowdown": "ArrowDown",
    "arrowleft": "ArrowLeft",
    "arrowright": "ArrowRight",
    "arrowup": "ArrowUp",
    "backspace": "Backspace",
    "capslock": "CapsLock",
    "cmd": "Meta",
    "ctrl": "Control",
    "delete": "Delete",
    "end": "End",
    "enter": "Enter",
    "esc": "Escape",
    "home": "Home",
    "insert": "Insert",
    "option": "Alt",
    "pagedown": "PageDown",
    "pageup": "PageUp",
    "shift": "Shift",
    "space": " ",
    "super": "Meta",
    "tab": "Tab",
    "win": "Meta",
}


# Utility Functions
def pp(obj):
    """Pretty print a JSON object."""
    print(json.dumps(obj, indent=4))


def show_image(base_64_image):
    """Display an image from base64 string."""
    image_data = base64.b64decode(base_64_image)
    image = Image.open(BytesIO(image_data))
    image.show()


def sanitize_message(msg: dict) -> dict:
    """Return a copy of the message with image_url omitted for computer_call_output messages."""
    if msg.get("type") == "computer_call_output":
        output = msg.get("output", {})
        if isinstance(output, dict):
            sanitized = msg.copy()
            sanitized["output"] = {**output, "image_url": "[omitted]"}
            return sanitized
    return msg


def create_response(**kwargs):
    """Send a request to OpenAI API to get a response."""
    url = "https://api.openai.com/v1/responses"
    headers = {
        "Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}",
        "Content-Type": "application/json"
    }

    openai_org = os.getenv("OPENAI_ORG")
    if openai_org:
        headers["Openai-Organization"] = openai_org

    response = requests.post(url, headers=headers, json=kwargs)

    if response.status_code != 200:
        print(f"Error: {response.status_code} {response.text}")

    return response.json()


def check_blocklisted_url(url: str) -> None:
    """Raise ValueError if the given URL (including subdomains) is in the blocklist."""
    hostname = urlparse(url).hostname or ""
    if any(
        hostname == blocked or hostname.endswith(f".{blocked}")
        for blocked in BLOCKED_DOMAINS
    ):
        raise ValueError(f"Blocked URL: {url}")


class SteelBrowser:
    """
    Steel browser implementation for OpenAI Computer Use Assistant.
    
    This class manages a Steel browser session and provides methods for
    computer actions like clicking, typing, and taking screenshots.
    """

    def __init__(
        self,
        width: int = 1024,
        height: int = 768,
        proxy: bool = False,
        solve_captcha: bool = False,
        virtual_mouse: bool = True,
        session_timeout: int = 900000,  # 15 minutes
        ad_blocker: bool = True,
        start_url: str = "https://www.google.com"
    ):
        """Initialize the Steel browser instance."""
        self.client = Steel(
            steel_api_key=os.getenv("STEEL_API_KEY"),
            base_url=os.getenv("STEEL_BASE_URL", "https://api.steel.dev")
        )
        self.dimensions = (width, height)
        self.proxy = proxy
        self.solve_captcha = solve_captcha
        self.virtual_mouse = virtual_mouse
        self.session_timeout = session_timeout
        self.ad_blocker = ad_blocker
        self.start_url = start_url
        self.session = None
        self._playwright = None
        self._browser = None
        self._page = None

    def get_environment(self):
        """Return the environment type."""
        return "browser"

    def get_dimensions(self):
        """Return browser dimensions."""
        return self.dimensions

    def get_current_url(self) -> str:
        """Get the current page URL."""
        return self._page.url if self._page else ""

    def __enter__(self):
        """Enter context manager - create Steel session and connect browser."""
        # Create Steel session
        width, height = self.dimensions
        session_params = {
            "use_proxy": self.proxy,
            "solve_captcha": self.solve_captcha,
            "api_timeout": self.session_timeout,
            "block_ads": self.ad_blocker,
            "dimensions": {"width": width, "height": height}
        }
        self.session = self.client.sessions.create(**session_params)

        print("Steel Session created successfully!")
        print(f"View live session at: {self.session.session_viewer_url}")

        # Start Playwright and connect to Steel session
        self._playwright = sync_playwright().start()
        browser = self._playwright.chromium.connect_over_cdp(
            f"wss://connect.steel.dev?apiKey={os.getenv('STEEL_API_KEY')}&sessionId={self.session.id}",
            timeout=60000
        )
        self._browser = browser
        context = browser.contexts[0]

        # Set up URL blocking
        def handle_route(route, request):
            url = request.url
            try:
                check_blocklisted_url(url)
                route.continue_()
            except ValueError:
                print(f"Blocking URL: {url}")
                route.abort()

        # Add virtual mouse if enabled
        if self.virtual_mouse:
            context.add_init_script("""
                if (window.self === window.top) {
                    function initCursor() {
                        const CURSOR_ID = '__cursor__';
                        if (document.getElementById(CURSOR_ID)) return;

                        const cursor = document.createElement('div');
                        cursor.id = CURSOR_ID;
                        Object.assign(cursor.style, {
                            position: 'fixed',
                            top: '0px',
                            left: '0px',
                            width: '20px',
                            height: '20px',
                            backgroundImage: 'url("data:image/svg+xml;utf8,<svg width=\\'16\\' height=\\'16\\' viewBox=\\'0 0 20 20\\' fill=\\'black\\' outline=\\'white\\' xmlns=\\'http://www.w3.org/2000/svg\\'><path d=\\'M15.8089 7.22221C15.9333 7.00888 15.9911 6.78221 15.9822 6.54221C15.9733 6.29333 15.8978 6.06667 15.7555 5.86221C15.6133 5.66667 15.4311 5.52445 15.2089 5.43555L1.70222 0.0888888C1.47111 0 1.23555 -0.0222222 0.995555 0.0222222C0.746667 0.0755555 0.537779 0.186667 0.368888 0.355555C0.191111 0.533333 0.0755555 0.746667 0.0222222 0.995555C-0.0222222 1.23555 0 1.47111 0.0888888 1.70222L5.43555 15.2222C5.52445 15.4445 5.66667 15.6267 5.86221 15.7689C6.06667 15.9111 6.28888 15.9867 6.52888 15.9955H6.58221C6.82221 15.9955 7.04445 15.9333 7.24888 15.8089C7.44445 15.6845 7.59555 15.52 7.70221 15.3155L10.2089 10.2222L15.3022 7.70221C15.5155 7.59555 15.6845 7.43555 15.8089 7.22221Z\\' ></path></svg>")',
                            backgroundSize: 'cover',
                            pointerEvents: 'none',
                            zIndex: '99999',
                            transform: 'translate(-2px, -2px)',
                        });

                        document.body.appendChild(cursor);

                        document.addEventListener("mousemove", (e) => {
                            cursor.style.top = e.clientY + "px";
                            cursor.style.left = e.clientX + "px";
                        });
                    }

                    requestAnimationFrame(function checkBody() {
                        if (document.body) {
                            initCursor();
                        } else {
                            requestAnimationFrame(checkBody);
                        }
                    });
                }
            """)

        # Get the page and set up routing
        self._page = context.pages[0]
        self._page.route("**/*", handle_route)

        # Navigate to start URL
        self._page.goto(self.start_url)
        
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Exit context manager - clean up resources."""
        if self._page:
            self._page.close()
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()

        # Release Steel session
        if self.session:
            print("Releasing Steel session...")
            self.client.sessions.release(self.session.id)
            print(f"Session completed. View replay at {self.session.session_viewer_url}")

    def screenshot(self) -> str:
        """Take a screenshot using CDP, fallback to standard screenshot."""
        try:
            # Try CDP screenshot first
            cdp_session = self._page.context.new_cdp_session(self._page)
            result = cdp_session.send(
                "Page.captureScreenshot", {"format": "png", "fromSurface": True}
            )
            return result["data"]
        except PlaywrightError as error:
            print(f"CDP screenshot failed, using fallback: {error}")
            # Fallback to standard screenshot
            png_bytes = self._page.screenshot(full_page=False)
            return base64.b64encode(png_bytes).decode("utf-8")

    def click(self, x: int, y: int, button: str = "left") -> None:
        """Click at coordinates."""
        if button == "back":
            self.back()
        elif button == "forward":
            self.forward()
        elif button == "wheel":
            self._page.mouse.wheel(x, y)
        else:
            button_type = {"left": "left", "right": "right"}.get(button, "left")
            self._page.mouse.click(x, y, button=button_type)

    def double_click(self, x: int, y: int) -> None:
        """Double click at coordinates."""
        self._page.mouse.dblclick(x, y)

    def scroll(self, x: int, y: int, scroll_x: int, scroll_y: int) -> None:
        """Scroll at coordinates."""
        self._page.mouse.move(x, y)
        self._page.evaluate(f"window.scrollBy({scroll_x}, {scroll_y})")

    def type(self, text: str) -> None:
        """Type text."""
        self._page.keyboard.type(text)

    def wait(self, ms: int = 1000) -> None:
        """Wait for specified milliseconds."""
        time.sleep(ms / 1000)

    def move(self, x: int, y: int) -> None:
        """Move mouse to coordinates."""
        self._page.mouse.move(x, y)

    def keypress(self, keys: List[str]) -> None:
        """Press keys (supports modifier combinations)."""
        mapped_keys = [CUA_KEY_TO_PLAYWRIGHT_KEY.get(key.lower(), key) for key in keys]
        # Press all keys down
        for key in mapped_keys:
            self._page.keyboard.down(key)
        # Release all keys in reverse order
        for key in reversed(mapped_keys):
            self._page.keyboard.up(key)

    def drag(self, path: List[Dict[str, int]]) -> None:
        """Drag along a path of coordinates."""
        if not path:
            return
        self._page.mouse.move(path[0]["x"], path[0]["y"])
        self._page.mouse.down()
        for point in path[1:]:
            self._page.mouse.move(point["x"], point["y"])
        self._page.mouse.up()

    def goto(self, url: str) -> None:
        """Navigate to URL."""
        try:
            self._page.goto(url)
        except Exception as e:
            print(f"Error navigating to {url}: {e}")

    def back(self) -> None:
        """Go back in browser history."""
        self._page.go_back()

    def forward(self) -> None:
        """Go forward in browser history."""
        self._page.go_forward()


class Agent:
    """
    Agent class for managing OpenAI Computer Use Assistant interactions.
    
    This class handles the conversation loop between OpenAI and the computer,
    processing actions and managing safety checks.
    """

    def __init__(
        self,
        model: str = "computer-use-preview",
        computer: SteelBrowser = None,
        tools: List[dict] = None,
        acknowledge_safety_check_callback: Callable = None,
    ):
        """Initialize the agent."""
        self.model = model
        self.computer = computer
        self.tools = tools or []
        self.acknowledge_safety_check_callback = acknowledge_safety_check_callback or (lambda x: False)
        self.print_steps = True
        self.debug = False
        self.show_images = False

        # Add computer tool if computer is provided
        if computer:
            dimensions = computer.get_dimensions()
            self.tools.append({
                "type": "computer-preview",
                "display_width": dimensions[0],
                "display_height": dimensions[1],
                "environment": computer.get_environment(),
            })

    def debug_print(self, *args):
        """Print debug information if debug mode is enabled."""
        if self.debug:
            pp(*args)

    def handle_item(self, item):
        """Handle each item from OpenAI response."""
        if item["type"] == "message":
            if self.print_steps:
                print(item["content"][0]["text"])

        elif item["type"] == "function_call":
            name, args = item["name"], json.loads(item["arguments"])
            if self.print_steps:
                print(f"{name}({args})")

            # Call function on computer if it exists
            if hasattr(self.computer, name):
                method = getattr(self.computer, name)
                method(**args)
            
            return [{
                "type": "function_call_output",
                "call_id": item["call_id"],
                "output": "success",
            }]

        elif item["type"] == "computer_call":
            action = item["action"]
            action_type = action["type"]
            action_args = {k: v for k, v in action.items() if k != "type"}
            
            if self.print_steps:
                print(f"{action_type}({action_args})")

            # Execute the action
            method = getattr(self.computer, action_type)
            method(**action_args)

            # Take screenshot
            screenshot_base64 = self.computer.screenshot()
            if self.show_images:
                show_image(screenshot_base64)

            # Handle safety checks
            pending_checks = item.get("pending_safety_checks", [])
            for check in pending_checks:
                message = check["message"]
                if not self.acknowledge_safety_check_callback(message):
                    raise ValueError(f"Safety check failed: {message}")

            # Prepare response
            call_output = {
                "type": "computer_call_output",
                "call_id": item["call_id"],
                "acknowledged_safety_checks": pending_checks,
                "output": {
                    "type": "input_image",
                    "image_url": f"data:image/png;base64,{screenshot_base64}",
                },
            }

            # Add current URL for browser environments
            if self.computer.get_environment() == "browser":
                current_url = self.computer.get_current_url()
                check_blocklisted_url(current_url)
                call_output["output"]["current_url"] = current_url

            return [call_output]

        return []

    def run_full_turn(self, input_items, print_steps=True, debug=False, show_images=False):
        """Run a full conversation turn with OpenAI."""
        self.print_steps = print_steps
        self.debug = debug
        self.show_images = show_images
        new_items = []

        # Keep looping until we get a final assistant response
        while not new_items or new_items[-1].get("role") != "assistant":
            self.debug_print([sanitize_message(msg) for msg in input_items + new_items])

            # Call OpenAI API
            response = create_response(
                model=self.model,
                input=input_items + new_items,
                tools=self.tools,
                truncation="auto",
            )
            self.debug_print(response)

            if "output" not in response:
                if self.debug:
                    print(response)
                raise ValueError("No output from model")

            # Process response items
            new_items += response["output"]
            for item in response["output"]:
                new_items += self.handle_item(item)

        return new_items


def acknowledge_safety_check_callback(message: str) -> bool:
    """Callback for safety check acknowledgment."""
    response = input(
        f"Safety Check Warning: {message}\nDo you want to acknowledge and proceed? (y/n): "
    ).lower()
    return response.strip() == "y"


def main():
    """Main function - run the Computer Use Assistant demo."""
    print("🚀 Steel + OpenAI Computer Use Assistant Demo")
    print("=" * 50)
    
    # Check for required environment variables
    if not os.getenv("STEEL_API_KEY"):
        print("❌ Error: STEEL_API_KEY environment variable is required")
        print("Get your API key at: https://app.steel.dev/settings/api-keys")
        return
    
    if not os.getenv("OPENAI_API_KEY"):
        print("❌ Error: OPENAI_API_KEY environment variable is required")
        print("Get your API key at: https://platform.openai.com/")
        return

    print("✅ API keys found!")
    print("\nStarting Steel browser session...")

    try:
        with SteelBrowser() as computer:
            print("✅ Steel browser session started!")
            
            # Create agent
            agent = Agent(
                computer=computer,
                acknowledge_safety_check_callback=acknowledge_safety_check_callback,
            )
            
            print("\n🤖 Computer Use Assistant is ready!")
            print("Type your requests below. Examples:")
            print("- 'Search for information about artificial intelligence'")
            print("- 'Find the weather forecast for New York'")
            print("- 'Go to Wikipedia and tell me about machine learning'")
            print("Type 'exit' to quit.\n")

            items = []
            while True:
                try:
                    user_input = input("👤 You: ").strip()
                    if user_input.lower() in ['exit', 'quit', 'bye']:
                        break
                    
                    if not user_input:
                        continue

                    print(f"\n🤖 Processing: {user_input}")
                    items.append({"role": "user", "content": user_input})
                    
                    # Run the agent
                    output_items = agent.run_full_turn(
                        items,
                        print_steps=True,
                        show_images=False,
                        debug=False,
                    )
                    items += output_items
                    print("\n" + "─" * 50)
                    
                except KeyboardInterrupt:
                    print("\n\n👋 Goodbye!")
                    break
                except Exception as e:
                    print(f"\n❌ Error: {e}")
                    print("Continuing...")

    except Exception as e:
        print(f"❌ Failed to start Steel browser: {e}")
        print("Please check your STEEL_API_KEY and internet connection.")


if __name__ == "__main__":
    main() 