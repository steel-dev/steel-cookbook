"""
Tool call example for browser-use 0.7.7. Based on https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-browser-use-starter
"""

import os
import time
import sys
import asyncio
from dotenv import load_dotenv
from steel import Steel
from browser_use import Agent, BrowserSession, Tools
from browser_use.llm import ChatOpenAI
# from session_store import SESSION_CACHE

from typing import Any, Dict, List, Optional

load_dotenv()

# Replace with your own API keys
STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or "your-openai-api-key-here"

# Replace with your own task
TASK = """
1. Go to https://recaptcha-demo.appspot.com/recaptcha-v2-checkbox.php
2. If you see a CAPTCHA box, use the wait_for_captcha_solution tool to solve it
3. Once the CAPTCHA is solved, submit the form
4. Return the result
"""

tools = Tools()

client = Steel(steel_api_key=STEEL_API_KEY)

SESSION_CACHE: Dict[str, Any] = {}


def _has_active_captcha(states: List[Dict[str, Any]]) -> bool:
    for state in states:
        if bool(state.get("isSolvingCaptcha")):
            return True
    return False


def _summarize_states(states: List[Dict[str, Any]]) -> Dict[str, Any]:
    summary: Dict[str, Any] = {
        "pages": [],
        "active_pages": 0,
        "total_tasks": 0,
        "solving_tasks": 0,
        "solved_tasks": 0,
        "failed_tasks": 0,
    }

    for state in states:
        tasks = state.get("tasks", []) or []
        solving = sum(1 for t in tasks if t.get("status") == "solving")
        solved = sum(1 for t in tasks if t.get("status") == "solved")
        failed = sum(
            1
            for t in tasks
            if t.get("status") in ("failed_to_detect", "failed_to_solve")
        )

        summary["pages"].append(
            {
                "pageId": state.get("pageId"),
                "url": state.get("url"),
                "isSolvingCaptcha": bool(state.get("isSolvingCaptcha")),
                "taskCounts": {
                    "total": len(tasks),
                    "solving": solving,
                    "solved": solved,
                    "failed": failed,
                },
            }
        )
        summary["active_pages"] += 1 if bool(state.get("isSolvingCaptcha")) else 0
        summary["total_tasks"] += len(tasks)
        summary["solving_tasks"] += solving
        summary["solved_tasks"] += solved
        summary["failed_tasks"] += failed

    return summary


@tools.action(
    description=(
        "You need to invoke this tool when you encounter a CAPTCHA. It will get a human to solve the CAPTCHA and wait until the CAPTCHA is solved."
    )
)
def wait_for_captcha_solution() -> Dict[str, Any]:
    session_id = SESSION_CACHE.get("session_id")
    timeout_ms = 60000
    poll_interval_ms = 1000

    start = time.monotonic()
    end_deadline = start + (timeout_ms / 1000.0)
    last_states: List[Dict[str, Any]] = []

    while True:
        now = time.monotonic()
        if now > end_deadline:
            duration_ms = int((now - start) * 1000)
            return {
                "success": False,
                "message": "Timeout waiting for CAPTCHAs to be solved",
                "duration_ms": duration_ms,
                "last_status": _summarize_states(last_states) if last_states else {},
            }
        try:
            # Convert CapchaStatusResponseItems to dict
            last_states = [
                state.to_dict() for state in client.sessions.captchas.status(session_id)
            ]

        except Exception:
            duration_ms = int((time.monotonic() - start) * 1000)
            print(
                {
                    "success": False,
                    "message": "Failed to get CAPTCHA status; please try again",
                    "duration_ms": duration_ms,
                    "last_status": {},
                }
            )
            return "Failed to get CAPTCHA status; please try again"

        if not last_states:
            duration_ms = int((time.monotonic() - start) * 1000)
            print(
                {
                    "success": True,
                    "message": "No active CAPTCHAs",
                    "duration_ms": duration_ms,
                    "last_status": {},
                }
            )
            return "No active CAPTCHAs"

        if not _has_active_captcha(last_states):
            duration_ms = int((time.monotonic() - start) * 1000)
            print(
                {
                    "success": True,
                    "message": "All CAPTCHAs solved",
                    "duration_ms": duration_ms,
                    "last_status": _summarize_states(last_states),
                }
            )
            return "All CAPTCHAs solved"

        time.sleep(poll_interval_ms / 1000.0)


async def main():
    print("🚀 Steel + Browser Use Assistant")
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
        print("   Get your API key at: https://platform.openai.com/api-keys")
        sys.exit(1)

    print("\nStarting Steel browser session...")

    client = Steel(steel_api_key=STEEL_API_KEY)
    try:
        session = client.sessions.create(solve_captcha=True)

        SESSION_CACHE["session_id"] = session.id
        print("✅ Steel browser session started!")
        print(f"View live session at: {session.session_viewer_url}")

        print(
            f"\033[1;93mSteel Session created!\033[0m\n"
            f"View session at \033[1;37m{session.session_viewer_url}\033[0m\n"
        )

        cdp_url = f"{session.websocket_url}&apiKey={STEEL_API_KEY}"

        model = ChatOpenAI(model="gpt-4o", temperature=0.3, api_key=OPENAI_API_KEY)
        agent = Agent(
            task=TASK,
            llm=model,
            browser_session=BrowserSession(cdp_url=cdp_url),
            tools=tools,
        )

        print(f"🎯 Executing task: {TASK}")
        print("=" * 60)

        try:
            result = await agent.run()

            print("\n" + "=" * 60)
            print("🎉 TASK EXECUTION COMPLETED")
            print("=" * 60)
            print(f"🎯 Task: {TASK}")
            if result:
                print(f"📋 Result:\n{result}")
            print("=" * 60)

        except Exception as e:
            print(f"❌ Task execution failed: {e}")
        finally:
            if session:
                print("Releasing Steel session...")
                client.sessions.release(session.id)
                print(f"Session completed. View replay at {session.session_viewer_url}")
            print("Done!")

    except Exception as e:
        print(f"❌ Failed to start Steel browser: {e}")
        print("Please check your STEEL_API_KEY and internet connection.")


if __name__ == "__main__":
    asyncio.run(main())
