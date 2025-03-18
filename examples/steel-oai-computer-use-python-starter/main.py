import os
import time
import base64
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, Browser, Page
from openai import OpenAI

# Load environment variables
load_dotenv()

# -------------
#  Steel Browser Integration
# -------------
from steel import Steel

class SteelBrowser:
    environment = "browser"
    dimensions = (1024, 768)

    def __init__(self):
        self.client = Steel(
            steel_api_key=os.getenv("STEEL_API_KEY"),
            base_url=os.getenv("STEEL_API_URL")
        )
        self.session = None
        self._playwright = None
        self._browser = None
        self._page = None

    def __enter__(self):
        # Create a Steel session
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
        self._page.goto("https://bing.com")
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._page: self._page.close()
        if self._browser: self._browser.close()
        if self._playwright: self._playwright.stop()
        if self.session:
            self.client.sessions.release(self.session.id)
            print(f"Session ended: {self.session.session_viewer_url}")

    def screenshot(self) -> str:
        try:
            cdp_session = self._page.context.new_cdp_session(self._page)
            result = cdp_session.send("Page.captureScreenshot", {"format": "png", "fromSurface": True})
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
        for k in keys:
            # Handle common keys
            if k == "ENTER": k = "Enter"
            elif k == "SPACE": k = "Space"
            elif k == "BACKSPACE": k = "Backspace"
            elif k == "TAB": k = "Tab"
            elif k == "ESCAPE" or k == "ESC": k = "Escape"
            elif k == "ARROWUP": k = "ArrowUp"
            elif k == "ARROWDOWN": k = "ArrowDown"
            elif k == "ARROWLEFT": k = "ArrowLeft"
            elif k == "ARROWRIGHT": k = "ArrowRight"
            self._page.keyboard.press(k)

    def drag(self, path: list[dict[str, int]]) -> None:
        if not path: return
        self._page.mouse.move(path[0]["x"], path[0]["y"])
        self._page.mouse.down()
        for point in path[1:]:
            self._page.mouse.move(point["x"], point["y"])
        self._page.mouse.up()

    def get_current_url(self) -> str:
        return self._page.url

def execute_action(browser, action):
    """Execute a computer action on the browser."""
    action_type = action.type
    action_params = {k: v for k, v in vars(action).items() if k != "type"}
    
    # Execute the action
    getattr(browser, action_type)(**action_params)
    print(f"Executed action: {action_type}")

def send_screenshot(client, browser, response_id, call_id, safety_checks):
    """Send a screenshot back to the model."""
    screenshot = browser.screenshot()
    current_url = browser.get_current_url()
    
    return client.responses.create(
        model="computer-use-preview",
        previous_response_id=response_id,
        tools=[{
            "type": "computer_use_preview",
            "display_width": browser.dimensions[0],
            "display_height": browser.dimensions[1],
            "environment": "browser"
        }],
        input=[{
            "type": "computer_call_output",
            "call_id": call_id,
            "acknowledged_safety_checks": safety_checks,
            "output": {
                "type": "input_image",
                "image_url": f"data:image/png;base64,{screenshot}"
            },
            "current_url": current_url
        }],
        truncation="auto"
    )

def run_cua_loop():
    # Get user task
    task = input("What task should the assistant perform? ")
    
    with SteelBrowser() as browser:
        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        tools = [{
            "type": "computer_use_preview",
            "display_width": browser.dimensions[0],
            "display_height": browser.dimensions[1],
            "environment": "browser"
        }]
        
        # Initial request
        response = client.responses.create(
            model="computer-use-preview",
            tools=tools,
            input=[{"role": "user", "content": task}],
            reasoning={"generate_summary": "concise"},
            truncation="auto"
        )
        
        # Process first response
        computer_calls = [i for i in response.output if i.type == "computer_call"]
        if computer_calls:
            comp_call = computer_calls[0]
            execute_action(browser, comp_call.action)
            response = send_screenshot(client, browser, response.id, comp_call.call_id, [])
            
        # Main loop
        while True:
            # Print any text messages
            for item in response.output:
                if item.type == "message":
                    print(f"Assistant: {item.content[0].text}")
                
            # Check for computer calls
            computer_calls = [i for i in response.output if i.type == "computer_call"]
            if not computer_calls:
                print("Task completed.")
                break
                
            # Execute action and send screenshot
            comp_call = computer_calls[0]
            action = comp_call.action
            print(f"Action: {action.type}")
            
            execute_action(browser, action)
            
            pending_checks = getattr(comp_call, "pending_safety_checks", [])
            response = send_screenshot(client, browser, response.id, comp_call.call_id, pending_checks)

if __name__ == "__main__":
    try:
        run_cua_loop()
    except KeyboardInterrupt:
        print("Interrupted by user.")
    except Exception as e:
        print(f"Error: {e}")