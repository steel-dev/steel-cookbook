# Claude Computer Use (Mobile)

Mobile-emulated Chrome, driven by Claude's computer toolset. The agent loop is the same as the [Desktop TS](../claude-computer-use-ts) recipe (screenshot in, coordinate out, next screenshot back), but three things change when the surface is a phone: Steel allocates the viewport instead of you, Playwright drives the page over CDP instead of Steel's Input API, and every coordinate is clamped before it touches the browser.

## Mobile session, Playwright driver

`SteelBrowser.initialize` asks Steel for a mobile device and connects Playwright to the returned CDP socket:

```typescript
this.session = await this.client.sessions.create({
  timeout: 900000,
  deviceConfig: { device: "mobile" },
});

const cdpUrl = this.session.websocketUrl;
this.browser = await chromium.connectOverCDP(cdpUrl, { timeout: 60000 });
this.page = this.browser.contexts()[0].pages()[0];
```

`deviceConfig.device: "mobile"` tells Steel to spin up Chrome with a mobile user agent, mobile viewport, and touch-capable device metrics.

Claude Opus 5.5 gets one tool entry, `{ type: "computer_toolset_20260801" }`, with no beta header and no display size. It often asks for several actions in one turn. `processResponse` runs them in order and answers each with a `tool_result` that carries `toolset_name: "computer"`, as in the [Desktop TS](../claude-computer-use-ts) recipe.

The switch in `executeComputerAction` maps each action onto Playwright calls: `left_click` becomes `page.mouse.click(x, y)`, `type` chunks through `page.keyboard.type` with a 12 ms delay per keystroke, `scroll` multiplies `scroll_amount` by 100 and calls `page.mouse.wheel`, `key` splits on `+` so `ctrl+a` routes through `CUA_KEY_TO_PLAYWRIGHT_KEY` into real modifier-plus-key presses. Playwright can hold keys, so modifiers in `text` work on clicks, scrolls and drags, and `hold_key`, `triple_click`, `left_mouse_down` and `left_mouse_up` all run. Only `zoom` is turned off.

## Dimensions come from the session

Desktop recipes hard-code the viewport in the constructor. Mobile inverts that: the constructor holds a placeholder until Steel says what device it allocated.

```typescript
constructor(startUrl: string = "https://amazon.com") {
  this.dimensions = [1920, 1080]; // placeholder
  // ...
}

async initialize() {
  this.session = await this.client.sessions.create(sessionParams);
  this.dimensions = [
    this.session.dimensions.width,
    this.session.dimensions.height,
  ];
  await this.page.setViewportSize({ width, height });
}
```

`ClaudeAgent` reads those dimensions back through `computer.getDimensions()` and writes them into the system prompt. Order matters. Instantiate `ClaudeAgent` before `computer.initialize()` completes and the agent captures the placeholder while the real page is rendered at the mobile size Steel picked.

The toolset takes no display size. Claude's coordinates are pixels of the screenshots that it gets, so `screenshot` passes `scale: "css"` to Playwright. A screenshot then has one pixel per CSS pixel of the viewport, whatever the phone's pixel ratio, and a click lands where Claude saw the target.

## Clamping coordinates

Phone targets are small. `clampCoordinates` pins every incoming coordinate to `[0, width - 1] x [0, height - 1]` and logs when it has to:

```typescript
private clampCoordinates(x: number, y: number): [number, number] {
  const clampedX = Math.max(0, Math.min(x, width - 1));
  const clampedY = Math.max(0, Math.min(y, height - 1));
  if (x !== clampedX || y !== clampedY) {
    console.log(`Coordinate clamped: (${x}, ${y}) → (${clampedX}, ${clampedY})`);
  }
  return [clampedX, clampedY];
}
```

Frequent clamps mean the screenshots no longer match the viewport.

## Completion markers

The system prompt instructs Claude to end every run with `TASK_COMPLETED:`, `TASK_FAILED:`, or `TASK_ABANDONED:`. `isTaskComplete` scans each assistant turn for those tokens first, then falls back to natural-language patterns. The loop also exits when Claude stops with `stop_reason: "refusal"`, on `detectRepetition`, and at a 50-iteration cap.

## Run it

```bash
cd examples/claude-computer-use-mobile
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
npm install
npm start
```

Keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [console.anthropic.com](https://console.anthropic.com/). Override the task inline:

```bash
TASK="Open amazon.com and find the price of an iPhone 16 Pro Max" npm start
```

Your output varies. One run printed:

```text
Steel + Claude Computer Use Assistant
============================================================

Starting Steel browser session...
Steel Session created successfully!
View live session at: https://app.steel.dev/sessions/35a951cd-9097-4d20-aaa6-2c564327cc75
Steel browser session started!
Executing task: Go to amazon.com, search for 'iPhone 16 Pro Max', find the product page,
    and extract the current price and availability status
    Note: Don't open new tabs or pages, always stay in the same page.
============================================================
screenshot({})
Taking screenshot with dimensions: 508x1074
left_click({"coordinate":[220,121]})
type({"text":"iPhone 16 Pro Max\n"})
wait({"duration":3})
screenshot({})
Taking screenshot with dimensions: 508x1074
...
TASK_COMPLETED: Found a renewed iPhone 16 Pro Max (256GB, Black Titanium, Unlocked) on Amazon at $692.00, in stock with only 3 left.
Task complete - no further actions requested

============================================================
TASK EXECUTION COMPLETED
============================================================
Duration: 42.3 seconds
...
Releasing Steel session...
Session completed. View replay at https://app.steel.dev/sessions/35a951cd-9097-4d20-aaa6-2c564327cc75
```

Expect one to three minutes for a typical mobile browse.

## Make it yours

- **Change the start URL.** `SteelBrowser` defaults to `https://amazon.com`. Pass a different URL to the constructor in `main`.
- **Tighten or loosen the blocklist.** `BLOCKED_DOMAINS` flows through `context.route`.
- **Tune the system prompt.** `SYSTEM_PROMPT` teaches Claude the mobile conventions. The `<COORDINATE_SYSTEM>` block is rewritten at runtime with the live viewport numbers.
- **Persist a login.** Pass `sessionContext` into `sessions.create` to resume with cookies and local storage. See [credentials](../credentials-ts).
- **Raise the iteration cap.** `maxIterations = 50` in `executeTask` is conservative for long mobile flows.

## Related

[Desktop TS](../claude-computer-use-ts) · [Desktop Python](../claude-computer-use-py) · [Computer use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) · [Playwright docs](https://playwright.dev)
