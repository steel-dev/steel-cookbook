"""
OpenAI AI agent for autonomous web interactions with Steel browsers.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-oai-computer-use-python-starter
"""

import os
import time
import base64
import json
from typing import List, Dict
from urllib.parse import urlparse

import requests
from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, Error as PlaywrightError
from steel import Steel
from PIL import Image
from io import BytesIO

load_dotenv(override=True)

# Replace with your own API keys
STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or "your-openai-api-key-here"

# Replace with your own task
TASK = os.getenv("TASK") or "Go to Wikipedia and search for machine learning"

SYSTEM_PROMPT = """You are an expert browser automation assistant operating in an iterative execution loop. Your goal is to efficiently complete tasks using a Chrome browser with full internet access.

<CAPABILITIES>
* You control a Chrome browser tab and can navigate to any website
* You can click, type, scroll, take screenshots, and interact with web elements  
* You have full internet access and can visit any public website
* You can read content, fill forms, search for information, and perform complex multi-step tasks
* After each action, you receive a screenshot showing the current state
* Use the goto(url) function to navigate directly to URLs - DO NOT try to click address bars or browser UI
* Use the back() function to go back to the previous page

<COORDINATE_SYSTEM>
* The browser viewport has specific dimensions that you must respect
* All coordinates (x, y) must be within the viewport bounds
* X coordinates must be between 0 and the display width (inclusive)
* Y coordinates must be between 0 and the display height (inclusive)
* Always ensure your click, move, scroll, and drag coordinates are within these bounds
* If you're unsure about element locations, take a screenshot first to see the current state

<AUTONOMOUS_EXECUTION>
* Work completely independently - make decisions and act immediately without asking questions
* Never request clarification, present options, or ask for permission
* Make intelligent assumptions based on task context
* If something is ambiguous, choose the most logical interpretation and proceed
* Take immediate action rather than explaining what you might do
* When the task objective is achieved, immediately declare "TASK_COMPLETED:" - do not provide commentary or ask questions

<REASONING_STRUCTURE>
For each step, you must reason systematically:
* Analyze your previous action's success/failure and current state
* Identify what specific progress has been made toward the goal
* Determine the next immediate objective and how to achieve it
* Choose the most efficient action sequence to make progress

<EFFICIENCY_PRINCIPLES>
* Combine related actions when possible rather than single-step execution
* Navigate directly to relevant websites without unnecessary exploration
* Use screenshots strategically to understand page state before acting
* Be persistent with alternative approaches if initial attempts fail
* Focus on the specific information or outcome requested

<COMPLETION_CRITERIA>
* MANDATORY: When you complete the task, your final message MUST start with "TASK_COMPLETED: [brief summary]"
* MANDATORY: If technical issues prevent completion, your final message MUST start with "TASK_FAILED: [reason]"  
* MANDATORY: If you abandon the task, your final message MUST start with "TASK_ABANDONED: [explanation]"
* Do not write anything after completing the task except the required completion message
* Do not ask questions, provide commentary, or offer additional help after task completion
* The completion message is the end of the interaction - nothing else should follow

<CRITICAL_REQUIREMENTS>
* This is fully automated execution - work completely independently
* Start by taking a screenshot to understand the current state
* Use goto(url) function for navigation - never click on browser UI elements
* Always respect coordinate boundaries - invalid coordinates will fail
* Recognize when the stated objective has been achieved and declare completion immediately
* Focus on the explicit task given, not implied or potential follow-up tasks

Remember: Be thorough but focused. Complete the specific task requested efficiently and provide clear results."""

BLOCKED_DOMAINS = [
    "maliciousbook.com",
    "evilvideos.com", 
    "darkwebforum.com",
    "shadytok.com",
    "suspiciouspins.com",
    "ilanbigio.com",
]

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


def pp(obj):
    print(json.dumps(obj, indent=4))


def show_image(base_64_image):
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

    def __init__(
        self,
        width: int = 1024,
        height: int = 768,
        proxy: bool = False,
        solve_captcha: bool = False,
        virtual_mouse: bool = True,
        session_timeout: int = 900000,  # 15 minutes
        ad_blocker: bool = True,
        start_url: str = "https://www.google.com",
    ):
        self.client = Steel(
            steel_api_key=os.getenv("STEEL_API_KEY"),
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
        return "browser"

    def get_dimensions(self):
        return self.dimensions

    def get_current_url(self) -> str:
        return self._page.url if self._page else ""

    def __enter__(self):
        """Enter context manager - create Steel session and connect browser."""
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

        self._playwright = sync_playwright().start()
        browser = self._playwright.chromium.connect_over_cdp(
            f"{self.session.websocket_url}&apiKey={os.getenv('STEEL_API_KEY')}",
            timeout=60000
        )
        self._browser = browser
        context = browser.contexts[0]

        def handle_route(route, request):
            url = request.url
            try:
                check_blocklisted_url(url)
                route.continue_()
            except ValueError:
                print(f"Blocking URL: {url}")
                route.abort()

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

        self._page = context.pages[0]
        self._page.route("**/*", handle_route)
        
        self._page.set_viewport_size({"width": width, "height": height})
        
        self._page.goto(self.start_url)
        
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if self._page:
            self._page.close()
        if self._browser:
            self._browser.close()
        if self._playwright:
            self._playwright.stop()

        if self.session:
            print("Releasing Steel session...")
            self.client.sessions.release(self.session.id)
            print(f"Session completed. View replay at {self.session.session_viewer_url}")

    def screenshot(self) -> str:
        """Take a screenshot using Playwright for consistent viewport sizing."""
        try:
            width, height = self.dimensions
            png_bytes = self._page.screenshot(
                full_page=False,
                clip={"x": 0, "y": 0, "width": width, "height": height}
            )
            return base64.b64encode(png_bytes).decode("utf-8")
        except PlaywrightError as error:
            print(f"Screenshot failed, trying CDP fallback: {error}")
            try:
                cdp_session = self._page.context.new_cdp_session(self._page)
                result = cdp_session.send(
                    "Page.captureScreenshot", {"format": "png", "fromSurface": False}
                )
                return result["data"]
            except PlaywrightError as cdp_error:
                print(f"CDP screenshot also failed: {cdp_error}")
                raise error

    def click(self, x: int, y: int, button: str = "left") -> None:
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

    def keypress(self, keys: List[str]) -> None:
        """Press keys (supports modifier combinations)."""
        mapped_keys = [CUA_KEY_TO_PLAYWRIGHT_KEY.get(key.lower(), key) for key in keys]
        for key in mapped_keys:
            self._page.keyboard.down(key)
        for key in reversed(mapped_keys):
            self._page.keyboard.up(key)

    def drag(self, path: List[Dict[str, int]]) -> None:
        if not path:
            return
        start_x, start_y = path[0]["x"], path[0]["y"]
        self._page.mouse.move(start_x, start_y)
        self._page.mouse.down()
        for point in path[1:]:
            scaled_x, scaled_y = point["x"], point["y"]
            self._page.mouse.move(scaled_x, scaled_y)
        self._page.mouse.up()

    def goto(self, url: str) -> None:
        try:
            self._page.goto(url)
        except Exception as e:
            print(f"Error navigating to {url}: {e}")

    def back(self) -> None:
        self._page.go_back()

    def forward(self) -> None:
        self._page.go_forward()


class Agent:

    def __init__(
        self,
        model: str = "computer-use-preview",
        computer: SteelBrowser = None,
        tools: List[dict] = None,
        auto_acknowledge_safety: bool = True,
    ):
        self.model = model
        self.computer = computer
        self.tools = tools or []
        self.auto_acknowledge_safety = auto_acknowledge_safety
        self.print_steps = True
        self.debug = False
        self.show_images = False

        if computer:
            scaled_width, scaled_height = computer.get_dimensions()
            self.viewport_width = scaled_width
            self.viewport_height = scaled_height
            
            # Create dynamic system prompt with viewport dimensions
            self.system_prompt = SYSTEM_PROMPT.replace(
                '<COORDINATE_SYSTEM>',
                f'<COORDINATE_SYSTEM>\n* The browser viewport dimensions are {scaled_width}x{scaled_height} pixels\n* The browser viewport has specific dimensions that you must respect'
            )
            
            self.tools.append({
                "type": "computer-preview",
                "display_width": scaled_width,
                "display_height": scaled_height,
                "environment": computer.get_environment(),
            })
            
            # Add goto function tool for direct URL navigation
            self.tools.append({
                "type": "function",
                "name": "goto",
                "description": "Navigate directly to a specific URL.",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "url": {
                            "type": "string",
                            "description": "Fully qualified URL to navigate to (e.g., https://example.com).",
                        },
                    },
                    "additionalProperties": False,
                    "required": ["url"],
                },
            })
            
            # Add back function tool for browser navigation
            self.tools.append({
                "type": "function",
                "name": "back",
                "description": "Go back to the previous page.",
                "parameters": {},
            })
        else:
            self.viewport_width = 1024
            self.viewport_height = 768
            self.system_prompt = SYSTEM_PROMPT

    def debug_print(self, *args):
        if self.debug:
            pp(*args)



    def get_viewport_info(self) -> dict:
        """Get detailed viewport information for debugging."""
        if not self.computer or not self.computer._page:
            return {}
        
        try:
            return self.computer._page.evaluate("""
                () => ({
                    innerWidth: window.innerWidth,
                    innerHeight: window.innerHeight,
                    devicePixelRatio: window.devicePixelRatio,
                    screenWidth: window.screen.width,
                    screenHeight: window.screen.height,
                    scrollX: window.scrollX,
                    scrollY: window.scrollY
                })
            """)
        except:
            return {}

    def validate_screenshot_dimensions(self, screenshot_base64: str) -> dict:
        """Validate screenshot dimensions against viewport."""
        try:
            image_data = base64.b64decode(screenshot_base64)
            image = Image.open(BytesIO(image_data))
            screenshot_width, screenshot_height = image.size
            
            viewport_info = self.get_viewport_info()
            
            scaling_info = {
                "screenshot_size": (screenshot_width, screenshot_height),
                "viewport_size": (self.viewport_width, self.viewport_height),
                "actual_viewport": (viewport_info.get('innerWidth', 0), viewport_info.get('innerHeight', 0)),
                "device_pixel_ratio": viewport_info.get('devicePixelRatio', 1.0),
                "width_scale": screenshot_width / self.viewport_width if self.viewport_width > 0 else 1.0,
                "height_scale": screenshot_height / self.viewport_height if self.viewport_height > 0 else 1.0
            }
            
            # Warn about scaling mismatches
            if scaling_info["width_scale"] != 1.0 or scaling_info["height_scale"] != 1.0:
                print(f"⚠️  Screenshot scaling detected:")
                print(f"   Screenshot: {screenshot_width}x{screenshot_height}")
                print(f"   Expected viewport: {self.viewport_width}x{self.viewport_height}")
                print(f"   Actual viewport: {viewport_info.get('innerWidth', 'unknown')}x{viewport_info.get('innerHeight', 'unknown')}")
                print(f"   Scale factors: {scaling_info['width_scale']:.3f}x{scaling_info['height_scale']:.3f}")
            
            return scaling_info
        except Exception as e:
            print(f"⚠️  Error validating screenshot dimensions: {e}")
            return {}

    def validate_coordinates(self, action_args: dict) -> dict:
        """Validate coordinates without clamping."""
        validated_args = action_args.copy()
        
        # Handle single coordinates (click, move, etc.)
        if 'x' in action_args and 'y' in action_args:
            validated_args['x'] = int(float(action_args['x']))
            validated_args['y'] = int(float(action_args['y']))
        
        # Handle path arrays (drag)
        if 'path' in action_args and isinstance(action_args['path'], list):
            validated_path = []
            for point in action_args['path']:
                validated_path.append({
                    'x': int(float(point.get('x', 0))),
                    'y': int(float(point.get('y', 0)))
                })
            validated_args['path'] = validated_path
        
        return validated_args

    def handle_item(self, item):
        """Handle each item from OpenAI response."""
        if item["type"] == "message":
            if self.print_steps:
                print(item["content"][0]["text"])

        elif item["type"] == "function_call":
            name, args = item["name"], json.loads(item["arguments"])
            if self.print_steps:
                print(f"{name}({args})")

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
            
            # Validate coordinates and log any issues
            validated_args = self.validate_coordinates(action_args)
            
            if self.print_steps:
                print(f"{action_type}({validated_args})")

            method = getattr(self.computer, action_type)
            method(**validated_args)

            screenshot_base64 = self.computer.screenshot()
            
            # Validate screenshot dimensions for debugging
            if action_type == "screenshot" or self.debug:
                self.validate_screenshot_dimensions(screenshot_base64)
            
            if self.show_images:
                show_image(screenshot_base64)

            pending_checks = item.get("pending_safety_checks", [])
            for check in pending_checks:
                message = check["message"]
                if self.auto_acknowledge_safety:
                    print(f"⚠️  Auto-acknowledging safety check: {message}")
                else:
                    raise ValueError(f"Safety check failed: {message}")

            call_output = {
                "type": "computer_call_output",
                "call_id": item["call_id"],
                "acknowledged_safety_checks": pending_checks,
                "output": {
                    "type": "input_image",
                    "image_url": f"data:image/png;base64,{screenshot_base64}",
                },
            }

            if self.computer.get_environment() == "browser":
                current_url = self.computer.get_current_url()
                check_blocklisted_url(current_url)
                call_output["output"]["current_url"] = current_url

            return [call_output]

        return []

    def execute_task(
        self, 
        task: str, 
        print_steps: bool = True, 
        debug: bool = False, 
        max_iterations: int = 50
    ) -> str:
        import re
        
        self.print_steps = print_steps
        self.debug = debug
        self.show_images = False

        input_items = [
            {
                "role": "system",
                "content": self.system_prompt,
            },
            {
                "role": "user",
                "content": task,
            },
        ]

        new_items = []
        iterations = 0
        consecutive_no_actions = 0
        last_assistant_messages = []

        print(f"🎯 Executing task: {task}")
        print("=" * 60)

        def is_task_complete(content: str) -> dict:
            """Check if the task is complete based on content patterns."""
            
            # Explicit completion markers
            if "TASK_COMPLETED:" in content:
                return {"completed": True, "reason": "explicit_completion"}
            if "TASK_FAILED:" in content or "TASK_ABANDONED:" in content:
                return {"completed": True, "reason": "explicit_failure"}
            
            # Natural completion patterns
            completion_patterns = [
                r'task\s+(completed|finished|done|accomplished)',
                r'successfully\s+(completed|finished|found|gathered)',
                r'here\s+(is|are)\s+the\s+(results?|information|summary)',
                r'to\s+summarize',
                r'in\s+conclusion',
                r'final\s+(answer|result|summary)'
            ]
            
            # Failure/abandonment patterns
            failure_patterns = [
                r'cannot\s+(complete|proceed|access|continue)',
                r'unable\s+to\s+(complete|access|find|proceed)',
                r'blocked\s+by\s+(captcha|security|authentication)',
                r'giving\s+up',
                r'no\s+longer\s+able',
                r'have\s+tried\s+multiple\s+approaches'
            ]
            
            for pattern in completion_patterns:
                if re.search(pattern, content, re.IGNORECASE):
                    return {"completed": True, "reason": "natural_completion"}
            
            for pattern in failure_patterns:
                if re.search(pattern, content, re.IGNORECASE):
                    return {"completed": True, "reason": "natural_failure"}
            
            return {"completed": False}

        def detect_repetition(new_message: str) -> bool:
            """Detect if the message is too similar to recent messages."""
            if len(last_assistant_messages) < 2:
                return False
            
            def similarity(str1: str, str2: str) -> float:
                words1 = str1.lower().split()
                words2 = str2.lower().split()
                common_words = [word for word in words1 if word in words2]
                return len(common_words) / max(len(words1), len(words2))
            
            return any(similarity(new_message, prev_message) > 0.8 
                      for prev_message in last_assistant_messages)

        while iterations < max_iterations:
            iterations += 1
            has_actions = False
            
            if new_items and new_items[-1].get("role") == "assistant":
                last_message = new_items[-1]
                if last_message.get("content") and len(last_message["content"]) > 0:
                    content = last_message["content"][0].get("text", "")
                    
                    # Check for explicit completion
                    completion = is_task_complete(content)
                    if completion["completed"]:
                        print(f"✅ Task completed ({completion['reason']})")
                        break
                    
                    # Check for repetition
                    if detect_repetition(content):
                        print("🔄 Repetition detected - stopping execution")
                        last_assistant_messages.append(content)
                        break
                    
                    # Track assistant messages for repetition detection
                    last_assistant_messages.append(content)
                    if len(last_assistant_messages) > 3:
                        last_assistant_messages.pop(0)  # Keep only last 3

            self.debug_print([sanitize_message(msg) for msg in input_items + new_items])

            try:
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

                new_items += response["output"]
                
                # Check if this iteration had any actions
                for item in response["output"]:
                    if item.get("type") in ["computer_call", "function_call"]:
                        has_actions = True
                    new_items += self.handle_item(item)
                
                # Track consecutive iterations without actions
                if not has_actions:
                    consecutive_no_actions += 1
                    if consecutive_no_actions >= 3:
                        print("⚠️  No actions for 3 consecutive iterations - stopping")
                        break
                else:
                    consecutive_no_actions = 0
                    
            except Exception as error:
                print(f"❌ Error during task execution: {error}")
                raise error

        if iterations >= max_iterations:
            print(f"⚠️  Task execution stopped after {max_iterations} iterations")

        assistant_messages = [item for item in new_items if item.get("role") == "assistant"]
        if assistant_messages:
            final_message = assistant_messages[-1]
            if final_message.get("content") and len(final_message["content"]) > 0:
                return final_message["content"][0].get("text", "Task execution completed (no final message)")
        
        return "Task execution completed (no final message)"


def main():
    print("🚀 Steel + OpenAI Computer Use Assistant")
    print("=" * 60)
    
    if STEEL_API_KEY == "your-steel-api-key-here":
        print("⚠️  WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key")
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        return
    
    if OPENAI_API_KEY == "your-openai-api-key-here":
        print("⚠️  WARNING: Please replace 'your-openai-api-key-here' with your actual OpenAI API key")
        print("   Get your API key at: https://platform.openai.com/")
        return

    task = os.getenv("TASK") or "Go to Wikipedia and search for machine learning"

    print("\nStarting Steel browser session...")

    try:
        with SteelBrowser() as computer:
            print("✅ Steel browser session started!")
            
            agent = Agent(
                computer=computer,
                auto_acknowledge_safety=True,
            )
            
            start_time = time.time()
            
            try:
                result = agent.execute_task(
                    task,
                    print_steps=True,
                    debug=False,
                    max_iterations=50,
                )
                
                duration = f"{(time.time() - start_time):.1f}"
                
                print("\n" + "=" * 60)
                print("🎉 TASK EXECUTION COMPLETED")
                print("=" * 60)
                print(f"⏱️  Duration: {duration} seconds")
                print(f"🎯 Task: {task}")
                print(f"📋 Result:\n{result}")
                print("=" * 60)
                
            except Exception as error:
                print(f"❌ Task execution failed: {error}")
                exit(1)

    except Exception as e:
        print(f"❌ Failed to start Steel browser: {e}")
        print("Please check your STEEL_API_KEY and internet connection.")
        exit(1)


if __name__ == "__main__":
    main() 