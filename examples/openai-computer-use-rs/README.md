# Steel + OpenAI Computer Use (Rust)

OpenAI's `computer-use-preview` model returns mouse and keyboard actions instead of text. This recipe executes those actions against a real Chromium running in Steel's cloud, feeds each resulting screenshot back, and loops until the model reports the task done. There is no official OpenAI Rust SDK, so it calls the Responses API directly with `reqwest` and drives the browser through Steel's server-side `computer` endpoint. It is the Rust counterpart to [openai-computer-use-py](../openai-computer-use-py) and the OpenAI sibling of [claude-computer-use-rs](../claude-computer-use-rs).

## The loop

The Responses API is stateful. Each turn you pass the previous `response.id` as `previous_response_id` and send only the new input, so the conversation never gets resent:

```rust
let mut input = json!([{ "role": "user", "content": task }]);
let mut previous_response_id: Option<String> = None;

for _ in 0..MAX_ITERATIONS {
    let response = self.call_openai(&input, &previous_response_id).await?;
    previous_response_id = Some(response.id);

    let mut next_input = Vec::new();
    for item in &response.output {
        // message -> print it, reasoning -> print it,
        // computer_call -> run the action, screenshot, push a computer_call_output
    }
    if next_input.is_empty() { break; } // model returned only text: done
    input = Value::Array(next_input);
}
```

Contrast [claude-computer-use-rs](../claude-computer-use-rs), where the Anthropic Messages API is stateless and you grow and resend a `messages` array every turn. Here the server holds the history and you send back only `computer_call_output` items. `MAX_ITERATIONS` caps the loop so a stuck model cannot run forever.

## From OpenAI action to Steel action

A `computer_call` carries one `action` such as `{ "type": "click", "button": "left", "x": 412, "y": 280 }`. `execute_action` matches on `type` and builds the matching Steel `SessionComputerParams`:

```rust
"click" => SessionComputerParams::ClickMouse(ComputerActionRequestClickMouse {
    button: Some(map_button(/* left | right | middle | back | forward */)),
    coordinates: Some(vec![x, y]),
    screenshot: Some(true),
    ..
}),
"type"     => SessionComputerParams::TypeText(/* text */),
"keypress" => SessionComputerParams::PressKey(/* normalized keys */),
"scroll"   => SessionComputerParams::Scroll(/* delta_x, delta_y */),
```

Every action sets `screenshot: true`, so Steel returns a fresh base64 PNG. That image goes back as a `computer_call_output` with `image_url: data:image/png;base64,...`, which is what the model sees for its next move. OpenAI key names (`ENTER`, `CTRL`, `ESC`) are normalized to the DOM vocabulary Steel expects (`Enter`, `Control`, `Escape`).

When a turn includes a `pending_safety_check`, the recipe auto-acknowledges it by echoing it back in `acknowledged_safety_checks`. That is fine for a demo on a throwaway page. Read each check before letting an agent act on a real account.

## Run it

```bash
cd examples/openai-computer-use-rs
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
cargo run
```

Get a Steel key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys) and an OpenAI key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys). Set `TASK` in `.env` to change the goal. Your output varies. Structure looks like this:

```text
Steel + OpenAI Computer Use Assistant
============================================================

Starting Steel session...
View live session at: https://app.steel.dev/sessions/3f2a...
Executing task: Go to Steel.dev and find the latest news
============================================================
click(button=left x=720 y=400)
type(text="steel.dev blog")
keypress(keys=["Enter"])
...
The latest Steel post is "...".
============================================================
TASK EXECUTION COMPLETED
Duration: 48.2 seconds
```

A run drives a real session and a vision model across many turns, so it costs a few cents of browser time plus the OpenAI tokens for the loop. Steel bills per session-minute until `cleanup` releases the session, which always runs through a deferred release, even on error.

## Make it yours

- **Change the task.** Set `TASK` in `.env`, or edit the default in `main`.
- **Resize the viewport.** `VIEWPORT_WIDTH` and `VIEWPORT_HEIGHT` set both the Steel session dimensions and the `display_width`/`display_height` on the tool. Keep them in sync so the model's coordinates match the page.
- **Gate safety checks.** Instead of auto-acknowledging every `pending_safety_check`, prompt a human or allowlist specific codes before echoing them back.
- **Start authenticated.** Pass a session context or credentials to `sessions().create(...)` so the agent begins on a logged-in page. See [auth-context](../auth-context-ts) and [credentials](../credentials-ts).

## Related

[openai-computer-use-go](../openai-computer-use-go) is the same agent through the official `openai-go` SDK, which has a typed Responses API. [openai-computer-use-py](../openai-computer-use-py) and [openai-computer-use-ts](../openai-computer-use-ts) are the Python and TypeScript versions. [claude-computer-use-rs](../claude-computer-use-rs) runs the same Steel action loop against Anthropic instead.
