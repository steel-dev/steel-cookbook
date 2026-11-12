# Claude Computer Use (Go)

Two typed unions meet in this recipe. Claude's Messages API returns computer tool calls (`left_click` at `[640, 412]`, `type "steel.dev"`, `scroll down 3`); Steel's Sessions Computer endpoint accepts a discriminated union of actions (`click_mouse`, `type_text`, `scroll`) and takes screenshots. `main.go` is the agent loop that translates one into the other and feeds the screenshot back, using the official `anthropic-sdk-go` and `github.com/steel-dev/sdk/go` SDKs end to end with no hand-rolled HTTP.

A Steel session is a headful Chromium in a VM. The Computer endpoint (`client.Sessions.Computer`) runs a mouse or keyboard action server-side, and its `take_screenshot` action returns a base64 PNG.

## Constructing a Steel action

Steel models its action request as a tagged union. In Go that is `SessionComputerParams`, whose `Body` field takes exactly one of the `SessionComputerParamsBody*` variant structs. Each variant carries its own `Action` constant, which the SDK sends as the tag, so you build the struct and hand it over:

```go
req := steel.SessionComputerParamsBodyClickMouse{
    Action:      steel.F(steel.SessionComputerParamsBodyClickMouseActionClickMouse),
    Button:      steel.F(button),
    Coordinates: steel.F(a.point(in.Coordinate)),
}
resp, err := a.steelClient.Sessions.Computer(ctx, a.session.ID, steel.SessionComputerParams{Body: req})
```

`act` wraps that call and turns the response's `Error` field into a Go error, so a failed action stops the turn.

`runMember` is one `switch` over Claude's action names that builds the right variant for each: `left_click` and friends become a `SessionComputerParamsBodyClickMouse` (with `NumClicks` 2 for a double click), `type` becomes `SessionComputerParamsBodyTypeText`, `scroll` becomes a `SessionComputerParamsBodyScroll`. Three translation details carry over from the Python and TypeScript versions. A click or scroll without a `coordinate` uses the last cursor position, which starts at the center of the viewport. Steel scrolls one wheel step per `scroll` call, so `scroll_amount: 3` sends three. And key names like `CTRL+A` run through `normalizeKey` (`CTRL` to `Control`, `ESC` to `Escape`, `UP` to `ArrowUp`) before they reach `press_key`.

Every field on these structs is a `param.Field`, so each value goes in through `steel.F`, and a field you never set, such as `NumClicks` on a single click, stays out of the request.

## Reading Claude's turn

The response side is the other union. `Message.Content` is a slice of `ContentBlockUnion`; `block.AsAny()` returns the concrete variant for a type switch:

```go
for _, block := range msg.Content {
    switch v := block.AsAny().(type) {
    case anthropic.TextBlock:
        responseText += v.Text
        fmt.Println(v.Text)
    case anthropic.ToolUseBlock:
        if v.ToolsetName == "computer" {
            calls = append(calls, v)
        }
    }
}
```

Claude often asks for several actions in one turn. Each is a `ToolUseBlock` whose `Name` is the action and whose `ToolsetName` is `"computer"`. `ToolUseBlock.Input` arrives as `json.RawMessage`, and `runCall` unmarshals it into a small `computerInput` struct to read `coordinate`, `start_coordinate`, `text`, `scroll_amount` and the rest. The assistant turn goes back into the history through `msg.ToParam()`, which keeps every block as it came, thinking blocks included.

Each call gets a `ToolResultBlockParam` with `ToolsetName: anthropic.String("computer")`. Actions other than `screenshot` return the text `OK`. A screenshot is an `ImageBlockParam` with a `Base64ImageSourceParam`, built in `screenshot`. If an action fails, the rest of the turn is skipped, and each skipped call gets "Not executed: an earlier computer action in this turn failed." When every action succeeds and the turn didn't end with a `screenshot`, the last result also carries a fresh screenshot.

## The loop

`executeTask` seeds the history with the task, then on each turn calls the Messages API and processes the response:

```go
resp, err := a.anthropicClient.Messages.New(ctx, anthropic.MessageNewParams{
    Model:     a.model,
    MaxTokens: 16000,
    System:    []anthropic.TextBlockParam{{Text: browserSystemPrompt()}},
    Messages:  a.messages,
    Tools:     a.tools,
})
```

The tool is declared once in `NewAgent` as an `anthropic.ComputerToolset20260801Param`, the computer toolset for Claude Opus 5.5. It needs no beta header and no display size, because Claude reads the size from the screenshots. Its `Configs` turn off the actions that Steel's Input API can't do: `Zoom`, `TripleClick`, `LeftMouseDown`, `LeftMouseUp` and `HoldKey`. Four conditions end the loop: Claude returns only text (task done), Claude stops with `StopReasonRefusal`, the last assistant messages overlap more than 80% by word content (`wordOverlap`, a cheap stall detector), or the iteration count hits `maxIterations` (50).

One SDK note: the recipe pins `anthropic-sdk-go` v1.84.0, which has the computer toolset types and `ModelClaudeOpus5_5` and sends API version `2023-06-01`. Version 2 of the SDK lives at `github.com/anthropics/anthropic-sdk-go/v2`, sends `2026-10-21` and needs Go 1.25.

## Run it

```bash
cd examples/claude-computer-use-go
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
go run .
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [console.anthropic.com](https://console.anthropic.com/). The default task lives in `.env` as `TASK`; override it per run:

```bash
TASK="Find the current weather in New York City" go run .
```

Your output varies. One run printed:

```text
Steel + Claude Computer Use Assistant
============================================================

Starting Steel session...
Steel Session created successfully!
View live session at: https://app.steel.dev/sessions/0c66fda0-3f72-4557-9b3f-2ae7bfa85c36
Executing task: Go to Steel.dev and find the latest news
============================================================
key({"text":"ctrl+l"})
type({"text":"https://steel.dev\n"})
wait({"duration":3})
screenshot({})
Let me check the Resources menu for a blog/news section.
left_click({"coordinate":[417,161]})
wait({"duration":1})
screenshot({})
...
Task complete - no further actions requested

============================================================
TASK EXECUTION COMPLETED
============================================================
Duration: 50.6 seconds
Task: Go to Steel.dev and find the latest news
Result:
The newest item on Steel.dev is a blog post from **October 7, 2026: "Build the agent. Don't build its computer."** (19-minute read). It's about whether to build or buy the infrastructure AI agents run on. It covers deciding what computer your agent needs, testing how an agent sandbox recovers from failures, and starting with a managed setup.
...
============================================================
Releasing Steel session...
Session completed. View replay at https://app.steel.dev/sessions/0c66fda0-3f72-4557-9b3f-2ae7bfa85c36
```

Expect one to three minutes for a simple browsing task. A run costs a few cents of browser time plus the Anthropic tokens for each screenshot. Steel bills per session-minute, so the `defer agent.cleanup(ctx)` in `run` that releases the session is not optional: skip it and the browser runs until the 900000 ms timeout set in `initialize`.

## Make it yours

- **Change the task.** Edit `TASK` in `.env` or pass it inline.
- **Tune the viewport.** `viewportWidth` and `viewportHeight` set the Steel `Dimensions`. Claude reads the size from the screenshots, so nothing else changes.
- **Rework the system prompt.** `browserSystemPrompt` is where the browsing conventions live: date injection, the screenshot-after-submit rule, black-screen recovery.
- **Raise the ceiling.** `maxIterations` is the safety net for long tasks.
- **Hand off auth.** Pass `SessionContext` to `Sessions.New` to start authenticated. See [credentials](../credentials-ts) and [auth-context](../auth-context-ts).

## Related

[Python version](../claude-computer-use-py) · [TypeScript version](../claude-computer-use-ts) · [OpenAI computer use in Go](../openai-computer-use-go) · [Anthropic computer use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
