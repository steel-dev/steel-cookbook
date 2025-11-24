"""
Claude AI agent for autonomous web task execution with Steel headful Input API.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-claude-computer-use-python-starter
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
TASK = (
    os.getenv("TASK")
    or "Go to Google and search for machine learning, summarize the best answer"
)


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


def pp(obj) -> None:
    print(json.dumps(obj, indent=2))


class Agent:
    def __init__(self):
        self.client = Anthropic(api_key=ANTHROPIC_API_KEY)
        self.steel = Steel(steel_api_key=STEEL_API_KEY)
        self.model = "claude-sonnet-4-5"
        self.messages: List[BetaMessageParam] = []
        self.session = None

        self.viewport_width = 1280
        self.viewport_height = 768

        self.system_prompt = BROWSER_SYSTEM_PROMPT
        self.tools = [
            {
                "type": "computer_20250124",
                "name": "computer",
                "display_width_px": self.viewport_width,
                "display_height_px": self.viewport_height,
                "display_number": 1,
            }
        ]

    def _center(self) -> Tuple[int, int]:
        return (self.viewport_width // 2, self.viewport_height // 2)

    def _split_keys(self, k: Optional[str]) -> List[str]:
        return [s.strip() for s in k.split("+")] if k else []

    def _normalize_key(self, key: str) -> str:
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

    def _normalize_keys(self, keys: List[str]) -> List[str]:
        return [self._normalize_key(k) for k in keys]

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
            coords = self._center()

        body: Optional[dict] = None

        if action == "mouse_move":
            body = {
                "action": "move_mouse",
                "coordinates": [coords[0], coords[1]],
                "screenshot": True,
            }
            hk = self._split_keys(key)
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
            hk = self._split_keys(key)
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
            hk = self._split_keys(key)
            if hk:
                body["hold_keys"] = hk

        elif action == "left_click_drag":
            start_x, start_y = self._center()
            end_x, end_y = coords
            body = {
                "action": "drag_mouse",
                "path": [[start_x, start_y], [end_x, end_y]],
                "screenshot": True,
            }
            hk = self._split_keys(key)
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
            hk = self._split_keys(text)
            if hk:
                body["hold_keys"] = hk

        elif action == "hold_key":
            keys = self._split_keys(text or "")
            keys = self._normalize_keys(keys)
            body = {
                "action": "press_key",
                "keys": keys or [],
                "duration": duration,
                "screenshot": True,
            }

        elif action == "key":
            keys = self._split_keys(text or "")
            keys = self._normalize_keys(keys)
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
            hk = self._split_keys(key)
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

    def process_response(self, message) -> str:
        response_text = ""
        for block in message.content:
            if block.type == "text":
                response_text += block.text
                print(block.text)
            elif block.type == "tool_use":
                tool_name = block.name
                tool_input = block.input
                print(f"🔧 {tool_name}({json.dumps(tool_input)})")
                if tool_name == "computer":
                    action = tool_input.get("action")
                    params = {
                        "text": tool_input.get("text"),
                        "coordinate": tool_input.get("coordinate"),
                        "scroll_direction": tool_input.get("scroll_direction"),
                        "scroll_amount": tool_input.get("scroll_amount"),
                        "duration": tool_input.get("duration"),
                        "key": tool_input.get("key"),
                    }
                    try:
                        screenshot_base64 = self.execute_computer_action(
                            action=action,
                            text=params["text"],
                            coordinate=params["coordinate"],
                            scroll_direction=params["scroll_direction"],
                            scroll_amount=params["scroll_amount"],
                            duration=params["duration"],
                            key=params["key"],
                        )
                        self.messages.append(
                            {
                                "role": "assistant",
                                "content": [
                                    {
                                        "type": "tool_use",
                                        "id": block.id,
                                        "name": block.name,
                                        "input": tool_input,
                                    }
                                ],
                            }
                        )
                        self.messages.append(
                            {
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
                                                    "data": screenshot_base64,
                                                },
                                            }
                                        ],
                                    }
                                ],
                            }
                        )
                        return self.get_claude_response()
                    except Exception as e:
                        print(f"❌ Error executing {action}: {e}")
                        self.messages.append(
                            {
                                "role": "assistant",
                                "content": [
                                    {
                                        "type": "tool_use",
                                        "id": block.id,
                                        "name": block.name,
                                        "input": tool_input,
                                    }
                                ],
                            }
                        )
                        self.messages.append(
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "tool_result",
                                        "tool_use_id": block.id,
                                        "content": f"Error executing {action}: {e}",
                                        "is_error": True,
                                    }
                                ],
                            }
                        )
                        return self.get_claude_response()

        if response_text and not any(b.type == "tool_use" for b in message.content):
            self.messages.append({"role": "assistant", "content": response_text})

        return response_text

    def get_claude_response(self) -> str:
        try:
            response = self.client.beta.messages.create(
                model=self.model,
                max_tokens=4096,
                messages=self.messages,
                tools=self.tools,
                betas=["computer-use-2025-01-24"],
            )
            return self.process_response(response)
        except Exception as e:
            err = f"Error communicating with Claude: {e}"
            print(f"❌ {err}")
            return err

    def execute_task(
        self,
        task: str,
        print_steps: bool = True,
        debug: bool = False,
        max_iterations: int = 50,
    ) -> str:
        self.messages = [
            {"role": "user", "content": self.system_prompt},
            {"role": "user", "content": task},
        ]

        iterations = 0
        consecutive_no_actions = 0
        last_assistant_messages: List[str] = []

        print(f"🎯 Executing task: {task}")
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

        while iterations < max_iterations:
            iterations += 1
            has_actions = False

            last_assistant = None
            for msg in reversed(self.messages):
                if msg.get("role") == "assistant" and isinstance(
                    msg.get("content"), str
                ):
                    last_assistant = msg.get("content")
                    break
            if isinstance(last_assistant, str):
                if detect_repetition(last_assistant):
                    print("🔄 Repetition detected - stopping execution")
                    last_assistant_messages.append(last_assistant)
                    break
                last_assistant_messages.append(last_assistant)
                if len(last_assistant_messages) > 3:
                    last_assistant_messages.pop(0)

            if debug:
                pp(self.messages)

            try:
                response = self.client.beta.messages.create(
                    model=self.model,
                    max_tokens=4096,
                    messages=self.messages,
                    tools=self.tools,
                    betas=["computer-use-2025-01-24"],
                )
                if debug:
                    pp(response)

                for block in response.content:
                    if block.type == "tool_use":
                        has_actions = True

                self.process_response(response)

                if not has_actions:
                    consecutive_no_actions += 1
                    if consecutive_no_actions >= 3:
                        print("⚠️  No actions for 3 consecutive iterations - stopping")
                        break
                else:
                    consecutive_no_actions = 0
            except Exception as e:
                print(f"❌ Error during task execution: {e}")
                raise e

        if iterations >= max_iterations:
            print(f"⚠️  Task execution stopped after {max_iterations} iterations")

        assistant_messages = [m for m in self.messages if m.get("role") == "assistant"]
        final_message = assistant_messages[-1] if assistant_messages else None
        if final_message and isinstance(final_message.get("content"), str):
            return final_message["content"]
        return "Task execution completed (no final message)"


def main():
    print("🚀 Steel + Claude Computer Use Assistant")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print(
            "⚠️  WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key"
        )
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        sys.exit(1)

    if ANTHROPIC_API_KEY == "your-anthropic-api-key-here":
        print(
            "⚠️  WARNING: Please replace 'your-anthropic-api-key-here' with your actual Anthropic API key"
        )
        print("   Get your API key at: https://console.anthropic.com/")
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
            raise RuntimeError("Task execution failed")
    except Exception as e:
        print(f"❌ Failed to start Steel session: {e}")
        print("Please check your STEEL_API_KEY and internet connection.")
        raise RuntimeError("Failed to start Steel session")
    finally:
        agent.cleanup()


if __name__ == "__main__":
    main()
