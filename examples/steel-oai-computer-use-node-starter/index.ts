import * as dotenv from "dotenv";
import * as readline from "readline";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { Steel } from "steel-sdk";

dotenv.config();

// Blocked domains for security
const BLOCKED_DOMAINS = [
  "maliciousbook.com",
  "evilvideos.com",
  "darkwebforum.com",
  "shadytok.com",
  "suspiciouspins.com",
  "ilanbigio.com",
];

// Key mapping for CUA to Playwright
const CUA_KEY_TO_PLAYWRIGHT_KEY: Record<string, string> = {
  "/": "Divide",
  "\\": "Backslash",
  alt: "Alt",
  arrowdown: "ArrowDown",
  arrowleft: "ArrowLeft",
  arrowright: "ArrowRight",
  arrowup: "ArrowUp",
  backspace: "Backspace",
  capslock: "CapsLock",
  cmd: "Meta",
  ctrl: "Control",
  delete: "Delete",
  end: "End",
  enter: "Enter",
  esc: "Escape",
  home: "Home",
  insert: "Insert",
  option: "Alt",
  pagedown: "PageDown",
  pageup: "PageUp",
  shift: "Shift",
  space: " ",
  super: "Meta",
  tab: "Tab",
  win: "Meta",
};

interface MessageItem {
  type: "message";
  content: Array<{ text: string }>;
}

interface FunctionCallItem {
  type: "function_call";
  call_id: string;
  name: string;
  arguments: string;
}

interface ComputerCallItem {
  type: "computer_call";
  call_id: string;
  action: {
    type: string;
    [key: string]: any;
  };
  pending_safety_checks?: Array<{
    id: string;
    message: string;
  }>;
}

interface OutputItem {
  type: "computer_call_output" | "function_call_output";
  call_id: string;
  acknowledged_safety_checks?: Array<{
    id: string;
    message: string;
  }>;
  output?:
    | {
        type: string;
        image_url?: string;
        current_url?: string;
      }
    | string;
}

interface ResponseItem {
  id: string;
  output: (MessageItem | FunctionCallItem | ComputerCallItem)[];
}

// Utility Functions
function pp(obj: any): void {
  console.log(JSON.stringify(obj, null, 2));
}

function sanitizeMessage(msg: any): any {
  if (msg?.type === "computer_call_output") {
    const output = msg.output || {};
    if (typeof output === "object") {
      return {
        ...msg,
        output: { ...output, image_url: "[omitted]" },
      };
    }
  }
  return msg;
}

async function createResponse(params: any): Promise<ResponseItem> {
  const url = "https://api.openai.com/v1/responses";
  const headers: Record<string, string> = {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  };

  const openaiOrg = process.env.OPENAI_ORG;
  if (openaiOrg) {
    headers["Openai-Organization"] = openaiOrg;
  }

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API Error: ${response.status} ${errorText}`);
  }

  return (await response.json()) as ResponseItem;
}

function checkBlocklistedUrl(url: string): void {
  try {
    const hostname = new URL(url).hostname || "";
    const isBlocked = BLOCKED_DOMAINS.some(
      (blocked) => hostname === blocked || hostname.endsWith(`.${blocked}`)
    );
    if (isBlocked) {
      throw new Error(`Blocked URL: ${url}`);
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Blocked URL:")) {
      throw error;
    }
    // If URL parsing fails, allow it to continue
  }
}

/**
 * Steel browser implementation for OpenAI Computer Use Assistant.
 */
class SteelBrowser {
  private client: Steel;
  private session: any;
  private browser: Browser | null = null;
  private page: Page | null = null;
  private dimensions: [number, number];
  private proxy: boolean;
  private solveCaptcha: boolean;
  private virtualMouse: boolean;
  private sessionTimeout: number;
  private adBlocker: boolean;
  private startUrl: string;

  constructor(
    width: number = 1024,
    height: number = 768,
    proxy: boolean = false,
    solveCaptcha: boolean = false,
    virtualMouse: boolean = true,
    sessionTimeout: number = 900000, // 15 minutes
    adBlocker: boolean = true,
    startUrl: string = "https://www.google.com"
  ) {
    this.client = new Steel({
      steelAPIKey: process.env.STEEL_API_KEY!,
      baseURL: process.env.STEEL_BASE_URL || "https://api.steel.dev",
    });
    this.dimensions = [width, height];
    this.proxy = proxy;
    this.solveCaptcha = solveCaptcha;
    this.virtualMouse = virtualMouse;
    this.sessionTimeout = sessionTimeout;
    this.adBlocker = adBlocker;
    this.startUrl = startUrl;
  }

  getEnvironment(): string {
    return "browser";
  }

  getDimensions(): [number, number] {
    return this.dimensions;
  }

  getCurrentUrl(): string {
    return this.page?.url() || "";
  }

  async initialize(): Promise<void> {
    const [width, height] = this.dimensions;
    const sessionParams = {
      useProxy: this.proxy,
      solveCaptcha: this.solveCaptcha,
      apiTimeout: this.sessionTimeout,
      blockAds: this.adBlocker,
      dimensions: { width, height },
    };

    this.session = await this.client.sessions.create(sessionParams);
    console.log("Steel Session created successfully!");
    console.log(`View live session at: ${this.session.sessionViewerUrl}`);

    // Connect to Steel session
    const connectUrl =
      process.env.STEEL_CONNECT_URL || "wss://connect.steel.dev";
    const cdpUrl = `${connectUrl}?apiKey=${process.env.STEEL_API_KEY}&sessionId=${this.session.id}`;

    this.browser = await chromium.connectOverCDP(cdpUrl, {
      timeout: 60000,
    });

    const context = this.browser.contexts()[0];

    // Set up URL blocking
    await context.route("**/*", async (route, request) => {
      const url = request.url();
      try {
        checkBlocklistedUrl(url);
        await route.continue();
      } catch (error) {
        console.log(`Blocking URL: ${url}`);
        await route.abort();
      }
    });

    // Add virtual mouse if enabled
    if (this.virtualMouse) {
      await context.addInitScript(`
        if (window.self === window.top) {
          function initCursor() {
            const CURSOR_ID = '__cursor__';
            if (document.getElementById(CURSOR_ID)) return;

            const cursor = document.createElement('div');
            cursor.id = CURSOR_ID;
            Object.assign(cursor.style, {
              position: 'fixed',
              top: '0px',
              left: '0px',
              width: '20px',
              height: '20px',
              backgroundImage: 'url("data:image/svg+xml;utf8,<svg width=\\'16\\' height=\\'16\\' viewBox=\\'0 0 20 20\\' fill=\\'black\\' outline=\\'white\\' xmlns=\\'http://www.w3.org/2000/svg\\'><path d=\\'M15.8089 7.22221C15.9333 7.00888 15.9911 6.78221 15.9822 6.54221C15.9733 6.29333 15.8978 6.06667 15.7555 5.86221C15.6133 5.66667 15.4311 5.52445 15.2089 5.43555L1.70222 0.0888888C1.47111 0 1.23555 -0.0222222 0.995555 0.0222222C0.746667 0.0755555 0.537779 0.186667 0.368888 0.355555C0.191111 0.533333 0.0755555 0.746667 0.0222222 0.995555C-0.0222222 1.23555 0 1.47111 0.0888888 1.70222L5.43555 15.2222C5.52445 15.4445 5.66667 15.6267 5.86221 15.7689C6.06667 15.9111 6.28888 15.9867 6.52888 15.9955H6.58221C6.82221 15.9955 7.04445 15.9333 7.24888 15.8089C7.44445 15.6845 7.59555 15.52 7.70221 15.3155L10.2089 10.2222L15.3022 7.70221C15.5155 7.59555 15.6845 7.43555 15.8089 7.22221Z\\' ></path></svg>")',
              backgroundSize: 'cover',
              pointerEvents: 'none',
              zIndex: '99999',
              transform: 'translate(-2px, -2px)',
            });

            document.body.appendChild(cursor);

            document.addEventListener("mousemove", (e) => {
              cursor.style.top = e.clientY + "px";
              cursor.style.left = e.clientX + "px";
            });
          }

          function checkBody() {
            if (document.body) {
              initCursor();
            } else {
              requestAnimationFrame(checkBody);
            }
          }
          requestAnimationFrame(checkBody);
        }
      `);
    }

    // Get the page
    this.page = context.pages()[0];

    // Navigate to start URL
    await this.page.goto(this.startUrl);
  }

  async cleanup(): Promise<void> {
    if (this.page) {
      await this.page.close();
    }
    if (this.browser) {
      await this.browser.close();
    }
    if (this.session) {
      console.log("Releasing Steel session...");
      await this.client.sessions.release(this.session.id);
      console.log(
        `Session completed. View replay at ${this.session.sessionViewerUrl}`
      );
    }
  }

  async screenshot(): Promise<string> {
    if (!this.page) throw new Error("Page not initialized");

    try {
      // Try CDP screenshot first
      const cdpSession = await this.page.context().newCDPSession(this.page);
      const result = await cdpSession.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
      });
      return result.data;
    } catch (error) {
      console.log(`CDP screenshot failed, using fallback: ${error}`);
      // Fallback to standard screenshot
      const buffer = await this.page.screenshot({ fullPage: false });
      return buffer.toString("base64");
    }
  }

  async click(x: number, y: number, button: string = "left"): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");

    if (button === "back") {
      await this.back();
    } else if (button === "forward") {
      await this.forward();
    } else if (button === "wheel") {
      await this.page.mouse.wheel(x, y);
    } else {
      const buttonType = { left: "left", right: "right" }[button] || "left";
      await this.page.mouse.click(x, y, { button: buttonType as any });
    }
  }

  async doubleClick(x: number, y: number): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    await this.page.mouse.dblclick(x, y);
  }

  async scroll(
    x: number,
    y: number,
    scrollX: number,
    scrollY: number
  ): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    await this.page.mouse.move(x, y);
    await this.page.evaluate(
      ({ scrollX, scrollY }) => {
        window.scrollBy(scrollX, scrollY);
      },
      { scrollX, scrollY }
    );
  }

  async type(text: string): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    await this.page.keyboard.type(text);
  }

  async wait(ms: number = 1000): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  async move(x: number, y: number): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    await this.page.mouse.move(x, y);
  }

  async keypress(keys: string[]): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");

    const mappedKeys = keys.map(
      (key) => CUA_KEY_TO_PLAYWRIGHT_KEY[key.toLowerCase()] || key
    );

    // Press all keys down
    for (const key of mappedKeys) {
      await this.page.keyboard.down(key);
    }

    // Release all keys in reverse order
    for (const key of mappedKeys.reverse()) {
      await this.page.keyboard.up(key);
    }
  }

  async drag(path: Array<{ x: number; y: number }>): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    if (path.length === 0) return;

    await this.page.mouse.move(path[0].x, path[0].y);
    await this.page.mouse.down();

    for (const point of path.slice(1)) {
      await this.page.mouse.move(point.x, point.y);
    }

    await this.page.mouse.up();
  }

  async goto(url: string): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    try {
      await this.page.goto(url);
    } catch (error) {
      console.log(`Error navigating to ${url}: ${error}`);
    }
  }

  async back(): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    await this.page.goBack();
  }

  async forward(): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    await this.page.goForward();
  }
}

/**
 * Agent class for managing OpenAI Computer Use Assistant interactions.
 */
class Agent {
  private model: string;
  private computer: SteelBrowser;
  private tools: any[];
  private acknowledgeSafetyCheckCallback: (message: string) => Promise<boolean>;
  private printSteps: boolean = true;
  private debug: boolean = false;
  private showImages: boolean = false;

  constructor(
    model: string = "computer-use-preview",
    computer: SteelBrowser,
    tools: any[] = [],
    acknowledgeSafetyCheckCallback: (
      message: string
    ) => Promise<boolean> = async () => false
  ) {
    this.model = model;
    this.computer = computer;
    this.tools = tools;
    this.acknowledgeSafetyCheckCallback = acknowledgeSafetyCheckCallback;

    // Add computer tool
    const dimensions = computer.getDimensions();
    this.tools.push({
      type: "computer-preview",
      display_width: dimensions[0],
      display_height: dimensions[1],
      environment: computer.getEnvironment(),
    });
  }

  debugPrint(...args: any[]): void {
    if (this.debug) {
      pp(args);
    }
  }

  async executeAction(actionType: string, actionArgs: any): Promise<void> {
    // Helper function to convert string to number
    const toNumber = (value: any): number => {
      if (typeof value === "string") {
        const num = parseFloat(value);
        return isNaN(num) ? 0 : num;
      }
      return typeof value === "number" ? value : 0;
    };

    // Execute actions with proper type conversion
    switch (actionType) {
      case "click":
        await this.computer.click(
          toNumber(actionArgs.x),
          toNumber(actionArgs.y),
          actionArgs.button || "left"
        );
        break;
      case "doubleClick":
      case "double_click":
        await this.computer.doubleClick(
          toNumber(actionArgs.x),
          toNumber(actionArgs.y)
        );
        break;
      case "move":
        await this.computer.move(
          toNumber(actionArgs.x),
          toNumber(actionArgs.y)
        );
        break;
      case "scroll":
        await this.computer.scroll(
          toNumber(actionArgs.x),
          toNumber(actionArgs.y),
          toNumber(actionArgs.scrollX || actionArgs.scroll_x),
          toNumber(actionArgs.scrollY || actionArgs.scroll_y)
        );
        break;
      case "drag":
        const path = actionArgs.path || [];
        const convertedPath = path.map((point: any) => ({
          x: toNumber(point.x),
          y: toNumber(point.y),
        }));
        await this.computer.drag(convertedPath);
        break;
      case "type":
        await this.computer.type(actionArgs.text || "");
        break;
      case "keypress":
        await this.computer.keypress(actionArgs.keys || []);
        break;
      case "wait":
        await this.computer.wait(toNumber(actionArgs.ms) || 1000);
        break;
      case "goto":
        await this.computer.goto(actionArgs.url || "");
        break;
      case "back":
        await this.computer.back();
        break;
      case "forward":
        await this.computer.forward();
        break;
      case "screenshot":
        // Screenshot is handled automatically after action execution
        break;
      default:
        // Try to call the method directly if it exists
        const method = (this.computer as any)[actionType];
        if (typeof method === "function") {
          await method.call(this.computer, ...Object.values(actionArgs));
        }
        break;
    }
  }

  async handleItem(
    item: MessageItem | FunctionCallItem | ComputerCallItem
  ): Promise<OutputItem[]> {
    if (item.type === "message") {
      if (this.printSteps) {
        console.log(item.content[0].text);
      }
    } else if (item.type === "function_call") {
      const { name, arguments: argsStr } = item;
      const args = JSON.parse(argsStr);

      if (this.printSteps) {
        console.log(`${name}(${JSON.stringify(args)})`);
      }

      // Call function on computer if it exists
      if (typeof (this.computer as any)[name] === "function") {
        const method = (this.computer as any)[name];
        await method.call(this.computer, ...Object.values(args));
      }

      return [
        {
          type: "function_call_output",
          call_id: item.call_id,
          output: "success",
        },
      ];
    } else if (item.type === "computer_call") {
      const { action } = item;
      const actionType = action.type;
      const { type, ...actionArgs } = action;

      if (this.printSteps) {
        console.log(`${actionType}(${JSON.stringify(actionArgs)})`);
      }

      // Execute the action with proper argument parsing
      await this.executeAction(actionType, actionArgs);

      // Take screenshot
      const screenshotBase64 = await this.computer.screenshot();

      // Handle safety checks
      const pendingChecks = item.pending_safety_checks || [];
      for (const check of pendingChecks) {
        const acknowledged = await this.acknowledgeSafetyCheckCallback(
          check.message
        );
        if (!acknowledged) {
          throw new Error(`Safety check failed: ${check.message}`);
        }
      }

      // Prepare response
      const callOutput: OutputItem = {
        type: "computer_call_output",
        call_id: item.call_id,
        acknowledged_safety_checks: pendingChecks,
        output: {
          type: "input_image",
          image_url: `data:image/png;base64,${screenshotBase64}`,
        },
      };

      // Add current URL for browser environments
      if (this.computer.getEnvironment() === "browser") {
        const currentUrl = this.computer.getCurrentUrl();
        checkBlocklistedUrl(currentUrl);
        (callOutput.output as any).current_url = currentUrl;
      }

      return [callOutput];
    }

    return [];
  }

  async runFullTurn(
    inputItems: any[],
    printSteps: boolean = true,
    debug: boolean = false,
    showImages: boolean = false
  ): Promise<any[]> {
    this.printSteps = printSteps;
    this.debug = debug;
    this.showImages = showImages;
    let newItems: any[] = [];

    // Keep looping until we get a final assistant response
    while (
      newItems.length === 0 ||
      newItems[newItems.length - 1]?.role !== "assistant"
    ) {
      this.debugPrint([...inputItems, ...newItems].map(sanitizeMessage));

      // Call OpenAI API
      const response = await createResponse({
        model: this.model,
        input: [...inputItems, ...newItems],
        tools: this.tools,
        truncation: "auto",
      });

      this.debugPrint(response);

      if (!response.output) {
        if (this.debug) {
          console.log(response);
        }
        throw new Error("No output from model");
      }

      // Process response items
      newItems.push(...response.output);
      for (const item of response.output) {
        const handleResult = await this.handleItem(item);
        newItems.push(...handleResult);
      }
    }

    return newItems;
  }
}

async function acknowledgeSafetyCheckCallback(
  message: string
): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(
      `Safety Check Warning: ${message}\nDo you want to acknowledge and proceed? (y/n): `,
      (answer) => {
        rl.close();
        resolve(answer.toLowerCase().trim() === "y");
      }
    );
  });
}

async function main(): Promise<void> {
  console.log("🚀 Steel + OpenAI Computer Use Assistant Demo");
  console.log("=".repeat(50));

  // Check for required environment variables
  if (!process.env.STEEL_API_KEY) {
    console.log("❌ Error: STEEL_API_KEY environment variable is required");
    console.log("Get your API key at: https://app.steel.dev/settings/api-keys");
    return;
  }

  if (!process.env.OPENAI_API_KEY) {
    console.log("❌ Error: OPENAI_API_KEY environment variable is required");
    console.log("Get your API key at: https://platform.openai.com/");
    return;
  }

  console.log("✅ API keys found!");
  console.log("\nStarting Steel browser session...");

  const computer = new SteelBrowser();

  try {
    await computer.initialize();
    console.log("✅ Steel browser session started!");

    // Create agent
    const agent = new Agent(
      "computer-use-preview",
      computer,
      [],
      acknowledgeSafetyCheckCallback
    );

    console.log("\n🤖 Computer Use Assistant is ready!");
    console.log("Type your requests below. Examples:");
    console.log("- 'Search for information about artificial intelligence'");
    console.log("- 'Find the weather forecast for New York'");
    console.log("- 'Go to Wikipedia and tell me about machine learning'");
    console.log("Type 'exit' to quit.\n");

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    let items: any[] = [];

    while (true) {
      try {
        const userInput = await new Promise<string>((resolve) => {
          rl.question("👤 You: ", resolve);
        });

        if (["exit", "quit", "bye"].includes(userInput.toLowerCase().trim())) {
          break;
        }

        if (!userInput.trim()) {
          continue;
        }

        console.log(`\n🤖 Processing: ${userInput}`);
        items.push({ role: "user", content: userInput });

        // Run the agent
        const outputItems = await agent.runFullTurn(
          items,
          true, // printSteps
          false, // debug
          false // showImages
        );
        items.push(...outputItems);
        console.log("\n" + "─".repeat(50));
      } catch (error) {
        if (error instanceof Error && error.message.includes("SIGINT")) {
          console.log("\n\n👋 Goodbye!");
          break;
        }
        console.log(`\n❌ Error: ${error}`);
        console.log("Continuing...");
      }
    }

    rl.close();
  } catch (error) {
    console.log(`❌ Failed to start Steel browser: ${error}`);
    console.log("Please check your STEEL_API_KEY and internet connection.");
  } finally {
    await computer.cleanup();
  }
}

main().catch(console.error);
