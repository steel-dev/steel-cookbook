# Google ADK (TypeScript)

[Google ADK](https://adk.dev/) (`@google/adk`) is Google's Agent Development Kit. You build an `LlmAgent` with a Gemini model, `instruction`, and a list of `FunctionTool`s, then hand it to a `Runner`. The runner owns the loop: it appends your message to a session, calls the model, dispatches tool calls, feeds results back, and yields an async stream of `Event`s until the agent produces its final answer.

This recipe wires that tool layer to a Steel cloud browser. Three `FunctionTool`s in `index.ts` (`navigate`, `snapshot`, `extract`) drive a single Playwright page over CDP. The Steel session opens once in `main()` before the runner starts, so the tools close over a live `page` rather than spinning up a browser per call. Demo task: read the front page of Hacker News and return the top 5 stories as JSON.

```typescript
const agent = new LlmAgent({
  name: "steel_research",
  model: new Gemini({ model: "gemini-2.5-flash", apiKey: GOOGLE_API_KEY }),
  instruction: "You operate a Steel cloud browser via tools. Workflow: navigate, snapshot, extract. ...",
  tools: [navigate, snapshot, extract],
});

const runner = new InMemoryRunner({ agent });

// runTask() wraps this loop in a fresh session and retries up to three times
// when a turn ends in MALFORMED_FUNCTION_CALL or an empty answer.
for await (const event of runner.runAsync({ userId, sessionId, newMessage })) {
  if (event.errorCode) break; // transient: caught by runTask, retried
  if (isFinalResponse(event)) finalText = stringifyContent(event).trim();
}
```

The model is built as an explicit `Gemini` instance so the key comes from `GOOGLE_API_KEY`. ADK's bare-string model path (`model: "gemini-2.5-flash"`) only resolves `GOOGLE_GENAI_API_KEY` or `GEMINI_API_KEY` from the environment, so passing `apiKey` directly keeps the one variable name consistent with the rest of the cookbook.

## Run it

```bash
cd examples/google-adk-ts
cp .env.example .env          # set STEEL_API_KEY and GOOGLE_API_KEY
npm install
npm start
```

Get keys at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys) and [aistudio.google.com/apikey](https://aistudio.google.com/apikey). `main()` prints a Live View URL right after the session opens; open it in another tab to watch the page as the agent navigates and scrapes.

Each tool logs its own latency, and the event loop logs a `step:` line whenever the model emits a tool call, so you can read the agent's progress as it happens. Your output varies. Structure looks like this:

```text
Steel + Google ADK Starter
============================================================
    open-session: 1380ms
Live View: https://app.steel.dev/sessions/ab12cd34...
  step: navigate
    navigate: 690ms
  step: snapshot
    snapshot: 410ms (3820 chars, 120 links)
  step: extract
    extract: 95ms (5 rows)

Agent finished.

Top stories:
{
  "stories": [
    {
      "rank": 1,
      "title": "Show HN: ...",
      "url": "https://...",
      "points": 412
    }
  ]
}

Releasing Steel session...
Session released. Replay: https://app.steel.dev/sessions/ab12cd34...
```

A full run takes ~15-30 seconds and a few cents of Steel session time plus Gemini tokens. The `finally` block calls `steel.sessions.release()`; skip it and the session keeps billing until the default 5-minute timeout.

## How the loop reads

`runAsync` is an async generator, not a callback. Every `for await` iteration hands you one `Event`: a tool call the model wants to make, the tool's result coming back, a chunk of the model's reasoning, or the final answer. Two helpers from `@google/adk` keep the consumer thin:

- `isFinalResponse(event)` is true on the last event of the turn. That is the cue to capture the answer.
- `stringifyContent(event)` flattens an event's `content.parts` into a single string, so you do not walk the parts array by hand.

The `step:` log reads `event.content.parts` for `functionCall.name`. That is the only place the recipe inspects raw event parts; everything else leans on the two helpers. ADK logs one INFO line per event by default; `setLogLevel(LogLevel.WARN)` at startup keeps the console to the agent's own output.

`runTask` runs that loop inside a fresh session and watches `event.errorCode`. gemini-2.5-flash occasionally ends a turn with `MALFORMED_FUNCTION_CALL` or an empty answer, so the helper retries up to three times before giving up rather than failing the whole run.

One Gemini wrinkle shapes the tools: its function-declaration schema rejects numeric bounds (`exclusiveMinimum`, `maximum`) and `default`, so each tool keeps its `parameters` to plain types and applies caps and defaults inside `execute`. A `.positive()` or `.default()` left on a Zod field surfaces as a 400 from the model call.

This agent has no `outputSchema`. ADK disables tool calls when an output schema is set on an `LlmAgent`, and this agent needs its tools through the whole turn, so the prompt asks for bare JSON instead and `main()` parses the final text (stripping a stray ```json fence if the model adds one). For a turn that does not call tools, set `outputSchema` on the agent for validated typed output.

## Make it yours

- **Swap the model.** Change the `model` string passed to `Gemini`. `"gemini-2.5-pro"`, `"gemini-flash-latest"`, and other Gemini IDs all work with the same `GOOGLE_API_KEY`.
- **Swap the task.** Edit `TASK` and the JSON shape named in the agent's `instruction`. The three tools are task-agnostic; they describe a generic navigate-then-scrape flow.
- **Add a tool.** A `click` tool wrapping `page.click`, or a `screenshot` tool returning a base64 PNG. Build it with `new FunctionTool({ name, description, parameters, execute })` and add it to the agent's `tools` array.
- **Persist sessions.** Swap `InMemoryRunner` for a `Runner` with a `DatabaseSessionService` to keep conversation state across runs; the session ID is the thread key.
- **Run Vertex instead of AI Studio.** Set `GOOGLE_GENAI_USE_VERTEXAI=TRUE` plus `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION`, and construct `new Gemini({ model, vertexai: true })`.
- **Turn on stealth.** Pass `useProxy`, `solveCaptcha`, or `sessionTimeout` to `steel.sessions.create({...})` for sites with anti-bot.

## Related

[Mastra version](../mastra) · [OpenAI Agents SDK version](../openai-agents-ts) · [ADK TypeScript docs](https://adk.dev/get-started/typescript/)
