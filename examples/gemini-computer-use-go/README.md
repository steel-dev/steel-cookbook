# Gemini Computer Use (Go)

`google.golang.org/genai` exposes computer use as a typed tool on the request config: set `config.Tools = []*genai.Tool{{ComputerUse: &genai.ComputerUse{Environment: genai.EnvironmentBrowser}}}` and `client.Models.GenerateContent(ctx, "gemini-3-flash-preview", contents, config)` starts planning against a fixed browser vocabulary (`click_at`, `type_text_at`, `navigate`, `scroll_document`, `search`, `drag_and_drop`, `key_combination`, `hover_at`, `go_back`, `go_forward`, `open_web_browser`, `wait_5_seconds`). Coordinates arrive in a normalized 0-1000 grid.

Steel runs the screen. A session is a headful Chromium in a VM, and `client.Sessions.Computer(ctx, sessionID, body)` takes the action as its body and returns a `*SessionComputerResponse` whose `Base64Image` carries the resulting PNG.

## Two typed surfaces, one bytes gotcha

The Steel computer endpoint accepts the action as an `any` body, so each action is a distinct struct: `steel.ClickMouse`, `steel.MoveMouse`, `steel.PressKey`, `steel.TypeText`, `steel.Scroll`, `steel.DragMouse`, `steel.Wait`, `steel.TakeScreenshot`. The agent's `switch fc.Name` builds the right one per Gemini call, and `run` reads `*resp.Base64Image` back out (pointer fields, nil-checked).

Gemini's args land in a `map[string]any` with JSON types: numbers are `float64`, so `argInt` casts before `denormalizeX` / `denormalizeY` scale 0-1000 onto the 1440x900 viewport. The one trap worth naming: `genai.Blob.Data` is `[]byte`, not a base64 string. Steel hands back base64 text, so every screenshot is run through `base64.StdEncoding.DecodeString` before it becomes an `InlineData` part.

```go
data, err := base64.StdEncoding.DecodeString(shots[i])
parts = append(parts, &genai.Part{
    InlineData: &genai.Blob{MIMEType: "image/png", Data: data},
})
```

Several Gemini actions are compound and get expanded locally. `type_text_at` fans into click, Ctrl+A, Backspace, type, optional Enter, a one-second wait, then a screenshot. `navigate` and `search` skip hunting for the URL bar by doing the Ctrl+L focus trick in `openURL`. `key_combination` arrives as a `+`-joined string; `splitKeys` and `normalizeKey` break it apart and rewrite synonyms (`CTRL` to `Control`, `CMD` to `Meta`, `ARROWUP` to `ArrowUp`).

## The loop

`executeTask` seeds two user `Part`s (the system prompt and the task) into `contents`, then loops on `GenerateContent`. genai keeps no server-side state, so the full `contents` slice, every prior screenshot included, is resent each turn. Each turn appends the model's `Content`, then a user `Content` pairing one `FunctionResponse` (name plus current URL) with one `InlineData` screenshot per call. Four exits:

- Text and no function calls: the model wrote its final answer.
- Three consecutive empty turns (no text, no calls): stop.
- `FinishReasonMalformedFunctionCall` with nothing else: a preview-model quirk, skip to the next iteration.
- The 50-iteration cap.

`main` defers `agent.cleanup`, which releases the Steel session.

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

I'll open steel.dev and scan the page for recent news.
navigate({"url":"https://steel.dev"})
scroll_document({"direction":"down"})
click_at({"x":512,"y":340})
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
- Swap the model. The `model` constant is the only version string.
- Resize the viewport. `viewportWidth` / `viewportHeight` feed both the Steel `Dimensions` and the denormalize math.
- Gate safety decisions. Replace the auto-acknowledge branch in `executeTask` with a human approval before the action fires.
- Hand off auth. Pass `SessionContext` to `Sessions.Create` to resume with cookies and local storage. See [credentials](../credentials-ts).

## Related

[TypeScript version](../gemini-computer-use-ts) · [Python version](../gemini-computer-use-py) · [Anthropic equivalent](../claude-computer-use-go) · [OpenAI equivalent](../openai-computer-use-go) · [google.golang.org/genai](https://pkg.go.dev/google.golang.org/genai)
