# Gemini Computer Use (TypeScript)

Gemini exposes computer use as a built-in tool type, not a hand-written schema. You set `config.tools = [{ computerUse: { environment: Environment.ENVIRONMENT_BROWSER } }]` on a `generateContent` call and the model plans against a fixed action vocabulary (`click_at`, `type_text_at`, `navigate`, `scroll_document`, `search`, `drag_and_drop`, `key_combination`, ...) with coordinates in a normalized 0-1000 grid. You never declare the viewport to Gemini. You do have to denormalize its coordinates to pixels, fan a few of its compound actions into several Steel calls, and return each screenshot as `inlineData`. That's the translator in `index.ts`, wrapped around a Steel session.

The model defaults to `gemini-3-flash-preview`. Conversation state lives entirely on your side, appended to `this.contents` turn by turn.

## The translator

`Agent.executeComputerAction` is where Gemini's action names meet Steel's Input API. They overlap conceptually but rarely line up one-to-one, so the switch is where most of the design decisions sit.

Coordinates come first. Gemini plans in a 1000x1000 normalized grid regardless of the browser dimensions; `denormalizeX` and `denormalizeY` scale back to pixels off `viewportWidth`/`viewportHeight` (1440x900 by default).

```typescript
private denormalizeX(x: number): number {
  return Math.round((x / MAX_COORDINATE) * this.viewportWidth);
}
```

A click at `(500, 500)` from the model lands at `(720, 450)` on a 1440x900 session. These two fields also set the Steel `dimensions`, so they're the single source of truth for the viewport. Change them in one place.

Several of Gemini's actions are compound; the starter expands them. `type_text_at` takes `x`, `y`, `text`, plus optional `press_enter` and `clear_before_typing` flags and fans into click, Ctrl+A, Backspace, type_text, Enter, wait, screenshot. `navigate` and `search` skip the URL bar hunt by doing the Chrome `Ctrl+L` trick: focus the address bar, type, press Enter, wait. `scroll_document` splits `up`/`down` into `PageUp`/`PageDown` keystrokes and `left`/`right` into pixel-delta `scroll` calls. `key_combination` arrives as a `+`-joined string like `"Control+Enter"`; `splitKeys` and `normalizeKey` break it apart and rewrite synonyms (`CTRL` to `Control`, `CMD` to `Meta`, `ARROWUP` to `ArrowUp`, `F1`-`F12` passthrough) before it reaches Steel.

`open_web_browser` is a no-op. Steel hands you a browser already open, so the mapping just takes a screenshot and returns.

Every other mapped action sets `screenshot: true` on the Steel call. The PNG comes back in the same response, avoiding a follow-up `take_screenshot`.

## Sending frames back

This is where Gemini diverges hardest from Anthropic's `tool_result` and OpenAI's `computer_call_output`. Each completed call produces two parts in a single user-role turn: a `functionResponse` that names the call and echoes the current URL, then an `inlineData` part carrying the screenshot as raw base64.

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

No `call_id` to match, no `data:image/png;base64,` URL prefix, no separate `source` wrapper. The whole batch is built in `buildFunctionResponseParts` and pushed onto `this.contents` as one `role: "user"` entry. Get the shape wrong and the next turn either hallucinates or stalls; this is the main thing worth inspecting if the model loses the plot.

## The loop itself

`Agent.executeTask` alternates between calling `generateContent` and replaying the result. Each response's first candidate is split two ways:

- `extractFunctionCalls` collects `part.functionCall` entries.
- `extractText` collects `part.text`, with a regex (`/^[\s\d]*$/`) that drops stray digit-only parts Gemini 3 Flash occasionally emits alongside real reasoning.

The raw `candidate.content` is appended to `this.contents` as-is, so the model sees its own plan on the next call.

Four exits, in rough order of frequency:

- **Text, no function calls.** The model wrote a final message. Loop breaks and that text becomes the return value.
- **Empty turn.** No calls, no text. `consecutiveNoActions` increments. Three in a row stops the loop.
- **`MALFORMED_FUNCTION_CALL` with nothing else.** A known quirk of the preview model. The loop simply continues to the next iteration.
- **Iteration cap.** 50 turns by default (third argument to `executeTask`).

After the loop, a reverse walk over `this.contents` pulls the last `role: "model"` text, again filtering stray-digit parts, as the returned summary.

The `finally` in `main` calls `agent.cleanup()`, which releases the Steel session. Skipping it keeps the browser billed until the 15-minute `timeout` set in `initialize()`.

## Safety decisions

Gemini doesn't return a separate safety-checks array. When an action looks sensitive, the model attaches a `safety_decision` object _inside_ the function call's own `args`. The starter inspects it during dispatch:

```typescript
const safetyDecision = actionArgs.safety_decision as
  | Record<string, unknown>
  | undefined;
if (safetyDecision?.decision === "require_confirmation") {
  console.log(`Safety confirmation required: ${safetyDecision.explanation}`);
  console.log("Auto-acknowledging safety check");
}
```

There's no check ID to echo back. Logging the explanation and proceeding is the protocol. For production, gate the `executeComputerAction` call behind a human when `decision === "require_confirmation"`; the safety block runs right before dispatch.

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

A session viewer URL prints as the script starts. Open it in another tab to watch Gemini pilot the browser. Your output varies. Structure looks like this:

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

Expect roughly 60-120 seconds and 15-40 turns for a simple browsing task. Cost is Steel session time plus Gemini tokens, dominated by the per-turn `inlineData` screenshots.

## Make it yours

- **Resize the viewport.** `viewportWidth` / `viewportHeight` in the `Agent` constructor feed both the Steel session `dimensions` and the `denormalizeX` / `denormalizeY` math. Nothing in the tool declaration needs to change.
- **Swap the model.** `this.model = "gemini-3-flash-preview"` is the only version string. Point it at another checkpoint that supports computer use without touching the loop.
- **Tune the system prompt.** `BROWSER_SYSTEM_PROMPT` carries the browsing conventions: today's date via `formatToday()`, clear-before-typing, batch-actions-when-possible, black-screen recovery. Edit it for your site or workflow.
- **Gate safety decisions.** Replace the auto-acknowledgement branch with a human approval before the next `executeComputerAction` fires.
- **Hand off auth.** Pair this recipe with Steel's [credentials](../credentials) or [auth contexts](../auth-context) to start the session already logged in; computer use then just uses what the browser can already see.

## Related

[Computer use docs](https://ai.google.dev/gemini-api/docs/computer-use) - [Python version](../gemini-computer-use-py) - [Anthropic equivalent](../claude-computer-use-ts) - [OpenAI equivalent](../openai-computer-use-ts)
