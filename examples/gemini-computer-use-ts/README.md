# Gemini Computer Use (TypeScript)

Gemini exposes computer use as a built-in tool type, not a hand-written schema. You set `config.tools = [{ computerUse: { environment: Environment.ENVIRONMENT_BROWSER } }]` on a `generateContent` call and the model plans against a fixed action vocabulary (`click`, `type`, `navigate`, `scroll`, `press_key`, `hotkey`, `drag_and_drop`, `take_screenshot`, ...) with coordinates in a normalized 0-1000 grid. Every call carries an `intent` string that says why the model chose it. `excludedPredefinedFunctions: UNSUPPORTED_ACTIONS` removes `triple_click`, `mouse_down`, `mouse_up`, `key_down` and `key_up`, which Steel's Input API cannot perform.

The model defaults to `gemini-3.8-flash`. Conversation state lives entirely on your side, appended to `this.contents` turn by turn.

## Coordinates and action mapping

Gemini plans in a 1000x1000 normalized grid regardless of the browser dimensions; `denormalizeX` and `denormalizeY` scale back to pixels off `viewportWidth`/`viewportHeight` (1440x900 by default).

```typescript
private denormalizeX(x: number): number {
  return Math.round((x / MAX_COORDINATE) * this.viewportWidth);
}
```

Some of Gemini's actions are compound; the starter expands them. `type` sends `type_text`, then Enter if `press_enter` is true, then waits a second. `navigate` skips the URL bar hunt by doing the Chrome `Ctrl+L` trick: focus the address bar, type, press Enter, wait. `hotkey` arrives as a list like `["Control", "Enter"]`; `normalizeKey` rewrites synonyms (`CTRL` to `Control`, `CMD` to `Meta`, `ARROWUP` to `ArrowUp`).

Every mapped action sets `screenshot: true` on the Steel call. The PNG comes back in the same response.

## Sending frames back

Each completed call produces two parts in a single user-role turn: a `functionResponse` that names the call and echoes the current URL, then an `inlineData` part carrying the screenshot as raw base64. An action the starter cannot run adds an `error` field, so the model can pick another action.

```typescript
const functionResponse: FunctionResponse = {
  name: fc.name ?? "",
  response: {
    url: result.url ?? this.currentUrl,
    ...(result.error ? { error: result.error } : {}),
  },
};
parts.push({ functionResponse });

parts.push({
  inlineData: {
    mimeType: "image/png",
    data: result.screenshotBase64,
  },
});
```

## The loop

Four exits, in rough order of frequency:

- **Text, no function calls.** The model wrote a final message.
- **Empty turn.** No calls, no text. `consecutiveNoActions` increments. Three in a row stops the loop.
- **`MALFORMED_FUNCTION_CALL` with nothing else.** The model produced a call it could not format; the loop continues to the next iteration.
- **Iteration cap.** 50 turns by default.

The `finally` in `main` calls `agent.cleanup()`, which releases the Steel session.

## Run it

```bash
cd examples/gemini-computer-use-ts
cp .env.example .env          # set STEEL_API_KEY and GEMINI_API_KEY
npm install
npm start
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [aistudio.google.com](https://aistudio.google.com/apikey). Override the task inline:

```bash
TASK="Find the current weather in New York City" npm start
```

Your output varies. Structure looks like this:

```text
Steel Session created successfully!
View live session at: https://app.steel.dev/sessions/ab12cd34...

Executing task: Go to Steel.dev and find the latest news
============================================================
navigate({"intent":"Go to steel.dev","url":"https://steel.dev"})
click({"intent":"Click on Resources or Docs to find latest news or blog","x":321,"y":181})
click({"x":70,"intent":"Click on Blog","y":332})
Steel's latest release adds ...

============================================================
TASK EXECUTION COMPLETED
============================================================
Duration: 78.2 seconds
```

Expect roughly 60-120 seconds and 15-40 turns for a simple browsing task.

## Make it yours

- **Resize the viewport.** `viewportWidth` / `viewportHeight` in the `Agent` constructor feed both the Steel session `dimensions` and the `denormalizeX` / `denormalizeY` math.
- **Swap the model.** `this.model = "gemini-3.8-flash"` is the only version string. `gemini-3.5-flash-lite` is faster and cheaper. `gemini-3-flash-preview` uses an older action vocabulary (`click_at`, `type_text_at`) that this starter does not handle.
- **Tune the system prompt.** `BROWSER_SYSTEM_PROMPT` carries the browsing conventions: today's date via `formatToday()`, clear-before-typing, batch-actions-when-possible, black-screen recovery.
- **Gate safety decisions.** Replace the auto-acknowledgement branch with a human approval before the next `executeComputerAction` fires.
- **Hand off auth.** Pair this recipe with Steel's [credentials](../credentials-ts) or [auth contexts](../auth-context-ts) to start the session already signed in.

## Related

[Computer use docs](https://aistudio.google.com/docs/computer-use) · [Python version](../gemini-computer-use-py) · [Anthropic equivalent](../claude-computer-use-ts) · [OpenAI equivalent](../openai-computer-use-ts)
