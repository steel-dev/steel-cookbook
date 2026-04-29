"""
Claude AI agent for autonomous web task execution with Steel headful Input API.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/claude-computer-use-py
"""

import os
import sys
import time
import json
from typing import List, Optional, Tuple
from datetime import datetime

from dotenv import load_dotenv
from steel import Steel
from anthropic import Anthropic
from anthropic.types.beta import BetaMessageParam

load_dotenv(override=True)

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY") or "your-anthropic-api-key-here"
TASK = os.getenv("TASK") or "Go to Steel.dev and find the latest news"


def format_today() -> str:
    return datetime.now().strftime("%A, %B %d, %Y")


BROWSER_SYSTEM_PROMPT = f"""<BROWSER_ENV>
  - You control a headful Chromium browser running in a VM with internet access.
  - Chromium is already open; interact only through the "computer" tool (mouse, keyboard, scroll, screenshots).
  - Today's date is {format_today()}.
  </BROWSER_ENV>
  
  <BROWSER_CONTROL>
  - When viewing pages, zoom out or scroll so all relevant content is visible.
  - When typing into any input:
    * Clear it first with Ctrl+A, then Delete.
    * After submitting (pressing Enter or clicking a button), take an extra screenshot to confirm the result and move the mouse away.
  - Computer tool calls are slow; batch related actions into a single call whenever possible.
  - You may act on the user's behalf on sites where they are already authenticated.
  - Assume any required authentication/Auth Contexts are already configured before the task starts.
  - If the first screenshot is black:
    * Click near the center of the screen.
    * Take another screenshot.
  - Never click the browser address bar with the mouse. To navigate to a URL:
    * Press Ctrl+L to focus and select the address bar.
    * Type the full URL, then press Enter.
    * If you see any existing text (e.g., 'about:blank'), press Ctrl+L before typing so you replace it (never append).
  - Prefer typing into inputs on the page (e.g., a site's search box) rather than the browser address bar, unless entering a direct URL.
  </BROWSER_CONTROL>
  
  <TASK_EXECUTION>
  - You receive exactly one natural-language task and no further user feedback.
  - Do not ask the user clarifying questions; instead, make reasonable assumptions and proceed.
  - For complex tasks, quickly plan a short, ordered sequence of steps before acting.
  - Prefer minimal, high-signal actions that move directly toward the goal.
  - Keep your final response concise and focused on fulfilling the task (e.g., a brief summary of findings or results).
  </TASK_EXECUTION>"""


class Agent:
    def __init__(self):
        self.client = Anthropic(api_key=ANTHROPIC_API_KEY)
        self.steel = Steel(steel_api_key=STEEL_API_KEY)
        self.model = "claude-opus-4-7"
        self.messages: List[BetaMessageParam] = []
        self.session = None

        self.viewport_width = 1280
        self.viewport_height = 768

        self.system_prompt = BROWSER_SYSTEM_PROMPT
        self.tools = [
            {
                "type": "computer_20251124",
                "name": "computer",
                "display_width_px": self.viewport_width,
                "display_height_px": self.viewport_height,
                "display_number": 1,
            }
        ]

    def center(self) -> Tuple[int, int]:
        return (self.viewport_width // 2, self.viewport_height // 2)

    def split_keys(self, k: Optional[str]) -> List[str]:
        return [s.strip() for s in k.split("+")] if k else []

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

    def take_screenshot(self) -> str:
        resp = self.steel.sessions.computer(self.session.id, action="take_screenshot")
        img = getattr(resp, "base64_image", None)
        if not img:
            raise RuntimeError("No screenshot returned from Input API")
        return img

    def execute_computer_action(
        self,
        action: str,
        text: Optional[str] = None,
        coordinate: Optional[Tuple[int, int]] = None,
        scroll_direction: Optional[str] = None,
        scroll_amount: Optional[int] = None,
        duration: Optional[float] = None,
        key: Optional[str] = None,
    ) -> str:
        if (
            coordinate
            and isinstance(coordinate, (list, tuple))
            and len(coordinate) == 2
        ):
            coords = (int(coordinate[0]), int(coordinate[1]))
        else:
            coords = self.center()

        body: Optional[dict] = None

        if action == "mouse_move":
            body = {
                "action": "move_mouse",
                "coordinates": [coords[0], coords[1]],
                "screenshot": True,
            }
            hk = self.split_keys(key)
            if hk:
                body["hold_keys"] = hk

        elif action in ("left_mouse_down", "left_mouse_up"):
            body = {
                "action": "click_mouse",
                "button": "left",
                "click_type": "down" if action == "left_mouse_down" else "up",
                "coordinates": [coords[0], coords[1]],
                "screenshot": True,
            }
            hk = self.split_keys(key)
            if hk:
                body["hold_keys"] = hk

        elif action in (
            "left_click",
            "right_click",
            "middle_click",
            "double_click",
            "triple_click",
        ):
            button_map = {
                "left_click": "left",
                "right_click": "right",
                "middle_click": "middle",
                "double_click": "left",
                "triple_click": "left",
            }
            clicks = (
                2 if action == "double_click" else 3 if action == "triple_click" else 1
            )
            body = {
                "action": "click_mouse",
                "button": button_map[action],
                "coordinates": [coords[0], coords[1]],
                "screenshot": True,
            }
            if clicks > 1:
                body["num_clicks"] = clicks
            hk = self.split_keys(key)
            if hk:
                body["hold_keys"] = hk

        elif action == "left_click_drag":
            start_x, start_y = self.center()
            end_x, end_y = coords
            body = {
                "action": "drag_mouse",
                "path": [[start_x, start_y], [end_x, end_y]],
                "screenshot": True,
            }
            hk = self.split_keys(key)
            if hk:
                body["hold_keys"] = hk

        elif action == "scroll":
            step = 100
            dx_dy = {
                "down": (0, step * (scroll_amount or 0)),
                "up": (0, -step * (scroll_amount or 0)),
                "right": (step * (scroll_amount or 0), 0),
                "left": (-(step * (scroll_amount or 0)), 0),
            }
            dx, dy = dx_dy.get(
                scroll_direction or "down", (0, step * (scroll_amount or 0))
            )
            body = {
                "action": "scroll",
                "coordinates": [coords[0], coords[1]],
                "delta_x": dx,
                "delta_y": dy,
                "screenshot": True,
            }
            hk = self.split_keys(text)
            if hk:
                body["hold_keys"] = hk

        elif action == "hold_key":
            keys = self.split_keys(text or "")
            keys = self.normalize_keys(keys)
            body = {
                "action": "press_key",
                "keys": keys or [],
                "duration": duration,
                "screenshot": True,
            }

        elif action == "key":
            keys = self.split_keys(text or "")
            keys = self.normalize_keys(keys)
            body = {
                "action": "press_key",
                "keys": keys or [],
                "screenshot": True,
            }

        elif action == "type":
            body = {
                "action": "type_text",
                "text": text,
                "screenshot": True,
            }
            hk = self.split_keys(key)
            if hk:
                body["hold_keys"] = hk

        elif action == "wait":
            body = {
                "action": "wait",
                "duration": duration,
                "screenshot": True,
            }

        elif action == "screenshot":
            return self.take_screenshot()

        elif action == "cursor_position":
            self.steel.sessions.computer(self.session.id, action="get_cursor_position")
            return self.take_screenshot()

        else:
            raise ValueError(f"Invalid action: {action}")

        clean_body = {k: v for k, v in body.items() if v is not None}
        resp = self.steel.sessions.computer(self.session.id, **clean_body)
        img = getattr(resp, "base64_image", None)
        if img:
            return img
        return self.take_screenshot()

    def process_response(self, message) -> Tuple[str, bool]:
        response_text = ""
        has_actions = False
        tool_results = []

        assistant_content = []
        for block in message.content:
            if block.type == "text":
                response_text += block.text
                print(block.text)
                assistant_content.append({"type": "text", "text": block.text})
            elif block.type == "tool_use":
                has_actions = True
                assistant_content.append(
                    {
                        "type": "tool_use",
                        "id": block.id,
                        "name": block.name,
                        "input": block.input,
                    }
                )
                tool_name = block.name
                tool_input = block.input
                print(f"{tool_name}({json.dumps(tool_input)})")
                if tool_name == "computer":
                    action = tool_input.get("action")
                    try:
                        screenshot_base64 = self.execute_computer_action(
                            action=action,
                            text=tool_input.get("text"),
                            coordinate=tool_input.get("coordinate"),
                            scroll_direction=tool_input.get("scroll_direction"),
                            scroll_amount=tool_input.get("scroll_amount"),
                            duration=tool_input.get("duration"),
                            key=tool_input.get("key"),
                        )
                        tool_results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": [
                                    {
                                        "type": "image",
                                        "source": {
                                            "type": "base64",
                                            "media_type": "image/png",
                                            "data": screenshot_base64,
                                        },
                                    }
                                ],
                            }
                        )
                    except Exception as e:
                        print(f"Error executing {action}: {e}")
                        tool_results.append(
                            {
                                "type": "tool_result",
                                "tool_use_id": block.id,
                                "content": f"Error executing {action}: {e}",
                                "is_error": True,
                            }
                        )

        self.messages.append({"role": "assistant", "content": assistant_content})
        if tool_results:
            self.messages.append({"role": "user", "content": tool_results})

        return response_text, has_actions

    def execute_task(
        self,
        task: str,
        print_steps: bool = True,
        max_iterations: int = 50,
    ) -> str:
        self.messages = [
            {"role": "user", "content": self.system_prompt},
            {"role": "user", "content": task},
        ]

        iterations = 0
        last_assistant_messages: List[str] = []

        print(f"Executing task: {task}")
        print("=" * 60)

        def detect_repetition(new_message: str) -> bool:
            if len(last_assistant_messages) < 2:
                return False
            words1 = new_message.lower().split()
            return any(
                len([w for w in words1 if w in prev.lower().split()])
                / max(len(words1), len(prev.lower().split()))
                > 0.8
                for prev in last_assistant_messages
            )

        def extract_text(content) -> str:
            if isinstance(content, str):
                return content
            if isinstance(content, list):
                return "".join(
                    b.get("text", "") for b in content if b.get("type") == "text"
                )
            return ""

        final_text = ""

        while iterations < max_iterations:
            iterations += 1

            if self.messages:
                last_message = self.messages[-1]
                if last_message.get("role") == "assistant":
                    content = extract_text(last_message.get("content"))
                    if content:
                        if detect_repetition(content):
                            print("Repetition detected - stopping execution")
                            final_text = content
                            break
                        last_assistant_messages.append(content)
                        if len(last_assistant_messages) > 3:
                            last_assistant_messages.pop(0)

            try:
                response = self.client.beta.messages.create(
                    model=self.model,
                    max_tokens=4096,
                    messages=self.messages,
                    tools=self.tools,
                    betas=["computer-use-2025-11-24"],
                )

                text, has_actions = self.process_response(response)

                if not has_actions:
                    print("Task complete - no further actions requested")
                    final_text = text
                    break
            except Exception as e:
                print(f"Error during task execution: {e}")
                raise e

        if iterations >= max_iterations:
            print(f"Task execution stopped after {max_iterations} iterations")

        return final_text or "Task execution completed (no final message)"


def main():
    print("Steel + Claude Computer Use Assistant")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print(
            "WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key"
        )
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        sys.exit(1)

    if ANTHROPIC_API_KEY == "your-anthropic-api-key-here":
        print(
            "WARNING: Please replace 'your-anthropic-api-key-here' with your actual Anthropic API key"
        )
        print("   Get your API key at: https://console.anthropic.com/")
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
            print(f"Duration: {duration} seconds")
            print(f"Task: {TASK}")
            print(f"Result:\n{result}")
            print("=" * 60)
        except Exception as e:
            print(f"Task execution failed: {e}")
            raise RuntimeError("Task execution failed")
    except Exception as e:
        print(f"Failed to start Steel session: {e}")
        print("Please check your STEEL_API_KEY and internet connection.")
        raise RuntimeError("Failed to start Steel session")
    finally:
        agent.cleanup()


if __name__ == "__main__":
    main()
