import * as dotenv from "dotenv";
import * as readline from "readline";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { OpenAI } from "openai";
import { Steel } from "steel-sdk";
import { MODIFIERS, PLAYWRIGHT_KEYS } from "./const";

dotenv.config();

interface ResponseItem {
  type: string;
  id: string;
}

interface MessageResponseItem extends ResponseItem {
  type: "message";
  role: "assistant";
  content: {
    type: "output_text";
    text: string;
  }[];
}

interface ComputerCallResponseItem extends ResponseItem {
  type: "computer_call";
  call_id: string;
  action: {
    type: string;
    [key: string]: any;
  };
  pending_safety_checks?: string[];
}

interface FunctionCallResponseItem extends ResponseItem {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}

type ResponseOutputItem =
  | MessageResponseItem
  | ComputerCallResponseItem
  | FunctionCallResponseItem;

interface Response {
  id: string;
  output: ResponseOutputItem[];
}

/**
 * SteelBrowser class for interacting with a Steel browser session
 * This class provides methods to control a browser using Steel's API
 */
class SteelBrowser {
  environment = "browser" as const;
  dimensions = { width: 1024, height: 768 };

  private client: Steel;
  private session: any;
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor() {
    this.client = new Steel({
      steelAPIKey: process.env.STEEL_API_KEY,
      baseURL: process.env.STEEL_API_URL,
    });
  }

  async initialize(): Promise<void> {
    this.session = await this.client.sessions.create({
      useProxy: false,
      solveCaptcha: false,
      blockAds: true,
      dimensions: this.dimensions,
    });
    console.log(`Session created: ${this.session.sessionViewerUrl}`);

    const connectUrl =
      process.env.STEEL_CONNECT_URL || "wss://connect.steel.dev";
    const cdpUrl = `${connectUrl}?apiKey=${process.env.STEEL_API_KEY}&sessionId=${this.session.id}`;

    try {
      this.browser = await chromium.connectOverCDP(cdpUrl, {
        timeout: 60000, // 60 second timeout
      });

      const context = this.browser.contexts()[0];
      this.page = context.pages()[0];
      await this.page.goto("https://google.com");
    } catch (error) {
      console.error("Error connecting to Steel session:", error);

      // Clean up if connection fails
      if (this.session) {
        try {
          await this.client.sessions.release(this.session.id);
          console.log(`Session released due to connection error`);
        } catch (releaseError) {
          console.error("Error releasing session:", releaseError);
        }
      }

      throw error;
    }
  }

  async applySameTabScript(): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    await this.page.addInitScript(
      `
      window.addEventListener('load', () => {
          // Initial cleanup
          document.querySelectorAll('a[target="_blank"]').forEach(a => a.target = '_self');
          
          // Watch for dynamic changes
          const observer = new MutationObserver((mutations) => {
              mutations.forEach((mutation) => {
                  if (mutation.addedNodes) {
                      mutation.addedNodes.forEach((node) => {
                          if (node.nodeType === 1) { // ELEMENT_NODE
                              // Check the added element itself
                              if (node.tagName === 'A' && node.target === '_blank') {
                                  node.target = '_self';
                              }
                              // Check any anchor children
                              node.querySelectorAll('a[target="_blank"]').forEach(a => a.target = '_self');
                          }
                      });
                  }
              });
          });
          
          observer.observe(document.body, {
              childList: true,
              subtree: true
          });
      });
      `
    );
  }

  async cleanup(): Promise<void> {
    if (this.page) await this.page.close();
    if (this.browser) await this.browser.close();
    if (this.session) {
      await this.client.sessions.release(this.session.id);
      console.log(`Session ended: ${this.session.sessionViewerUrl}`);
    }
  }

  async screenshot(): Promise<string> {
    if (!this.page) throw new Error("Page not initialized");

    try {
      const cdpSession = await this.page.context().newCDPSession(this.page);
      const result = await cdpSession.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
      });
      return result.data;
    } catch (e) {
      const buffer = await this.page.screenshot();
      return buffer.toString("base64");
    }
  }

  async click(
    x: number | string,
    y: number | string,
    button: string = "left"
  ): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    const parsedX = typeof x === "string" ? parseInt(x, 10) : x;
    const parsedY = typeof y === "string" ? parseInt(y, 10) : y;

    if (isNaN(parsedX) || isNaN(parsedY)) {
      throw new Error(`Invalid coordinates: x=${x}, y=${y}`);
    }

    if (button == "wheel") {
      await this.page.mouse.wheel(parsedX, parsedY);
      return;
    }

    await this.page.mouse.click(parsedX, parsedY, {
      button: button as "left" | "right" | "middle",
    });
  }

  async doubleClick(x: number | string, y: number | string): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    const parsedX = typeof x === "string" ? parseInt(x, 10) : x;
    const parsedY = typeof y === "string" ? parseInt(y, 10) : y;

    if (isNaN(parsedX) || isNaN(parsedY)) {
      throw new Error(`Invalid coordinates: x=${x}, y=${y}`);
    }

    await this.page.mouse.dblclick(parsedX, parsedY);
  }

  /**
   * Scroll the page
   */
  async scroll(
    x: number | string,
    y: number | string,
    scrollX: number | string,
    scrollY: number | string
  ): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    const parsedX = typeof x === "string" ? parseInt(x, 10) : x;
    const parsedY = typeof y === "string" ? parseInt(y, 10) : y;
    const parsedScrollX =
      typeof scrollX === "string" ? parseInt(scrollX, 10) : scrollX;
    const parsedScrollY =
      typeof scrollY === "string" ? parseInt(scrollY, 10) : scrollY;

    if (
      isNaN(parsedX) ||
      isNaN(parsedY) ||
      isNaN(parsedScrollX) ||
      isNaN(parsedScrollY)
    ) {
      throw new Error(`Invalid scroll parameters`);
    }

    await this.page.mouse.move(parsedX, parsedY);
    await this.page.evaluate(
      ({ scrollX, scrollY }) => {
        window.scrollBy(scrollX, scrollY);
      },
      { scrollX: parsedScrollX, scrollY: parsedScrollY }
    );
  }

  async type(text: string): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    await this.page.keyboard.type(text);
  }

  async wait(ms: number = 1000): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async move(x: number | string, y: number | string): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    const parsedX = typeof x === "string" ? parseInt(x, 10) : x;
    const parsedY = typeof y === "string" ? parseInt(y, 10) : y;

    if (isNaN(parsedX) || isNaN(parsedY)) {
      throw new Error(`Invalid coordinates: x=${x}, y=${y}`);
    }

    await this.page.mouse.move(parsedX, parsedY);
  }

  async keypress(keys: string[]): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");

    if (MODIFIERS[keys[0]]) {
      await this.page.keyboard.down(MODIFIERS[keys[0].toUpperCase()]);
      for (const k of keys.slice(1)) {
        await this.page.keyboard.press(k);
      }
      await this.page.keyboard.up(MODIFIERS[keys[0].toUpperCase()]);
    }

    for (const k of keys) {
      let key = PLAYWRIGHT_KEYS[k.toUpperCase()] || k;
      if (!key) {
        throw new Error(`Invalid key: ${k}`);
      }
      await this.page.keyboard.press(key);
    }
  }

  async drag(
    path: Array<{ x: number | string; y: number | string }>
  ): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    if (path.length === 0) return;

    const parsedPath = path.map((point) => {
      const x = typeof point.x === "string" ? parseInt(point.x, 10) : point.x;
      const y = typeof point.y === "string" ? parseInt(point.y, 10) : point.y;

      if (isNaN(x) || isNaN(y)) {
        throw new Error(`Invalid path coordinates`);
      }

      return { x, y };
    });

    await this.page.mouse.move(parsedPath[0].x, parsedPath[0].y);
    await this.page.mouse.down();

    for (const point of parsedPath.slice(1)) {
      await this.page.mouse.move(point.x, point.y);
    }

    await this.page.mouse.up();
  }

  getCurrentUrl(): string {
    if (!this.page) throw new Error("Page not initialized");
    return this.page.url();
  }

  async back(): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    await this.page.goBack();
  }

  async goto(url: string): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    await this.page.goto(url);
  }

  async refresh(): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    await this.page.reload();
  }
}

/**
 * Check if an item is a computer call
 */
function isComputerCall(item: any): item is ComputerCallResponseItem {
  return (
    item?.type === "computer_call" && "action" in item && "call_id" in item
  );
}

async function executeAction(
  browser: SteelBrowser,
  action: ComputerCallResponseItem["action"]
): Promise<void> {
  const actionType = action.type;

  try {
    if (actionType === "click") {
      let x, y, button;

      if (
        (action.x === "left" ||
          action.x === "right" ||
          action.x === "middle") &&
        typeof action.y === "number"
      ) {
        x = action.button ?? 0;
        y = action.y;
        button = action.x;
      } else {
        x = action.x ?? 0;
        y = action.y ?? 0;
        button = action.button ?? "left";
      }

      await browser.click(x, y, button);
    } else if (actionType === "goto" && action.url) {
      await browser.goto(action.url);
    } else if (actionType === "back") {
      await browser.back();
    } else if (actionType === "refresh") {
      await browser.refresh();
    } else if (actionType === "doubleClick" || actionType === "double_click") {
      await browser.doubleClick(action.x ?? 0, action.y ?? 0);
    } else if (actionType === "move") {
      await browser.move(action.x ?? 0, action.y ?? 0);
    } else if (actionType === "scroll") {
      await browser.scroll(
        action.x ?? 0,
        action.y ?? 0,
        action.scrollX ?? action.scroll_x ?? 0,
        action.scrollY ?? action.scroll_y ?? 0
      );
    } else if (actionType === "type") {
      await browser.type(action.text || "");
    } else if (actionType === "keypress") {
      await browser.keypress(action.keys || []);
    } else if (actionType === "drag") {
      await browser.drag(action.path || []);
    } else if (actionType === "wait") {
      await browser.wait(action.ms ?? 1000);
    } else if (actionType === "screenshot") {
      // Just take a screenshot, no additional action needed
    } else {
      const actionParams = Object.fromEntries(
        Object.entries(action).filter(([key]) => key !== "type")
      );
      await (browser as any)[actionType](...Object.values(actionParams));
    }

    console.log(`Executed action: ${actionType}`);
  } catch (error) {
    console.error(`Error executing ${actionType} action:`, error);
    throw error;
  }
}

/**
 * Send a screenshot back to the model
 */
async function sendScreenshot(
  client: OpenAI,
  browser: SteelBrowser,
  responseId: string,
  callId: string,
  safetyChecks: string[] = []
): Promise<Response> {
  const screenshot = await browser.screenshot();

  return client.responses.create({
    model: "computer-use-preview",
    previous_response_id: responseId,
    tools: [
      {
        type: "computer-preview" as const,
        display_width: browser.dimensions.width,
        display_height: browser.dimensions.height,
        environment: browser.environment,
      },
    ],
    input: [
      {
        type: "computer_call_output",
        call_id: callId,
        acknowledged_safety_checks: safetyChecks.map((check) => ({
          id: check,
          code: check,
          message: `Acknowledged: ${check}`,
        })),
        output: {
          type: "computer_screenshot",
          image_url: `data:image/png;base64,${screenshot}`,
        },
      },
    ],
    truncation: "auto",
  }) as Promise<Response>;
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Main function to run the CUA loop
 */
async function runCuaLoop(): Promise<void> {
  const task = await new Promise<string>((resolve) =>
    rl.question("What task should the assistant perform? ", resolve)
  );

  const browser = new SteelBrowser();

  try {
    await browser.initialize();

    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const tools = [
      {
        type: "computer-preview" as const,
        display_width: browser.dimensions.width,
        display_height: browser.dimensions.height,
        environment: browser.environment,
      },
    ];

    // Initial request to OpenAI
    const response = (await client.responses.create({
      model: "computer-use-preview",
      tools,
      input: [{ role: "user", content: task }],
      reasoning: {
        generate_summary: "concise",
      },
      truncation: "auto",
    })) as Response;

    // Process first response
    const computerCalls = response.output.filter(isComputerCall);

    if (computerCalls.length > 0) {
      const compCall = computerCalls[0];
      await executeAction(browser, compCall.action);
      const nextResponse = await sendScreenshot(
        client,
        browser,
        response.id,
        compCall.call_id,
        compCall.pending_safety_checks || []
      );

      // Continue with the main loop
      await processResponses(client, browser, nextResponse);
    } else {
      await processResponses(client, browser, response);
    }
  } catch (error) {
    console.error("Error:", error);
  } finally {
    // Clean up resources
    await browser.cleanup();
    rl.close();
  }
}

/**
 * Process responses from the model
 */
async function processResponses(
  client: OpenAI,
  browser: SteelBrowser,
  initialResponse: Response
): Promise<void> {
  let response = initialResponse;

  // Main loop
  while (true) {
    for (const item of response.output) {
      if (item.type === "message") {
        const messageItem = item as MessageResponseItem;
        console.log(`Assistant: ${messageItem.content[0].text}`);
      }
    }

    const computerCalls = response.output.filter(isComputerCall);
    if (computerCalls.length === 0) {
      console.log("Task completed.");
      break;
    }

    const compCall = computerCalls[0];
    const action = compCall.action;
    console.log(`Action: ${action.type}`);

    await executeAction(browser, action);

    const pendingChecks = compCall.pending_safety_checks || [];
    response = await sendScreenshot(
      client,
      browser,
      response.id,
      compCall.call_id,
      pendingChecks
    );
  }
}

/**
 * Main entry point
 */
async function main() {
  try {
    console.log("🤖 Welcome to the Steel-powered Computer Use Agent!");
    await runCuaLoop();
    console.log(
      "👋 Session completed. Thank you for using the Computer Use Agent!"
    );
  } catch (error) {
    console.error("❌ Error:", error);
    try {
      rl.close();
    } catch (e) {
      // Ignore errors when closing readline interface
    }

    process.exit(1);
  }
}

main();
