# OpenAI Computer Use (TypeScript)

OpenAI's computer-use model ships as a single tool declaration: `{ type: "computer" }`. You hand it to the Responses API, send a screenshot, and the model returns `computer_call` items with actions like `click`, `type`, `keypress`, `scroll`. Your job is to execute them against a real browser, capture the next screenshot, and feed it back.

## The loop

The Responses API threads conversation state server-side, so each turn carries only the new tool outputs plus a `previous_response_id`:

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

First turn: `nextInput` is `[{ role: "user", content: task }]`. Subsequent turns: `nextInput` is just the array of tool outputs from the previous iteration.

The response's `output` array mixes three item types:

- `message`: a plain text reply. The final message becomes the return value.
- `reasoning`: the model's own summary; printed but not fed back.
- `computer_call`: one or more actions to execute. Each call has a `call_id` that must be echoed back in the matching `computer_call_output`.

## Actions in, screenshots out

`executeComputerAction` is the translation layer:

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

The screenshot goes back as a `computer_call_output`, matched by `call_id`:

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

A few translation details:

- **`keypress` takes a list.** `normalizeKey` rewrites synonyms (`CTRL` to `Control`, `CMD` to `Meta`, `ENTER` to `Enter`).
- **`scroll` is delta-based.** OpenAI sends `scroll_x`/`scroll_y` in pixels. Steel's `scroll` takes `delta_x`/`delta_y` directly.
- **`drag` gives a path.** OpenAI provides the full point list in `path`; Steel's `drag_mouse` wants the same shape.
- **Unknown actions fall through to `take_screenshot`.**

## Safety checks

A `computer_call` can attach `pending_safety_checks` when the planned action looks sensitive. The call won't take effect until you echo those check IDs back in `acknowledged_safety_checks`. The starter auto-acknowledges everything; for production, flip `autoAcknowledgeSafety` to `false` and gate each check on a human approval.

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

Your output varies. Structure looks like this:

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

Expect roughly 60-120 seconds and 15-40 turns for a simple browsing task.

## Make it yours

- **Change the viewport.** `viewportWidth` and `viewportHeight` in the `Agent` constructor set the Steel session `dimensions`.
- **Swap the model.** The default is `gpt-5.5`. Update `this.model` in the `Agent` constructor.
- **Tune reasoning effort.** `reasoning: { effort: "medium" }` trades latency for planning quality.
- **Rewrite the system prompt.** `BROWSER_SYSTEM_PROMPT` holds the browsing conventions.
- **Persist a login.** Pass `sessionContext` to `sessions.create`. See [credentials](../credentials) and [auth-context](../auth-context).
- **Turn off auto-ack.** Flip `autoAcknowledgeSafety` to `false` to make pending safety checks raise.

## Related

[Computer use guide](https://platform.openai.com/docs/guides/tools-computer-use) · [Python version](../openai-computer-use-py) · [Anthropic equivalent](../claude-computer-use-ts)
