"""
OpenAI AI agent for autonomous web interactions with Steel computers (Input API).
https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-oai-computer-use-python-starter
"""

import os
import sys
import time
import json
from typing import Any, Dict, List, Optional, Tuple
from datetime import datetime

import requests
from dotenv import load_dotenv
from steel import Steel

load_dotenv(override=True)

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or "your-openai-api-key-here"
TASK = (
    os.getenv("TASK")
    or "Go to Google and search for machine learning, summarize the best answer"
)


def format_today() -> str:
    return datetime.now().strftime("%A, %B %d, %Y")


BROWSER_SYSTEM_PROMPT = f"""<BROWSER_ENV>
  - You control a headful Chromium browser running in a VM with internet access.
  - Interact only through the computer tool (mouse/keyboard/scroll/screenshots). Do not call navigation functions.
  - Today's date is {format_today()}.
  </BROWSER_ENV>
  
  <BROWSER_CONTROL>
  - Before acting, take a screenshot to observe state.
  - When typing into any input:
    * Clear with Ctrl/⌘+A, then Delete.
    * After submitting (Enter or clicking a button), call wait(1–2s) once, then take a single screenshot and move the mouse aside.
    * Do not press Enter repeatedly. If the page state doesn't change after submit+wait+screenshot, change strategy (e.g., focus address bar with Ctrl/⌘+L, type the full URL, press Enter once).
  - Computer calls are slow; batch related actions together.
  - Zoom out or scroll so all relevant content is visible before reading.
  - If the first screenshot is black, click near center and screenshot again.
  </BROWSER_CONTROL>
  
  <TASK_EXECUTION>
  - You receive exactly one natural-language task and no further user feedback.
  - Do not ask clarifying questions; make reasonable assumptions and proceed.
  - Prefer minimal, high-signal actions that move directly toward the goal.
  - Every assistant turn must include at least one computer action; avoid text-only turns.
  - Avoid repetition: never repeat the same action sequence in consecutive turns (e.g., pressing Enter multiple times). If an action has no visible effect, pivot to a different approach.
  - If two iterations produce no meaningful progress, try a different tactic (e.g., Ctrl/⌘+L → type URL → Enter) rather than repeating the prior keys, then proceed.
  - Keep the final response concise and focused on fulfilling the task.
  </TASK_EXECUTION>"""


def create_response(**kwargs):
    url = "https://api.openai.com/v1/responses"
    headers = {
        "Authorization": f"Bearer {os.getenv('OPENAI_API_KEY')}",
        "Content-Type": "application/json",
    }

    openai_org = os.getenv("OPENAI_ORG")
    if openai_org:
        headers["Openai-Organization"] = openai_org

    response = requests.post(url, headers=headers, json=kwargs)
    if response.status_code != 200:
        raise RuntimeError(f"OpenAI API Error: {response.status_code} {response.text}")
    return response.json()


class Agent:
    def __init__(self):
        self.steel = Steel(steel_api_key=STEEL_API_KEY)
        self.session = None
        self.model = "computer-use-preview"

        self.viewport_width = 1280
        self.viewport_height = 768
        self.system_prompt = BROWSER_SYSTEM_PROMPT
        self.tools = [
            {
                "type": "computer-preview",
                "display_width": self.viewport_width,
                "display_height": self.viewport_height,
                "environment": "browser",
            }
        ]

        self.print_steps = True
        self.auto_acknowledge_safety = True

    def center(self) -> Tuple[int, int]:
        return (self.viewport_width // 2, self.viewport_height // 2)

    def to_number(self, v: Any, default: float = 0.0) -> float:
        if isinstance(v, (int, float)):
            return float(v)
        if isinstance(v, str):
            try:
                return float(v)
            except ValueError:
                return default
        return default

    def to_coords(self, x: Any = None, y: Any = None) -> Tuple[int, int]:
        if x is None or y is None:
            return self.center()
        return (
            int(self.to_number(x, self.center()[0])),
            int(self.to_number(y, self.center()[1])),
        )

    def split_keys(self, k: Optional[Any]) -> List[str]:
        if isinstance(k, list):
            return [str(s) for s in k if s]
        if isinstance(k, str) and k.strip():
            return [s.strip() for s in k.split("+") if s.strip()]
        return []

    def normalize_key(self, key: str) -> str:
        if not isinstance(key, str) or not key:
            return key
        k = key.strip()
        upper = k.upper()
        synonyms = {
            "ENTER": "Enter",
            "RETURN": "Enter",
            "ESC": "Escape",
            "ESCAPE": "Escape",
            "TAB": "Tab",
            "BACKSPACE": "Backspace",
            "BKSP": "Backspace",
            "DELETE": "Delete",
            "DEL": "Delete",
            "SPACE": "Space",
            "CTRL": "Control",
            "CONTROL": "Control",
            "ALT": "Alt",
            "SHIFT": "Shift",
            "META": "Meta",
            "SUPER": "Meta",
            "CMD": "Meta",
            "COMMAND": "Meta",
            "UP": "ArrowUp",
            "DOWN": "ArrowDown",
            "LEFT": "ArrowLeft",
            "RIGHT": "ArrowRight",
            "ARROWUP": "ArrowUp",
            "ARROWDOWN": "ArrowDown",
            "ARROWLEFT": "ArrowLeft",
            "ARROWRIGHT": "ArrowRight",
            "HOME": "Home",
            "END": "End",
            "PAGEUP": "PageUp",
            "PAGEDOWN": "PageDown",
            "INSERT": "Insert",
        }
        if upper in synonyms:
            return synonyms[upper]
        if upper.startswith("F") and upper[1:].isdigit():
            return "F" + upper[1:]
        return k

    def normalize_keys(self, keys: List[str]) -> List[str]:
        return [self.normalize_key(k) for k in keys]

    def initialize(self) -> None:
        width = self.viewport_width
        height = self.viewport_height
        self.session = self.steel.sessions.create(
            dimensions={"width": width, "height": height},
            block_ads=True,
            api_timeout=900000,
        )
        print("Steel Session created successfully!")
        print(f"View live session at: {self.session.session_viewer_url}")

    def cleanup(self) -> None:
        if self.session:
            print("Releasing Steel session...")
            self.steel.sessions.release(self.session.id)
            print(
                f"Session completed. View replay at {self.session.session_viewer_url}"
            )
            self.session = None

    def take_screenshot(self) -> str:
        resp = self.steel.sessions.computer(self.session.id, action="take_screenshot")
        img = getattr(resp, "base64_image", None)
        if not img:
            raise RuntimeError("No screenshot returned from Steel")
        return img

    def map_button(self, btn: Optional[str]) -> str:
        b = (btn or "left").lower()
        if b in ("left", "right", "middle", "back", "forward"):
            return b
        return "left"

    def execute_computer_action(
        self, action_type: str, action_args: Dict[str, Any]
    ) -> str:
        body: Dict[str, Any]

        if action_type == "move":
            coords = self.to_coords(action_args.get("x"), action_args.get("y"))
            body = {
                "action": "move_mouse",
                "coordinates": [coords[0], coords[1]],
                "screenshot": True,
            }

        elif action_type in ("click",):
            coords = self.to_coords(action_args.get("x"), action_args.get("y"))
            button = self.map_button(action_args.get("button"))
            num_clicks = int(self.to_number(action_args.get("num_clicks"), 1))
            payload = {
                "action": "click_mouse",
                "button": button,
                "coordinates": [coords[0], coords[1]],
                "screenshot": True,
            }
            if num_clicks > 1:
                payload["num_clicks"] = num_clicks
            body = payload

        elif action_type in ("doubleClick", "double_click"):
            coords = self.to_coords(action_args.get("x"), action_args.get("y"))
            body = {
                "action": "click_mouse",
                "button": "left",
                "coordinates": [coords[0], coords[1]],
                "num_clicks": 2,
                "screenshot": True,
            }

        elif action_type == "drag":
            path = action_args.get("path") or []
            steel_path: List[List[int]] = []
            for p in path:
                steel_path.append(list(self.to_coords(p.get("x"), p.get("y"))))
            if len(steel_path) < 2:
                cx, cy = self.center()
                tx, ty = self.to_coords(action_args.get("x"), action_args.get("y"))
                steel_path = [[cx, cy], [tx, ty]]
            body = {"action": "drag_mouse", "path": steel_path, "screenshot": True}

        elif action_type == "scroll":
            coords: Optional[Tuple[int, int]] = None
            if action_args.get("x") is not None or action_args.get("y") is not None:
                coords = self.to_coords(action_args.get("x"), action_args.get("y"))
            delta_x = int(self.to_number(action_args.get("scroll_x"), 0))
            delta_y = int(self.to_number(action_args.get("scroll_y"), 0))
            body = {
                "action": "scroll",
                "screenshot": True,
            }
            if coords:
                body["coordinates"] = [coords[0], coords[1]]
            if delta_x:
                body["delta_x"] = delta_x
            if delta_y:
                body["delta_y"] = delta_y

        elif action_type == "type":
            text = action_args.get("text") or ""
            body = {"action": "type_text", "text": text, "screenshot": True}

        elif action_type == "keypress":
            keys = action_args.get("keys")
            keys_list = self.split_keys(keys)
            normalized = self.normalize_keys(keys_list)
            body = {"action": "press_key", "keys": normalized, "screenshot": True}

        elif action_type == "wait":
            ms = self.to_number(action_args.get("ms"), 1000)
            seconds = max(0.001, ms / 1000.0)
            body = {"action": "wait", "duration": seconds, "screenshot": True}

        elif action_type == "screenshot":
            return self.take_screenshot()

        else:
            return self.take_screenshot()

        resp = self.steel.sessions.computer(
            self.session.id, **{k: v for k, v in body.items() if v is not None}
        )
        img = getattr(resp, "base64_image", None)
        return img if img else self.take_screenshot()

    def handle_item(self, item: Dict[str, Any]) -> List[Dict[str, Any]]:
        if item["type"] == "message":
            if self.print_steps and item.get("content") and len(item["content"]) > 0:
                print(item["content"][0].get("text", ""))
            return []

        if item["type"] == "function_call":
            if self.print_steps:
                print(f"{item['name']}({item['arguments']})")
            return [
                {
                    "type": "function_call_output",
                    "call_id": item["call_id"],
                    "output": "success",
                }
            ]

        if item["type"] == "computer_call":
            action = item["action"]
            action_type = action["type"]
            action_args = {k: v for k, v in action.items() if k != "type"}

            if self.print_steps:
                print(f"{action_type}({json.dumps(action_args)})")

            screenshot_base64 = self.execute_computer_action(action_type, action_args)

            pending_checks = item.get("pending_safety_checks", []) or []
            for check in pending_checks:
                if self.auto_acknowledge_safety:
                    print(f"⚠️  Auto-acknowledging safety check: {check.get('message')}")
                else:
                    raise RuntimeError(f"Safety check failed: {check.get('message')}")

            call_output = {
                "type": "computer_call_output",
                "call_id": item["call_id"],
                "acknowledged_safety_checks": pending_checks,
                "output": {
                    "type": "input_image",
                    "image_url": f"data:image/png;base64,{screenshot_base64}",
                },
            }
            return [call_output]

        return []

    def execute_task(
        self,
        task: str,
        print_steps: bool = True,
        debug: bool = False,
        max_iterations: int = 50,
    ) -> str:
        self.print_steps = print_steps

        input_items: List[Dict[str, Any]] = [
            {"role": "system", "content": self.system_prompt},
            {"role": "user", "content": task},
        ]

        new_items: List[Dict[str, Any]] = []
        iterations = 0
        consecutive_no_actions = 0
        last_assistant_texts: List[str] = []

        print(f"🎯 Executing task: {task}")
        print("=" * 60)

        def detect_repetition(text: str) -> bool:
            if len(last_assistant_texts) < 2:
                return False
            words1 = text.lower().split()
            for prev in last_assistant_texts:
                words2 = prev.lower().split()
                common = [w for w in words1 if w in words2]
                if len(common) / max(len(words1), len(words2)) > 0.8:
                    return True
            return False

        while iterations < max_iterations:
            iterations += 1
            has_actions = False

            if new_items and new_items[-1].get("role") == "assistant":
                content = new_items[-1].get("content", [])
                last_text = content[0].get("text") if content else None
                if isinstance(last_text, str) and last_text:
                    if detect_repetition(last_text):
                        print("🔄 Repetition detected - stopping execution")
                        last_assistant_texts.append(last_text)
                        break
                    last_assistant_texts.append(last_text)
                    if len(last_assistant_texts) > 3:
                        last_assistant_texts.pop(0)

            try:
                response = create_response(
                    model=self.model,
                    input=[*input_items, *new_items],
                    tools=self.tools,
                    truncation="auto",
                )

                if "output" not in response:
                    raise RuntimeError("No output from model")

                for item in response["output"]:
                    new_items.append(item)
                    if item.get("type") in ("computer_call", "function_call"):
                        has_actions = True
                    new_items.extend(self.handle_item(item))

                if not has_actions:
                    consecutive_no_actions += 1
                    if consecutive_no_actions >= 3:
                        print("⚠️  No actions for 3 consecutive iterations - stopping")
                        break
                else:
                    consecutive_no_actions = 0
            except Exception as error:
                print(f"❌ Error during task execution: {error}")
                raise

        if iterations >= max_iterations:
            print(f"⚠️  Task execution stopped after {max_iterations} iterations")

        assistant_messages = [i for i in new_items if i.get("role") == "assistant"]
        if assistant_messages:
            content = assistant_messages[-1].get("content") or []
            if content and content[0].get("text"):
                return content[0]["text"]
        return "Task execution completed (no final message)"


def main():
    print("🚀 Steel + OpenAI Computer Use Assistant (Steel actions)")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print(
            "⚠️  WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key"
        )
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        sys.exit(1)
    if OPENAI_API_KEY == "your-openai-api-key-here":
        print(
            "⚠️  WARNING: Please replace 'your-openai-api-key-here' with your actual OpenAI API key"
        )
        print("   Get your API key at: https://platform.openai.com/")
        sys.exit(1)

    print("\nStarting Steel session...")
    agent = Agent()
    try:
        agent.initialize()
        print("✅ Steel session started!")

        start_time = time.time()
        try:
            result = agent.execute_task(TASK, True, False, 50)
            duration = f"{(time.time() - start_time):.1f}"
            print("\n" + "=" * 60)
            print("🎉 TASK EXECUTION COMPLETED")
            print("=" * 60)
            print(f"⏱️  Duration: {duration} seconds")
            print(f"🎯 Task: {TASK}")
            print(f"📋 Result:\n{result}")
            print("=" * 60)
        except Exception as e:
            print(f"❌ Task execution failed: {e}")
            raise
    except Exception as e:
        print(f"❌ Failed to start Steel session: {e}")
        print("Please check your STEEL_API_KEY and internet connection.")
        raise
    finally:
        agent.cleanup()


if __name__ == "__main__":
    main()
