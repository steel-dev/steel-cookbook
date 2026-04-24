# OpenAI Computer Use (TypeScript)

OpenAI's computer-use model ships as a single tool declaration: `{ type: "computer" }`. No display dimensions, no capability flags, no schema. You hand it to the Responses API, send a screenshot, and the model returns `computer_call` items with actions like `click`, `type`, `keypress`, `scroll`. Your job is to execute them against a real browser, capture the next screenshot, and feed it back. That's the loop in `index.ts`, and the browser is a Steel session.

## The loop

The Responses API threads conversation state server-side, so each turn carries only the new tool outputs plus a `previous_response_id`. That's the shape of `Agent.executeTask`:

```typescript
const response = await createResponse({
  model: this.model,
  instructions: this.systemPrompt,
  input: nextInput,
  tools: this.tools,
  previous_response_id: previousResponseId,
  reasoning: { effort: "medium" },
  truncation: "auto",
});
```

First turn: `nextInput` is `[{ role: "user", content: task }]`. Subsequent turns: `nextInput` is just the array of tool outputs generated in the previous iteration. The model remembers the rest. `truncation: "auto"` lets OpenAI drop old screenshots from context when the window fills.

The response's `output` array mixes three item types, and the loop walks them:

- `message`: a plain text reply. The final message (when the model stops calling tools) becomes the return value.
- `reasoning`: the model's own summary of what it's thinking. Printed as plain text; not fed back as input (the Responses API handles that via `previous_response_id`).
- `computer_call`: one or more actions to execute. Each call has a `call_id` that must be echoed back in the matching `computer_call_output`.

When a turn produces zero tool outputs, the loop exits.

## Actions in, screenshots out

`executeComputerAction` is the translation layer. OpenAI's action vocabulary (`click`, `type`, `keypress`, `scroll`, `drag`, `screenshot`, `wait`) doesn't line up with Steel's Input API (`click_mouse`, `type_text`, `press_key`, `scroll`, `drag_mouse`, `take_screenshot`, `wait`). A switch statement maps one to the other:

```typescript
case "click": {
  const coords = this.toCoords(actionArgs.x, actionArgs.y);
  const button = this.mapButton(actionArgs.button);
  const clicks = this.toNumber(actionArgs.num_clicks, 1);
  body = {
    action: "click_mouse",
    button,
    coordinates: coords,
    ...(clicks > 1 ? { num_clicks: clicks } : {}),
    screenshot: true,
  };
  break;
}
```

Every mapped action sets `screenshot: true`, so Steel returns a fresh base64 PNG after the interaction. That PNG goes back as a `computer_call_output`, matched to the original call by `call_id`:

```typescript
toolOutputs.push({
  type: "computer_call_output",
  call_id: item.call_id,
  acknowledged_safety_checks: pendingChecks,
  output: {
    type: "computer_screenshot",
    image_url: `data:image/png;base64,${screenshotBase64}`,
  },
});
```

Note the `image_url` data URI. OpenAI's computer tool expects a URL (or data URI), not a raw base64 payload in a `source` field. This is one of the concrete shape differences from Anthropic's tool.

A few translation details are worth knowing:

- **`keypress` takes a list.** OpenAI emits `{ action: "keypress", keys: ["Control", "a"] }` for chords; `normalizeKey` rewrites synonyms (`CTRL` to `Control`, `CMD` to `Meta`, `ENTER` to `Enter`) before Steel sees them.
- **`scroll` is delta-based.** OpenAI sends `scroll_x`/`scroll_y` in pixels with an optional anchor. Steel's `scroll` takes `delta_x`/`delta_y` directly, so it's almost a passthrough.
- **`drag` gives a path.** OpenAI provides the full point list in `path`; Steel's `drag_mouse` wants the same shape. If the path is shorter than 2 points, the code prepends viewport center as a safe default.
- **Unknown actions fall through to `take_screenshot`.** The model occasionally emits an action type the switch doesn't handle; returning a fresh frame is the cheapest recovery.

## Safety checks

OpenAI's computer tool can attach `pending_safety_checks` to a `computer_call` when the planned action looks sensitive (exfiltration, prompt injection, irreversible state). The call won't take effect until you echo those check IDs back in `acknowledged_safety_checks`:

```typescript
const pendingChecks = item.pending_safety_checks ?? [];
for (const check of pendingChecks) {
  if (this.autoAcknowledgeSafety) {
    console.log(`Auto-acknowledging safety check: ${check.message}`);
  } else {
    throw new Error(`Safety check failed: ${check.message}`);
  }
}
```

The starter auto-acknowledges everything because the task is user-supplied and the browser runs in a throwaway Steel VM. For production, flip `autoAcknowledgeSafety` to `false` and gate each check on a human approval.

## Stop conditions

The loop has two exits:

- **No tool outputs.** The model produced only `message` and/or `reasoning`. Task complete.
- **Iteration cap.** 50 turns by default. Hitting it returns the last text the model produced.

The `finally` block in `main` always calls `agent.cleanup()`, which releases the Steel session. Forgetting this keeps the browser billed until the 15-minute `timeout` set in `initialize()`.

## Run it

```bash
cd examples/openai-computer-use-ts
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
npm install
npm start
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [platform.openai.com](https://platform.openai.com/api-keys). Override the task inline:

```bash
TASK="Find the current weather in New York City" npm start
```

A session viewer URL prints as the script starts. Open it in another tab to watch the model pilot the browser. Your output varies, but the structure looks like this:

```text
Steel Session created successfully!
View live session at: https://app.steel.dev/sessions/ab12cd34...

Executing task: Go to Steel.dev and find the latest news
============================================================
I'll navigate to steel.dev and scan the landing page.
click({"x":720,"y":48})
type({"text":"https://steel.dev"})
keypress({"keys":["Enter"]})
scroll({"x":720,"y":450,"scroll_y":600})
Steel's latest release adds ...

============================================================
TASK EXECUTION COMPLETED
============================================================
Duration: 71.4 seconds
```

Expect roughly 60-120 seconds and 15-40 turns for a simple browsing task. Cost is Steel session time plus OpenAI tokens, dominated by the screenshots (each turn sends one back).

## Make it yours

- **Change the viewport.** `viewportWidth` and `viewportHeight` in the `Agent` constructor set the Steel session `dimensions`. Unlike Anthropic's tool, OpenAI's computer declaration takes no display size, so the model infers resolution from each screenshot. Resize freely.
- **Tune reasoning effort.** `reasoning: { effort: "medium" }` in `createResponse` trades latency for planning quality. `"low"` is faster and cheaper; `"high"` is slower and more deliberate on ambiguous pages.
- **Rewrite the system prompt.** `BROWSER_SYSTEM_PROMPT` holds the browsing conventions: today's date injection, clear-input-before-typing, black-screen recovery. Edit it to match your site or workflow.
- **Hand off auth.** Computer use can act on any page the browser is already logged into. Pair this recipe with Steel's [credentials](../credentials) or [auth contexts](../auth-context) to start the session authenticated.

## Related

[Computer use guide](https://platform.openai.com/docs/guides/tools-computer-use) · [Python version](../openai-computer-use-py) · [Anthropic equivalent](../claude-computer-use-ts)
