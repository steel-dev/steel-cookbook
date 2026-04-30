# Gemini Computer Use (TypeScript)

Gemini exposes computer use as a built-in tool type, not a hand-written schema. You set `config.tools = [{ computerUse: { environment: Environment.ENVIRONMENT_BROWSER } }]` on a `generateContent` call and the model plans against a fixed action vocabulary (`click_at`, `type_text_at`, `navigate`, `scroll_document`, `search`, `drag_and_drop`, `key_combination`, ...) with coordinates in a normalized 0-1000 grid.

The model defaults to `gemini-3-flash-preview`. Conversation state lives entirely on your side, appended to `this.contents` turn by turn.

## Coordinates and action mapping

Gemini plans in a 1000x1000 normalized grid regardless of the browser dimensions; `denormalizeX` and `denormalizeY` scale back to pixels off `viewportWidth`/`viewportHeight` (1440x900 by default).

```typescript
private denormalizeX(x: number): number {
  return Math.round((x / MAX_COORDINATE) * this.viewportWidth);
}
```

Several of Gemini's actions are compound; the starter expands them. `type_text_at` fans into click, Ctrl+A, Backspace, type_text, Enter, wait, screenshot. `navigate` and `search` skip the URL bar hunt by doing the Chrome `Ctrl+L` trick: focus the address bar, type, press Enter, wait. `key_combination` arrives as a `+`-joined string like `"Control+Enter"`; `splitKeys` and `normalizeKey` break it apart and rewrite synonyms (`CTRL` to `Control`, `CMD` to `Meta`, `ARROWUP` to `ArrowUp`).

Every mapped action sets `screenshot: true` on the Steel call. The PNG comes back in the same response.

## Sending frames back

Each completed call produces two parts in a single user-role turn: a `functionResponse` that names the call and echoes the current URL, then an `inlineData` part carrying the screenshot as raw base64.

```typescript
const functionResponse: FunctionResponse = {
  name: fc.name ?? "",
  response: { url: result.url ?? this.currentUrl },
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
- **`MALFORMED_FUNCTION_CALL` with nothing else.** A known quirk of the preview model; the loop continues to the next iteration.
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
I'll navigate to steel.dev and scan the landing page for news.
navigate({"url":"https://steel.dev"})
scroll_document({"direction":"down"})
click_at({"x":520,"y":410})
Steel's latest release adds ...

============================================================
TASK EXECUTION COMPLETED
============================================================
Duration: 78.2 seconds
```

Expect roughly 60-120 seconds and 15-40 turns for a simple browsing task.

## Make it yours

- **Resize the viewport.** `viewportWidth` / `viewportHeight` in the `Agent` constructor feed both the Steel session `dimensions` and the `denormalizeX` / `denormalizeY` math.
- **Swap the model.** `this.model = "gemini-3-flash-preview"` is the only version string.
- **Tune the system prompt.** `BROWSER_SYSTEM_PROMPT` carries the browsing conventions: today's date via `formatToday()`, clear-before-typing, batch-actions-when-possible, black-screen recovery.
- **Gate safety decisions.** Replace the auto-acknowledgement branch with a human approval before the next `executeComputerAction` fires.
- **Hand off auth.** Pair this recipe with Steel's [credentials](../credentials) or [auth contexts](../auth-context) to start the session already logged in.

## Related

[Computer use docs](https://ai.google.dev/gemini-api/docs/computer-use) · [Python version](../gemini-computer-use-py) · [Anthropic equivalent](../claude-computer-use-ts) · [OpenAI equivalent](../openai-computer-use-ts)
