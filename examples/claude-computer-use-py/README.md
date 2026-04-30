# Claude Computer Use (Python)

Computer use is Anthropic's primitive for giving Claude direct control of a screen. You declare a `computer` tool with a viewport size; Claude replies with actions like `left_click` at `(x, y)`, `type` with text, `scroll`, `key`. You execute each one and hand back a screenshot.

Steel supplies the screen. A Steel session is a headful Chromium in a VM reachable over HTTPS, and the Input API (`sessions.computer`) executes mouse and keyboard actions and returns a PNG in the same call.

## The loop

Everything in `main.py` hangs off a single loop in `Agent.execute_task`. Seed the conversation with a system prompt and the task, then on each turn:

```python
response = self.client.beta.messages.create(
    model=self.model,
    max_tokens=4096,
    messages=self.messages,
    tools=self.tools,
    betas=["computer-use-2025-11-24"],
)

text, has_actions = self.process_response(response)

if not has_actions:
    break
```

`tools` declares the computer tool Claude is allowed to call:

```python
self.tools = [
    {
        "type": "computer_20251124",
        "name": "computer",
        "display_width_px": self.viewport_width,
        "display_height_px": self.viewport_height,
        "display_number": 1,
    }
]
```

The viewport (1280x768) has to match what Steel renders or clicks land in the wrong place.

`tool_use` blocks go to `execute_computer_action`, which maps each Anthropic action name onto a Steel Input API call:

```python
elif action in ("left_click", "right_click", "middle_click",
                "double_click", "triple_click"):
    body = {
        "action": "click_mouse",
        "button": button_map[action],
        "coordinates": [coords[0], coords[1]],
        "screenshot": True,
    }
```

`screenshot: True` tells Steel to attach a base64 PNG to the response, so a click and the screenshot that proves it landed are one round-trip. The PNG goes back into `messages` as a `tool_result` with the matching `tool_use_id`.

Two normalization details: `key` / `hold_key` run names like `CTRL+A` through `normalize_key` (`CTRL` to `Control`, `ESC` to `Escape`, `UP` to `ArrowUp`), and `scroll_amount` is multiplied by 100 pixels per step.

Two things end the loop: Claude responds with only text (task done), or the last two assistant messages overlap 80%+ on word content (`detect_repetition`). A hard cap of 50 iterations catches anything that slips past both.

## Run it

```bash
cd examples/claude-computer-use-py
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
uv run main.py
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [console.anthropic.com](https://console.anthropic.com/). Default task lives in `.env` as `TASK`; you can override per-run:

```bash
TASK="Find the current weather in New York City" python main.py
```

Your output varies. Structure looks like this:

```text
Starting Steel session...
Steel Session created successfully!
View live session at: https://app.steel.dev/sessions/ab12cd34…

Executing task: Go to Steel.dev and find the latest news
============================================================
I'll navigate to Steel.dev and look for the latest news.
computer({"action": "key", "text": "ctrl+l"})
computer({"action": "type", "text": "https://steel.dev"})
computer({"action": "key", "text": "Return"})
computer({"action": "screenshot"})
…
Task complete - no further actions requested

TASK EXECUTION COMPLETED
Duration: 74.3 seconds
Result: Steel just shipped …

Releasing Steel session...
```

A run typically takes 60-180 seconds and 10-30 loop iterations.

## Make it yours

- **Change the task.** Edit `TASK` in `.env` or pass it per-run.
- **Tune the viewport.** `viewport_width` / `viewport_height` in `Agent.__init__`.
- **Rework the system prompt.** `BROWSER_SYSTEM_PROMPT` is where site-specific knowledge lives.
- **Persist a login.** Pass `session_context` to `sessions.create` to resume with cookies and local storage. See [credentials](../credentials).
- **Raise the ceiling.** `max_iterations=50` in `execute_task` is the safety net.

## Related

[Anthropic computer use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) · [TypeScript version](../claude-computer-use-ts)
