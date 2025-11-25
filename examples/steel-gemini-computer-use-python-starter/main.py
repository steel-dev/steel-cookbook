"""
Gemini AI agent for autonomous web task execution with Steel headful Input API.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-gemini-computer-use-python-starter
"""

import os
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

MODEL = "gemini-2.5-computer-use-preview-10-2025"
MAX_COORDINATE = 1000


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
        self.session = None
        self.contents: List[Content] = []
        self.current_url = "about:blank"

        self.viewport_width = 1280
        self.viewport_height = 768

        self.tools: List[Tool] = [
            Tool(
                computer_use=types.ComputerUse(
                    environment=types.Environment.ENVIRONMENT_BROWSER,
                )
            )
        ]

        self.config = GenerateContentConfig(tools=self.tools)

    def _denormalize_x(self, x: int) -> int:
        return int(x / MAX_COORDINATE * self.viewport_width)

    def _denormalize_y(self, y: int) -> int:
        return int(y / MAX_COORDINATE * self.viewport_height)

    def _center(self) -> Tuple[int, int]:
        return (self.viewport_width // 2, self.viewport_height // 2)

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
            "DELETE": "Delete",
            "SPACE": "Space",
            "CTRL": "Control",
            "CONTROL": "Control",
            "ALT": "Alt",
            "SHIFT": "Shift",
            "META": "Meta",
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

    def _take_screenshot(self) -> str:
        resp = self.steel.sessions.computer(self.session.id, action="take_screenshot")
        img = getattr(resp, "base64_image", None)
        if not img:
            raise RuntimeError("No screenshot returned from Steel")
        return img

    def _execute_computer_action(
        self, function_call: FunctionCall
    ) -> Tuple[str, Optional[str]]:
        """Execute a computer action and return (screenshot_base64, url)."""
        name = function_call.name or ""
        args: Dict[str, Any] = function_call.args or {}

        if name == "open_web_browser":
            screenshot = self._take_screenshot()
            return screenshot, self.current_url

        elif name == "click_at":
            x = self._denormalize_x(args.get("x", 0))
            y = self._denormalize_y(args.get("y", 0))
            resp = self.steel.sessions.computer(
                self.session.id,
                action="click_mouse",
                button="left",
                coordinates=[x, y],
                screenshot=True,
            )
            img = getattr(resp, "base64_image", None)
            return img or self._take_screenshot(), self.current_url

        elif name == "hover_at":
            x = self._denormalize_x(args.get("x", 0))
            y = self._denormalize_y(args.get("y", 0))
            resp = self.steel.sessions.computer(
                self.session.id,
                action="move_mouse",
                coordinates=[x, y],
                screenshot=True,
            )
            img = getattr(resp, "base64_image", None)
            return img or self._take_screenshot(), self.current_url

        elif name == "type_text_at":
            x = self._denormalize_x(args.get("x", 0))
            y = self._denormalize_y(args.get("y", 0))
            text = args.get("text", "")
            press_enter = args.get("press_enter", True)
            clear_before_typing = args.get("clear_before_typing", True)

            self.steel.sessions.computer(
                self.session.id,
                action="click_mouse",
                button="left",
                coordinates=[x, y],
            )

            if clear_before_typing:
                self.steel.sessions.computer(
                    self.session.id,
                    action="press_key",
                    keys=["Control", "a"],
                )
                self.steel.sessions.computer(
                    self.session.id,
                    action="press_key",
                    keys=["Backspace"],
                )

            self.steel.sessions.computer(
                self.session.id,
                action="type_text",
                text=text,
            )

            if press_enter:
                self.steel.sessions.computer(
                    self.session.id,
                    action="press_key",
                    keys=["Enter"],
                )

            self.steel.sessions.computer(
                self.session.id,
                action="wait",
                duration=1,
            )

            screenshot = self._take_screenshot()
            return screenshot, self.current_url

        elif name == "scroll_document":
            direction = args.get("direction", "down")
            if direction == "down":
                keys = ["PageDown"]
            elif direction == "up":
                keys = ["PageUp"]
            elif direction in ("left", "right"):
                cx, cy = self._center()
                delta = -400 if direction == "left" else 400
                resp = self.steel.sessions.computer(
                    self.session.id,
                    action="scroll",
                    coordinates=[cx, cy],
                    delta_x=delta,
                    delta_y=0,
                    screenshot=True,
                )
                img = getattr(resp, "base64_image", None)
                return img or self._take_screenshot(), self.current_url
            else:
                keys = ["PageDown"]

            resp = self.steel.sessions.computer(
                self.session.id,
                action="press_key",
                keys=keys,
                screenshot=True,
            )
            img = getattr(resp, "base64_image", None)
            return img or self._take_screenshot(), self.current_url

        elif name == "scroll_at":
            x = self._denormalize_x(args.get("x", 0))
            y = self._denormalize_y(args.get("y", 0))
            direction = args.get("direction", "down")
            magnitude = self._denormalize_y(args.get("magnitude", 800))

            delta_x, delta_y = 0, 0
            if direction == "down":
                delta_y = magnitude
            elif direction == "up":
                delta_y = -magnitude
            elif direction == "right":
                delta_x = magnitude
            elif direction == "left":
                delta_x = -magnitude

            resp = self.steel.sessions.computer(
                self.session.id,
                action="scroll",
                coordinates=[x, y],
                delta_x=delta_x,
                delta_y=delta_y,
                screenshot=True,
            )
            img = getattr(resp, "base64_image", None)
            return img or self._take_screenshot(), self.current_url

        elif name == "wait_5_seconds":
            resp = self.steel.sessions.computer(
                self.session.id,
                action="wait",
                duration=5,
                screenshot=True,
            )
            img = getattr(resp, "base64_image", None)
            return img or self._take_screenshot(), self.current_url

        elif name == "go_back":
            resp = self.steel.sessions.computer(
                self.session.id,
                action="press_key",
                keys=["Alt", "ArrowLeft"],
                screenshot=True,
            )
            img = getattr(resp, "base64_image", None)
            return img or self._take_screenshot(), self.current_url

        elif name == "go_forward":
            resp = self.steel.sessions.computer(
                self.session.id,
                action="press_key",
                keys=["Alt", "ArrowRight"],
                screenshot=True,
            )
            img = getattr(resp, "base64_image", None)
            return img or self._take_screenshot(), self.current_url

        elif name == "search":
            self.steel.sessions.computer(
                self.session.id,
                action="press_key",
                keys=["Control", "l"],
            )
            self.steel.sessions.computer(
                self.session.id,
                action="type_text",
                text="https://www.google.com",
            )
            self.steel.sessions.computer(
                self.session.id,
                action="press_key",
                keys=["Enter"],
            )
            self.steel.sessions.computer(
                self.session.id,
                action="wait",
                duration=2,
            )
            self.current_url = "https://www.google.com"
            screenshot = self._take_screenshot()
            return screenshot, self.current_url

        elif name == "navigate":
            url = args.get("url", "")
            if not url.startswith(("http://", "https://")):
                url = "https://" + url

            self.steel.sessions.computer(
                self.session.id,
                action="press_key",
                keys=["Control", "l"],
            )
            self.steel.sessions.computer(
                self.session.id,
                action="type_text",
                text=url,
            )
            self.steel.sessions.computer(
                self.session.id,
                action="press_key",
                keys=["Enter"],
            )
            self.steel.sessions.computer(
                self.session.id,
                action="wait",
                duration=2,
            )
            self.current_url = url
            screenshot = self._take_screenshot()
            return screenshot, self.current_url

        elif name == "key_combination":
            keys_str = args.get("keys", "")
            keys = [k.strip() for k in keys_str.split("+")]
            normalized_keys = self._normalize_keys(keys)
            resp = self.steel.sessions.computer(
                self.session.id,
                action="press_key",
                keys=normalized_keys,
                screenshot=True,
            )
            img = getattr(resp, "base64_image", None)
            return img or self._take_screenshot(), self.current_url

        elif name == "drag_and_drop":
            start_x = self._denormalize_x(args.get("x", 0))
            start_y = self._denormalize_y(args.get("y", 0))
            end_x = self._denormalize_x(args.get("destination_x", 0))
            end_y = self._denormalize_y(args.get("destination_y", 0))
            resp = self.steel.sessions.computer(
                self.session.id,
                action="drag_mouse",
                path=[[start_x, start_y], [end_x, end_y]],
                screenshot=True,
            )
            img = getattr(resp, "base64_image", None)
            return img or self._take_screenshot(), self.current_url

        else:
            print(f"Unknown action: {name}, taking screenshot")
            screenshot = self._take_screenshot()
            return screenshot, self.current_url

    def _extract_function_calls(self, candidate: Candidate) -> List[FunctionCall]:
        function_calls: List[FunctionCall] = []
        if not candidate.content or not candidate.content.parts:
            return function_calls
        for part in candidate.content.parts:
            if part.function_call:
                function_calls.append(part.function_call)
        return function_calls

    def _extract_text(self, candidate: Candidate) -> str:
        if not candidate.content or not candidate.content.parts:
            return ""
        texts: List[str] = []
        for part in candidate.content.parts:
            if part.text:
                texts.append(part.text)
        return " ".join(texts).strip()

    def _build_function_response_parts(
        self,
        function_calls: List[FunctionCall],
        results: List[Tuple[str, Optional[str]]],
    ) -> List[Part]:
        parts: List[Part] = []

        for i, fc in enumerate(function_calls):
            screenshot_base64, url = results[i]

            function_response = FunctionResponse(
                name=fc.name or "",
                response={"url": url or self.current_url},
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

        print(f"🎯 Executing task: {task}")
        print("=" * 60)

        while iterations < max_iterations:
            iterations += 1

            try:
                response = self.client.models.generate_content(
                    model=MODEL,
                    contents=self.contents,
                    config=self.config,
                )

                if not response.candidates:
                    print("❌ No candidates in response")
                    break

                candidate = response.candidates[0]

                if candidate.content:
                    self.contents.append(candidate.content)

                reasoning = self._extract_text(candidate)
                function_calls = self._extract_function_calls(candidate)

                if (
                    not function_calls
                    and not reasoning
                    and candidate.finish_reason == FinishReason.MALFORMED_FUNCTION_CALL
                ):
                    print("⚠️ Malformed function call, retrying...")
                    continue

                if not function_calls:
                    if reasoning:
                        if print_steps:
                            print(f"\n💬 {reasoning}")
                        print("✅ Task complete - model provided final response")
                        break
                    consecutive_no_actions += 1
                    if consecutive_no_actions >= 3:
                        print("⚠️ No actions for 3 consecutive iterations - stopping")
                        break
                    continue

                consecutive_no_actions = 0

                if print_steps and reasoning:
                    print(f"\n💭 {reasoning}")

                results: List[Tuple[str, Optional[str]]] = []
                for fc in function_calls:
                    action_name = fc.name or "unknown"
                    action_args = fc.args or {}
                    if print_steps:
                        print(f"🔧 {action_name}({json.dumps(action_args)})")

                    if action_args:
                        safety_decision = action_args.get("safety_decision")
                        if (
                            isinstance(safety_decision, dict)
                            and safety_decision.get("decision")
                            == "require_confirmation"
                        ):
                            print(
                                f"⚠️ Safety confirmation required: {safety_decision.get('explanation')}"
                            )
                            print("✅ Auto-acknowledging safety check")

                    result = self._execute_computer_action(fc)
                    results.append(result)

                function_response_parts = self._build_function_response_parts(
                    function_calls, results
                )
                self.contents.append(
                    Content(role="user", parts=function_response_parts)
                )

            except Exception as e:
                print(f"❌ Error during task execution: {e}")
                raise

        if iterations >= max_iterations:
            print(f"⚠️ Task execution stopped after {max_iterations} iterations")

        for content in reversed(self.contents):
            if content.role == "model" and content.parts:
                text_parts = [p.text for p in content.parts if p.text]
                if text_parts:
                    return " ".join(text_parts).strip()

        return "Task execution completed (no final message)"


def main():
    print("🚀 Steel + Gemini Computer Use Assistant")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print(
            "⚠️ WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key"
        )
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        sys.exit(1)

    if GEMINI_API_KEY == "your-gemini-api-key-here":
        print(
            "⚠️ WARNING: Please replace 'your-gemini-api-key-here' with your actual Gemini API key"
        )
        print("   Get your API key at: https://aistudio.google.com/apikey")
        sys.exit(1)

    print("\nStarting Steel session...")
    agent = Agent()

    try:
        agent.initialize()
        print("✅ Steel session started!")

        start_time = time.time()
        result = agent.execute_task(TASK, True, 50)
        duration = f"{(time.time() - start_time):.1f}"

        print("\n" + "=" * 60)
        print("🎉 TASK EXECUTION COMPLETED")
        print("=" * 60)
        print(f"⏱️  Duration: {duration} seconds")
        print(f"🎯 Task: {TASK}")
        print(f"📋 Result:\n{result}")
        print("=" * 60)

    except Exception as e:
        print(f"❌ Failed to run: {e}")
        raise

    finally:
        agent.cleanup()


if __name__ == "__main__":
    main()
