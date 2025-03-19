import os
import time
import base64
import requests
import json
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, Page
from steel import Steel
from const import MODIFIERS, PLAYWRIGHT_KEYS

load_dotenv()


def create_response(**kwargs):
    """Send a request to OpenAI API to get a response."""
    url = "https://api.openai.com/v1/responses"
    headers = {
        "Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}",
        "Content-Type": "application/json",
        "Openai-beta": "responses=v1",
    }

    openai_org = os.getenv("OPENAI_ORG")
    if openai_org:
        headers["Openai-Organization"] = openai_org

    response = requests.post(url, headers=headers, json=kwargs)

    if response.status_code != 200:
        print(f"Error: {response.status_code} {response.text}")

    return response.json()


def pp(obj):
    """Pretty print a JSON object."""
    print(json.dumps(obj, indent=4))


def sanitize_message(msg: dict) -> dict:
    """Return a copy of the message with image_url omitted for computer_call_output messages."""
    if msg.get("type") == "computer_call_output":
        output = msg.get("output", {})
        if isinstance(output, dict):
            sanitized = msg.copy()
            sanitized["output"] = {**output, "image_url": "[omitted]"}
            return sanitized
    return msg


class SteelBrowser:
    environment = "browser"
    dimensions = (1024, 768)

    def __init__(self):
        self.client = Steel(
            steel_api_key=os.getenv("STEEL_API_KEY"),
            base_url=os.getenv("STEEL_API_URL"),
        )
        self.session = None
        self._playwright = None
        self._browser = None
        self._page = None

    def __enter__(self):
        self.session = self.client.sessions.create(
            use_proxy=False,
            solve_captcha=False,
            block_ads=True,
            dimensions={"width": self.dimensions[0], "height": self.dimensions[1]},
        )
        print(f"Session created: {self.session.session_viewer_url}")

        # Connect to the session
        self._playwright = sync_playwright().start()
        connect_url = os.getenv("STEEL_CONNECT_URL", "wss://connect.steel.dev")
        cdp_url = f"{connect_url}?apiKey={os.getenv('STEEL_API_KEY')}&sessionId={self.session.id}"
        self._browser = self._playwright.chromium.connect_over_cdp(cdp_url)
        self._page = self._browser.contexts[0].pages[0]
        self._page.goto("https://google.com")
        self.apply_same_tab_script()
        return self

    def apply_same_tab_script(self):
        """Apply script to make links open in the same tab."""
        self._page.add_init_script(
            """
            window.addEventListener('load', () => {
                // Initial cleanup
                document.querySelectorAll('a[target="_blank"]').forEach(a => a.target = '_self');
                
                // Watch for dynamic changes
                const observer = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        if (mutation.addedNodes) {
                            mutation.addedNodes.forEach((node) => {
                                if (node.nodeType === 1) { // ELEMENT_NODE
                                    // Check the added element itself
                                    if (node.tagName === 'A' && node.target === '_blank') {
                                        node.target = '_self';
                                    }
                                    // Check any anchor children
                                    node.querySelectorAll('a[target="_blank"]').forEach(a => a.target = '_self');
                                }
                            });
                        }
                    });
                });
                
                observer.observe(document.body, {
                    childList: true,
                    subtree: true
                });
            });
        """
        )

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._page:
            self._page.close()
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()
        if self.session:
            self.client.sessions.release(self.session.id)
            print(f"Session ended: {self.session.session_viewer_url}")

    def screenshot(self) -> str:
        try:
            cdp_session = self._page.context.new_cdp_session(self._page)
            result = cdp_session.send(
                "Page.captureScreenshot", {"format": "png", "fromSurface": True}
            )
            return result["data"]
        except:
            png_bytes = self._page.screenshot()
            return base64.b64encode(png_bytes).decode("utf-8")

    def click(self, x: int, y: int, button: str = "left") -> None:
        self._page.mouse.click(x, y, button=button)

    def double_click(self, x: int, y: int) -> None:
        self._page.mouse.dblclick(x, y)

    def scroll(self, x: int, y: int, scroll_x: int, scroll_y: int) -> None:
        self._page.mouse.move(x, y)
        self._page.evaluate(f"window.scrollBy({scroll_x}, {scroll_y})")

    def type(self, text: str) -> None:
        self._page.keyboard.type(text)

    def wait(self, ms: int = 1000) -> None:
        time.sleep(ms / 1000)

    def move(self, x: int, y: int) -> None:
        self._page.mouse.move(x, y)

    def keypress(self, keys: list[str]) -> None:
        if not keys:
            return

        # Handle modifier keys
        if keys[0].upper() in MODIFIERS:
            # Press and hold the modifier key
            self._page.keyboard.down(MODIFIERS[keys[0].upper()])
            # Press the remaining keys
            for k in keys[1:]:
                key = PLAYWRIGHT_KEYS.get(k.upper(), k)
                self._page.keyboard.press(key)
            # Release the modifier key
            self._page.keyboard.up(MODIFIERS[keys[0].upper()])
            return

        # Handle regular key presses
        for k in keys:
            key = PLAYWRIGHT_KEYS.get(k.upper(), k)
            self._page.keyboard.press(key)

    def drag(self, path: list[dict[str, int]]) -> None:
        if not path:
            return
        self._page.mouse.move(path[0]["x"], path[0]["y"])
        self._page.mouse.down()
        for point in path[1:]:
            self._page.mouse.move(point["x"], point["y"])
        self._page.mouse.up()

    def get_current_url(self) -> str:
        return self._page.url

    def goto(self, url: str) -> None:
        """Navigate to a specific URL."""
        self._page.goto(url)

    def back(self) -> None:
        """Navigate back in the browser history."""
        self._page.go_back()

    def refresh(self) -> None:
        """Refresh the current page."""
        self._page.reload()


def acknowledge_safety_check_callback(message: str) -> bool:
    response = input(
        f"Safety Check Warning: {message}\nDo you want to acknowledge and proceed? (y/n): "
    ).lower()
    return response.strip() == "y"


def handle_item(item, computer):
    """Handle each item; may cause a computer action + screenshot."""
    if item["type"] == "message":  # print messages
        print(item["content"][0]["text"])

    if item["type"] == "computer_call":  # perform computer actions
        action = item["action"]
        action_type = action["type"]
        action_args = {k: v for k, v in action.items() if k != "type"}
        print(f"{action_type}({action_args})")

        # give our computer environment action to perform
        getattr(computer, action_type)(**action_args)

        screenshot_base64 = computer.screenshot()

        pending_checks = item.get("pending_safety_checks", [])
        for check in pending_checks:
            if not acknowledge_safety_check_callback(check["message"]):
                raise ValueError(f"Safety check failed: {check['message']}")

        # return value informs model of the latest screenshot
        call_output = {
            "type": "computer_call_output",
            "call_id": item["call_id"],
            "acknowledged_safety_checks": pending_checks,
            "output": {
                "type": "input_image",
                "image_url": f"data:image/png;base64,{screenshot_base64}",
            },
        }

        if computer.environment == "browser":
            current_url = computer.get_current_url()
            call_output["output"]["current_url"] = current_url

        return [call_output]

    return []


def main():
    """Run the CUA (Computer Use Assistant) loop with Steel browser."""
    with SteelBrowser() as computer:
        tools = [
            {
                "type": "computer-preview",
                "display_width": computer.dimensions[0],
                "display_height": computer.dimensions[1],
                "environment": computer.environment,
            }
        ]

        items = []
        while True:
            user_input = input("> ")
            items.append({"role": "user", "content": user_input})

            while True:
                response = create_response(
                    model="computer-use-preview",
                    input=items,
                    tools=tools,
                    truncation="auto",
                )

                if "output" not in response:
                    print(response)
                    raise ValueError("No output from model")

                items += response["output"]

                for item in response["output"]:
                    items += handle_item(item, computer)

                if items[-1].get("role") == "assistant":
                    break


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted by user.")
    except Exception as e:
        print(f"Error: {e}")
