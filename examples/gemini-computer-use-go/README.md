# Gemini Computer Use (Go)

`google.golang.org/genai` exposes computer use as a typed tool on the request config: set `config.Tools = []*genai.Tool{{ComputerUse: &genai.ComputerUse{Environment: genai.EnvironmentBrowser}}}` and `client.Models.GenerateContent(ctx, "gemini-4-hydrogen", contents, config)` starts planning against a fixed browser vocabulary (`click`, `double_click`, `right_click`, `middle_click`, `move`, `drag_and_drop`, `type`, `scroll`, `press_key`, `hotkey`, `wait`, `navigate`, `go_back`, `go_forward`, `take_screenshot`). Coordinates arrive in a normalized 0-1000 grid, and every call carries an `intent` string that says why the model chose it. `ExcludedPredefinedFunctions: unsupportedActions` removes `triple_click`, `mouse_down`, `mouse_up`, `key_down` and `key_up`, which Steel's Input API cannot perform.

Steel runs the screen. A session is a headful Chromium in a VM, and `client.Sessions.Computer(ctx, sessionID, body)` takes the action as its body and returns a `*SessionComputerResponse` whose `Base64Image` carries the resulting PNG.

## Two typed surfaces, one bytes gotcha

The Steel computer endpoint takes the action as the `Body` of `SessionComputerParams`, a union interface, so each action is a distinct struct: `steel.SessionComputerParamsBodyClickMouse`, `...MoveMouse`, `...PressKey`, `...TypeText`, `...Scroll`, `...DragMouse`, `...Wait`, `...TakeScreenshot`. The agent's `switch fc.Name` builds the right one per Gemini call, and `run` reads `resp.Base64Image` back out (a plain string, empty when the action captured no screenshot).

Gemini's args land in a `map[string]any` with JSON types: numbers are `float64`, so `argInt` casts before `denormalizeX` / `denormalizeY` scale 0-1000 onto the 1440x900 viewport. The one trap worth naming: `genai.Blob.Data` is `[]byte`, not a base64 string. Steel hands back base64 text, so every screenshot is run through `base64.StdEncoding.DecodeString` before it becomes an `InlineData` part.

```go
data, err := base64.StdEncoding.DecodeString(shots[i])
parts = append(parts, &genai.Part{
    InlineData: &genai.Blob{MIMEType: "image/png", Data: data},
})
```

Some Gemini actions are compound and get expanded locally. `type` sends the text, then Enter if `press_enter` is true, then waits a second before the screenshot. `navigate` skips hunting for the URL bar by doing the Ctrl+L focus trick in `openURL`. `hotkey` arrives as a list of key names; `argStrings` and `normalizeKey` turn it into Steel's names (`CTRL` to `Control`, `CMD` to `Meta`, `ARROWUP` to `ArrowUp`).

## The loop

`executeTask` seeds two user `Part`s (the system prompt and the task) into `contents`, then loops on `GenerateContent`. genai keeps no server-side state, so the full `contents` slice, every prior screenshot included, is resent each turn. Each turn appends the model's `Content`, then a user `Content` pairing one `FunctionResponse` (name plus current URL) with one `InlineData` screenshot per call. An action the agent cannot run adds an `error` field to its `FunctionResponse`, so the model can pick another action. Four exits:

- Text and no function calls: the model wrote its final answer.
- Three consecutive empty turns (no text, no calls): stop.
- `FinishReasonMalformedFunctionCall` with nothing else: the model produced a call it could not format, so skip to the next iteration.
- The 50-iteration cap.

`run` defers `agent.cleanup`, which releases the Steel session, and returns an error instead of calling `os.Exit` so that the deferred cleanup always runs.

## Run it

```bash
cd examples/gemini-computer-use-go
cp .env.example .env          # set STEEL_API_KEY and GEMINI_API_KEY
go mod tidy
go run .
```

Steel keys live at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys); Gemini keys at [aistudio.google.com/apikey](https://aistudio.google.com/apikey). Override the task per run:

```bash
TASK="Find the current weather in New York City" go run .
```

Output varies. The shape is:

```text
Steel + Gemini Computer Use Assistant
============================================================

Starting Steel session...
Steel Session created successfully!
View live session at: https://app.steel.dev/sessions/ab12cd34...
Executing task: Go to Steel.dev and find the latest news
============================================================

navigate({"intent":"Go to steel.dev","url":"https://steel.dev"})
click({"intent":"Click on Resources dropdown to find news or blog","x":321,"y":179})
click({"intent":"Click on Blog","x":68,"y":332})
Task complete - model provided final response
Releasing Steel session...
Session completed. View replay at https://app.steel.dev/sessions/ab12cd34...

============================================================
TASK EXECUTION COMPLETED
============================================================
Duration: 78.4 seconds
Task: Go to Steel.dev and find the latest news
Result:
Steel's latest release notes mention ...
============================================================
```

A run usually takes 60-180 seconds across 10-30 iterations.

## Make it yours

- Change the task. Edit `TASK` in `.env` or pass it inline.
- Swap the model. The `model` constant is the only version string. `gemini-3.8-flash` and `gemini-3.5-flash-lite` use the same action set, and Flash-Lite is the fastest and cheapest of the three. `gemini-3-flash-preview` uses an older action vocabulary (`click_at`, `type_text_at`) that this agent does not handle.
- Raise the thinking level. `NewAgent` sets `ThinkingLevel: genai.ThinkingLevelLow`, which keeps a turn to ~10 seconds. `genai.ThinkingLevelMedium` and `genai.ThinkingLevelHigh` plan each step more carefully, but at `HIGH`, the model's default, a turn takes 40-90 seconds.
- Resize the viewport. `viewportWidth` / `viewportHeight` feed both the Steel `Dimensions` and the denormalize math.
- Gate safety decisions. Replace the auto-acknowledge branch in `executeTask` with a human approval before the action fires.
- Hand off auth. Pass `SessionContext` to `Sessions.New` to resume with cookies and local storage. See [credentials](../credentials-ts).

## Related

[TypeScript version](../gemini-computer-use-ts) · [Python version](../gemini-computer-use-py) · [Anthropic equivalent](../claude-computer-use-go) · [OpenAI equivalent](../openai-computer-use-go) · [google.golang.org/genai](https://pkg.go.dev/google.golang.org/genai)
