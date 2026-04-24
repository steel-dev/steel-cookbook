# OpenAI Computer Use (Python)

OpenAI's Computer Use models expose one tool (`{"type": "computer"}`) and emit `computer_call` items containing an `action` the model wants performed on a screen. You execute the action, return a screenshot as a `computer_call_output`, and the next turn the model sees the result. Unlike a typical tool call, you don't name the function or define its arguments: the action vocabulary (`click`, `type`, `keypress`, `scroll`, `drag`, `wait`, `screenshot`) is fixed by OpenAI.

Steel provides the screen. A Steel session is a headful Chromium in a VM, and `sessions.computer(session_id, action=...)` accepts mouse / keyboard actions and returns a base64 PNG in the same response. One round-trip per OpenAI action.

This recipe also uses OpenAI's **Responses API**, not Chat Completions. Responses keeps conversation state on OpenAI's side via `previous_response_id`, so each turn only sends the new tool outputs rather than the full screenshot history.

## The loop

Everything hangs off `Agent.execute_task` in `main.py`. Seed the first turn with the task, then on every iteration:

```python
params = {
    "model": self.model,
    "instructions": self.system_prompt,
    "input": next_input,
    "tools": self.tools,
    "reasoning": {"effort": "medium"},
    "truncation": "auto",
}
if previous_response_id:
    params["previous_response_id"] = previous_response_id

response = create_response(**params)
previous_response_id = response.get("id")
```

`create_response` is a thin `requests.post` against `https://api.openai.com/v1/responses`; the official SDK works too, but hitting the endpoint directly makes the wire format obvious. `instructions` is the system prompt, `tools` is `[{"type": "computer"}]` (no name, no schema), and `previous_response_id` chains turns without resending context.

Each `response["output"]` is a list of items, each with its own `type`. The loop walks them:

```python
for item in response["output"]:
    item_type = item.get("type")

    if item_type == "reasoning":
        # summary blocks, printed as thought bubbles
        ...
    if item_type == "message":
        # final text, captured as the task result
        ...
    if item_type == "computer_call":
        # one or more actions to execute on the browser
        ...
```

`reasoning` items carry the model's internal thinking as `summary` blocks: printed but never echoed back to the API (the chain preserves them via `previous_response_id`). `message` items are terminal prose; the agent stores the last one as the final result. `computer_call` is where the work happens.

## Executing a computer call

`execute_computer_action` maps OpenAI's action vocabulary onto Steel's Input API. Each branch builds a Steel request body and sends it through `self.steel.sessions.computer(...)` with `screenshot: True` attached, so one call does the action and returns the frame:

```python
elif action_type in ("click",):
    coords = self.to_coords(action_args.get("x"), action_args.get("y"))
    button = self.map_button(action_args.get("button"))
    num_clicks = int(self.to_number(action_args.get("num_clicks"), 1))
    payload = {
        "action": "click_mouse",
        "button": button,
        "coordinates": [coords[0], coords[1]],
        "screenshot": True,
    }
    if num_clicks > 1:
        payload["num_clicks"] = num_clicks
    body = payload
```

Two bits of normalization earn their keep. `keypress` arrives with OpenAI names (`CTRL`, `ENTER`, `ESC`, `UP`); `normalize_key` rewrites them into the Steel / DOM vocabulary Steel expects (`Control`, `Enter`, `Escape`, `ArrowUp`). And coordinate values sometimes come in as strings; `to_coords` coerces them and falls back to the viewport center when the model omits them entirely.

After the action returns, the screenshot goes back as a `computer_call_output`:

```python
tool_outputs.append({
    "type": "computer_call_output",
    "call_id": item["call_id"],
    "acknowledged_safety_checks": pending_checks,
    "output": {
        "type": "computer_screenshot",
        "image_url": f"data:image/png;base64,{screenshot_base64}",
    },
})
```

`call_id` pairs the frame with the originating `computer_call`. When the next iteration's `input=next_input` ships these outputs, OpenAI stitches them onto the response identified by `previous_response_id`.

## Safety checks

Computer use is the one place OpenAI inserts a gate you have to clear. A `computer_call` can include `pending_safety_checks` (warnings about things like navigating to an unfamiliar URL, typing credentials, or triggering irreversible actions). You must echo them back in `acknowledged_safety_checks` on the next turn, or the model stalls. The default here is `auto_acknowledge_safety = True`, which suits a starter but is not what you want in production. Flip it to `False` and surface the check to a human before proceeding.

## The loop ends, or it doesn't

`execute_task` exits when an iteration produces no `tool_outputs`, meaning the response contained only `message` / `reasoning` and the model considers the task done. `max_iterations=50` is the hard ceiling. Unlike chatty text models, a stuck computer-use loop usually manifests as the same `keypress` or `click` repeated forever; the `BROWSER_SYSTEM_PROMPT` includes an explicit "don't repeat the same action sequence" rule to keep that rare.

## The system prompt matters

`BROWSER_SYSTEM_PROMPT` is tuned for this viewport and setup:

- **Clear before typing.** `Ctrl+A` then `Delete`, otherwise typed text concatenates onto whatever was already in the field.
- **One Enter, then wait.** After submitting a form, wait 1-2s and take a single screenshot; don't re-press Enter speculatively.
- **Prefer `Ctrl+L` over clicking the address bar.** Reliable focus, one round-trip.
- **Today's date** is injected at startup (`format_today()`) so the model doesn't browse as if it were 18 months ago.

These rules exist because the model will happily rage-click the same input six times if left to its own devices. Edit them when you add site-specific knowledge, don't delete them.

## Run it

```bash
cd examples/openai-computer-use-py
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
pip install -r requirements.txt
python main.py
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [platform.openai.com](https://platform.openai.com/api-keys). The script prints a session viewer URL as soon as the Steel session is up. Open it in another tab to watch the browser run live. Every reasoning summary and action also prints in the terminal so you can follow along.

Override the task per run:

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
I'll open steel.dev and check the blog.
keypress({"keys": ["CTRL", "L"]})
type({"text": "https://steel.dev"})
keypress({"keys": ["ENTER"]})
wait({"ms": 1500})
…
Steel's latest release notes mention …

TASK EXECUTION COMPLETED
Duration: 62.8 seconds
```

A run typically takes 60-180 seconds and 10-30 iterations, depending on the task. You pay for Steel session-minutes and for OpenAI tokens: screenshots are cached between turns via `previous_response_id`, so per-turn input cost stays roughly flat even on long loops. The `finally` block in `main()` calls `sessions.release()`; leaving it out keeps the session alive until Steel's 15-minute default timeout.

## Make it yours

- **Change the task.** Edit `TASK` in `.env` or pass it inline. The agent takes one natural-language instruction and runs to completion; no follow-up turn.
- **Swap the model.** The default is `gpt-5.5`. Any Responses-API computer-use model works; update `self.model` in `Agent.__init__`.
- **Tune the viewport.** `viewport_width` / `viewport_height` in `Agent.__init__` flow into `sessions.create(dimensions=...)`. OpenAI's computer tool doesn't take a size hint: the model infers it from screenshots, so matching the Steel dimensions is enough.
- **Turn off auto-ack.** Flip `auto_acknowledge_safety = False` to make pending safety checks raise instead of being silently accepted. Useful when wiring this into a human-in-the-loop setup.
- **Persist a login.** Pass `session_context` to `sessions.create` to resume with cookies and local storage from a previous run; the model skips the login flow. See [credentials](../credentials) for the pattern.
- **Adjust reasoning.** `"effort": "medium"` trades latency for deeper plans. Drop to `"low"` for fast lookups, raise to `"high"` for multi-step research.

## Related

[TypeScript version](../openai-computer-use-ts) · [Claude version](../claude-computer-use-py) · [OpenAI Computer Use guide](https://platform.openai.com/docs/guides/tools-computer-use) · [Responses API reference](https://platform.openai.com/docs/api-reference/responses)
