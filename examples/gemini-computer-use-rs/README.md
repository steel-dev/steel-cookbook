# Gemini Computer Use (Rust)

There is no official Gemini Rust SDK, so this port talks to the `generateContent` REST endpoint directly over `reqwest`. The request body is a hand-built `serde_json::Value`: `contents` accumulates the conversation turn by turn, and `tools` carries a single `computerUse` entry with `"environment": "ENVIRONMENT_BROWSER"` that switches Gemini into its built-in computer-use vocabulary. Its `excludedPredefinedFunctions` list removes `triple_click`, `mouse_down`, `mouse_up`, `key_down` and `key_up`, which Steel's Input API cannot perform. The browser itself is a Steel cloud session driven through the `steel-rs` crate, the same `sessions().computer(...)` surface the Anthropic and OpenAI Rust recipes use.

The model is `gemini-4-hydrogen` at the `LOW` thinking level, the viewport is 1440x900, and the agent caps out at 50 iterations.

## REST plumbing and coordinates

Everything in the request and response is camelCase JSON, so the two response structs (`Candidate`, `GenerateContentResponse`) carry `#[serde(rename_all = "camelCase")]` and the rest is read straight off `serde_json::Value` with `.get(...)`. Auth is the `x-goog-api-key` header rather than a bearer token.

Gemini plans on a fixed 0-1000 grid regardless of the real viewport. `denormalize_x` and `denormalize_y` scale those numbers back to pixels off `VIEWPORT_WIDTH` / `VIEWPORT_HEIGHT` before any coordinate reaches Steel. Every call carries an `intent` string that says why the model chose it. Some actions are compound and get expanded locally: `type` sends the text, then Enter if `press_enter` is true, then waits; `navigate` skips the address-bar hunt with the Chrome `Ctrl+L` trick (focus the bar, type the URL, press Enter, wait). `hotkey` arrives as a list such as `["Control", "Enter"]`, and `normalize_key` rewrites each name to its canonical form (`CTRL` to `Control`, `CMD` to `Meta`, `ARROWUP` to `ArrowUp`).

## Sending frames back

In REST the screenshot stays a base64 string the whole way through. Each completed call appends two parts to a single user-role turn: a `functionResponse` naming the call and echoing the current URL, then an `inlineData` part with `mimeType` `image/png` and the base64 PNG as `data`. The bytes are never decoded. An action the agent cannot run adds an `error` field to the `functionResponse`, so the model can pick another action.

The loop has four exits: a text-only turn (the model wrote its final answer), three empty turns in a row, a `MALFORMED_FUNCTION_CALL` finish reason with nothing else (the model produced a call it could not format, so the loop retries on the next iteration), and the 50-iteration cap. A call may carry a `safety_decision` arg requesting confirmation; the agent logs it and auto-acknowledges before running the action.

## Run it

```bash
cd examples/gemini-computer-use-rs
cp .env.example .env          # set STEEL_API_KEY and GEMINI_API_KEY
cargo run
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [aistudio.google.com](https://aistudio.google.com/apikey). Override the task with the `TASK` env var:

```bash
TASK="Find the current weather in New York City" cargo run
```

Output varies. The shape looks like this:

```text
Steel + Gemini Computer Use Assistant
============================================================

Starting Steel session...
Steel Session created successfully!
View live session at: https://app.steel.dev/sessions/ab12cd34...
Steel session started!
Executing task: Go to Steel.dev and find the latest news
============================================================

take_screenshot({"intent":"Check initial screen"})
navigate({"intent":"Go to steel.dev","url":"https://steel.dev"})
click({"intent":"Click on announcements/news banner at the top","x":495,"y":115})
Steel's latest release adds ...

============================================================
TASK EXECUTION COMPLETED
============================================================
Duration: 78.2 seconds
Task: Go to Steel.dev and find the latest news
Result:
Steel's latest release adds ...
============================================================
Releasing Steel session...
Session completed. View replay at https://app.steel.dev/sessions/ab12cd34...
```

Expect roughly 40 to 80 seconds and 4 to 7 turns for a simple browsing task.

## Make it yours

- **Resize the viewport.** `VIEWPORT_WIDTH` / `VIEWPORT_HEIGHT` feed both the Steel session `dimensions` and the `denormalize_x` / `denormalize_y` math, so they stay in sync.
- **Swap the model.** `GEMINI_URL` is the only place the version string `gemini-4-hydrogen` appears. `gemini-3.8-flash` and `gemini-3.5-flash-lite` use the same action set, and Flash-Lite is the fastest and cheapest of the three. `gemini-3-flash-preview` uses an older action vocabulary (`click_at`, `type_text_at`) that this agent does not handle.
- **Raise the thinking level.** `call_gemini` sends `"thinkingLevel": "LOW"`, which keeps a turn to ~10 seconds. `MEDIUM` and `HIGH` plan each step more carefully, but at `HIGH`, the model's default, a turn takes 40 seconds to 2 minutes.
- **Tune the system prompt.** `browser_system_prompt` carries the browsing conventions: today's date via `format_today`, clear-before-typing, batch-actions-when-possible, black-screen recovery.
- **Gate safety decisions.** Replace the auto-acknowledge branch with a human approval before the next `execute_computer_action` fires.
- **Cap the run.** `MAX_ITERATIONS` bounds the loop; lower it for cheaper experiments.

## Related

[Gemini computer use docs](https://aistudio.google.com/docs/computer-use) · [TypeScript version](../gemini-computer-use-ts) · [Python version](../gemini-computer-use-py) · [Anthropic equivalent](../claude-computer-use-rs) · [OpenAI equivalent](../openai-computer-use-rs)
