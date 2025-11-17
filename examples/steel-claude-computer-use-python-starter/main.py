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

# Env
STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY") or "your-anthropic-api-key-here"
TASK = (
    os.getenv("TASK")
    or "Go to Wikipedia and search for machine learning, summarize the best answer"
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


class Computer:
    def __init__(
        self,
        width: int = 1280,
        height: int = 768,
        proxy: bool = False,
        solve_captcha: bool = False,
        session_timeout: int = 900000,
        ad_blocker: bool = True,
    ):
        self.client = Steel(steel_api_key=STEEL_API_KEY)
        self.dimensions: Tuple[int, int] = (width, height)
        self.proxy = proxy
        self.solve_captcha = solve_captcha
        self.session_timeout = session_timeout
        self.ad_blocker = ad_blocker
        self.session = None
        self.last_mouse_position: Optional[Tuple[int, int]] = None

    def get_dimensions(self) -> Tuple[int, int]:
        return self.dimensions

    def clamp_coordinates(self, x: int, y: int) -> Tuple[int, int]:
        width, height = self.dimensions
        clamped_x = max(0, min(int(x), width - 1))
        clamped_y = max(0, min(int(y), height - 1))
        if clamped_x != x or clamped_y != y:
            print(f"⚠️  Coordinate clamped: ({x}, {y}) → ({clamped_x}, {clamped_y})")
        return clamped_x, clamped_y

    def _validate_coords(
        self, coordinate: Optional[Tuple[int, int]]
    ) -> Optional[Tuple[int, int]]:
        if coordinate is None:
            return None
        if not isinstance(coordinate, (tuple, list)) or len(coordinate) != 2:
            raise ValueError(f"{coordinate} must be a tuple/list of length 2")
        x, y = self.clamp_coordinates(coordinate[0], coordinate[1])
        return (x, y)

    def initialize(self) -> None:
        width, height = self.dimensions
        self.session = self.client.sessions.create(
            use_proxy=self.proxy,
            solve_captcha=self.solve_captcha,
            api_timeout=self.session_timeout,
            block_ads=self.ad_blocker,
            dimensions={"width": width, "height": height},
        )
        print("Steel Session created successfully!")
        print(f"View live session at: {self.session.session_viewer_url}")

    def cleanup(self) -> None:
        if self.session:
            print("Releasing Steel session...")
            self.client.sessions.release(self.session.id)
            print(
                f"Session completed. View replay at {self.session.session_viewer_url}"
            )

    def take_screenshot(self) -> str:
        resp = self.client.sessions.computer(self.session.id, action="take_screenshot")
        img = resp.base64_image
        if not img:
            raise RuntimeError("No screenshot returned from Input API")
        return img

    def _center(self) -> Tuple[int, int]:
        width, height = self.dimensions
        return (width // 2, height // 2)

    def _hold_keys_from(self, k: Optional[str]) -> Optional[List[str]]:
        if not k:
            return None
        keys = [s.strip() for s in k.split("+") if s.strip()]
        return keys or None

    def execute_computer_action(
        self,
        action: str,
        text: Optional[str] = None,
        coordinate: Optional[Tuple[int, int]] = None,
        scroll_direction: Optional[str] = None,
        scroll_amount: Optional[int] = None,
        duration: Optional[float] = None,
        key: Optional[str] = None,
        **kwargs,
    ) -> str:
        maybe = self._validate_coords(coordinate)
        result_position: Optional[Tuple[int, int]] = None
        body: Optional[dict] = None

        def position_or_center() -> Tuple[int, int]:
            return maybe or self.last_mouse_position or self._center()

        if action == "mouse_move":
            x, y = position_or_center()
            body = {
                "action": "move_mouse",
                "coordinates": [x, y],
                "screenshot": True,
            }
            hk = self._hold_keys_from(key)
            if hk:
                body["hold_keys"] = hk
            result_position = (x, y)

        elif action in ("left_mouse_down", "left_mouse_up"):
            x, y = position_or_center()
            body = {
                "action": "click_mouse",
                "button": "left",
                "click_type": "down" if action == "left_mouse_down" else "up",
                "coordinates": [x, y],
                "screenshot": True,
            }
            hk = self._hold_keys_from(key)
            if hk:
                body["hold_keys"] = hk
            result_position = (x, y)

        elif action in (
            "left_click",
            "right_click",
            "middle_click",
            "double_click",
            "triple_click",
        ):
            x, y = position_or_center()
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
                "coordinates": [x, y],
                "screenshot": True,
            }
            if clicks > 1:
                body["num_clicks"] = clicks
            hk = self._hold_keys_from(key)
            if hk:
                body["hold_keys"] = hk
            result_position = (x, y)

        elif action == "left_click_drag":
            end_x, end_y = position_or_center()
            start_x, start_y = self.last_mouse_position or self._center()
            body = {
                "action": "drag_mouse",
                "path": [[start_x, start_y], [end_x, end_y]],
                "screenshot": True,
            }
            hk = self._hold_keys_from(key)
            if hk:
                body["hold_keys"] = hk
            result_position = (end_x, end_y)

        elif action == "scroll":
            if scroll_direction not in ("up", "down", "left", "right"):
                raise ValueError(
                    "scroll_direction must be 'up', 'down', 'left', or 'right'"
                )
            if scroll_amount is None or scroll_amount < 0:
                raise ValueError("scroll_amount must be a non-negative number")
            x, y = position_or_center()
            step = 100
            delta_map = {
                "down": (0, step * scroll_amount),
                "up": (0, -step * scroll_amount),
                "right": (step * scroll_amount, 0),
                "left": (-step * scroll_amount, 0),
            }
            delta_x, delta_y = delta_map[scroll_direction]
            body = {
                "action": "scroll",
                "coordinates": [x, y],
                "delta_x": delta_x,
                "delta_y": delta_y,
                "screenshot": True,
            }
            hk = self._hold_keys_from(text)
            if hk:
                body["hold_keys"] = hk
            result_position = (x, y)

        elif action == "hold_key":
            if text is None:
                raise ValueError("text is required for hold_key")
            if duration is None or duration < 0:
                raise ValueError("duration must be a non-negative number")
            if duration > 100:
                raise ValueError("duration is too long")
            body = {
                "action": "press_key",
                "keys": [s.strip() for s in text.split("+") if s.strip()],
                "duration": duration,
                "screenshot": True,
            }

        elif action == "key":
            if text is None:
                raise ValueError("text is required for key")
            body = {
                "action": "press_key",
                "keys": [s.strip() for s in text.split("+") if s.strip()],
                "screenshot": True,
            }

        elif action == "type":
            if text is None:
                raise ValueError("text is required for type")
            body = {
                "action": "type_text",
                "text": text,
                "screenshot": True,
            }
            hk = self._hold_keys_from(key)
            if hk:
                body["hold_keys"] = hk

        elif action == "wait":
            if duration is None or duration < 0:
                raise ValueError("duration must be a non-negative number")
            if duration > 100:
                raise ValueError("duration is too long")
            body = {
                "action": "wait",
                "duration": duration,
                "screenshot": True,
            }

        elif action == "screenshot":
            return self.take_screenshot()

        elif action == "cursor_position":
            resp = self.client.sessions.computer(
                self.session.id, action="get_cursor_position"
            )
            return self.take_screenshot()

        else:
            raise ValueError(f"Invalid action: {action}")

        resp = self.client.sessions.computer(self.session.id, **body)
        if result_position:
            self.last_mouse_position = result_position
        else:
            pos = getattr(resp, "position", None)
            if isinstance(pos, (list, tuple)) and len(pos) == 2:
                self.last_mouse_position = (int(pos[0]), int(pos[1]))
        img = getattr(resp, "base64_image", None)
        if img:
            return img
        return self.take_screenshot()


class ClaudeAgent:
    def __init__(self, computer: Computer):
        self.client = Anthropic(api_key=ANTHROPIC_API_KEY)
        self.computer = computer
        self.messages: List[BetaMessageParam] = []
        self.model = "claude-sonnet-4-5"

        width, height = computer.get_dimensions()
        self.viewport_width = width
        self.viewport_height = height

        self.system_prompt = BROWSER_SYSTEM_PROMPT

        self.tools = [
            {
                "type": "computer_20250124",
                "name": "computer",
                "display_width_px": width,
                "display_height_px": height,
                "display_number": 1,
            }
        ]

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
                        screenshot_base64 = self.computer.execute_computer_action(
                            action=action,
                            text=params["text"],
                            coordinate=params["coordinate"],
                            scroll_direction=params["scroll_direction"],
                            scroll_amount=params["scroll_amount"],
                            duration=params["duration"],
                            key=params["key"],
                        )
                        # Add assistant tool_use then tool_result (image)
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
            {"role": "user", "content": BROWSER_SYSTEM_PROMPT},
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

            if self.messages and isinstance(self.messages[-1].get("content"), str):
                content = self.messages[-1]["content"]
                if detect_repetition(content):
                    print("🔄 Repetition detected - stopping execution")
                    last_assistant_messages.append(content)
                    break
                last_assistant_messages.append(content)
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
    computer = Computer()
    try:
        computer.initialize()
        print("✅ Steel session started!")

        agent = ClaudeAgent(computer)
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
            sys.exit(1)
    except Exception as e:
        print(f"❌ Failed to start Steel session: {e}")
        print("Please check your STEEL_API_KEY and internet connection.")
        sys.exit(1)
    finally:
        computer.cleanup()


if __name__ == "__main__":
    main()
