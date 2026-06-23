# Claude Computer Use (Go)

Two typed unions meet in this recipe. Claude's Beta Messages API returns a `computer` tool call (`left_click` at `[640, 412]`, `type "claude opus"`, `scroll down 3`); Steel's Sessions Computer endpoint accepts a discriminated union of actions (`click_mouse`, `type_text`, `scroll`) and returns a screenshot. `main.go` is the agent loop that translates one into the other and feeds the screenshot back, using the official `anthropic-sdk-go` and `steel-go` SDKs end to end with no hand-rolled HTTP.

A Steel session is a headful Chromium in a VM. The Computer endpoint (`client.Sessions.Computer`) runs a mouse or keyboard action server-side and, when you pass `Screenshot: true`, returns a base64 PNG in the same call. So one round-trip both acts and observes.

## Constructing a Steel action

Steel models its action request as a tagged union. In Go that is `SessionComputerParams`: a discriminator `Action` plus one pointer field per variant, all marshaled by the SDK based on the tag. You set the string and the matching struct, and leave the rest nil:

```go
req := &steel.ComputerActionRequestClickMouse{
    Action:      "click_mouse",
    Button:      &button,
    Coordinates: &coords,
    Screenshot:  ptr(true),
}
resp, err := a.steelClient.Sessions.Computer(ctx, a.session.ID,
    steel.SessionComputerParams{Action: "click_mouse", ComputerActionRequestClickMouse: req})
img := resp.Base64Image // *string, base64 PNG
```

`executeComputerAction` is one big `switch` over Claude's action names that builds the right variant for each: `left_click` and friends become a `ComputerActionRequestClickMouse` (with `NumClicks` 2 or 3 for double and triple), `type` becomes `ComputerActionRequestTypeText`, `scroll` becomes a `ComputerActionRequestScroll` with pixel deltas. Two translation details carry over from the Python and TypeScript versions: `scroll_amount` is multiplied by 100 pixels per step, and key names like `CTRL+A` run through `normalizeKey` (`CTRL` to `Control`, `ESC` to `Escape`, `UP` to `ArrowUp`) before they reach `press_key`.

Most coordinate and key fields on these structs are pointers (`*[]float64`, `*bool`), so the `ptr` generic helper near the top of the file keeps the construction readable.

## Reading Claude's turn

The response side is the other union. `BetaMessage.Content` is a slice of `BetaContentBlockUnion`; `block.AsAny()` returns the concrete variant for a type switch:

```go
for _, block := range msg.Content {
    switch v := block.AsAny().(type) {
    case anthropic.BetaTextBlock:
        // narration; print it and echo it back as a text block
    case anthropic.BetaToolUseBlock:
        // v.Input is the action; execute it, return a screenshot
    }
}
```

`BetaToolUseBlock.Input` arrives as `any`. `processResponse` marshals it to JSON and unmarshals into a small `computerAction` struct to read `action`, `coordinate`, `text`, and the rest. The same `Input` value goes straight back into `NewBetaToolUseBlock` when echoing the assistant turn, so you never reconstruct it field by field.

Screenshots return to Claude as a `tool_result` whose content is a base64 image, built in `screenshotResult`. The `anthropic-sdk-go` ships `NewBetaToolResultBlock` for text results, but an image result needs the explicit struct: a `BetaToolResultBlockParam` whose `Content` holds a `BetaImageBlockParam` with a `BetaBase64ImageSourceParam`. The `ToolUseID` ties the screenshot back to the call that produced it.

## The loop

`executeTask` seeds the history with the system prompt and the task, then on each turn calls the Beta Messages API and processes the response:

```go
resp, err := a.anthropicClient.Beta.Messages.New(ctx, anthropic.BetaMessageNewParams{
    Model:     anthropic.ModelClaudeOpus4_7,
    MaxTokens: 4096,
    Messages:  a.messages,
    Tools:     a.tools,
    Betas:     []string{"computer-use-2025-11-24"},
})
```

The tool is declared once in `NewAgent` with `anthropic.BetaToolUnionParamOfComputerUseTool20251124(viewportHeight, viewportWidth)`, which builds the `computer_20251124` definition. Keep the 1280x768 viewport in sync with the Steel session's `Dimensions` or clicks land in the wrong place. Three conditions end the loop: Claude returns only text (task done), the last assistant messages overlap more than 80% by word content (`wordOverlap`, a cheap stall detector), or the iteration count hits `maxIterations` (50).

One SDK note worth its own line: `anthropic-sdk-go` v1.51.1 has no named constant for the `computer-use-2025-11-24` beta yet (its newest is `computer-use-2025-01-24`). Because `AnthropicBeta` is a string alias, the raw string in `Betas` is correct and type-checks. Swap in the constant if a later SDK release adds one.

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

Your output varies. Structure looks like this:

```text
Steel Session created successfully!
View live session at: https://app.steel.dev/sessions/ab12cd34...

Executing task: Go to Steel.dev and find the latest news
============================================================
I'll navigate to Steel.dev and look for the latest news.
computer({"action":"key","text":"ctrl+l"})
computer({"action":"type","text":"https://steel.dev"})
computer({"action":"key","text":"Return"})
computer({"action":"screenshot"})
...
Task complete - no further actions requested

============================================================
TASK EXECUTION COMPLETED
Duration: 78.4 seconds
Releasing Steel session...
```

Expect roughly 60 to 180 seconds and 10 to 40 loop iterations for a simple browsing task. A run costs a few cents of browser time plus the Anthropic tokens for each screenshot. Steel bills per session-minute, so the `defer agent.cleanup(ctx)` in `main` that releases the session is not optional: skip it and the browser runs until the 900000 ms timeout set in `initialize`.

## Make it yours

- **Change the task.** Edit `TASK` in `.env` or pass it inline.
- **Tune the viewport.** `viewportWidth` and `viewportHeight` set both the Steel `Dimensions` and the tool's `display_*_px`. Keep them equal.
- **Rework the system prompt.** `browserSystemPrompt` is where the browsing conventions live: date injection, the screenshot-after-submit rule, black-screen recovery.
- **Raise the ceiling.** `maxIterations` is the safety net for long tasks.
- **Hand off auth.** Pass `SessionContext` to `Sessions.Create` to start authenticated. See [credentials](../credentials-ts) and [auth-context](../auth-context-ts).

## Related

[Python version](../claude-computer-use-py) · [TypeScript version](../claude-computer-use-ts) · [OpenAI computer use in Go](../openai-computer-use-go) · [Anthropic computer use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool)
