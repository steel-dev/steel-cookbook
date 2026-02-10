"""
Steel + Browser-Use: Manual reCAPTCHA v2 Solver

This example demonstrates how to manually solve reCAPTCHA v2 using Steel's CAPTCHA
solving capabilities with the browser-use framework.

The agent opens multiple tabs with different CAPTCHA challenges (Google reCAPTCHA v2
and Google reCAPTCHA v3), but only solves the reCAPTCHA v2 — filtering by the `type`
field from Steel's CAPTCHA status API.

Unlike auto-solving, this approach:
  1. Creates a Steel session with solve_captcha=True but auto_captcha_solving disabled
  2. Opens multiple CAPTCHA demo pages in separate tabs via browser-use agent
  3. Polls the CAPTCHA status endpoint to detect tasks across all pages
  4. Manually triggers solving only for tasks with type="recaptchaV2"
  5. Waits for the solve to complete, then submits the reCAPTCHA v2 form

Based on: steel-recaptcha-proxy-tester/solve-recaptcha-demo.ts
"""

import os
import sys
import time
import asyncio
from typing import Any, Dict, List, Set

from dotenv import load_dotenv
from steel import Steel
from browser_use import Agent, BrowserSession, Tools
from browser_use.llm import ChatOpenAI, ChatGroq, ChatGoogle

load_dotenv()

# ── Configuration ────────────────────────────────────────────────────────────
STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or "your-gemini-api-key-here"

CAPTCHA_PAGES = [
    {
        "name": "Google reCAPTCHA v2",
        "url": "https://www.google.com/recaptcha/api2/demo",
    },
    {
        "name": "Google reCAPTCHA v3 Demo",
        "url": "https://2captcha.com/demo/recaptcha-v3",
    },
]

# In this example we only solve "recaptchaV2" tasks. To solve ALL detected
# captchas regardless of type, simply call:
#
#   client.sessions.captchas.solve(session_id) # solve all
#
# Or to solve a specific task by ID:
#
#   client.sessions.captchas.solve(session_id, task_id=task_id)
#
# See: https://docs.steel.dev/api/captchas  (CAPTCHA API reference)
SOLVE_CAPTCHA_TYPE = "recaptchaV2"

# Polling configuration
# Maximum 60 attempts (≈3 minutes with 3s interval)
MAX_POLL_ATTEMPTS = 60
POLL_INTERVAL_SECS = 3.0     # Seconds between status polls

# ── Steel client ─────────────────────────────────────────────────────────────
client = Steel(steel_api_key=STEEL_API_KEY)

# Shared session state for the browser-use tool
_session_state: Dict[str, Any] = {}

# ── browser-use tools ────────────────────────────────────────────────────────
tools = Tools()


def _log_task_status(task: Dict[str, Any], page_url: str) -> None:
    """Pretty-print a single CAPTCHA task status."""
    status = task.get("status", "unknown")
    task_id = task.get("id", "unknown")
    duration = task.get("totalDuration")

    print(f"\n   📄 Page: {page_url}")
    print(f"   📊 Task status: {status}")
    print(f"   🆔 Task ID: {task_id}")
    if duration:
        print(f"   ⏱️  Duration: {duration}ms")


@tools.action(
    description=(
        "Manually poll for reCAPTCHA v2 detection and trigger solving. "
        "Call this tool after navigating to pages that contain CAPTCHA challenges. "
        "It will monitor all pages for CAPTCHA tasks but only solve reCAPTCHA v2 "
        "(type='recaptchaV2'). Other types like recaptchaV3, turnstile or image_to_text are logged "
        "but not solved. Returns once the reCAPTCHA v2 is solved or a timeout is reached."
    )
)
async def solve_recaptcha_v2_manual() -> str:
    """
    Poll Steel's CAPTCHA status endpoint, detect reCAPTCHA v2 tasks,
    manually trigger solve, and wait for completion.
    """
    session_id = _session_state.get("session_id")
    if not session_id:
        return "❌ No active session. Cannot poll CAPTCHA status."

    solved_tasks: Set[str] = set()
    solve_requested: Set[str] = set()
    # Track reCAPTCHA v2 tasks we've seen
    detected_recaptcha_v2: Set[str] = set()
    start = time.monotonic()

    print("\n🤖 Starting manual reCAPTCHA v2 solve polling...")
    print(
        f"   Max attempts: {MAX_POLL_ATTEMPTS} | Interval: {POLL_INTERVAL_SECS}s\n")

    for attempt in range(1, MAX_POLL_ATTEMPTS + 1):
        await asyncio.sleep(POLL_INTERVAL_SECS)

        try:
            status_response = client.sessions.captchas.status(session_id)
            # Convert SDK objects to dicts for easier processing
            states: List[Dict[str, Any]] = [
                s.to_dict() if hasattr(s, "to_dict") else dict(s)
                for s in status_response
            ]
        except Exception as exc:
            print(f"   ⚠️  Failed to fetch status (attempt {attempt}): {exc}")
            continue

        print(f"🔄 Poll attempt {attempt}/{MAX_POLL_ATTEMPTS}")

        if not states:
            print("   ℹ️  No CAPTCHA status yet...")
            continue

        for page_data in states:
            tasks = page_data.get("tasks") or []
            page_url = page_data.get("url", "unknown")

            for task in tasks:
                task_id = task.get("id", "")
                task_status = task.get("status", "")

                _log_task_status(task, page_url)

                # Detected → trigger solve only for reCAPTCHA v2
                #
                # Each task has a `type` field indicating the CAPTCHA kind:
                #   "recaptchaV2", "recaptchaV3", "turnstile", "image_to_text"
                #
                # Note: To solve ALL detected captchas (any type), simply call:
                #   client.sessions.captchas.solve(session_id)
                #
                if task_status == "detected" and task_id not in solve_requested:
                    task_type = task.get("type", "")
                    if task_type == SOLVE_CAPTCHA_TYPE:
                        # Track this reCAPTCHA v2 task
                        detected_recaptcha_v2.add(task_id)
                        print(
                            f"   🎯 reCAPTCHA v2 detected (type={task_type})! Requesting solve...")
                        try:
                            solve_resp = client.sessions.captchas.solve(
                                session_id, task_id=task_id
                            )
                            solve_requested.add(task_id)
                            print(f"   ✅ Solve requested: {solve_resp}")
                        except Exception as exc:
                            print(f"   ❌ Solve request failed: {exc}")
                    else:
                        print(
                            f"   ℹ️  Non-reCAPTCHA v2 task (type={task_type}, id={task_id}), skipping."
                        )

                # Solving / Validating
                elif task_status == "solving":
                    if task.get("type") == SOLVE_CAPTCHA_TYPE:
                        detected_recaptcha_v2.add(task_id)
                    print("   🧩 CAPTCHA is being solved...")
                elif task_status == "validating":
                    if task.get("type") == SOLVE_CAPTCHA_TYPE:
                        detected_recaptcha_v2.add(task_id)
                    print("   🔄 CAPTCHA is being validated...")

                # Solved
                elif task_status == "solved":
                    if task.get("type") == SOLVE_CAPTCHA_TYPE and task_id not in solved_tasks:
                        solved_tasks.add(task_id)
                        print("   🎉 reCAPTCHA v2 marked as solved!")

                # Failed
                elif task_status in ("failed_to_solve", "error", "failed_to_detect"):
                    error_msg = task.get("error", "unknown error")
                    print(f"   ❌ Solve failed: {error_msg}")

        # Check completion: look for pages where we requested reCAPTCHA v2 solves
        # and verify that isSolvingCaptcha is False for those specific pages.
        # This means the CAPTCHA solving process is complete (either solved or failed).
        # Info: The "validating" status means the CAPTCHA is technically solved but Steel
        # is waiting a few seconds to check for any errors after submission.
        # Once isSolvingCaptcha becomes False for pages with reCAPTCHA v2(and the status is not "detected"), we know the process is done.
        if detected_recaptcha_v2:
            # Find pages that have reCAPTCHA v2 tasks and check if they're all done
            recaptcha_pages_done = False
            all_pages_checked = True

            for page_data in states:
                page_tasks = page_data.get("tasks") or []
                # Check if this page has any of our reCAPTCHA v2 tasks that are beyond "detected" status
                has_active_recaptcha_v2 = any(
                    task.get("id") in detected_recaptcha_v2
                    and task.get("status") not in ("detected", "undetected")
                    for task in page_tasks
                )

                # If this page has reCAPTCHA v2 and is still solving
                if has_active_recaptcha_v2:
                    if not page_data.get("isSolvingCaptcha", False):
                        # This page has reCAPTCHA v2 and it's done solving
                        recaptcha_pages_done = True
                    else:
                        # This page is still solving, we're not done
                        all_pages_checked = False
                        break

            if recaptcha_pages_done and all_pages_checked:
                elapsed = time.monotonic() - start
                print(
                    f"\n✅ reCAPTCHA v2 solved! ({len(detected_recaptcha_v2)} task(s) in {elapsed:.1f}s)")
                return (
                    f"reCAPTCHA v2 solved successfully! "
                    f"{len(detected_recaptcha_v2)} task(s) solved in {elapsed:.1f}s. "
                    "You can now submit the form."
                )

        if attempt == MAX_POLL_ATTEMPTS:
            elapsed = time.monotonic() - start
            print(f"\n⏰ Timeout after {elapsed:.1f}s — CAPTCHA not solved.")
            return (
                f"Timeout: reCAPTCHA v2 was not solved within {MAX_POLL_ATTEMPTS} attempts "
                f"({elapsed:.1f}s). Check the session viewer for details."
            )

        print("")  # Blank line for readability

    return "Polling loop exited unexpectedly."


# Agent task
# Build the URL list from CAPTCHA_PAGES for the agent prompt
_page_list = "\n".join(
    f"   - {p['name']}: {p['url']}" for p in CAPTCHA_PAGES
)

TASK = f"""
1. Open the following pages in separate tabs:
{_page_list}
2. Wait for each page to load completely.
3. You will see different CAPTCHA challenges on these pages. Use the solve_recaptcha_v2_manual tool — it will poll for all CAPTCHA tasks but only solve the reCAPTCHA v2 one.
4. After the tool reports the reCAPTCHA v2 is solved, go to the Google reCAPTCHA v2 demo tab and click the "Submit" button.
5. Report the result shown on the page after submission.
"""


async def main() -> None:
    print("🚀 Steel + Browser-Use: Manual reCAPTCHA v2 Solver")
    print("=" * 60)

    # ── Validate keys ────────────────────────────────────────────────────
    if STEEL_API_KEY == "your-steel-api-key-here":
        print("❌ ERROR: Please set your STEEL_API_KEY in the .env file")
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        sys.exit(1)

    if GEMINI_API_KEY == "your-gemini-api-key-here":
        print("❌ ERROR: Please set your GEMINI_API_KEY in the .env file")
        print("   Get your API key at: https://aistudio.google.com/app/api-keys")
        sys.exit(1)

    session = None
    try:
        # Create Steel session
        print("\n🔧 Creating Steel session with CAPTCHA solving enabled...")
        session = client.sessions.create(
            timeout=300000,  # 5 minutes timeout for the session
            solve_captcha=True,
            stealth_config={
                "auto_captcha_solving": False,  # Disable auto-solving for manual control
            },
        )

        _session_state["session_id"] = session.id

        print(f"✅ Session created!")
        print(f"   Session ID: {session.id}")
        print(f"   Viewer:     {session.session_viewer_url}\n")

        # Connect browser-use
        cdp_url = f"{session.websocket_url}&apiKey={STEEL_API_KEY}"

        model = ChatGoogle(
            model="gemini-3-pro-preview",
            temperature=0.3,
            api_key=GEMINI_API_KEY,
        )

        agent = Agent(
            task=TASK,
            llm=model,
            browser_session=BrowserSession(cdp_url=cdp_url),
            tools=tools,
        )

        print(
            f"🎯 Task: Open {len(CAPTCHA_PAGES)} CAPTCHA pages, solve reCAPTCHA v2 only")
        print("=" * 60)

        start_time = time.time()

        # Run agent
        result = await agent.run()

        duration = time.time() - start_time

        print("\n" + "=" * 60)
        print("🎉 TASK EXECUTION COMPLETED")
        print("=" * 60)
        print(f"⏱️  Duration: {duration:.1f}s")
        if result:
            print(f"📋 Result:\n{result}")
        print("=" * 60)

    except Exception as exc:
        print(f"\n❌ Error: {exc}")
        raise
    finally:
        if session:
            print("\n🧹 Releasing Steel session...")
            try:
                client.sessions.release(session.id)
                print("✅ Session released successfully.")
                print(f"   Replay: {session.session_viewer_url}")
            except Exception as exc:
                print(f"⚠️  Failed to release session: {exc}")
        print("Done!")


if __name__ == "__main__":
    asyncio.run(main())
