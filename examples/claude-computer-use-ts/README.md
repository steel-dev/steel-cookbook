# Claude Computer Use (TypeScript)

Claude sees the screen as an image and returns concrete actions at pixel coordinates: `left_click [640, 412]`, `type "steel.dev"`, `scroll down 3`. Something has to execute those actions against a real browser and send the next screenshot back. That "something" is the agent loop in `index.ts`, and the browser is a Steel session.

## The loop

The whole thing fits in one `while` block inside `Agent.executeTask`. Each iteration sends the growing message history and the computer toolset to Claude Opus 5.5:

```typescript
const response = await this.client.messages.create({
  model: this.model,
  max_tokens: 16000,
  system: this.systemPrompt,
  messages: this.messages,
  tools: this.tools,
});
```

`this.tools` holds one entry, `{ type: "computer_toolset_20260801" }`. It needs no beta header, no tool name and no display size. Claude reads the screen size from the screenshots, so its coordinates are pixels of the screenshots that you send back. The constructor turns off the actions that Steel's Input API can't do: `zoom`, `triple_click`, `left_mouse_down`, `left_mouse_up` and `hold_key`.

Claude often asks for several actions in one turn, such as a click, a `type` and a `screenshot`. Each action is its own `tool_use` block, whose `name` is the action and whose `toolset_name` is `"computer"`. `processResponse` runs them in order and returns one `tool_result` per call, each with `toolset_name: "computer"`. If an action fails, the rest of the turn is skipped, and each skipped call gets "Not executed: an earlier computer action in this turn failed." When every action succeeds and the turn didn't end with a `screenshot`, the last result also carries a fresh screenshot.

`runMember` is the translation layer. Claude's actions (`left_click`, `type`, `key`, `scroll`, ...) map onto Steel's Input API (`click_mouse`, `type_text`, `press_key`, `scroll`):

```typescript
case "left_click":
case "right_click":
case "middle_click":
case "double_click": {
  if (input.text) {
    throw new Error("Holding modifier keys during a click is not supported");
  }
  await this.act({
    action: "click_mouse",
    button:
      name === "right_click"
        ? "right"
        : name === "middle_click"
          ? "middle"
          : "left",
    coordinates: this.point(input.coordinate),
    ...(name === "double_click" ? { num_clicks: 2 } : {}),
  });
  return "OK";
}
```

A few translation details:

- **The cursor is tracked.** A click or scroll without a `coordinate` uses the last position, which starts at the center of the viewport. Steel would otherwise act at `[0, 0]`.
- **Scroll is one call per step.** Steel scrolls one wheel step per `scroll` call, whatever the delta, so `scroll_amount: 3` makes three calls.
- **Keys pass through.** Claude's key names, such as `ctrl+l` or `Return`, go to `press_key` as they are, split on `+`.
- **Modifiers on clicks and scrolls fail.** Steel's Input API can't hold a key during a click or a scroll, so `runMember` returns an error and Claude tries another way.

## Stop conditions

- **No tool calls.** Claude wrote only text. Task is complete.
- **Refusal.** Claude stopped with `stop_reason: "refusal"`.
- **Repetition.** `detectRepetition` compares the last assistant message against the previous three by word overlap (>80%).
- **Iteration cap.** 50 iterations by default.

The `finally` block in `main` always calls `agent.cleanup()`, which releases the Steel session.

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

Your output varies. One run printed:

```text
Steel + Claude Computer Use Assistant
============================================================

Starting Steel session...
Steel Session created successfully!
View live session at: https://app.steel.dev/sessions/2e5527d8-d5e6-4b50-97ff-0d1d8b7adbfe
Steel session started!
Executing task: Go to Steel.dev and find the latest news
============================================================
key({"text":"ctrl+l"})
type({"text":"steel.dev\n"})
wait({"duration":3})
screenshot({})
Let me check the Resources menu for a blog/news section.
left_click({"coordinate":[417,161]})
wait({"duration":1})
screenshot({})
...
Task complete - no further actions requested

============================================================
TASK EXECUTION COMPLETED
============================================================
Duration: 67.6 seconds
Task: Go to Steel.dev and find the latest news
Result:
The latest news on Steel.dev is a blog post from October 7, 2026, titled **"Build the agent. Don't build its computer."** It's by Nikola Balic and is a 19-minute read.
...
============================================================
Releasing Steel session...
Session completed. View replay at https://app.steel.dev/sessions/2e5527d8-d5e6-4b50-97ff-0d1d8b7adbfe
```

Expect one to two minutes for a simple browsing task.

## Make it yours

- **Change the viewport.** `viewportWidth` and `viewportHeight` in the `Agent` constructor set the Steel session dimensions. Claude reads the size from the screenshots, so nothing else changes.
- **Tune the system prompt.** `BROWSER_SYSTEM_PROMPT` is where the browsing conventions live: date injection, screenshot-after-submit rule, black-screen recovery.
- **Raise the ceiling.** Long tasks bump against the 50-iteration default in `executeTask`.
- **Hand off auth.** Pair this recipe with Steel's [credentials](../credentials-ts) or [auth contexts](../auth-context-ts) to start the session authenticated.

## Related

[Computer use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) · [Python version](../claude-computer-use-py) · [Mobile variant](../claude-computer-use-mobile)
