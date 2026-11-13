# Gemini Computer Use (Python)

Gemini's computer use ships through `google.genai` as a single built-in tool: `Tool(computer_use=ComputerUse(environment=ENVIRONMENT_BROWSER))`. Setting `ENVIRONMENT_BROWSER` turns on a fixed vocabulary of browser function calls (`click`, `double_click`, `right_click`, `middle_click`, `move`, `drag_and_drop`, `type`, `scroll`, `press_key`, `hotkey`, `wait`, `navigate`, `go_back`, `go_forward`, `take_screenshot`). Every call carries an `intent` string that says why the model chose it. `excluded_predefined_functions=UNSUPPORTED_ACTIONS` removes `triple_click`, `mouse_down`, `mouse_up`, `key_down` and `key_up`, which Steel's Input API cannot perform.

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

Gemini does not keep server-side conversation state, so every turn resends the full `contents` list including every prior screenshot.

## Coordinates live in a 0-1000 canvas

Gemini never emits pixel coordinates. Every position (`x`, `y`, `start_x`, `start_y`, `end_x`, `end_y`) is scaled against `MAX_COORDINATE = 1000` regardless of viewport. `scroll` is the exception: its `magnitude_in_pixels` is already in pixels. `denormalize_x` and `denormalize_y` rescale onto Steel's viewport before each action:

```python
def denormalize_x(self, x: int) -> int:
    return int(x / MAX_COORDINATE * self.viewport_width)
```

## Sending screenshots back

Gemini expects each function response as two `Part`s in a user-role `Content`: a `FunctionResponse` with metadata, then an `inline_data` `Blob` carrying the PNG. An action the recipe cannot run comes back with an `error` field, so the model can pick another action.

```python
response: Dict[str, Any] = {"url": self.current_url}
if error:
    response["error"] = error

function_response = FunctionResponse(
    name=fc.name or "",
    response=response,
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

navigate({"url": "https://steel.dev", "intent": "Go to Steel.dev homepage"})
click({"y": 179, "x": 321, "intent": "Click on Resources menu or blog/news link"})
click({"y": 332, "x": 70, "intent": "Click on Blog"})
scroll({"y": 500, "x": 500, "magnitude_in_pixels": 500, "intent": "Scroll down to see blog posts", "direction": "down"})
...
Task complete - model provided final response

TASK EXECUTION COMPLETED
Duration: 78.4 seconds
Result: Steel's latest release notes mention ...
```

A run typically takes 60-180 seconds and 10-30 iterations. Because `generate_content` has no server-side state, every new turn resends the full `self.contents` list including every prior `Blob`. The `finally` block in `main()` calls `sessions.release()`.

## Make it yours

- Change the task. Edit `TASK` in `.env` or pass it inline.
- Swap the model. `self.model = "gemini-4-hydrogen"` in `Agent.__init__`. `gemini-3.8-flash` and `gemini-3.5-flash-lite` use the same action set, and Flash-Lite is the fastest and cheapest of the three. `gemini-3-flash-preview` uses an older action vocabulary (`click_at`, `type_text_at`) that this recipe does not handle.
- Tune the viewport. `viewport_width` and `viewport_height` in `Agent.__init__` flow into `sessions.create(dimensions=...)`.
- Gate safety confirmations. Replace the auto-acknowledge branch in `execute_task` with a human prompt.
- Persist a login. Pass `session_context` to `sessions.create` to resume with cookies and local storage. See [credentials](../credentials-ts).
- Raise the ceiling. `max_iterations=50` in `execute_task` bounds a single task.

## Related

[TypeScript version](../gemini-computer-use-ts) · [Gemini Computer Use guide](https://aistudio.google.com/docs/computer-use) · [google-genai SDK](https://googleapis.github.io/python-genai/)
