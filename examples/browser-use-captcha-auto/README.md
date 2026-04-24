# Browser Use with Auto-CAPTCHA (Python)

Steel can solve CAPTCHAs inside a session without the agent lifting a finger. This recipe wires that into Browser Use: one flag at session creation, one custom tool the agent calls to block until the solver reports done. Everything else is the same perception-plan-act loop as the base [Browser Use](../browser-use) recipe.

```python
session = client.sessions.create(solve_captcha=True)
```

`solve_captcha=True` turns on Steel's solver in the session's browser. Steel detects reCAPTCHA, hCaptcha, and similar widgets as the page loads them, drives the challenge transparently, and exposes progress through a status endpoint. From Browser Use's side, nothing changes: it still connects via `BrowserSession(cdp_url=...)` and runs the same agent loop. The solver lives below the CDP layer, invisible to the framework.

The only hand-off the agent needs is a way to wait. That's a tool registered with Browser Use's `Tools` decorator:

```python
tools = Tools()

@tools.action(description="Wait for CAPTCHA to be solved by Steel. ...")
async def wait_for_captcha_solution() -> str:
    ...
```

The description is what the LLM reads when deciding to call the tool, so it spells out the trigger: "Call this tool when you encounter any CAPTCHA challenge." The body polls `client.sessions.captchas.status(session_id)` once per second and returns once no page is still solving.

`wait_for_captcha_solution` runs with a 60-second deadline. Each tick fetches CAPTCHA state for every open tab and calls `_has_active_captcha`, which checks whether any state still has `isSolvingCaptcha=True`. Once that flips false, `_summarize_states` collapses per-page task counts (total, solving, solved, failed) into one dict and the tool returns a success string like "All CAPTCHAs have been solved after 4120ms. ..." so the agent has something to reason about on its next step.

The `TASK` string closes the loop. It tells the agent to navigate, call `wait_for_captcha_solution` when a challenge appears, then submit. Without that instruction the agent would try to click the checkbox itself and race the auto-solver.

## Run it

```bash
cd examples/browser-use-captcha-auto
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
pip install -r requirements.txt
python main.py
```

Keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [platform.openai.com](https://platform.openai.com/api-keys). The default `TASK` points at a public reCAPTCHA v2 checkbox demo so you can verify the flow end-to-end without touching a real target.

A session viewer URL prints as the script starts. Open it in another tab to watch Steel click the checkbox while the agent idles inside `wait_for_captcha_solution`.

Your output varies. Structure looks like this:

```text
Starting Steel browser session...
Steel Session created!
View session at https://app.steel.dev/sessions/ab12cd34...

Executing task:
1. Navigate to https://recaptcha-demo.appspot.com/recaptcha-v2-checkbox.php
2. When you encounter a CAPTCHA ... call the wait_for_captcha_solution tool
...
============================================================
 INFO     [Agent] Step 1: navigate to recaptcha demo
 INFO     [Agent] Step 2: call wait_for_captcha_solution

Waiting for CAPTCHA to be solved...
All CAPTCHAs solved in 4120ms
 INFO     [Agent] Step 3: click submit
 INFO     [Agent] Step 4: done
============================================================
TASK EXECUTION COMPLETED

Releasing Steel session...
Session completed. View replay at https://app.steel.dev/sessions/ab12cd34...
```

A run usually finishes in under a minute: a few cents of Steel session time plus OpenAI tokens for each agent step. The `finally` block that calls `client.sessions.release()` still matters. Steel bills per session-minute and CAPTCHA-enabled sessions count the same, so skipping release keeps the browser running until the default 5-minute timeout.

## Reading the status endpoint

`client.sessions.captchas.status(session_id)` returns one entry per open page. Each entry carries:

- `pageId` and `url` for the tab.
- `isSolvingCaptcha`: true while Steel is actively working on that page.
- `tasks`: per-challenge status strings like `solving`, `solved`, `failed_to_detect`, `failed_to_solve`.

`_summarize_states` rolls those per-page counts into totals so the agent sees a compact summary instead of raw page objects. The only invariant the tool itself depends on is `_has_active_captcha`: return once no page is still solving. If you want richer logic (fail early on `failed_to_solve`, surface the specific page URL, give up after N failures), extend the summary helper.

## Make it yours

- **Point at a real target.** Replace the `TASK` string with the actual flow: "sign up at example.com with these details". Keep the instruction to call `wait_for_captcha_solution` when a CAPTCHA appears; everything else, the agent figures out.
- **Tune the poll loop.** `wait_for_captcha_solution` uses `timeout_ms=60000` and `poll_interval_ms=1000`. Image grids and audio fallbacks sometimes need 90-120 seconds. A 2-3 second poll cuts API calls without noticeable delay.
- **Fail loud on solver failure.** The current summary counts `failed` tasks but the tool does not short-circuit on them. Check `summary["failed_tasks"] > 0` inside the loop and return an error string so the agent can retry or abort.
- **Combine with stealth.** `sessions.create()` accepts `use_proxy=True` and `session_timeout=1800000` alongside `solve_captcha=True`. Sites that CAPTCHA you aggressively usually want all three.

## Related

- [Manual variant](../browser-use-captcha-manual): trigger solve requests explicitly instead of letting Steel detect challenges on its own.
- [Browser Use base](../browser-use): the minimal wiring without any CAPTCHA handling.
- [Browser Use docs](https://docs.browser-use.com)
