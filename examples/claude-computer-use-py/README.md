# Claude Computer Use (Python)

Computer use is Anthropic's primitive for giving Claude direct control of a screen. You declare the computer toolset; Claude replies with actions like `left_click` at `(x, y)`, `type` with text, `scroll`, `key`. You execute each one and hand back a screenshot.

Steel supplies the screen. A Steel session is a headful Chromium in a VM reachable over HTTPS, and the Input API (`sessions.computer`) executes mouse and keyboard actions and takes screenshots.

## The loop

Everything in `main.py` hangs off a single loop in `Agent.execute_task`. Seed the conversation with the task, then on each turn:

```python
response = self.client.messages.create(
    model=self.model,
    max_tokens=16000,
    system=self.system_prompt,
    messages=self.messages,
    tools=self.tools,
)

text, has_actions = self.process_response(response)

if not has_actions:
    break
```

`tools` holds the computer toolset, with the actions that Steel's Input API can't do turned off:

```python
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
```

The toolset needs no beta header, no tool name and no display size. Claude reads the screen size from the screenshots, so its coordinates are pixels of the screenshots that you send back. Claude Opus 5.5 accepts only this form of computer use on the Claude API.

`process_response` puts Claude's reply into `messages` as it came, thinking blocks included. Claude often asks for several actions in one turn: each is a `tool_use` block whose `name` is the action and whose `toolset_name` is `"computer"`. They run in order through `run_member`, which maps each action onto a Steel Input API call:

```python
elif name in ("left_click", "right_click", "middle_click", "double_click"):
    if tool_input.get("text"):
        raise ValueError("Holding modifier keys during a click is not supported")
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
```

Each call gets a `tool_result` with `toolset_name: "computer"`. If an action fails, the rest of the turn is skipped, and each skipped call gets "Not executed: an earlier computer action in this turn failed." When every action succeeds and the turn didn't end with a `screenshot`, the last result also carries a fresh screenshot.

Three translation details: a click or scroll without a `coordinate` uses the last cursor position, which starts at the center of the viewport. `key` runs names like `CTRL+A` through `normalize_key` (`CTRL` to `Control`, `ESC` to `Escape`, `UP` to `ArrowUp`). And Steel scrolls one wheel step per `scroll` call, so `scroll_amount: 3` makes three calls.

Three things end the loop: Claude responds with only text (task done), Claude stops with `stop_reason: "refusal"`, or the last two assistant messages overlap 80%+ on word content (`detect_repetition`). A hard cap of 50 iterations catches anything that slips past them.

## Run it

```bash
cd examples/claude-computer-use-py
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
uv run main.py
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [console.anthropic.com](https://console.anthropic.com/). Default task lives in `.env` as `TASK`; you can override per-run:

```bash
TASK="Find the current weather in New York City" uv run main.py
```

Your output varies. One run printed:

```text
Steel + Claude Computer Use Assistant
============================================================

Starting Steel session...
Steel Session created successfully!
View live session at: https://app.steel.dev/sessions/2fae1421-9fef-4463-8313-ce048e197e9a
Steel session started!
Executing task: Go to Steel.dev and find the latest news
============================================================
key({"text": "ctrl+l"})
type({"text": "steel.dev\n"})
wait({"duration": 3})
screenshot({})
The banner announces news. Let me check Resources for a blog/news section too.
left_click({"coordinate": [418, 161]})
wait({"duration": 1})
screenshot({})
...
Task complete - no further actions requested

============================================================
TASK EXECUTION COMPLETED
============================================================
Duration: 47.9 seconds
Task: Go to Steel.dev and find the latest news
Result:
The latest news on Steel.dev is a blog post from October 7, 2026: **"Build the agent. Don't build its computer."** by Nikola Balic (19-minute read).
...
============================================================
Releasing Steel session...
Session completed. View replay at https://app.steel.dev/sessions/2fae1421-9fef-4463-8313-ce048e197e9a
```

A run typically takes one to three minutes.

## Make it yours

- **Change the task.** Edit `TASK` in `.env` or pass it per-run.
- **Tune the viewport.** `viewport_width` / `viewport_height` in `Agent.__init__`.
- **Rework the system prompt.** `BROWSER_SYSTEM_PROMPT` is where site-specific knowledge lives.
- **Persist a login.** Pass `session_context` to `sessions.create` to resume with cookies and local storage. See [credentials](../credentials-ts).
- **Raise the ceiling.** `max_iterations=50` in `execute_task` is the safety net.

## Related

[Anthropic computer use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) · [TypeScript version](../claude-computer-use-ts)
