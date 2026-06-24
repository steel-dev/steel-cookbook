# Claude Computer Use (Rust)

There is no first-party Anthropic SDK for Rust, so the Messages API here is exactly what it is on the wire: one `POST https://api.anthropic.com/v1/messages` with `reqwest`, three headers, and a JSON body you assemble yourself. That turns out to be an advantage for computer use. The request body is dynamic (a growing transcript of text, `tool_use`, and screenshot `tool_result` blocks), so you build it with `serde_json::json!`; the response shape is fixed, so you decode it into a typed `enum`. The half that benefits from types gets them, the half that does not stays loose.

The other half of the loop is the browser. A Steel session is a headful Chromium in a VM, and `client.sessions().computer(&id, action)` runs one mouse or keyboard action server-side and returns a base64 PNG in the same call. The `steel` crate models the action set as a `SessionComputerParams` enum, so the actions you send Steel are fully typed even though the actions you receive from Claude arrive as untyped JSON.

## Two type boundaries

This recipe straddles two APIs with opposite typing stories, and `main.rs` leans into both.

Claude's reply decodes into an internally tagged enum on the block's `type` field:

```rust
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ContentBlock {
    Text { text: String },
    ToolUse { id: String, name: String, input: Value },
    #[serde(other)]
    Other,
}
```

`input` stays a `serde_json::Value` on purpose: it is the computer tool's arguments (`action`, `coordinate`, `text`, ...), and those vary per action. The `#[serde(other)]` arm means a new block type in a future API version deserializes instead of panicking.

Going the other direction, `execute_computer_action` reads that loose `input` and constructs a typed Steel action. Claude's vocabulary (`left_click`, `type`, `scroll`, `key`) does not match Steel's (`click_mouse`, `type_text`, `scroll`, `press_key`), so the function is the translation layer:

```rust
"left_click" | "right_click" | "middle_click" | "double_click" | "triple_click" => {
    SessionComputerParams::ClickMouse(ComputerActionRequestClickMouse {
        button: Some(button),
        coordinates: Some(vec![coords.0, coords.1]),
        num_clicks,
        screenshot: Some(true),
        ..
    })
}
```

`screenshot: Some(true)` tells Steel to attach a fresh PNG to the action's response, so the click and the screenshot that proves it landed are a single round-trip. That PNG goes straight back into the next `tool_result` as a base64 `image` source.

Two translation details worth knowing. Keys run through `normalize_key` before they reach Steel (`CTRL` to `Control`, `ESC` to `Escape`, `UP` to `ArrowUp`), and `scroll_amount` is converted to a pixel delta at 100px per step, with direction mapped onto `delta_x` / `delta_y`. Both mirror the Python recipe so behavior stays identical across languages.

## The loop

`Agent::execute_task` seeds the transcript with the system prompt and the task, then repeats: call Anthropic, run any actions, append results.

```rust
let response = self.call_anthropic().await?;
let (text, has_actions) = self.process_response(response).await?;

if !has_actions {
    println!("Task complete - no further actions requested");
    final_text = text;
    break;
}
```

The tool definition declares `computer_20251124` with `display_width_px` and `display_height_px`. Those must match the Steel session's `dimensions` (1280x768 here) or Claude's coordinates point at the wrong pixels. Both read from the same `VIEWPORT_WIDTH` / `VIEWPORT_HEIGHT` constants so they cannot drift.

Three things end the loop: Claude replies with text and no `tool_use` (done), the last assistant message overlaps a recent one by more than 80% on word content (`detect_repetition`, a cheap stall guard), or the hard `MAX_ITERATIONS` cap of 50 trips. The beta is opt-in per request through the `anthropic-beta: computer-use-2025-11-24` header in `call_anthropic`.

## Run it

```bash
cd examples/claude-computer-use-rs
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
cargo run
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [console.anthropic.com](https://console.anthropic.com/). The default `TASK` lives in `.env`; override it per run:

```bash
TASK="Find the current weather in New York City" cargo run
```

Your output varies. Structure looks like this:

```text
Steel Session created successfully!
View live session at: https://app.steel.dev/sessions/ab12cd34...

Executing task: Go to Steel.dev and find the latest news
============================================================
I'll navigate to Steel.dev and look for the latest news.
computer({"action":"key","text":"ctrl+l"})
computer({"action":"type","text":"https://steel.dev"})
computer({"action":"key","text":"Enter"})
computer({"action":"screenshot"})
...
Task complete - no further actions requested

TASK EXECUTION COMPLETED
Duration: 78.4 seconds
Result: Steel's latest news includes ...

Releasing Steel session...
```

Expect 60 to 180 seconds and 10 to 30 iterations for a simple browse, plus Anthropic token cost. A run also spends a few cents of browser time. Steel bills per session-minute, so the `cleanup` call that releases the session is not optional: `main` runs the task inside an `async` block and calls `agent.cleanup().await` afterward whether it returned `Ok` or an error, so a failed task still frees the browser.

## Make it yours

- **Change the task.** Edit `TASK` in `.env` or pass it inline.
- **Tune the viewport.** `VIEWPORT_WIDTH` / `VIEWPORT_HEIGHT` feed both the Steel `dimensions` and the tool definition. Keep them together.
- **Rework the prompt.** `browser_system_prompt` holds the browsing conventions: date injection, the clear-then-type rule, black-screen recovery.
- **Raise the ceiling.** `MAX_ITERATIONS` is the safety net for long tasks.
- **Persist a login.** Pass a session context to `sessions().create` to resume with cookies and local storage. See [credentials](../credentials-ts).

## Related

[Anthropic computer use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) · [Python version](../claude-computer-use-py) · [Go version](../claude-computer-use-go) · [scrape-rs](../scrape-rs)
