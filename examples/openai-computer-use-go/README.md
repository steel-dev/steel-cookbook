# OpenAI Computer Use (Go)

This recipe wires two typed Go SDKs together so OpenAI's `computer-use-preview` model can drive a Steel cloud browser. The model emits a computer action through the official `github.com/openai/openai-go/v3` Responses API. You execute that action against a Steel session with `client.Sessions.Computer`, then hand the resulting screenshot back so the next turn sees what changed. That single exchange, repeated, is the whole agent.

The interesting part in Go is the seam between the two SDKs, because each models the action vocabulary differently. openai-go gives you a *flattened* union: `ResponseComputerToolCallActionUnion` carries every possible field (`X`, `Y`, `Button`, `Keys`, `ScrollX`, `Text`, `Path`) on one struct, and you read whichever ones the `Type` discriminator says are live. Steel's Go SDK takes the opposite shape: `SessionComputerParams` is a *constructed* discriminated union where you set an `Action` string and attach the one matching `ComputerActionRequest*` pointer. `executeAction` is the translation layer between the two.

```go
case "click":
    body := &steel.ComputerActionRequestClickMouse{
        Action:      steel.ComputerActionRequestVariant1ActionClickMouse,
        Button:      ptr(mapButton(act.Button)),
        Coordinates: coords(),
        Screenshot:  ptr(true),
    }
    return a.run(ctx, steel.SessionComputerParams{Action: "click_mouse", ComputerActionRequestClickMouse: body})
```

Every branch sets `Screenshot: ptr(true)`, so the Steel call that performs the action also returns the screenshot in the same round trip. `run` reads `resp.Base64Image` and falls back to an explicit `take_screenshot` if a particular action did not capture one.

## Responses keeps the conversation, you keep the loop

The Responses API stores conversation state server side. The first turn sends the task as a user message; every later turn sends only the new `computer_call_output` items and threads `PreviousResponseID` from the prior response. You never resend the screenshot history, so input size stays roughly flat even across a long run.

```go
params := responses.ResponseNewParams{
    Model:        shared.ResponsesModelComputerUsePreview,
    Instructions: openai.String(systemPrompt()),
    Input:        responses.ResponseNewParamsInputUnion{OfInputItemList: input},
    Tools: []responses.ToolUnionParam{
        responses.ToolParamOfComputerUsePreview(viewportHeight, viewportWidth, responses.ComputerUsePreviewToolEnvironmentBrowser),
    },
    Reasoning:  shared.ReasoningParam{Effort: shared.ReasoningEffortMedium},
    Truncation: responses.ResponseNewParamsTruncationAuto,
}
if previousResponseID != "" {
    params.PreviousResponseID = openai.String(previousResponseID)
}
```

`executeTask` walks `resp.Output`, switching on each item's `Type`. A `reasoning` item is the model thinking out loud and gets printed. A `message` item is terminal prose, stored as the final result. A `computer_call` item carries the actions to run. The model may batch several actions into one call, so `actionsFromCall` returns `call.Actions` when it is populated and the single `call.Action` otherwise, normalizing both into the same flat slice. When a turn produces no tool output, the loop stops.

The model speaks OpenAI key names (`CTRL`, `ENTER`, `ESC`, `ArrowUp`). Steel expects DOM key names (`Control`, `Enter`, `Escape`). `normalizeKey` rewrites them before any `press_key` action goes out.

## Safety checks

A `computer_call` can arrive with `PendingSafetyChecks`. You must echo each one back in `AcknowledgedSafetyChecks` on the matching `computer_call_output`, or the model stalls waiting for confirmation. This starter auto-acknowledges and prints each check:

```go
for _, check := range call.PendingSafetyChecks {
    fmt.Printf("Auto-acknowledging safety check: %s\n", check.Message)
    acks = append(acks, responses.ResponseInputItemComputerCallOutputAcknowledgedSafetyCheckParam{
        ID: check.ID, Code: openai.String(check.Code), Message: openai.String(check.Message),
    })
}
```

Auto-acknowledging suits a demo, not production. In a real deployment, surface the check's `Message` to a human and only acknowledge on approval.

## Run it

```bash
cd examples/openai-computer-use-go
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
go mod tidy
go run .
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [platform.openai.com](https://platform.openai.com/api-keys). The program prints a session viewer URL at startup. Open it in another tab to watch the browser run live.

Override the task per run:

```bash
TASK="Find the current weather in New York City" go run .
```

Your output varies. Structure looks like this:

```text
Steel session created successfully!
View live session at: https://app.steel.dev/sessions/ab12cd34...

Executing task: Go to Steel.dev and find the latest news
============================================================
I'll open steel.dev and check for recent posts.
keypress(keys=[Control l])
type(text="https://steel.dev")
keypress(keys=[Enter])
...
Steel's latest update mentions ...

============================================================
TASK EXECUTION COMPLETED
============================================================
Duration: 78.4 seconds
```

A run typically takes 60-180 seconds across 10-30 model turns. Each turn is one Responses call plus one or more Steel computer actions, so a run costs a few cents of browser time on top of model tokens. Steel bills per session-minute, so the deferred `cleanup` that calls `Sessions.Release` is not optional: skip it and the browser keeps running until the session timeout (set to 900000 ms here in `initialize`).

## Make it yours

- **Change the task.** Edit `TASK` in `.env` or pass it inline.
- **Tune reasoning effort.** `shared.ReasoningEffortMedium` trades latency for deeper plans. Drop to `ReasoningEffortLow` for quick lookups, raise to `ReasoningEffortHigh` for multi-step research.
- **Adjust the viewport.** `viewportWidth` and `viewportHeight` feed both the Steel session `Dimensions` and the `computer_use_preview` tool's display size. Keep the two in sync so the model's coordinates match the real screen.
- **Raise or lower the ceiling.** `maxIterations` bounds the loop at 50 turns. Lower it to cap spend on a flaky task.
- **Gate safety checks.** Replace the auto-acknowledge block with a prompt or an allowlist before appending to `acks`.
- **Persist a login.** Pass `SessionContext` to `Sessions.Create` to reuse cookies across runs. See [credentials](../credentials).

## Notes

The published OpenAI Python and TypeScript computer-use recipes target the `{"type": "computer"}` tool on a newer general model. This Go port uses the dedicated `computer-use-preview` model and its `computer_use_preview` tool, which is the path the openai-go Responses API exposes today through `ToolParamOfComputerUsePreview`. The action vocabulary and the loop shape are identical; only the tool descriptor and model id differ.

## Related

[Python version](../openai-computer-use-py) · [TypeScript version](../openai-computer-use-ts) · [Claude on Steel in Go](../claude-computer-use-go) · [OpenAI computer use guide](https://platform.openai.com/docs/guides/tools-computer-use) · [Responses API reference](https://platform.openai.com/docs/api-reference/responses)
