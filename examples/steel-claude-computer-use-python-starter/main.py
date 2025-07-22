import os
import time
import base64
import json
import re
from typing import List, Dict
from urllib.parse import urlparse

from dotenv import load_dotenv
from playwright.sync_api import sync_playwright, Error as PlaywrightError
from steel import Steel
from PIL import Image
from io import BytesIO

from anthropic import Anthropic
from anthropic.types.beta import (
    BetaMessage,
    BetaMessageParam,
    BetaToolResultBlockParam,
)

load_dotenv(override=True)

SYSTEM_PROMPT = """You are an expert browser automation assistant operating in an iterative execution loop. Your goal is to efficiently complete tasks using a Chrome browser with full internet access.

<CAPABILITIES>
* You control a Chrome browser tab and can navigate to any website
* You can click, type, scroll, take screenshots, and interact with web elements  
* You have full internet access and can visit any public website
* You can read content, fill forms, search for information, and perform complex multi-step tasks
* After each action, you receive a screenshot showing the current state

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
* Navigate to the most relevant website for the task without asking
* Never click on browser UI elements
* Always respect coordinate boundaries - invalid coordinates will fail
* Recognize when the stated objective has been achieved and declare completion immediately
* Focus on the explicit task given, not implied or potential follow-up tasks

Remember: Be thorough but focused. Complete the specific task requested efficiently and provide clear results."""

TYPING_DELAY_MS = 12
TYPING_GROUP_SIZE = 50

BLOCKED_DOMAINS = [
    "maliciousbook.com",
    "evilvideos.com", 
    "darkwebforum.com",
    "shadytok.com",
    "suspiciouspins.com",
    "ilanbigio.com",
]

MODEL_CONFIGS = {
    "claude-3-5-sonnet-20241022": {
        "tool_type": "computer_20241022",
        "beta_flag": "computer-use-2024-10-22",
        "description": "Stable Claude 3.5 Sonnet (recommended)"
    },
    "claude-3-7-sonnet-20250219": {
        "tool_type": "computer_20250124", 
        "beta_flag": "computer-use-2025-01-24",
        "description": "Claude 3.7 Sonnet (newer)"
    },
    "claude-sonnet-4-20250514": {
        "tool_type": "computer_20250124",
        "beta_flag": "computer-use-2025-01-24", 
        "description": "Claude 4 Sonnet (newest)"
    },
    "claude-opus-4-20250514": {
        "tool_type": "computer_20250124",
        "beta_flag": "computer-use-2025-01-24",
        "description": "Claude 4 Opus (newest)"
    }
}

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
    "Return": "Enter",
    "KP_Enter": "Enter", 
    "Escape": "Escape",
    "BackSpace": "Backspace",
    "Delete": "Delete",
    "Tab": "Tab",
    "ISO_Left_Tab": "Shift+Tab",
    "Up": "ArrowUp",
    "Down": "ArrowDown",
    "Left": "ArrowLeft", 
    "Right": "ArrowRight",
    "Page_Up": "PageUp",
    "Page_Down": "PageDown",
    "Home": "Home",
    "End": "End",
    "Insert": "Insert",
    "F1": "F1", "F2": "F2", "F3": "F3", "F4": "F4",
    "F5": "F5", "F6": "F6", "F7": "F7", "F8": "F8",
    "F9": "F9", "F10": "F10", "F11": "F11", "F12": "F12",
    "Shift_L": "Shift", "Shift_R": "Shift",
    "Control_L": "Control", "Control_R": "Control", 
    "Alt_L": "Alt", "Alt_R": "Alt",
    "Meta_L": "Meta", "Meta_R": "Meta",
    "Super_L": "Meta", "Super_R": "Meta",
    "minus": "-",
    "equal": "=",
    "bracketleft": "[",
    "bracketright": "]",
    "semicolon": ";",
    "apostrophe": "'",
    "grave": "`",
    "comma": ",",
    "period": ".",
    "slash": "/",
}


def chunks(s: str, chunk_size: int) -> List[str]:
    return [s[i : i + chunk_size] for i in range(0, len(s), chunk_size)]


def pp(obj):
    print(json.dumps(obj, indent=2))


def show_image(base_64_image):
    image_data = base64.b64decode(base_64_image)
    image = Image.open(BytesIO(image_data))
    image.show()


def check_blocklisted_url(url: str) -> None:
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
        session_timeout: int = 900000,
        ad_blocker: bool = True,
        start_url: str = "https://www.google.com",
    ):
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
        self._last_mouse_position = None

    def get_dimensions(self):
        return self.dimensions

    def get_current_url(self) -> str:
        return self._page.url if self._page else ""

    def __enter__(self):
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
            f"wss://connect.steel.dev?apiKey={os.getenv('STEEL_API_KEY')}&sessionId={self.session.id}",
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

    def validate_and_get_coordinates(self, coordinate):
        if not isinstance(coordinate, (list, tuple)) or len(coordinate) != 2:
            raise ValueError(f"{coordinate} must be a tuple or list of length 2")
        if not all(isinstance(i, int) and i >= 0 for i in coordinate):
            raise ValueError(f"{coordinate} must be a tuple/list of non-negative ints")
        
        x, y = self.clamp_coordinates(coordinate[0], coordinate[1])
        return x, y

    def clamp_coordinates(self, x: int, y: int):
        width, height = self.dimensions
        clamped_x = max(0, min(x, width - 1))
        clamped_y = max(0, min(y, height - 1))
        
        if x != clamped_x or y != clamped_y:
            print(f"⚠️  Coordinate clamped: ({x}, {y}) → ({clamped_x}, {clamped_y})")
        
        return clamped_x, clamped_y

    def execute_computer_action(
        self, 
        action: str, 
        text: str = None,
        coordinate = None,
        scroll_direction: str = None,
        scroll_amount: int = None,
        duration = None,
        key: str = None,
        **kwargs
    ) -> str:
        
        if action in ("left_mouse_down", "left_mouse_up"):
            if coordinate is not None:
                raise ValueError(f"coordinate is not accepted for {action}")
            
            if action == "left_mouse_down":
                self._page.mouse.down()
            elif action == "left_mouse_up":
                self._page.mouse.up()
            
            return self.screenshot()
        
        if action == "scroll":
            if scroll_direction is None or scroll_direction not in ("up", "down", "left", "right"):
                raise ValueError("scroll_direction must be 'up', 'down', 'left', or 'right'")
            if scroll_amount is None or not isinstance(scroll_amount, int) or scroll_amount < 0:
                raise ValueError("scroll_amount must be a non-negative int")
            
            if coordinate is not None:
                x, y = self.validate_and_get_coordinates(coordinate)
                self._page.mouse.move(x, y)
                self._last_mouse_position = (x, y)
            
            if text:
                modifier_key = text
                if modifier_key in CUA_KEY_TO_PLAYWRIGHT_KEY:
                    modifier_key = CUA_KEY_TO_PLAYWRIGHT_KEY[modifier_key]
                self._page.keyboard.down(modifier_key)
            
            scroll_mapping = {
                "down": (0, 100 * scroll_amount),
                "up": (0, -100 * scroll_amount),
                "right": (100 * scroll_amount, 0),
                "left": (-100 * scroll_amount, 0)
            }
            delta_x, delta_y = scroll_mapping[scroll_direction]
            self._page.mouse.wheel(delta_x, delta_y)
            
            if text:
                self._page.keyboard.up(modifier_key)
            
            return self.screenshot()
        
        if action in ("hold_key", "wait"):
            if duration is None or not isinstance(duration, (int, float)):
                raise ValueError("duration must be a number")
            if duration < 0:
                raise ValueError("duration must be non-negative")
            if duration > 100:
                raise ValueError("duration is too long")
            
            if action == "hold_key":
                if text is None:
                    raise ValueError("text is required for hold_key")
                
                hold_key = text
                if hold_key in CUA_KEY_TO_PLAYWRIGHT_KEY:
                    hold_key = CUA_KEY_TO_PLAYWRIGHT_KEY[hold_key]
                
                self._page.keyboard.down(hold_key)
                time.sleep(duration)
                self._page.keyboard.up(hold_key)
                
            elif action == "wait":
                time.sleep(duration)
            
            return self.screenshot()
        
        if action in ("left_click", "right_click", "double_click", "triple_click", "middle_click"):
            if text is not None:
                raise ValueError(f"text is not accepted for {action}")
            
            if coordinate is not None:
                x, y = self.validate_and_get_coordinates(coordinate)
                self._page.mouse.move(x, y)
                self._last_mouse_position = (x, y)
                click_x, click_y = x, y
            elif self._last_mouse_position:
                click_x, click_y = self._last_mouse_position
            else:
                width, height = self.dimensions
                click_x, click_y = width // 2, height // 2
            
            if key:
                modifier_key = key
                if modifier_key in CUA_KEY_TO_PLAYWRIGHT_KEY:
                    modifier_key = CUA_KEY_TO_PLAYWRIGHT_KEY[modifier_key]
                self._page.keyboard.down(modifier_key)
            
            if action == "left_click":
                self._page.mouse.click(click_x, click_y)
            elif action == "right_click":
                self._page.mouse.click(click_x, click_y, button="right")
            elif action == "double_click":
                self._page.mouse.dblclick(click_x, click_y)
            elif action == "triple_click":
                for _ in range(3):
                    self._page.mouse.click(click_x, click_y)
            elif action == "middle_click":
                self._page.mouse.click(click_x, click_y, button="middle")
            
            if key:
                self._page.keyboard.up(modifier_key)
            
            return self.screenshot()
        
        if action in ("mouse_move", "left_click_drag"):
            if coordinate is None:
                raise ValueError(f"coordinate is required for {action}")
            if text is not None:
                raise ValueError(f"text is not accepted for {action}")
            
            x, y = self.validate_and_get_coordinates(coordinate)
            
            if action == "mouse_move":
                self._page.mouse.move(x, y)
                self._last_mouse_position = (x, y)
            elif action == "left_click_drag":
                self._page.mouse.down()
                self._page.mouse.move(x, y)
                self._page.mouse.up()
                self._last_mouse_position = (x, y)
            
            return self.screenshot()
        
        if action in ("key", "type"):
            if text is None:
                raise ValueError(f"text is required for {action}")
            if coordinate is not None:
                raise ValueError(f"coordinate is not accepted for {action}")
            
            if action == "key":
                press_key = text
                
                if "+" in press_key:
                    key_parts = press_key.split("+")
                    modifier_keys = key_parts[:-1]
                    main_key = key_parts[-1]
                    
                    playwright_modifiers = []
                    for mod in modifier_keys:
                        if mod.lower() in ("ctrl", "control"):
                            playwright_modifiers.append("Control")
                        elif mod.lower() in ("shift",):
                            playwright_modifiers.append("Shift")
                        elif mod.lower() in ("alt", "option"):
                            playwright_modifiers.append("Alt")
                        elif mod.lower() in ("cmd", "meta", "super"):
                            playwright_modifiers.append("Meta")
                        else:
                            playwright_modifiers.append(mod)
                    
                    if main_key in CUA_KEY_TO_PLAYWRIGHT_KEY:
                        main_key = CUA_KEY_TO_PLAYWRIGHT_KEY[main_key]
                    
                    press_key = "+".join(playwright_modifiers + [main_key])
                else:
                    if press_key in CUA_KEY_TO_PLAYWRIGHT_KEY:
                        press_key = CUA_KEY_TO_PLAYWRIGHT_KEY[press_key]
                
                self._page.keyboard.press(press_key)
            elif action == "type":
                for chunk in chunks(text, TYPING_GROUP_SIZE):
                    self._page.keyboard.type(chunk, delay=TYPING_DELAY_MS)
                    time.sleep(0.01)
            
            return self.screenshot()
        
        if action in ("screenshot", "cursor_position"):
            if text is not None:
                raise ValueError(f"text is not accepted for {action}")
            if coordinate is not None:
                raise ValueError(f"coordinate is not accepted for {action}")
            
            return self.screenshot()
        
        raise ValueError(f"Invalid action: {action}")


class ClaudeAgent:

    def __init__(self, computer: SteelBrowser = None, model: str = "claude-3-7-sonnet-20250219"):
        self.client = Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
        self.computer = computer
        self.messages: List[BetaMessageParam] = []
        self.model = model
        
        if computer:
            width, height = computer.get_dimensions()
            self.viewport_width = width
            self.viewport_height = height
            
            self.system_prompt = SYSTEM_PROMPT.replace(
                '<COORDINATE_SYSTEM>',
                f'<COORDINATE_SYSTEM>\n* The browser viewport dimensions are {width}x{height} pixels\n* The browser viewport has specific dimensions that you must respect'
            )
            
            if model not in MODEL_CONFIGS:
                raise ValueError(f"Unsupported model: {model}. Available models: {list(MODEL_CONFIGS.keys())}")
            
            self.model_config = MODEL_CONFIGS[model]
            
            self.tools = [{
                "type": self.model_config["tool_type"],
                "name": "computer",
                "display_width_px": width,
                "display_height_px": height,
                "display_number": 1,
            }]
        else:
            self.viewport_width = 1024
            self.viewport_height = 768
            self.system_prompt = SYSTEM_PROMPT

    def get_viewport_info(self) -> dict:
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

    def clamp_coordinate(self, x: float, y: float) -> tuple[float, float]:
        clamped_x = max(0, min(x, self.viewport_width - 1))
        clamped_y = max(0, min(y, self.viewport_height - 1))
        
        if x != clamped_x or y != clamped_y:
            print(f"⚠️  Coordinate clamped: ({x}, {y}) → ({clamped_x}, {clamped_y})")
        
        return clamped_x, clamped_y

    def validate_coordinates(self, action_args: dict) -> dict:
        validated_args = action_args.copy()
        
        if 'x' in action_args and 'y' in action_args:
            validated_args['x'] = int(float(action_args['x']))
            validated_args['y'] = int(float(action_args['y']))
        
        if 'path' in action_args and isinstance(action_args['path'], list):
            validated_path = []
            for point in action_args['path']:
                validated_path.append({
                    'x': int(float(point.get('x', 0))),
                    'y': int(float(point.get('y', 0)))
                })
            validated_args['path'] = validated_path
        
        return validated_args



    def execute_task(
        self, 
        task: str, 
        print_steps: bool = True, 
        debug: bool = False, 
        max_iterations: int = 50
    ) -> str:
        
        input_items = [
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
            if "TASK_COMPLETED:" in content:
                return {"completed": True, "reason": "explicit_completion"}
            if "TASK_FAILED:" in content or "TASK_ABANDONED:" in content:
                return {"completed": True, "reason": "explicit_failure"}
            
            completion_patterns = [
                r'task\s+(completed|finished|done|accomplished)',
                r'successfully\s+(completed|finished|found|gathered)',
                r'here\s+(is|are)\s+the\s+(results?|information|summary)',
                r'to\s+summarize',
                r'in\s+conclusion',
                r'final\s+(answer|result|summary)'
            ]
            
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
                    
                    completion = is_task_complete(content)
                    if completion["completed"]:
                        print(f"✅ Task completed ({completion['reason']})")
                        break
                    
                    if detect_repetition(content):
                        print("🔄 Repetition detected - stopping execution")
                        last_assistant_messages.append(content)
                        break
                    
                    last_assistant_messages.append(content)
                    if len(last_assistant_messages) > 3:
                        last_assistant_messages.pop(0)

            if debug:
                pp(input_items + new_items)

            try:
                response = self.client.beta.messages.create(
                    model=self.model,
                    max_tokens=4096,
                    system=self.system_prompt,
                    messages=input_items + new_items,
                    tools=self.tools,
                    betas=[self.model_config["beta_flag"]]
                )
                
                if debug:
                    pp(response)

                if debug:
                    pp(response)

                # Process the response content blocks
                for block in response.content:
                    if block.type == "text":
                        print(block.text)
                        # Add assistant message to conversation
                        new_items.append({
                            "role": "assistant",
                            "content": [
                                {
                                    "type": "text",
                                    "text": block.text
                                }
                            ]
                        })
                    elif block.type == "tool_use":
                        has_actions = True
                        # Handle computer use tool
                        if block.name == "computer":
                            tool_input = block.input
                            action = tool_input.get("action")
                            
                            print(f"🔧 {action}({tool_input})")
                            
                            # Execute the computer action
                            screenshot_base64 = self.computer.execute_computer_action(
                                action=action,
                                text=tool_input.get("text"),
                                coordinate=tool_input.get("coordinate"),
                                scroll_direction=tool_input.get("scroll_direction"),
                                scroll_amount=tool_input.get("scroll_amount"),
                                duration=tool_input.get("duration"),
                                key=tool_input.get("key")
                            )
                            
                            if action == "screenshot":
                                self.validate_screenshot_dimensions(screenshot_base64)
                            
                            # Add assistant message with tool use
                            new_items.append({
                                "role": "assistant", 
                                "content": [
                                    {
                                        "type": "tool_use",
                                        "id": block.id,
                                        "name": block.name,
                                        "input": tool_input
                                    }
                                ]
                            })
                            
                            # Add tool result
                            current_url = self.computer.get_current_url()
                            check_blocklisted_url(current_url)
                            
                            new_items.append({
                                "role": "user",
                                "content": [
                                    {
                                        "type": "tool_result",
                                        "tool_use_id": block.id,
                                        "content": [
                                            {
                                                "type": "image",
                                                "source": {
                                                    "type": "base64",
                                                    "media_type": "image/png",
                                                    "data": screenshot_base64
                                                }
                                            }
                                        ]
                                    }
                                ]
                            })
                
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
            content = final_message.get("content")
            if isinstance(content, list) and len(content) > 0:
                # Look for text content in the list
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "text":
                        return block.get("text", "Task execution completed (no final message)")
        
        return "Task execution completed (no final message)"


def main():
    print("🚀 Steel + Claude Computer Use Assistant")
    print("=" * 60)
    
    if not os.getenv("STEEL_API_KEY"):
        print("❌ Error: STEEL_API_KEY environment variable is required")
        print("Get your API key at: https://app.steel.dev/settings/api-keys")
        return
    
    if not os.getenv("ANTHROPIC_API_KEY"):
        print("❌ Error: ANTHROPIC_API_KEY environment variable is required")
        print("Get your API key at: https://console.anthropic.com/")
        return

    task = os.getenv("TASK") or "Go to Wikipedia and search for machine learning"

    print("\nStarting Steel browser session...")

    try:
        with SteelBrowser() as computer:
            print("✅ Steel browser session started!")
            
            agent = ClaudeAgent(
                computer=computer,
                model="claude-3-5-sonnet-20241022",
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