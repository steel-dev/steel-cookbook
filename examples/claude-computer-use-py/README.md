# Claude Computer Use (Python)

Computer use is Anthropic's primitive for giving Claude direct control of a screen. You declare a `computer` tool with a viewport size; Claude replies with actions like `left_click` at `(x, y)`, `type` with text, `scroll`, `key`. You execute each one and hand back a screenshot. The model sees what it just did and decides what to do next. That's the whole interface. No DOM, no selectors, no scaffolding.

Steel supplies the screen. A Steel session is a headful Chromium in a VM reachable over HTTPS, and the Input API (`sessions.computer`) executes mouse and keyboard actions and returns a PNG in the same call. One round-trip per Claude action.

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

The viewport (1280x768) has to match what Steel renders. Claude picks coordinates against this canvas, so if the numbers disagree the clicks land in the wrong place. The `computer_20251124` type pairs with the `computer-use-2025-11-24` beta; both move together when Anthropic ships a new version.

`process_response` walks the content blocks in Claude's reply. Text blocks get printed. `tool_use` blocks go to `execute_computer_action`, which maps each Anthropic action name onto a Steel Input API call:

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

`screenshot: True` tells Steel to attach a base64 PNG to the response, so a click and the screenshot that proves it landed are one round-trip, not two. The PNG goes back into `messages` as a `tool_result` with the matching `tool_use_id`, and the next iteration Claude sees exactly what changed.

Actions are thin translations with two bits of normalization worth knowing: `key` / `hold_key` run names like `CTRL+A` through `normalize_key` (Anthropic's vocabulary into Steel's: `CTRL` becomes `Control`, `ESC` becomes `Escape`, `UP` becomes `ArrowUp`), and `scroll_amount` is multiplied by 100 pixels per step because Claude counts in "tick" units.

Two things end the loop. `has_actions == False` means Claude responded with only text, meaning it thinks the task is done. Or the last two assistant messages overlap 80%+ on word content (`detect_repetition`), which usually means it's stuck retrying the same thing. A hard cap of 50 iterations catches anything that slips past both.

## The system prompt matters

`BROWSER_SYSTEM_PROMPT` in `main.py` is tuned for this setup and worth reading before you change anything:

- **Never click the address bar.** Claude reaches for it with the mouse by default and misses half the time. The prompt teaches it `Ctrl+L`, type URL, Enter.
- **Clear before typing.** `Ctrl+A` then `Delete`, otherwise typed text appends to whatever was already there.
- **Black first screenshot?** Click the center and try again. Focus sometimes lands off-window on a cold session.
- **Today's date** is injected at startup so Claude doesn't browse as if it were two years ago.

These aren't decorative; they're the difference between "works most of the time" and "falls over on the first form."

## Run it

```bash
cd examples/claude-computer-use-py
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
pip install -r requirements.txt
python main.py
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [console.anthropic.com](https://console.anthropic.com/). The script prints a session viewer URL as soon as the Steel session is up. Open it in another tab to watch Claude drive the browser live. Each tool call also prints as `computer({...})` so you can follow along in the terminal.

Default task lives in `.env` as `TASK`; you can override per-run:

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

A run typically takes 60-180 seconds and 10-30 loop iterations, depending on the task. You pay for Steel session-minutes and for Anthropic tokens; every screenshot goes into the message history, so longer tasks cost more on both sides. Release the session in `finally` (the template already does) so the browser doesn't idle until the 15-minute timeout.

## Make it yours

- **Change the task.** Edit `TASK` in `.env` or pass it per-run. The agent takes one natural-language instruction and runs to completion; no conversation, no follow-up questions.
- **Tune the viewport.** `viewport_width` / `viewport_height` in `Agent.__init__`. Claude picks coordinates against whatever you set, so update both the `tools` declaration and the `sessions.create` call together; they already read from the same attribute.
- **Rework the system prompt.** `BROWSER_SYSTEM_PROMPT` is where site-specific knowledge lives. Add rules for sites you care about ("on github.com, use the `/` shortcut to focus search"), constraints ("never submit forms on finance.example.com"), or persona.
- **Persist a login.** Pass `session_context` to `sessions.create` to resume with cookies and local storage from a previous run. Claude skips the login flow entirely. See [credentials](../credentials) for the pattern.
- **Raise the ceiling.** `max_iterations=50` in `execute_task` is the safety net. Long research tasks may want 100+; short lookups can drop to 20.

## Related

[Anthropic computer use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) · [TypeScript version](../claude-computer-use-ts)
