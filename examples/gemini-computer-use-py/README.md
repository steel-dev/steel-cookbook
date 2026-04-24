# Gemini Computer Use (Python)

Gemini's computer use ships through `google.genai` as a single built-in tool: `Tool(computer_use=ComputerUse(environment=ENVIRONMENT_BROWSER))`. You never write the schema. Setting `ENVIRONMENT_BROWSER` unlocks a fixed vocabulary of browser function calls (`click_at`, `type_text_at`, `scroll_document`, `scroll_at`, `navigate`, `search`, `key_combination`, `drag_and_drop`, `hover_at`, `go_back`, `go_forward`, `open_web_browser`, `wait_5_seconds`). Each one arrives as a `FunctionCall` with named arguments. You run it, send back a `FunctionResponse` plus a screenshot `Blob`, and the next turn sees the new frame.

Steel supplies the screen. A Steel session is a headful Chromium in a VM, and `sessions.computer(session_id, action=...)` runs mouse and keyboard actions with a base64 PNG attached to the response. One round-trip per Gemini action.

## The loop

`Agent.execute_task` seeds two user-role `Part`s (`BROWSER_SYSTEM_PROMPT` and the task) into `self.contents`, then calls `generate_content` in a loop:

```python
response = self.client.models.generate_content(
    model=self.model,
    contents=self.contents,
    config=self.config,
)

candidate = response.candidates[0]
if candidate.content:
    self.contents.append(candidate.content)

reasoning = self.extract_text(candidate)
function_calls = self.extract_function_calls(candidate)
```

`self.config` holds the single computer-use tool. The model is `gemini-3-flash-preview`. Gemini doesn't keep server-side conversation state like OpenAI's Responses API, so every turn resends the full `contents` list: task, prior candidates, every screenshot. That is the dominant cost on long runs (see "Cost shape" below).

`extract_function_calls` walks `candidate.content.parts` pulling out each `part.function_call`. `extract_text` does the same for `part.text` with one filter: `re.fullmatch(r"[\s\d]*", part.text)` drops stray digit-only and whitespace-only parts (`"0"`, `"00"`) that `gemini-3-flash-preview` occasionally emits alongside real reasoning. Swap models and you can probably drop this filter.

## Named function calls, not one computer tool

Claude emits actions inside one `computer` tool. OpenAI emits `computer_call` items with a fixed action field. Gemini emits distinct `FunctionCall`s by name. `execute_computer_action` dispatches on `function_call.name`:

```python
elif name == "click_at":
    x = self.denormalize_x(args.get("x", 0))
    y = self.denormalize_y(args.get("y", 0))
    resp = self.steel.sessions.computer(
        self.session.id,
        action="click_mouse",
        button="left",
        coordinates=[x, y],
        screenshot=True,
    )
```

Most branches are thin wrappers around one `sessions.computer` call with `screenshot=True`, so the action and its resulting frame come back in one round-trip. A few compose multiple Steel calls. `type_text_at` clicks the target, optionally runs `Ctrl+A` then `Backspace` to clear, types, optionally presses `Enter`, waits 1 second, then screenshots. `navigate` and `search` press `Ctrl+L` to focus the address bar, type the URL, and press `Enter` (far more reliable than asking the model to click the address bar itself). `scroll_document` translates directional scrolls into `PageUp` / `PageDown` for vertical and a wheel `scroll` for horizontal.

## Coordinates live in a 0-1000 canvas

Gemini never emits pixel coordinates. Every spatial argument (`x`, `y`, `destination_x`, `destination_y`, `magnitude`) is scaled against `MAX_COORDINATE = 1000` regardless of viewport. `denormalize_x` and `denormalize_y` rescale onto Steel's viewport before each action:

```python
def denormalize_x(self, x: int) -> int:
    return int(x / MAX_COORDINATE * self.viewport_width)
```

Changing `viewport_width` / `viewport_height` (default 1440x900) requires no change to the tool declaration. The model keeps pointing in 0-1000 space and the denormalizer stretches onto whatever Steel renders. Denormalize in every branch that takes spatial arguments, including `scroll_at`'s `magnitude` which Gemini specifies in the same 0-1000 range as positions.

Key names get a separate pass. `key_combination` arrives as a `keys` string like `"Ctrl+A"`. `split_keys` breaks on `+`, then `normalize_key` maps Gemini's vocabulary onto Steel / DOM names (`CTRL` to `Control`, `ESC` to `Escape`, `UP` to `ArrowUp`, function keys pass through as `F1` through `F12`).

## Sending screenshots back

Gemini expects each function response as two `Part`s in a user-role `Content`: a `FunctionResponse` with metadata, then an `inline_data` `Blob` carrying the PNG. `build_function_response_parts` builds the pair:

```python
function_response = FunctionResponse(
    name=fc.name or "",
    response={"url": url or self.current_url},
)
parts.append(Part(function_response=function_response))

parts.append(
    Part(
        inline_data=types.Blob(
            mime_type="image/png",
            data=screenshot_base64,
        )
    )
)
```

Two details. The screenshot is raw base64, not a `data:` URL. The SDK wraps it in a `Blob` with an explicit `mime_type`. And the `response` field carries only the current URL. The visual channel (the `Blob`) is what Gemini actually reads; the URL helps it ground "did my navigate land where I expected" without parsing the screenshot. When multiple function calls come back in one turn, every one gets its own `(FunctionResponse, Blob)` pair and all of them go into one user `Content` before the next `generate_content`.

## Safety decisions and malformed calls

Gemini surfaces safety concerns differently from OpenAI's `pending_safety_checks`. The review rides inside the function-call arguments as a `safety_decision` dict:

```python
safety_decision = action_args.get("safety_decision")
if (
    isinstance(safety_decision, dict)
    and safety_decision.get("decision") == "require_confirmation"
):
    print(f"Safety confirmation required: {safety_decision.get('explanation')}")
    print("Auto-acknowledging safety check")
```

The starter prints and proceeds. For production, gate on a human response: if `decision == "require_confirmation"`, skip `execute_computer_action` until someone approves, and send back a refusal `FunctionResponse` otherwise.

Separately, Gemini sometimes returns `candidate.finish_reason == FinishReason.MALFORMED_FUNCTION_CALL` with no callable function calls and no reasoning. The loop catches this and re-runs `generate_content`, which usually recovers on the next iteration.

## Stopping conditions

`execute_task` ends one of three ways:

1. Gemini emits only text, no function calls. That's the "I'm done" signal. The latest text becomes the returned result.
2. Three consecutive iterations produce neither text nor function calls (`consecutive_no_actions >= 3`). Safety net for stalls.
3. `max_iterations=50` caps total turns.

On exit the loop walks `self.contents` in reverse looking for the last `role == "model"` content with filtered text, and returns that as the final answer.

## The system prompt carries browser habits

`BROWSER_SYSTEM_PROMPT` encodes things Gemini won't discover on its own:

- Clear before typing: `Ctrl+A`, then `Delete`. Otherwise typed text concatenates with whatever is already in the field. `type_text_at` already does this when `clear_before_typing=True` (the default), but the prompt reinforces it for custom flows.
- Batch related actions. Gemini can return multiple `FunctionCall`s in one turn; reminding it reduces round-trips.
- Black first screenshot? Click the center and retry. Cold sessions sometimes land focus off-window.
- Today's date is injected via `format_today()` so Gemini doesn't browse as if it were a year ago.

Edit when you add site-specific knowledge. Don't strip the typing and black-screenshot rules.

## Run it

```bash
cd examples/gemini-computer-use-py
cp .env.example .env          # set STEEL_API_KEY and GEMINI_API_KEY
pip install -r requirements.txt
python main.py
```

Steel keys live at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). Gemini keys come from [aistudio.google.com/apikey](https://aistudio.google.com/apikey). The script prints a session viewer URL as soon as the Steel session is up. Open it in another tab to watch Gemini drive the browser. Every function call prints as `click_at({...})` or `type_text_at({...})` so you can follow along.

Override the task per run:

```bash
TASK="Find the current weather in New York City" python main.py
```

Your output varies. Structure looks like this:

```text
Steel Session created successfully!
View live session at: https://app.steel.dev/sessions/ab12cd34...

Executing task: Go to Steel.dev and find the latest news
============================================================

I'll open steel.dev and look for the latest news.
navigate({"url": "https://steel.dev"})
scroll_document({"direction": "down"})
click_at({"x": 512, "y": 340})
...
Task complete - model provided final response

TASK EXECUTION COMPLETED
Duration: 78.4 seconds
Result: Steel's latest release notes mention ...
```

## Cost shape

A run typically takes 60-180 seconds and 10-30 iterations. You pay for Steel session-minutes and Gemini tokens. Because `generate_content` has no server-side state, every new turn resends the full `self.contents` list including every prior `Blob`. Image tokens dominate on long tasks; halving iterations roughly halves the tail cost. The `finally` block in `main()` calls `sessions.release()`. Without it the session idles until Steel's default timeout.

## Make it yours

- Change the task. Edit `TASK` in `.env` or pass it inline. The agent runs one instruction to completion; no follow-up turns.
- Swap the model. `self.model = "gemini-3-flash-preview"` in `Agent.__init__`. Any Gemini computer-use-capable model works. If you move off 3 Flash, consider dropping the `re.fullmatch(r"[\s\d]*", ...)` filter in `extract_text` since the stray-digit quirk is model-specific.
- Tune the viewport. `viewport_width` and `viewport_height` in `Agent.__init__` flow into `sessions.create(dimensions=...)`. The 0-1000 coordinate space means the tool declaration never changes; `denormalize_x` / `denormalize_y` pick up the new size.
- Gate safety confirmations. Replace the auto-acknowledge branch in `execute_task` with a human prompt (or a refusal `FunctionResponse`). Gemini stops short of the action until you return a response.
- Persist a login. Pass `session_context` to `sessions.create` to resume with cookies and local storage so Gemini skips the login flow. See [credentials](../credentials) for the pattern.
- Raise the ceiling. `max_iterations=50` in `execute_task` bounds a single task. Long research benefits from 100+; short lookups can drop to 20.

## Related

[TypeScript version](../gemini-computer-use-ts) · [Gemini Computer Use guide](https://ai.google.dev/gemini-api/docs/computer-use) · [google-genai SDK](https://googleapis.github.io/python-genai/)
