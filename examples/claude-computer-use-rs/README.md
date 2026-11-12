# Claude Computer Use (Rust)

There is no first-party Anthropic SDK for Rust, so the Messages API here is exactly what it is on the wire: one `POST https://api.anthropic.com/v1/messages` with `reqwest`, two headers, and a JSON body you assemble yourself. That turns out to be an advantage for computer use. The request body is dynamic (a growing transcript of text, `tool_use`, and screenshot `tool_result` blocks), so you build it with `serde_json::json!`; each block of the response decodes into a typed `enum` for reading. The half that benefits from types gets them, the half that does not stays loose.

The other half of the loop is the browser. A Steel session is a headful Chromium in a VM, and `client.sessions().computer(&id, action)` runs one mouse or keyboard action server-side, and its `TakeScreenshot` action returns a base64 PNG. The `steel-rs` crate models the action set as a `SessionComputerParams` enum, so the actions you send Steel are fully typed even though the actions you receive from Claude arrive as untyped JSON.

## Two type boundaries

This recipe straddles two APIs with opposite typing stories, and `main.rs` leans into both.

Claude's reply decodes into an internally tagged enum on the block's `type` field:

```rust
#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ContentBlock {
    Text {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: Value,
        #[serde(default)]
        toolset_name: Option<String>,
    },
    #[serde(other)]
    Other,
}
```

`name` is the action, such as `left_click` or `type`, and `toolset_name` is `"computer"`. `input` stays a `serde_json::Value` on purpose: it holds the action's arguments (`coordinate`, `text`, `scroll_amount`, ...), and those vary per action. The `#[serde(other)]` arm catches the blocks that the loop doesn't read, such as thinking blocks, and means a new block type in a future API version deserializes instead of panicking. `MessagesResponse` keeps `content` as raw `Value`s, and `process_response` puts them back into the transcript as they came, thinking blocks included.

Going the other direction, `run_member` reads that loose `input` and constructs a typed Steel action. Claude's vocabulary (`left_click`, `type`, `scroll`, `key`) does not match Steel's (`click_mouse`, `type_text`, `scroll`, `press_key`), so the function is the translation layer:

```rust
"left_click" | "right_click" | "middle_click" | "double_click" => {
    if has_modifiers {
        return Err("Holding modifier keys during a click is not supported".into());
    }
    let button = match name {
        "right_click" => SessionComputerParamsClickMouseButton::Right,
        "middle_click" => SessionComputerParamsClickMouseButton::Middle,
        _ => SessionComputerParamsClickMouseButton::Left,
    };
    SessionComputerParams::ClickMouse(SessionComputerParamsClickMouse {
        button: Some(button),
        click_type: None,
        coordinates: Some(self.point(input.get("coordinate"))),
        hold_keys: None,
        num_clicks: if name == "double_click" {
            Some(2.0)
        } else {
            None
        },
        screenshot: None,
    })
}
```

Claude often asks for several actions in one turn. `process_response` runs them in order and answers each with a `tool_result` that carries `"toolset_name": "computer"`. Actions other than `screenshot` return the text `OK`, and a screenshot goes back as a base64 `image` source. If an action fails, the rest of the turn is skipped, and each skipped call gets "Not executed: an earlier computer action in this turn failed." When every action succeeds and the turn didn't end with a `screenshot`, the last result also carries a fresh screenshot.

Three translation details worth knowing. A click or scroll without a `coordinate` uses the last cursor position, which starts at the center of the viewport. Keys run through `normalize_key` before they reach Steel (`CTRL` to `Control`, `ESC` to `Escape`, `UP` to `ArrowUp`). And Steel scrolls one wheel step per `scroll` call, whatever the delta, so `scroll_amount: 3` sends three calls. All three mirror the Python recipe so behavior stays identical across languages.

## The loop

`Agent::execute_task` seeds the transcript with the task, then repeats: call Anthropic, run any actions, append results.

```rust
let response = self.call_anthropic().await?;
if response.stop_reason.as_deref() == Some("refusal") {
    println!("Claude declined to continue this task");
    final_text = "Claude declined to continue this task".to_string();
    break;
}
let (text, has_actions) = self.process_response(response).await?;

if !has_actions {
    println!("Task complete - no further actions requested");
    final_text = text;
    break;
}
```

The tool definition is the computer toolset for Claude Opus 5.5, `{"type": "computer_toolset_20260801"}`, with `configs` that turn off the actions Steel's Input API can't do: `zoom`, `triple_click`, `left_mouse_down`, `left_mouse_up` and `hold_key`. It takes no display size. Claude reads the size from the screenshots, so its coordinates are pixels of the screenshots that you send back. The system prompt goes in the request's `system` field.

Four things end the loop: Claude replies with text and no `tool_use` (done), Claude stops with `stop_reason: "refusal"`, the last assistant message overlaps a recent one by more than 80% on word content (`detect_repetition`, a cheap stall guard), or the hard `MAX_ITERATIONS` cap of 50 trips. The toolset needs no beta header, so `call_anthropic` sends only `x-api-key` and `anthropic-version: 2023-06-01`.

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

Your output varies. One run printed:

```text
Steel + Claude Computer Use Assistant
============================================================

Starting Steel session...
Steel Session created successfully!
View live session at: https://app.steel.dev/sessions/1f1ce23e-3942-43cd-aa54-04adb98621e7
Steel session started!
Executing task: Go to Steel.dev and find the latest news
============================================================
key({"text":"ctrl+l"})
type({"text":"steel.dev\n"})
wait({"duration":3})
screenshot({})
Let me check the Resources menu for a blog/news section.
left_click({"coordinate":[417,161]})
wait({"duration":1})
screenshot({})
...

============================================================
TASK EXECUTION COMPLETED
============================================================
Duration: 73.2 seconds
Task: Go to Steel.dev and find the latest news
Result:
The latest news on Steel.dev's blog is **"Build the agent. Don't build its computer."** by Nikola Balic, published October 7, 2026 (19-minute read).
...
============================================================
Releasing Steel session...
Session completed. View replay at https://app.steel.dev/sessions/1f1ce23e-3942-43cd-aa54-04adb98621e7
```

Expect one to three minutes for a simple browse, plus Anthropic token cost. A run also spends a few cents of browser time. Steel bills per session-minute, so the `cleanup` call that releases the session is not optional: `main` runs the task inside an `async` block and calls `agent.cleanup().await` afterward whether it returned `Ok` or an error, so a failed task still frees the browser.

## Make it yours

- **Change the task.** Edit `TASK` in `.env` or pass it inline.
- **Tune the viewport.** `VIEWPORT_WIDTH` / `VIEWPORT_HEIGHT` set the Steel `dimensions` and the starting cursor position. Claude reads the size from the screenshots, so nothing else changes.
- **Rework the prompt.** `browser_system_prompt` holds the browsing conventions: date injection, the clear-then-type rule, black-screen recovery.
- **Raise the ceiling.** `MAX_ITERATIONS` is the safety net for long tasks.
- **Persist a login.** Pass a session context to `sessions().create` to resume with cookies and local storage. See [credentials](../credentials-ts).

## Related

[Anthropic computer use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) · [Python version](../claude-computer-use-py) · [Go version](../claude-computer-use-go) · [scrape-rs](../scrape-rs)
