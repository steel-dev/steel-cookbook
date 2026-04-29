# Claude Computer Use (TypeScript)

Computer use is Anthropic's primitive, not a wrapper. Claude sees the screen as an image and returns concrete actions at pixel coordinates: `left_click [640, 412]`, `type "claude 4.7 opus"`, `scroll down 3`. Something has to execute those actions against a real browser and send the next screenshot back. That "something" is the agent loop in `index.ts`, and the browser is a Steel session.

## The loop

The whole thing fits in one `while` block inside `Agent.executeTask`. Each iteration sends the growing message history plus the `computer` tool definition to Claude:

```typescript
const response = await this.client.beta.messages.create({
  model: this.model,
  max_tokens: 4096,
  messages: this.messages,
  tools: this.tools,
  betas: ["computer-use-2025-11-24"],
});
```

The tool definition declares `computer_20251124` with the viewport's `display_width_px` and `display_height_px`. This is the coordinate system Claude plans in. Keep it consistent with the Steel session's `dimensions` (1280x768 here) or clicks land in the wrong place.

Claude's response is a list of content blocks. `processResponse` walks them: `text` blocks get printed, `tool_use` blocks for the `computer` tool get dispatched to `executeComputerAction`. When a turn contains no `tool_use` blocks, the loop exits. That's how the agent signals it's done.

## Actions in, screenshots out

`executeComputerAction` is the translation layer. Claude emits computer-use actions (`left_click`, `type`, `key`, `scroll`, `screenshot`, ...); Steel's Input API speaks a parallel vocabulary (`click_mouse`, `type_text`, `press_key`, `scroll`, `take_screenshot`). A switch statement maps one to the other and sends the result through `steel.sessions.computer(sessionId, body)`.

```typescript
case "left_click":
case "right_click":
case "middle_click":
case "double_click":
case "triple_click": {
  // ... build a click_mouse body with button, coordinates, num_clicks
  body = {
    action: "click_mouse",
    button: buttonMap[action],
    coordinates: coords,
    screenshot: true,
    // ...
  };
  break;
}
```

Every action sets `screenshot: true`, so Steel returns a fresh base64 PNG after each interaction. That PNG becomes the content of a `tool_result` block in the next user message:

```typescript
toolResults.push({
  type: "tool_result",
  tool_use_id: block.id,
  content: [{
    type: "image",
    source: { type: "base64", media_type: "image/png", data: screenshotBase64 },
  }],
});
```

Claude now has a new frame to reason over. The conversation grows turn by turn (assistant actions, user screenshots) until Claude stops calling tools.

A few of the translation details are worth knowing:

- **Keys get normalized.** Claude might emit `CTRL+a` or `cmd+enter`; `normalizeKey` maps synonyms (`CTRL` to `Control`, `CMD` to `Meta`, `ENTER` to `Enter`) before sending to Steel.
- **Scroll is delta-based.** Claude says `scroll_direction: "down", scroll_amount: 3`; Steel expects `delta_x`/`delta_y` in pixels. The code multiplies by 100 per step.
- **Drags default from center.** `left_click_drag` only gives an end coordinate, so the start is the viewport center. A pragmatic convention, not an Anthropic spec.

## Stop conditions

The loop has three exits:

- **No tool calls.** Claude wrote only text. Task is complete.
- **Repetition.** `detectRepetition` compares the last assistant message against the previous three by word overlap (>80%). Models occasionally loop on ambiguous states; this catches that cheaply.
- **Iteration cap.** 50 iterations by default. Hitting it prints a warning and returns whatever text was last produced.

The `finally` block in `main` always calls `agent.cleanup()`, which releases the Steel session. Forgetting this keeps the browser billed until the 15-minute timeout set in `initialize()`.

## Run it

```bash
cd examples/claude-computer-use-ts
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
npm install
npm start
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [console.anthropic.com](https://console.anthropic.com/). Override the task inline:

```bash
TASK="Find the current weather in New York City" npm start
```

A session viewer URL prints as the script starts. Open it in another tab to watch Claude pilot the browser. Your output varies, but the structure looks like this:

```text
Steel Session created successfully!
View live session at: https://app.steel.dev/sessions/ab12cd34...

Executing task: Go to Steel.dev and find the latest news
============================================================
I'll navigate to Steel.dev and look for the latest news.
computer({"action":"screenshot"})
computer({"action":"left_click","coordinate":[640,48]})
computer({"action":"type","text":"https://steel.dev"})
computer({"action":"key","text":"Return"})
...
Task complete - no further actions requested

TASK EXECUTION COMPLETED
Duration: 84.3 seconds
Result: Steel's latest news includes ...
```

Expect ~60-120 seconds and on the order of 15-40 iterations for a simple browsing task. Cost is Steel session time plus Anthropic tokens. Screenshots are the expensive part of the token bill.

## Make it yours

- **Change the viewport.** `viewportWidth` and `viewportHeight` in the `Agent` constructor set both the Steel session dimensions and the tool definition's `display_width_px`/`display_height_px`. Keep them in sync.
- **Tune the system prompt.** `BROWSER_SYSTEM_PROMPT` is where the browsing conventions live: date injection, screenshot-after-submit rule, black-screen recovery. Edit it to match your site or workflow.
- **Raise the ceiling.** Long tasks bump against the 50-iteration default in `executeTask`. The third argument lets you lift it.
- **Hand off auth.** Computer use can act on any page the browser is already logged into. Pair this recipe with Steel's [credentials](../credentials) or [auth contexts](../auth-context) to start the session authenticated.

## Related

[Computer use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) · [Python version](../claude-computer-use-py) · [Mobile variant](../claude-computer-use-mobile)
