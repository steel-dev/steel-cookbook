"""
Steel + Browser-Use: Automatic CAPTCHA Solver

This example demonstrates how to automatically solve CAPTCHAs using Steel's CAPTCHA
solving capabilities with the browser-use framework.

When the agent encounters a CAPTCHA, it can call the wait_for_captcha_solution tool
which will automatically wait for Steel to solve the CAPTCHA before proceeding.

Based on: https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-browser-use-starter
"""

import os
import time
import sys
import asyncio
from dotenv import load_dotenv
from steel import Steel
from browser_use import Agent, BrowserSession, Tools
from browser_use.llm import ChatOpenAI

from typing import Any, Dict, List

load_dotenv()

# Replace with your own API keys
STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or "your-openai-api-key-here"

# Replace with your own task
TASK = """
1. Navigate to https://recaptcha-demo.appspot.com/recaptcha-v2-checkbox.php
2. When you encounter a CAPTCHA (you'll see a checkbox or challenge), call the wait_for_captcha_solution tool
3. The tool will automatically wait for the CAPTCHA to be solved by Steel
4. After the CAPTCHA is solved (the tool returns success), submit the form by clicking the submit button
5. Return the success message or result from the page
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
        "Wait for CAPTCHA to be solved by Steel. "
        "Call this tool when you encounter any CAPTCHA challenge. Steel will automatically detect and solve the CAPTCHA. "
        "This tool will poll the CAPTCHA status and return once all CAPTCHAs on the page are solved. "
        "Returns a success message when CAPTCHAs are solved, or an error if timeout/failure occurs."
    )
)
async def wait_for_captcha_solution() -> str:
    """
    Poll Steel's CAPTCHA status endpoint and wait for all CAPTCHAs to be solved.
    """
    session_id = SESSION_CACHE.get("session_id")
    if not session_id:
        return "❌ Error: No active Steel session. Cannot check CAPTCHA status."

    timeout_ms = 60000
    poll_interval_ms = 1000

    start = time.monotonic()
    end_deadline = start + (timeout_ms / 1000.0)
    last_states: List[Dict[str, Any]] = []

    print("\n🔐 Waiting for CAPTCHA to be solved...")

    while True:
        now = time.monotonic()
        if now > end_deadline:
            duration_ms = int((now - start) * 1000)
            return f"⏱️ Timeout: CAPTCHA was not solved within {duration_ms}ms. Please try again or check the page."

        try:
            # Get CAPTCHA status from Steel
            last_states = [
                state.to_dict() for state in client.sessions.captchas.status(session_id)
            ]

        except Exception as e:
            duration_ms = int((time.monotonic() - start) * 1000)
            return f"❌ Error: Failed to get CAPTCHA status after {duration_ms}ms. Exception: {str(e)}"

        if not last_states:
            duration_ms = int((time.monotonic() - start) * 1000)
            return f"✅ Success: No CAPTCHAs detected on the page after {duration_ms}ms. You can proceed with the task."

        if not _has_active_captcha(last_states):
            duration_ms = int((time.monotonic() - start) * 1000)
            summary = _summarize_states(last_states)
            print(f"✅ All CAPTCHAs solved in {duration_ms}ms")
            return f"✅ Success: All CAPTCHAs have been solved after {duration_ms}ms. Summary: {summary}. You can now proceed to submit the form or continue with the task."

        await asyncio.sleep(poll_interval_ms / 1000.0)


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

        model = ChatOpenAI(model="gpt-5", api_key=OPENAI_API_KEY)

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
