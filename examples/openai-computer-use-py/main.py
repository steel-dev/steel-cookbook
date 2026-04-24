"""
OpenAI AI agent for autonomous web interactions with Steel computers (Input API).
https://github.com/steel-dev/steel-cookbook/tree/main/examples/openai-computer-use-py
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
TASK = os.getenv("TASK") or "Go to Steel.dev and find the latest news"


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
    * Clear with Ctrl+A, then Delete.
    * After submitting (Enter or clicking a button), call wait(1–2s) once, then take a single screenshot and move the mouse aside.
    * Do not press Enter repeatedly. If the page state doesn't change after submit+wait+screenshot, change strategy (e.g., focus address bar with Ctrl+L, type the full URL, press Enter once).
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
  - If two iterations produce no meaningful progress, try a different tactic (e.g., Ctrl+L → type URL → Enter) rather than repeating the prior keys, then proceed.
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
        self.model = "gpt-5.5"

        self.viewport_width = 1440
        self.viewport_height = 900
        self.system_prompt = BROWSER_SYSTEM_PROMPT
        self.tools = [{"type": "computer"}]

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
        if len(k) == 1 and k.isalpha() and k.isupper():
            return k.lower()
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

    def execute_task(
        self,
        task: str,
        print_steps: bool = True,
        max_iterations: int = 50,
    ) -> str:
        self.print_steps = print_steps

        previous_response_id: Optional[str] = None
        next_input: Any = [{"role": "user", "content": task}]
        final_message = ""

        print(f"Executing task: {task}")
        print("=" * 60)

        for turn in range(max_iterations):
            params: Dict[str, Any] = {
                "model": self.model,
                "instructions": self.system_prompt,
                "input": next_input,
                "tools": self.tools,
                "reasoning": {"effort": "medium"},
                "truncation": "auto",
            }
            if previous_response_id:
                params["previous_response_id"] = previous_response_id

            response = create_response(**params)
            if "output" not in response:
                raise RuntimeError("No output from model")
            previous_response_id = response.get("id")

            tool_outputs: List[Dict[str, Any]] = []

            for item in response["output"]:
                item_type = item.get("type")

                if item_type == "message":
                    content = item.get("content") or []
                    text = content[0].get("text", "") if content else ""
                    if self.print_steps and text:
                        print(text)
                    if text:
                        final_message = text
                    continue

                if item_type == "reasoning":
                    summary = " ".join(
                        s.get("text", "")
                        for s in (item.get("summary") or [])
                        if s.get("text")
                    )
                    if self.print_steps and summary:
                        print(f"{summary}")
                    continue

                if item_type == "function_call":
                    if self.print_steps:
                        print(f"{item['name']}({item['arguments']})")
                    tool_outputs.append(
                        {
                            "type": "function_call_output",
                            "call_id": item["call_id"],
                            "output": "success",
                        }
                    )
                    continue

                if item_type == "computer_call":
                    actions = item.get("actions") or (
                        [item["action"]] if item.get("action") else []
                    )

                    for action in actions:
                        action_type = action.get("type")
                        action_args = {k: v for k, v in action.items() if k != "type"}
                        if self.print_steps:
                            print(f"{action_type}({json.dumps(action_args)})")
                        self.execute_computer_action(action_type, action_args)

                    pending_checks = item.get("pending_safety_checks", []) or []
                    for check in pending_checks:
                        if self.auto_acknowledge_safety:
                            print(
                                f"Auto-acknowledging safety check: {check.get('message')}"
                            )
                        else:
                            raise RuntimeError(
                                f"Safety check failed: {check.get('message')}"
                            )

                    screenshot_base64 = self.take_screenshot()
                    tool_outputs.append(
                        {
                            "type": "computer_call_output",
                            "call_id": item["call_id"],
                            "acknowledged_safety_checks": pending_checks,
                            "output": {
                                "type": "computer_screenshot",
                                "image_url": f"data:image/png;base64,{screenshot_base64}",
                            },
                        }
                    )

            if not tool_outputs:
                break
            next_input = tool_outputs

        return final_message or "Task execution completed (no final message)"


def main():
    print("Steel + OpenAI Computer Use Assistant (Steel actions)")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print(
            "WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key"
        )
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        sys.exit(1)
    if OPENAI_API_KEY == "your-openai-api-key-here":
        print(
            "WARNING: Please replace 'your-openai-api-key-here' with your actual OpenAI API key"
        )
        print("   Get your API key at: https://platform.openai.com/")
        sys.exit(1)

    print("\nStarting Steel session...")
    agent = Agent()
    try:
        agent.initialize()
        print("Steel session started!")

        start_time = time.time()
        try:
            result = agent.execute_task(TASK, True, 50)
            duration = f"{(time.time() - start_time):.1f}"
            print("\n" + "=" * 60)
            print("TASK EXECUTION COMPLETED")
            print("=" * 60)
            print(f"⏱️  Duration: {duration} seconds")
            print(f"Task: {TASK}")
            print(f"Result:\n{result}")
            print("=" * 60)
        except Exception as e:
            print(f"Task execution failed: {e}")
            raise
    except Exception as e:
        print(f"Failed to start Steel session: {e}")
        print("Please check your STEEL_API_KEY and internet connection.")
        raise
    finally:
        agent.cleanup()


if __name__ == "__main__":
    main()
