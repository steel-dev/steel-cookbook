# Browser Use with Manual CAPTCHA Solving (Python)

Steel can solve CAPTCHAs for you in the background, or it can hand you the status API and let you drive. This recipe picks the second path. The session is created with auto-solving explicitly off, a custom Browser Use tool polls `client.sessions.captchas.status()`, and it calls `client.sessions.captchas.solve()` only for the CAPTCHA type you care about. Every state transition (detected, solving, validating, solved) is yours to read and react to.

```python
session = client.sessions.create(
    timeout=300000,
    solve_captcha=True,
    stealth_config={"auto_captcha_solving": False},
)
```

`solve_captcha=True` turns on Steel's CAPTCHA subsystem so the status endpoint has data to return. `auto_captcha_solving: False` tells Steel not to act on what it sees. Detection without intervention. You pick up the loop from there.

The default task opens two tabs, a reCAPTCHA v2 demo and a reCAPTCHA v3 demo, then delegates to a tool registered on the agent (`solve_recaptcha_v2_manual`). The tool polls until it finds work, requests a solve for v2 tasks only, and returns once the session reports it is no longer solving. The agent then clicks Submit and reads the result off the page.

## The polling loop

`solve_recaptcha_v2_manual` is registered with Browser Use via `@tools.action(...)` and runs in a 60-attempt, 3-second-interval loop (`MAX_POLL_ATTEMPTS`, `POLL_INTERVAL_SECS`). Each tick calls the status endpoint, iterates every page in the response, and dispatches on `task.status`:

```python
status_response = client.sessions.captchas.status(session_id)
states = [s.to_dict() if hasattr(s, "to_dict") else dict(s) for s in status_response]

for page_data in states:
    for task in page_data.get("tasks") or []:
        task_id = task.get("id", "")
        task_status = task.get("status", "")
        ...
```

A task with `status == "detected"` and `type == "recaptchaV2"` triggers a solve request:

```python
if task_status == "detected" and task_id not in solve_requested:
    if task.get("type") == SOLVE_CAPTCHA_TYPE:  # "recaptchaV2"
        client.sessions.captchas.solve(session_id, task_id=task_id)
        solve_requested.add(task_id)
```

Other types (`recaptchaV3`, `turnstile`, `image_to_text`) are logged and skipped. To solve every detected CAPTCHA regardless of type, drop the `task_id` arg: `client.sessions.captchas.solve(session_id)`. `solve_requested` is a set, so each task gets one request even as the poll loop revisits it.

## When is a solve actually done

`solved` is not the finish line. Steel marks a task `validating` after the answer is submitted so it can watch the site's response for a few seconds and confirm the solve was not rejected. The reliable signal for "stop polling" is the per-page `isSolvingCaptcha` flag:

```python
has_active_recaptcha_v2 = any(
    task.get("id") in detected_recaptcha_v2
    and task.get("status") not in ("detected", "undetected")
    for task in page_tasks
)

if has_active_recaptcha_v2:
    if not page_data.get("isSolvingCaptcha", False):
        recaptcha_pages_done = True
    else:
        all_pages_checked = False
        break
```

The tool tracks reCAPTCHA v2 task IDs in `detected_recaptcha_v2`, then for each page that holds one of those tasks past the `detected` state, waits for `isSolvingCaptcha` to flip to `False`. When every relevant page reports quiet, the tool returns a success string to the agent.

## Run it

```bash
cd examples/browser-use-captcha-manual
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
uv run main.py
```

Keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [platform.openai.com](https://platform.openai.com/api-keys). The session viewer URL prints as the script starts. Open it in another tab to watch the reCAPTCHA checkbox tick over in real time.

Your output varies. Structure looks like this:

```text
Creating Steel session with CAPTCHA solving enabled...
Session created!
   Session ID: ab12cd34...
   Viewer:     https://app.steel.dev/sessions/ab12cd34...

Task: Open 2 CAPTCHA pages, solve reCAPTCHA v2 only
============================================================
 INFO     [Agent] Step 1: open reCAPTCHA v2 and v3 demo tabs
 INFO     [Agent] Step 2: call solve_recaptcha_v2_manual

Starting manual reCAPTCHA v2 solve polling...
   Max attempts: 60 | Interval: 3.0s

Poll attempt 1/60
   Page: https://www.google.com/recaptcha/api2/demo
   Task status: detected
   reCAPTCHA v2 detected (type=recaptchaV2)! Requesting solve...
   Page: https://2captcha.com/demo/recaptcha-v3
   Task status: detected
   Non-reCAPTCHA v2 task (type=recaptchaV3, ...), skipping.

Poll attempt 3/60
   Task status: solving
   CAPTCHA is being solved...

Poll attempt 5/60
   Task status: validating
   CAPTCHA is being validated...

reCAPTCHA v2 solved! (1 task(s) in 18.4s)
 INFO     [Agent] Step 3: click Submit
 INFO     [Agent] Step 4: done
============================================================
TASK EXECUTION COMPLETED
```

A run takes ~60 seconds and costs Steel session time plus OpenAI tokens for each agent step. The `finally` block that calls `client.sessions.release()` isn't optional. Without it the browser stays up until the 5-minute timeout, whether the solve finished or not.

## Make it yours

- **Solve a different CAPTCHA type.** Change `SOLVE_CAPTCHA_TYPE` to `"recaptchaV3"`, `"turnstile"`, or `"image_to_text"`. The dispatch in `solve_recaptcha_v2_manual` already filters by `task.get("type")`, so the rest of the loop is type-agnostic.
- **Solve everything.** Replace `client.sessions.captchas.solve(session_id, task_id=task_id)` with `client.sessions.captchas.solve(session_id)` to solve every detected task regardless of type. Drop the type filter and the `detected_recaptcha_v2` set at the same time.
- **Retune the loop.** `MAX_POLL_ATTEMPTS` and `POLL_INTERVAL_SECS` gate how long the tool will wait. 60 x 3s (3 minutes) is generous for a single solve. Shorten both for smoke tests, or stretch `MAX_POLL_ATTEMPTS` for pages that queue many challenges.
- **Swap the target.** Replace the entries in `CAPTCHA_PAGES`. The agent builds its tab list and prompt from that array, so the tool will poll and solve whatever you point it at.

## Related

- [Auto variant](../browser-use-captcha-auto): flip `solve_captcha: True` and let Steel detect, solve, and submit without any tool plumbing.
- [Browser Use base](../browser-use): base recipe without CAPTCHA handling.
- [Browser Use docs](https://docs.browser-use.com)
