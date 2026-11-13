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
from anthropic.types import MessageParam

load_dotenv(override=True)

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY") or "your-anthropic-api-key-here"
TASK = os.getenv("TASK") or "Go to Steel.dev and find the latest news"


def format_today() -> str:
    return datetime.now().strftime("%A, %B %d, %Y")


BROWSER_SYSTEM_PROMPT = f"""<BROWSER_ENV>
  - You control a headful Chromium browser running in a VM with internet access.
  - Chromium is already open; interact only through the computer tools (mouse, keyboard, scroll, screenshots).
  - Today's date is {format_today()}.
  </BROWSER_ENV>
  
  <BROWSER_CONTROL>
  - When viewing pages, zoom out or scroll so all relevant content is visible.
  - When typing into any input:
    * Clear it first with Ctrl+A, then Delete.
    * After submitting (pressing Enter or clicking a button), take an extra screenshot to confirm the result and move the mouse away.
  - Each turn is slow; send related actions together in one turn whenever possible.
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


NOT_EXECUTED = "Not executed: an earlier computer action in this turn failed."

SCROLL_DELTAS = {
    "up": (0, -100),
    "down": (0, 100),
    "left": (-100, 0),
    "right": (100, 0),
}


class Agent:
    def __init__(self):
        self.client = Anthropic(api_key=ANTHROPIC_API_KEY)
        self.steel = Steel(steel_api_key=STEEL_API_KEY)
        self.model = "claude-opus-5-5"
        self.messages: List[MessageParam] = []
        self.session = None

        self.viewport_width = 1280
        self.viewport_height = 768
        self.cursor = (self.viewport_width // 2, self.viewport_height // 2)

        self.system_prompt = BROWSER_SYSTEM_PROMPT
        self.tools = [
            {
                "type": "computer_toolset_20260801",
                "configs": {
                    "zoom": {"enabled": False},
                    "triple_click": {"enabled": False},
                    "left_mouse_down": {"enabled": False},
                    "left_mouse_up": {"enabled": False},
                    "hold_key": {"enabled": False},
                },
            }
        ]

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

    def act(self, **body):
        resp = self.steel.sessions.computer(self.session.id, **body)
        if resp.error:
            raise RuntimeError(resp.error)
        return resp

    def take_screenshot(self) -> dict:
        resp = self.act(action="take_screenshot")
        if not resp.base64_image:
            raise RuntimeError("Steel returned no screenshot")
        return {
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": resp.base64_image,
            },
        }

    def point(self, coordinate) -> List[int]:
        if coordinate:
            self.cursor = (int(coordinate[0]), int(coordinate[1]))
        return [self.cursor[0], self.cursor[1]]

    def run_member(self, name: str, tool_input: dict) -> str:
        if name == "mouse_move":
            self.act(
                action="move_mouse",
                coordinates=self.point(tool_input.get("coordinate")),
            )
        elif name in ("left_click", "right_click", "middle_click", "double_click"):
            if tool_input.get("text"):
                raise ValueError(
                    "Holding modifier keys during a click is not supported"
                )
            body = {
                "action": "click_mouse",
                "button": {"right_click": "right", "middle_click": "middle"}.get(
                    name, "left"
                ),
                "coordinates": self.point(tool_input.get("coordinate")),
            }
            if name == "double_click":
                body["num_clicks"] = 2
            self.act(**body)
        elif name == "left_click_drag":
            start = tool_input.get("start_coordinate")
            end = tool_input.get("coordinate")
            if not start or not end:
                raise ValueError(
                    "left_click_drag needs start_coordinate and coordinate"
                )
            self.act(action="drag_mouse", path=[list(start), list(end)])
            self.point(end)
        elif name == "scroll":
            if tool_input.get("text"):
                raise ValueError(
                    "Holding modifier keys during a scroll is not supported"
                )
            dx, dy = SCROLL_DELTAS[tool_input.get("scroll_direction") or "down"]
            coordinates = self.point(tool_input.get("coordinate"))
            for _ in range(max(1, tool_input.get("scroll_amount") or 1)):
                self.act(
                    action="scroll", coordinates=coordinates, delta_x=dx, delta_y=dy
                )
        elif name == "type":
            self.act(action="type_text", text=tool_input.get("text") or "")
        elif name == "key":
            keys = self.normalize_keys(self.split_keys(tool_input.get("text")))
            for _ in range(max(1, tool_input.get("repeat") or 1)):
                self.act(action="press_key", keys=keys)
        elif name == "wait":
            self.act(action="wait", duration=tool_input.get("duration") or 1)
        elif name == "cursor_position":
            resp = self.act(action="get_cursor_position")
            return resp.output or f"{self.cursor[0]}, {self.cursor[1]}"
        else:
            raise ValueError(f"Unsupported action: {name}")
        return "OK"

    def process_response(self, message) -> Tuple[str, bool]:
        self.messages.append({"role": "assistant", "content": message.content})

        response_text = ""
        calls = []
        for block in message.content:
            if block.type == "text":
                response_text += block.text
                print(block.text)
            elif block.type == "tool_use" and block.toolset_name == "computer":
                calls.append(block)

        if not calls:
            return response_text, False

        results = []
        failed = False
        for call in calls:
            print(f"{call.name}({json.dumps(call.input)})")
            result = {
                "type": "tool_result",
                "tool_use_id": call.id,
                "toolset_name": "computer",
            }
            if failed:
                result["content"] = NOT_EXECUTED
                result["is_error"] = True
            else:
                try:
                    if call.name == "screenshot":
                        result["content"] = [self.take_screenshot()]
                    else:
                        result["content"] = [
                            {
                                "type": "text",
                                "text": self.run_member(call.name, call.input),
                            }
                        ]
                except Exception as e:
                    print(f"Error executing {call.name}: {e}")
                    result["content"] = f"Error: {e}"
                    result["is_error"] = True
                    failed = True
            results.append(result)

        if not failed and calls[-1].name != "screenshot":
            results[-1]["content"].append(self.take_screenshot())

        self.messages.append({"role": "user", "content": results})

        return response_text, True

    def execute_task(
        self,
        task: str,
        print_steps: bool = True,
        max_iterations: int = 50,
    ) -> str:
        self.messages = [{"role": "user", "content": task}]

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
                    getattr(b, "text", "")
                    for b in content
                    if getattr(b, "type", None) == "text"
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
                response = self.client.messages.create(
                    model=self.model,
                    max_tokens=16000,
                    system=self.system_prompt,
                    messages=self.messages,
                    tools=self.tools,
                )

                if response.stop_reason == "refusal":
                    print("Claude declined to continue this task")
                    final_text = "Claude declined to continue this task"
                    break

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
