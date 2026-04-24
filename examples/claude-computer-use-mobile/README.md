# Claude Computer Use (Mobile)

Mobile-emulated Chrome, driven by Claude's computer-use tool. The agent loop is the same as the [Desktop TS](../claude-computer-use-ts) recipe (screenshot in, coordinate out, next screenshot back), but three things change when the surface is a phone: Steel allocates the viewport instead of you, Playwright drives the page over CDP instead of Steel's Input API, and every coordinate is clamped before it touches the browser. Those differences are what this recipe walks through. If you want the loop mechanics and tool-definition details, read the desktop README first.

## Mobile session, Playwright driver

`SteelBrowser.initialize` asks Steel for a mobile device and connects Playwright to the returned CDP socket:

```typescript
this.session = await this.client.sessions.create({
  apiTimeout: 900000,
  solveCaptcha: false,
  deviceConfig: { device: "mobile" },
});

const cdpUrl = `${this.session.websocketUrl}&apiKey=${STEEL_API_KEY}`;
this.browser = await chromium.connectOverCDP(cdpUrl, { timeout: 60000 });
this.page = this.browser.contexts()[0].pages()[0];
```

`deviceConfig.device: "mobile"` tells Steel to spin up Chrome with a mobile user agent, mobile viewport, and touch-capable device metrics. The page that comes back renders mobile layouts, serves mobile-tuned assets, and fires touch events when you click.

Choosing Playwright over Steel's Input API buys two things. `context.route` intercepts every request against a `BLOCKED_DOMAINS` list and aborts matches before they leave the browser. And `SteelBrowser.screenshot` falls back to `Page.captureScreenshot` over a raw CDP session when Playwright's capture trips, which happens occasionally on backgrounded tabs in mobile emulation.

The action switch in `executeComputerAction` maps Claude's computer-use vocabulary onto Playwright calls: `left_click` becomes `page.mouse.click(x, y)`, `type` chunks through `page.keyboard.type` with a 12 ms delay per keystroke (50-char groups), `scroll` multiplies `scroll_amount` by 100 and calls `page.mouse.wheel`, and `key` splits on `+` so `ctrl+a` routes through `CUA_KEY_TO_PLAYWRIGHT_KEY` into real modifier-plus-key presses. Taps stay as `left_click`: Playwright synthesizes a mouse event, mobile Chrome turns it into a touch downstream. No real multitouch, but tap and swipe flows work transparently.

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

`ClaudeAgent` reads those dimensions back through `computer.getDimensions()` and threads them into both the system prompt and the `computer_20251124` tool definition:

```typescript
const [width, height] = computer.getDimensions();
this.tools = [{
  type: TOOL_TYPE,
  name: "computer",
  display_width_px: width,
  display_height_px: height,
  display_number: 1,
}];
```

Order matters. Instantiate `ClaudeAgent` before `computer.initialize()` completes and the agent captures the 1920x1080 placeholder while the real page is rendered at the mobile size Steel picked. Claude then plans pixels against a canvas that doesn't exist, and every click lands wrong.

## Clamping and coordinates

Phone targets are small. Buttons sit at the edge of the viewport, tap regions overlap, and Claude sometimes overshoots the rendered width by a pixel when it aims for a trailing icon. `clampCoordinates` pins every incoming coordinate to `[0, width - 1] x [0, height - 1]` and logs when it has to:

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

`validateAndGetCoordinates` wraps it for click, move, drag, and scroll targets. Occasional clamps are fine; frequent clamps mean the tool definition and the session's real dimensions have drifted. Check that the values you inject into `this.tools` match `session.dimensions` exactly.

`validateScreenshotDimensions` is the paranoid companion. After a `screenshot` action it re-reads the viewport and compares it to what the agent thinks it's looking at. It currently logs rather than rejects, so treat it as a debug signal, not a guard.

## Completion markers

The system prompt in `SYSTEM_PROMPT` instructs Claude to end every run with `TASK_COMPLETED:`, `TASK_FAILED:`, or `TASK_ABANDONED:`. `isTaskComplete` inside `executeTask` scans each assistant turn for those tokens first, then falls back to natural-language patterns (`task completed`, `unable to proceed`, `in conclusion`, etc.). The loop also exits on `detectRepetition` (>80% word overlap across the last three assistant messages) and a 50-iteration cap, same as the desktop version.

## Run it

```bash
cd examples/claude-computer-use-mobile
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
npm install
npm start
```

Keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [console.anthropic.com](https://console.anthropic.com/). The session viewer URL prints at startup, open it in another tab to watch the mobile Chrome navigate live. Override the task inline:

```bash
TASK="Open amazon.com and find the price of an iPhone 16 Pro Max" npm start
```

Your output varies. Structure looks like this:

```text
Steel Session created successfully!
View live session at: https://app.steel.dev/sessions/ab12cd34...

Executing task: Go to amazon.com, search for 'iPhone 16 Pro Max'...
============================================================
I'll start by taking a screenshot to see the current state.
computer({"action":"screenshot"})
Taking screenshot with dimensions: 390x844
computer({"action":"left_click","coordinate":[195,120]})
computer({"action":"type","text":"iPhone 16 Pro Max"})
...
TASK_COMPLETED: iPhone 16 Pro Max is $1,199 and in stock.

TASK EXECUTION COMPLETED
Duration: 96.4 seconds
```

Expect ~60-180 seconds and 15-40 iterations for a typical mobile browse. Every screenshot rides in the message history as a base64 PNG, so token cost scales with iteration count. The `finally` block calls `computer.cleanup()`, which releases the session; the 15-minute `apiTimeout` in `sessions.create` is the safety net if that slips.

## Make it yours

- **Change the start URL.** `SteelBrowser` defaults to `https://amazon.com`. Pass a different URL to the constructor in `main`, or edit `startUrl` to match your target.
- **Tighten or loosen the blocklist.** `BLOCKED_DOMAINS` flows through `context.route`. Add hosts to block (subdomains match via `.endsWith`), remove them to open access.
- **Tune the system prompt.** `SYSTEM_PROMPT` teaches Claude the mobile conventions: respect coordinate bounds, never tap browser UI, declare `TASK_COMPLETED:` when done. The `<COORDINATE_SYSTEM>` block is rewritten at runtime with the live viewport numbers, so your edits merge with the injected dimensions.
- **Persist a login.** Pass `sessionContext` into `sessions.create` to resume with cookies and local storage. Useful when the mobile site is gated behind auth. See [credentials](../credentials).
- **Raise the iteration cap.** `maxIterations = 50` in `executeTask` is conservative for long mobile flows with lots of scrolling. The fourth argument to `agent.executeTask` lifts it.

## Related

[Desktop TS](../claude-computer-use-ts) · [Desktop Python](../claude-computer-use-py) · [Computer use docs](https://platform.claude.com/docs/en/agents-and-tools/tool-use/computer-use-tool) · [Playwright docs](https://playwright.dev)
