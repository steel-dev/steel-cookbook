"""
Gemini AI agent for autonomous web task execution with Steel headful Input API.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/gemini-computer-use-py
"""

import os
import re
import sys
import time
import json
from typing import List, Optional, Tuple, Dict, Any
from datetime import datetime

from dotenv import load_dotenv
from steel import Steel
from google import genai
from google.genai import types
from google.genai.types import (
    Content,
    Part,
    FunctionCall,
    FunctionResponse,
    Candidate,
    FinishReason,
    Tool,
    GenerateContentConfig,
)

load_dotenv(override=True)

STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or "your-gemini-api-key-here"
TASK = os.getenv("TASK") or "Go to Steel.dev and find the latest news"

MAX_COORDINATE = 1000
UNSUPPORTED_ACTIONS = ["triple_click", "mouse_down", "mouse_up", "key_down", "key_up"]


def format_today() -> str:
    return datetime.now().strftime("%A, %B %d, %Y")


BROWSER_SYSTEM_PROMPT = f"""<BROWSER_ENV>
  - You control a headful Chromium browser running in a VM with internet access.
  - Chromium is already open; interact only through computer use actions (mouse, keyboard, scroll, screenshots).
  - Today's date is {format_today()}.
  </BROWSER_ENV>
  
  <BROWSER_CONTROL>
  - When viewing pages, zoom out or scroll so all relevant content is visible.
  - When typing into any input:
    * Clear it first with Ctrl+A, then Delete.
    * After submitting (pressing Enter or clicking a button), wait for the page to load.
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


class Agent:
    def __init__(self):
        self.client = genai.Client(api_key=GEMINI_API_KEY)
        self.steel = Steel(steel_api_key=STEEL_API_KEY)
        self.model = "gemini-3.8-flash"
        self.session = None
        self.contents: List[Content] = []
        self.current_url = "about:blank"

        self.viewport_width = 1440
        self.viewport_height = 900

        self.tools: List[Tool] = [
            Tool(
                computer_use=types.ComputerUse(
                    environment=types.Environment.ENVIRONMENT_BROWSER,
                    excluded_predefined_functions=UNSUPPORTED_ACTIONS,
                )
            )
        ]

        self.config = GenerateContentConfig(tools=self.tools)

    def denormalize_x(self, x: int) -> int:
        return int(x / MAX_COORDINATE * self.viewport_width)

    def denormalize_y(self, y: int) -> int:
        return int(y / MAX_COORDINATE * self.viewport_height)

    def center(self) -> Tuple[int, int]:
        return (self.viewport_width // 2, self.viewport_height // 2)

    def split_keys(self, k: Optional[str]) -> List[str]:
        return [s.strip() for s in k.split("+") if s.strip()] if k else []

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
        self.session = self.steel.sessions.create(
            dimensions={"width": self.viewport_width, "height": self.viewport_height},
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

    def point(self, args: Dict[str, Any]) -> List[int]:
        cx, cy = self.center()
        x, y = args.get("x"), args.get("y")
        return [
            self.denormalize_x(x) if x is not None else cx,
            self.denormalize_y(y) if y is not None else cy,
        ]

    def computer(self, **params: Any) -> str:
        resp = self.steel.sessions.computer(self.session.id, screenshot=True, **params)
        return getattr(resp, "base64_image", None) or self.take_screenshot()

    def execute_computer_action(
        self, function_call: FunctionCall
    ) -> Tuple[str, Optional[str]]:
        """Execute a computer action and return (screenshot_base64, error)."""
        name = function_call.name or ""
        args: Dict[str, Any] = function_call.args or {}

        if name in ("click", "double_click", "right_click", "middle_click"):
            button = {"right_click": "right", "middle_click": "middle"}.get(name, "left")
            params: Dict[str, Any] = {"button": button, "coordinates": self.point(args)}
            if name == "double_click":
                params["num_clicks"] = 2
            return self.computer(action="click_mouse", **params), None

        if name == "move":
            return self.computer(action="move_mouse", coordinates=self.point(args)), None

        if name == "drag_and_drop":
            path = [
                [
                    self.denormalize_x(args.get("start_x", 0)),
                    self.denormalize_y(args.get("start_y", 0)),
                ],
                [
                    self.denormalize_x(args.get("end_x", 0)),
                    self.denormalize_y(args.get("end_y", 0)),
                ],
            ]
            return self.computer(action="drag_mouse", path=path), None

        if name == "type":
            self.steel.sessions.computer(
                self.session.id, action="type_text", text=args.get("text", "")
            )
            if args.get("press_enter"):
                self.steel.sessions.computer(
                    self.session.id, action="press_key", keys=["Enter"]
                )
            return self.computer(action="wait", duration=1), None

        if name == "scroll":
            magnitude = args.get("magnitude_in_pixels", 300)
            direction = args.get("direction", "down")
            return (
                self.computer(
                    action="scroll",
                    coordinates=self.point(args),
                    delta_x={"left": -magnitude, "right": magnitude}.get(direction, 0),
                    delta_y={"up": -magnitude, "down": magnitude}.get(direction, 0),
                ),
                None,
            )

        if name in ("press_key", "hotkey"):
            keys = args.get("keys") if name == "hotkey" else args.get("key")
            if isinstance(keys, str):
                keys = self.split_keys(keys)
            return (
                self.computer(action="press_key", keys=self.normalize_keys(keys or [])),
                None,
            )

        if name == "wait":
            return self.computer(action="wait", duration=args.get("seconds", 1)), None

        if name == "navigate":
            url = args.get("url", "")
            if not url.startswith(("http://", "https://")):
                url = "https://" + url
            self.steel.sessions.computer(
                self.session.id, action="press_key", keys=["Control", "l"]
            )
            self.steel.sessions.computer(self.session.id, action="type_text", text=url)
            self.steel.sessions.computer(
                self.session.id, action="press_key", keys=["Enter"]
            )
            self.current_url = url
            return self.computer(action="wait", duration=2), None

        if name in ("go_back", "go_forward"):
            arrow = "ArrowLeft" if name == "go_back" else "ArrowRight"
            return self.computer(action="press_key", keys=["Alt", arrow]), None

        if name == "take_screenshot":
            return self.take_screenshot(), None

        return self.take_screenshot(), f"Unsupported action: {name}"

    def extract_function_calls(self, candidate: Candidate) -> List[FunctionCall]:
        function_calls: List[FunctionCall] = []
        if not candidate.content or not candidate.content.parts:
            return function_calls
        for part in candidate.content.parts:
            if part.function_call:
                function_calls.append(part.function_call)
        return function_calls

    def extract_text(self, candidate: Candidate) -> str:
        if not candidate.content or not candidate.content.parts:
            return ""
        texts: List[str] = []
        for part in candidate.content.parts:
            # Gemini 3 Flash occasionally emits stray digit/whitespace-only
            # text parts (e.g. "0", "00") alongside the real response.
            if part.text and not re.fullmatch(r"[\s\d]*", part.text):
                texts.append(part.text)
        return " ".join(texts).strip()

    def build_function_response_parts(
        self,
        function_calls: List[FunctionCall],
        results: List[Tuple[str, Optional[str]]],
    ) -> List[Part]:
        parts: List[Part] = []

        for i, fc in enumerate(function_calls):
            screenshot_base64, error = results[i]
            response: Dict[str, Any] = {"url": self.current_url}
            if error:
                response["error"] = error

            function_response = FunctionResponse(
                name=fc.name or "",
                response=response,
            )
            parts.append(Part(function_response=function_response))

            parts.append(
                Part(
                    inline_data=types.Blob(
                        mime_type="image/png",
                        data=screenshot_base64,
                    )
                )
            )

        return parts

    def execute_task(
        self,
        task: str,
        print_steps: bool = True,
        max_iterations: int = 50,
    ) -> str:
        self.contents = [
            Content(
                role="user",
                parts=[Part(text=BROWSER_SYSTEM_PROMPT), Part(text=task)],
            )
        ]

        iterations = 0
        consecutive_no_actions = 0

        print(f"Executing task: {task}")
        print("=" * 60)

        while iterations < max_iterations:
            iterations += 1

            try:
                response = self.client.models.generate_content(
                    model=self.model,
                    contents=self.contents,
                    config=self.config,
                )

                if not response.candidates:
                    print("No candidates in response")
                    break

                candidate = response.candidates[0]

                if candidate.content:
                    self.contents.append(candidate.content)

                reasoning = self.extract_text(candidate)
                function_calls = self.extract_function_calls(candidate)

                if (
                    not function_calls
                    and not reasoning
                    and candidate.finish_reason == FinishReason.MALFORMED_FUNCTION_CALL
                ):
                    print("Malformed function call, retrying...")
                    continue

                if not function_calls:
                    if reasoning:
                        if print_steps:
                            print(f"\n{reasoning}")
                        print("Task complete - model provided final response")
                        break
                    consecutive_no_actions += 1
                    if consecutive_no_actions >= 3:
                        print("No actions for 3 consecutive iterations - stopping")
                        break
                    continue

                consecutive_no_actions = 0

                if print_steps and reasoning:
                    print(f"\n{reasoning}")

                results: List[Tuple[str, Optional[str]]] = []
                for fc in function_calls:
                    action_name = fc.name or "unknown"
                    action_args = fc.args or {}
                    if print_steps:
                        print(f"{action_name}({json.dumps(action_args)})")

                    if action_args:
                        safety_decision = action_args.get("safety_decision")
                        if (
                            isinstance(safety_decision, dict)
                            and safety_decision.get("decision")
                            == "require_confirmation"
                        ):
                            print(
                                f"Safety confirmation required: {safety_decision.get('explanation')}"
                            )
                            print("Auto-acknowledging safety check")

                    result = self.execute_computer_action(fc)
                    results.append(result)

                function_response_parts = self.build_function_response_parts(
                    function_calls, results
                )
                self.contents.append(
                    Content(role="user", parts=function_response_parts)
                )

            except Exception as e:
                print(f"Error during task execution: {e}")
                raise

        if iterations >= max_iterations:
            print(f"Task execution stopped after {max_iterations} iterations")

        for content in reversed(self.contents):
            if content.role == "model" and content.parts:
                text_parts = [
                    p.text
                    for p in content.parts
                    if p.text and not re.fullmatch(r"[\s\d]*", p.text)
                ]
                if text_parts:
                    return " ".join(text_parts).strip()

        return "Task execution completed (no final message)"


def main():
    print("Steel + Gemini Computer Use Assistant")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print(
            "WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key"
        )
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        sys.exit(1)

    if GEMINI_API_KEY == "your-gemini-api-key-here":
        print(
            "WARNING: Please replace 'your-gemini-api-key-here' with your actual Gemini API key"
        )
        print("   Get your API key at: https://aistudio.google.com/apikey")
        sys.exit(1)

    print("\nStarting Steel session...")
    agent = Agent()

    try:
        agent.initialize()
        print("Steel session started!")

        start_time = time.time()
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
        print(f"Failed to run: {e}")
        raise

    finally:
        agent.cleanup()


if __name__ == "__main__":
    main()
