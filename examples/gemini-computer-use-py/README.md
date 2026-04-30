# Gemini Computer Use (Python)

Gemini's computer use ships through `google.genai` as a single built-in tool: `Tool(computer_use=ComputerUse(environment=ENVIRONMENT_BROWSER))`. Setting `ENVIRONMENT_BROWSER` unlocks a fixed vocabulary of browser function calls (`click_at`, `type_text_at`, `scroll_document`, `scroll_at`, `navigate`, `search`, `key_combination`, `drag_and_drop`, `hover_at`, `go_back`, `go_forward`, `open_web_browser`, `wait_5_seconds`).

Steel supplies the screen. A Steel session is a headful Chromium in a VM, and `sessions.computer(session_id, action=...)` runs mouse and keyboard actions with a base64 PNG attached to the response.

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

Gemini doesn't keep server-side conversation state, so every turn resends the full `contents` list including every prior screenshot.

## Coordinates live in a 0-1000 canvas

Gemini never emits pixel coordinates. Every spatial argument (`x`, `y`, `destination_x`, `destination_y`, `magnitude`) is scaled against `MAX_COORDINATE = 1000` regardless of viewport. `denormalize_x` and `denormalize_y` rescale onto Steel's viewport before each action:

```python
def denormalize_x(self, x: int) -> int:
    return int(x / MAX_COORDINATE * self.viewport_width)
```

## Sending screenshots back

Gemini expects each function response as two `Part`s in a user-role `Content`: a `FunctionResponse` with metadata, then an `inline_data` `Blob` carrying the PNG.

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

## Stopping conditions

`execute_task` ends one of three ways:

1. Gemini emits only text, no function calls.
2. Three consecutive iterations produce neither text nor function calls.
3. `max_iterations=50` caps total turns.

## Run it

```bash
cd examples/gemini-computer-use-py
cp .env.example .env          # set STEEL_API_KEY and GEMINI_API_KEY
uv run main.py
```

Steel keys live at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). Gemini keys come from [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

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

A run typically takes 60-180 seconds and 10-30 iterations. Because `generate_content` has no server-side state, every new turn resends the full `self.contents` list including every prior `Blob`. The `finally` block in `main()` calls `sessions.release()`.

## Make it yours

- Change the task. Edit `TASK` in `.env` or pass it inline.
- Swap the model. `self.model = "gemini-3-flash-preview"` in `Agent.__init__`.
- Tune the viewport. `viewport_width` and `viewport_height` in `Agent.__init__` flow into `sessions.create(dimensions=...)`.
- Gate safety confirmations. Replace the auto-acknowledge branch in `execute_task` with a human prompt.
- Persist a login. Pass `session_context` to `sessions.create` to resume with cookies and local storage. See [credentials](../credentials).
- Raise the ceiling. `max_iterations=50` in `execute_task` bounds a single task.

## Related

[TypeScript version](../gemini-computer-use-ts) · [Gemini Computer Use guide](https://ai.google.dev/gemini-api/docs/computer-use) · [google-genai SDK](https://googleapis.github.io/python-genai/)
