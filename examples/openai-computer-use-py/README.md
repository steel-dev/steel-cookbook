# OpenAI Computer Use (Python)

OpenAI's Computer Use models expose one tool (`{"type": "computer"}`) and emit `computer_call` items containing an `action` the model wants performed on a screen. You execute the action, return a screenshot as a `computer_call_output`, and the next turn the model sees the result. The action vocabulary (`click`, `type`, `keypress`, `scroll`, `drag`, `wait`, `screenshot`) is fixed by OpenAI.

This recipe uses OpenAI's **Responses API**, not Chat Completions. Responses keeps conversation state on OpenAI's side via `previous_response_id`, so each turn only sends the new tool outputs rather than the full screenshot history.

## The loop

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

Each `response["output"]` is a list of items with a `type`. The loop walks them:

- `reasoning`: model's internal thinking, printed.
- `message`: terminal prose; the agent stores the last one as the final result.
- `computer_call`: one or more actions to execute.

`execute_computer_action` maps OpenAI's action vocabulary onto Steel's Input API. Each branch builds a Steel request body and sends it through `self.steel.sessions.computer(...)` with `screenshot: True`:

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

`keypress` arrives with OpenAI names (`CTRL`, `ENTER`, `ESC`, `UP`); `normalize_key` rewrites them into the Steel / DOM vocabulary (`Control`, `Enter`, `Escape`, `ArrowUp`).

The screenshot goes back as a `computer_call_output`:

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

## Safety checks

A `computer_call` can include `pending_safety_checks`. You must echo them back in `acknowledged_safety_checks` on the next turn, or the model stalls. The default here is `auto_acknowledge_safety = True`, which suits a starter but is not what you want in production. Flip it to `False` and surface the check to a human before proceeding.

## Run it

```bash
cd examples/openai-computer-use-py
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
uv run main.py
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [platform.openai.com](https://platform.openai.com/api-keys).

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

A run typically takes 60-180 seconds and 10-30 iterations. Screenshots are cached between turns via `previous_response_id`, so per-turn input cost stays roughly flat even on long loops. The `finally` block in `main()` calls `sessions.release()`.

## Make it yours

- **Change the task.** Edit `TASK` in `.env` or pass it inline.
- **Swap the model.** The default is `gpt-5.5`. Update `self.model` in `Agent.__init__`.
- **Tune the viewport.** `viewport_width` / `viewport_height` in `Agent.__init__` flow into `sessions.create(dimensions=...)`.
- **Turn off auto-ack.** Flip `auto_acknowledge_safety = False` to make pending safety checks raise.
- **Persist a login.** Pass `session_context` to `sessions.create`. See [credentials](../credentials).
- **Adjust reasoning.** `"effort": "medium"` trades latency for deeper plans. Drop to `"low"` for fast lookups, raise to `"high"` for multi-step research.

## Related

[TypeScript version](../openai-computer-use-ts) · [Claude version](../claude-computer-use-py) · [OpenAI Computer Use guide](https://platform.openai.com/docs/guides/tools-computer-use) · [Responses API reference](https://platform.openai.com/docs/api-reference/responses)
