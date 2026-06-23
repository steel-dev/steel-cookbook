# Gemini Computer Use (Rust)

There is no official Gemini Rust SDK, so this port talks to the `generateContent` REST endpoint directly over `reqwest`. The request body is a hand-built `serde_json::Value`: `contents` accumulates the conversation turn by turn, and `tools` carries a single `{ "computerUse": { "environment": "ENVIRONMENT_BROWSER" } }` entry that switches Gemini into its built-in computer-use vocabulary. The browser itself is a Steel cloud session driven through the `steel-rs` crate, the same `sessions().computer(...)` surface the Anthropic and OpenAI Rust recipes use.

The model is `gemini-3-flash-preview`, the viewport is 1440x900, and the agent caps out at 50 iterations.

## REST plumbing and coordinates

Everything in the request and response is camelCase JSON, so the two response structs (`Candidate`, `GenerateContentResponse`) carry `#[serde(rename_all = "camelCase")]` and the rest is read straight off `serde_json::Value` with `.get(...)`. Auth is the `x-goog-api-key` header rather than a bearer token.

Gemini plans on a fixed 0-1000 grid regardless of the real viewport. `denormalize_x` and `denormalize_y` scale those numbers back to pixels off `VIEWPORT_WIDTH` / `VIEWPORT_HEIGHT` before any coordinate reaches Steel. Several actions are compound and get expanded locally: `type_text_at` fans into click, Ctrl+A, Backspace, type, optional Enter, and a wait; `navigate` and `search` skip the address-bar hunt with the Chrome `Ctrl+L` trick (focus the bar, type the URL, press Enter, wait). `key_combination` arrives as a `+`-joined string such as `"Control+Enter"`, which `split_keys` and `normalize_key` break apart and rewrite to canonical names (`CTRL` to `Control`, `CMD` to `Meta`, `ARROWUP` to `ArrowUp`).

## Sending frames back

In REST the screenshot stays a base64 string the whole way through. Each completed call appends two parts to a single user-role turn: a `functionResponse` naming the call and echoing the current URL, then an `inlineData` part with `mimeType` `image/png` and the base64 PNG as `data`. The bytes are never decoded.

The loop has four exits: a text-only turn (the model wrote its final answer), three empty turns in a row, a `MALFORMED_FUNCTION_CALL` finish reason with nothing else (a known preview-model quirk, retried on the next iteration), and the 50-iteration cap. A call may carry a `safety_decision` arg requesting confirmation; the agent logs it and auto-acknowledges before running the action.

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

I'll navigate to steel.dev and scan the landing page for news.
navigate({"url":"https://steel.dev"})
scroll_document({"direction":"down"})
click_at({"x":520,"y":410})
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

Expect roughly 60 to 120 seconds and 15 to 40 turns for a simple browsing task.

## Make it yours

- **Resize the viewport.** `VIEWPORT_WIDTH` / `VIEWPORT_HEIGHT` feed both the Steel session `dimensions` and the `denormalize_x` / `denormalize_y` math, so they stay in sync.
- **Swap the model.** `GEMINI_URL` is the only place the version string `gemini-3-flash-preview` appears.
- **Tune the system prompt.** `browser_system_prompt` carries the browsing conventions: today's date via `format_today`, clear-before-typing, batch-actions-when-possible, black-screen recovery.
- **Gate safety decisions.** Replace the auto-acknowledge branch with a human approval before the next `execute_computer_action` fires.
- **Cap the run.** `MAX_ITERATIONS` bounds the loop; lower it for cheaper experiments.

## Related

[Gemini computer use docs](https://ai.google.dev/gemini-api/docs/computer-use) · [TypeScript version](../gemini-computer-use-ts) · [Python version](../gemini-computer-use-py) · [Anthropic equivalent](../claude-computer-use-rs) · [OpenAI equivalent](../openai-computer-use-rs)
