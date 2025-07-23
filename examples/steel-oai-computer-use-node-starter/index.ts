import * as dotenv from "dotenv";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { Steel } from "steel-sdk";

dotenv.config();

// Replace with your own API keys
const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "your-openai-api-key-here";

// Replace with your own task
const TASK =
  process.env.TASK || "Go to Wikipedia and search for machine learning";

const SYSTEM_PROMPT = `You are an expert browser automation assistant operating in an iterative execution loop. Your goal is to efficiently complete tasks using a Chrome browser with full internet access.

<CAPABILITIES>
* You control a Chrome browser tab and can navigate to any website
* You can click, type, scroll, take screenshots, and interact with web elements  
* You have full internet access and can visit any public website
* You can read content, fill forms, search for information, and perform complex multi-step tasks
* After each action, you receive a screenshot showing the current state
* Use the goto(url) function to navigate directly to URLs - DO NOT try to click address bars or browser UI
* Use the back() function to go back to the previous page

<COORDINATE_SYSTEM>
* The browser viewport has specific dimensions that you must respect
* All coordinates (x, y) must be within the viewport bounds
* X coordinates must be between 0 and the display width (inclusive)
* Y coordinates must be between 0 and the display height (inclusive)
* Always ensure your click, move, scroll, and drag coordinates are within these bounds
* If you're unsure about element locations, take a screenshot first to see the current state

<AUTONOMOUS_EXECUTION>
* Work completely independently - make decisions and act immediately without asking questions
* Never request clarification, present options, or ask for permission
* Make intelligent assumptions based on task context
* If something is ambiguous, choose the most logical interpretation and proceed
* Take immediate action rather than explaining what you might do
* When the task objective is achieved, immediately declare "TASK_COMPLETED:" - do not provide commentary or ask questions

<REASONING_STRUCTURE>
For each step, you must reason systematically:
* Analyze your previous action's success/failure and current state
* Identify what specific progress has been made toward the goal
* Determine the next immediate objective and how to achieve it
* Choose the most efficient action sequence to make progress

<EFFICIENCY_PRINCIPLES>
* Combine related actions when possible rather than single-step execution
* Navigate directly to relevant websites without unnecessary exploration
* Use screenshots strategically to understand page state before acting
* Be persistent with alternative approaches if initial attempts fail
* Focus on the specific information or outcome requested

<COMPLETION_CRITERIA>
* MANDATORY: When you complete the task, your final message MUST start with "TASK_COMPLETED: [brief summary]"
* MANDATORY: If technical issues prevent completion, your final message MUST start with "TASK_FAILED: [reason]"  
* MANDATORY: If you abandon the task, your final message MUST start with "TASK_ABANDONED: [explanation]"
* Do not write anything after completing the task except the required completion message
* Do not ask questions, provide commentary, or offer additional help after task completion
* The completion message is the end of the interaction - nothing else should follow

<CRITICAL_REQUIREMENTS>
* This is fully automated execution - work completely independently
* Start by taking a screenshot to understand the current state
* Use goto(url) function for navigation - never click on browser UI elements
* Always respect coordinate boundaries - invalid coordinates will fail
* Recognize when the stated objective has been achieved and declare completion immediately
* Focus on the explicit task given, not implied or potential follow-up tasks

Remember: Be thorough but focused. Complete the specific task requested efficiently and provide clear results.`;

const BLOCKED_DOMAINS = [
  "maliciousbook.com",
  "evilvideos.com",
  "darkwebforum.com",
  "shadytok.com",
  "suspiciouspins.com",
  "ilanbigio.com",
];

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
  }
}

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

    const cdpUrl = `${this.session.websocketUrl}&apiKey=${process.env.STEEL_API_KEY}`;

    this.browser = await chromium.connectOverCDP(cdpUrl, {
      timeout: 60000,
    });

    const context = this.browser.contexts()[0];

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

    this.page = context.pages()[0];

    // Explicitly set viewport size to ensure it matches our expected dimensions
    await this.page.setViewportSize({
      width: width,
      height: height,
    });

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
      // Use regular Playwright screenshot for consistent viewport sizing
      const buffer = await this.page.screenshot({
        fullPage: false,
        clip: {
          x: 0,
          y: 0,
          width: this.dimensions[0],
          height: this.dimensions[1],
        },
      });
      return buffer.toString("base64");
    } catch (error) {
      console.log(`Screenshot failed: ${error}`);
      // Fallback to CDP screenshot without fromSurface
      try {
        const cdpSession = await this.page.context().newCDPSession(this.page);
        const result = await cdpSession.send("Page.captureScreenshot", {
          format: "png",
          fromSurface: false,
        });
        return result.data;
      } catch (cdpError) {
        console.log(`CDP screenshot also failed: ${cdpError}`);
        throw error;
      }
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
      await this.page.mouse.click(x, y, {
        button: buttonType as any,
      });
    }
  }

  async doubleClick(x: number, y: number): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    await this.page.mouse.dblclick(x, y);
  }

  async scroll(
    x: number,
    y: number,
    scroll_x: number,
    scroll_y: number
  ): Promise<void> {
    if (!this.page) throw new Error("Page not initialized");
    await this.page.mouse.move(x, y);
    await this.page.evaluate(
      ({ scrollX, scrollY }) => {
        window.scrollBy(scrollX, scrollY);
      },
      { scrollX: scroll_x, scrollY: scroll_y }
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

    for (const key of mappedKeys) {
      await this.page.keyboard.down(key);
    }

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

  async getViewportInfo(): Promise<any> {
    /**Get detailed viewport information for debugging.*/
    if (!this.page) {
      return {};
    }

    try {
      return await this.page.evaluate(() => ({
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        devicePixelRatio: window.devicePixelRatio,
        screenWidth: window.screen.width,
        screenHeight: window.screen.height,
        scrollX: window.scrollX,
        scrollY: window.scrollY,
      }));
    } catch {
      return {};
    }
  }
}

class Agent {
  private model: string;
  private computer: SteelBrowser;
  private tools: any[];
  private autoAcknowledgeSafety: boolean;
  private printSteps: boolean = true;
  private debug: boolean = false;
  private showImages: boolean = false;
  private viewportWidth: number;
  private viewportHeight: number;
  private systemPrompt: string;

  constructor(
    model: string = "computer-use-preview",
    computer: SteelBrowser,
    tools: any[] = [],
    autoAcknowledgeSafety: boolean = true
  ) {
    this.model = model;
    this.computer = computer;
    this.tools = tools;
    this.autoAcknowledgeSafety = autoAcknowledgeSafety;

    const [width, height] = computer.getDimensions();
    this.viewportWidth = width;
    this.viewportHeight = height;

    // Create dynamic system prompt with viewport dimensions
    this.systemPrompt = SYSTEM_PROMPT.replace(
      "<COORDINATE_SYSTEM>",
      `<COORDINATE_SYSTEM>
* The browser viewport dimensions are ${width}x${height} pixels
* The browser viewport has specific dimensions that you must respect`
    );

    this.tools.push({
      type: "computer-preview",
      display_width: width,
      display_height: height,
      environment: computer.getEnvironment(),
    });

    // Add goto function tool for direct URL navigation
    this.tools.push({
      type: "function",
      name: "goto",
      description: "Navigate directly to a specific URL.",
      parameters: {
        type: "object",
        properties: {
          url: {
            type: "string",
            description:
              "Fully qualified URL to navigate to (e.g., https://example.com).",
          },
        },
        additionalProperties: false,
        required: ["url"],
      },
    });

    // Add back function tool for browser navigation
    this.tools.push({
      type: "function",
      name: "back",
      description: "Go back to the previous page.",
      parameters: {},
    });
  }

  debugPrint(...args: any[]): void {
    if (this.debug) {
      pp(args);
    }
  }

  private async getViewportInfo(): Promise<any> {
    /**Get detailed viewport information for debugging.*/
    return await this.computer.getViewportInfo();
  }

  private async validateScreenshotDimensions(
    screenshotBase64: string
  ): Promise<any> {
    /**Validate screenshot dimensions against viewport.*/
    try {
      // Decode base64 and get image dimensions
      const buffer = Buffer.from(screenshotBase64, "base64");

      // Simple way to get dimensions from PNG buffer
      // PNG width is at bytes 16-19, height at bytes 20-23
      const width = buffer.readUInt32BE(16);
      const height = buffer.readUInt32BE(20);

      const viewportInfo = await this.getViewportInfo();

      const scalingInfo = {
        screenshot_size: [width, height],
        viewport_size: [this.viewportWidth, this.viewportHeight],
        actual_viewport: [
          viewportInfo.innerWidth || 0,
          viewportInfo.innerHeight || 0,
        ],
        device_pixel_ratio: viewportInfo.devicePixelRatio || 1.0,
        width_scale: this.viewportWidth > 0 ? width / this.viewportWidth : 1.0,
        height_scale:
          this.viewportHeight > 0 ? height / this.viewportHeight : 1.0,
      };

      // Warn about scaling mismatches
      if (scalingInfo.width_scale !== 1.0 || scalingInfo.height_scale !== 1.0) {
        console.log(`⚠️  Screenshot scaling detected:`);
        console.log(`   Screenshot: ${width}x${height}`);
        console.log(
          `   Expected viewport: ${this.viewportWidth}x${this.viewportHeight}`
        );
        console.log(
          `   Actual viewport: ${viewportInfo.innerWidth || "unknown"}x${viewportInfo.innerHeight || "unknown"}`
        );
        console.log(
          `   Scale factors: ${scalingInfo.width_scale.toFixed(3)}x${scalingInfo.height_scale.toFixed(3)}`
        );
      }

      return scalingInfo;
    } catch (error) {
      console.log(`⚠️  Error validating screenshot dimensions: ${error}`);
      return {};
    }
  }

  private validateCoordinates(actionArgs: any): any {
    const validatedArgs = { ...actionArgs };

    // Handle single coordinates (click, move, etc.)
    if ("x" in actionArgs && "y" in actionArgs) {
      validatedArgs.x = this.toNumber(actionArgs.x);
      validatedArgs.y = this.toNumber(actionArgs.y);
    }

    // Handle path arrays (drag)
    if ("path" in actionArgs && Array.isArray(actionArgs.path)) {
      validatedArgs.path = actionArgs.path.map((point: any) => ({
        x: this.toNumber(point.x),
        y: this.toNumber(point.y),
      }));
    }

    return validatedArgs;
  }

  private toNumber(value: any): number {
    if (typeof value === "string") {
      const num = parseFloat(value);
      return isNaN(num) ? 0 : num;
    }
    return typeof value === "number" ? value : 0;
  }

  async executeAction(actionType: string, actionArgs: any): Promise<void> {
    const validatedArgs = this.validateCoordinates(actionArgs);

    switch (actionType) {
      case "click":
        await this.computer.click(
          validatedArgs.x,
          validatedArgs.y,
          validatedArgs.button || "left"
        );
        break;
      case "doubleClick":
      case "double_click":
        await this.computer.doubleClick(validatedArgs.x, validatedArgs.y);
        break;
      case "move":
        await this.computer.move(validatedArgs.x, validatedArgs.y);
        break;
      case "scroll":
        await this.computer.scroll(
          validatedArgs.x,
          validatedArgs.y,
          this.toNumber(validatedArgs.scroll_x),
          this.toNumber(validatedArgs.scroll_y)
        );
        break;
      case "drag":
        const path = validatedArgs.path || [];
        await this.computer.drag(path);
        break;
      case "type":
        await this.computer.type(validatedArgs.text || "");
        break;
      case "keypress":
        await this.computer.keypress(validatedArgs.keys || []);
        break;
      case "wait":
        await this.computer.wait(this.toNumber(validatedArgs.ms) || 1000);
        break;
      case "goto":
        await this.computer.goto(validatedArgs.url || "");
        break;
      case "back":
        await this.computer.back();
        break;
      case "forward":
        await this.computer.forward();
        break;
      case "screenshot":
        break;
      default:
        const method = (this.computer as any)[actionType];
        if (typeof method === "function") {
          await method.call(this.computer, ...Object.values(validatedArgs));
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

      await this.executeAction(actionType, actionArgs);
      const screenshotBase64 = await this.computer.screenshot();

      // Validate screenshot dimensions for debugging
      await this.validateScreenshotDimensions(screenshotBase64);

      const pendingChecks = item.pending_safety_checks || [];
      for (const check of pendingChecks) {
        if (this.autoAcknowledgeSafety) {
          console.log(`⚠️  Auto-acknowledging safety check: ${check.message}`);
        } else {
          throw new Error(`Safety check failed: ${check.message}`);
        }
      }

      const callOutput: OutputItem = {
        type: "computer_call_output",
        call_id: item.call_id,
        acknowledged_safety_checks: pendingChecks,
        output: {
          type: "input_image",
          image_url: `data:image/png;base64,${screenshotBase64}`,
        },
      };

      if (this.computer.getEnvironment() === "browser") {
        const currentUrl = this.computer.getCurrentUrl();
        checkBlocklistedUrl(currentUrl);
        (callOutput.output as any).current_url = currentUrl;
      }

      return [callOutput];
    }

    return [];
  }

  async executeTask(
    task: string,
    printSteps: boolean = true,
    debug: boolean = false,
    maxIterations: number = 50
  ): Promise<string> {
    this.printSteps = printSteps;
    this.debug = debug;
    this.showImages = false;

    const inputItems = [
      {
        role: "system",
        content: this.systemPrompt,
      },
      {
        role: "user",
        content: task,
      },
    ];

    let newItems: any[] = [];
    let iterations = 0;
    let consecutiveNoActions = 0;
    let lastAssistantMessages: string[] = [];

    console.log(`🎯 Executing task: ${task}`);
    console.log("=".repeat(60));

    const isTaskComplete = (
      content: string
    ): { completed: boolean; reason?: string } => {
      const lowerContent = content.toLowerCase();

      if (content.includes("TASK_COMPLETED:")) {
        return { completed: true, reason: "explicit_completion" };
      }
      if (
        content.includes("TASK_FAILED:") ||
        content.includes("TASK_ABANDONED:")
      ) {
        return { completed: true, reason: "explicit_failure" };
      }

      const completionPatterns = [
        /task\s+(completed|finished|done|accomplished)/i,
        /successfully\s+(completed|finished|found|gathered)/i,
        /here\s+(is|are)\s+the\s+(results?|information|summary)/i,
        /to\s+summarize/i,
        /in\s+conclusion/i,
        /final\s+(answer|result|summary)/i,
      ];

      const failurePatterns = [
        /cannot\s+(complete|proceed|access|continue)/i,
        /unable\s+to\s+(complete|access|find|proceed)/i,
        /blocked\s+by\s+(captcha|security|authentication)/i,
        /giving\s+up/i,
        /no\s+longer\s+able/i,
        /have\s+tried\s+multiple\s+approaches/i,
      ];

      if (completionPatterns.some((pattern) => pattern.test(content))) {
        return { completed: true, reason: "natural_completion" };
      }

      if (failurePatterns.some((pattern) => pattern.test(content))) {
        return { completed: true, reason: "natural_failure" };
      }

      return { completed: false };
    };

    const detectRepetition = (newMessage: string): boolean => {
      if (lastAssistantMessages.length < 2) return false;

      const similarity = (str1: string, str2: string): number => {
        const words1 = str1.toLowerCase().split(/\s+/);
        const words2 = str2.toLowerCase().split(/\s+/);
        const commonWords = words1.filter((word) => words2.includes(word));
        return commonWords.length / Math.max(words1.length, words2.length);
      };

      return lastAssistantMessages.some(
        (prevMessage) => similarity(newMessage, prevMessage) > 0.8
      );
    };

    while (iterations < maxIterations) {
      iterations++;
      let hasActions = false;

      if (
        newItems.length > 0 &&
        newItems[newItems.length - 1]?.role === "assistant"
      ) {
        const lastMessage = newItems[newItems.length - 1];
        if (lastMessage.content?.[0]?.text) {
          const content = lastMessage.content[0].text;

          const completion = isTaskComplete(content);
          if (completion.completed) {
            console.log(`✅ Task completed (${completion.reason})`);
            break;
          }

          if (detectRepetition(content)) {
            console.log("🔄 Repetition detected - stopping execution");
            lastAssistantMessages.push(content);
            break;
          }

          lastAssistantMessages.push(content);
          if (lastAssistantMessages.length > 3) {
            lastAssistantMessages.shift(); // Keep only last 3
          }
        }
      }

      this.debugPrint([...inputItems, ...newItems].map(sanitizeMessage));

      try {
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

        newItems.push(...response.output);

        for (const item of response.output) {
          if (item.type === "computer_call" || item.type === "function_call") {
            hasActions = true;
          }
          const handleResult = await this.handleItem(item);
          newItems.push(...handleResult);
        }

        if (!hasActions) {
          consecutiveNoActions++;
          if (consecutiveNoActions >= 3) {
            console.log(
              "⚠️  No actions for 3 consecutive iterations - stopping"
            );
            break;
          }
        } else {
          consecutiveNoActions = 0;
        }
      } catch (error) {
        console.error(`❌ Error during task execution: ${error}`);
        throw error;
      }
    }

    if (iterations >= maxIterations) {
      console.warn(
        `⚠️  Task execution stopped after ${maxIterations} iterations`
      );
    }

    const assistantMessages = newItems.filter(
      (item) => item.role === "assistant"
    );
    const finalMessage = assistantMessages[assistantMessages.length - 1];

    return (
      finalMessage?.content?.[0]?.text ||
      "Task execution completed (no final message)"
    );
  }
}

async function main(): Promise<void> {
  console.log("🚀 Steel + OpenAI Computer Use Assistant");
  console.log("=".repeat(60));

  if (STEEL_API_KEY === "your-steel-api-key-here") {
    console.warn(
      "⚠️  WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key"
    );
    console.warn(
      "   Get your API key at: https://app.steel.dev/settings/api-keys"
    );
    return;
  }

  if (OPENAI_API_KEY === "your-openai-api-key-here") {
    console.warn(
      "⚠️  WARNING: Please replace 'your-openai-api-key-here' with your actual OpenAI API key"
    );
    console.warn("   Get your API key at: https://platform.openai.com/");
    return;
  }

  console.log("\nStarting Steel browser session...");

  const computer = new SteelBrowser();

  try {
    await computer.initialize();
    console.log("✅ Steel browser session started!");

    const agent = new Agent("computer-use-preview", computer, [], true);

    const startTime = Date.now();

    try {
      const result = await agent.executeTask(TASK, true, false, 50);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log("\n" + "=".repeat(60));
      console.log("🎉 TASK EXECUTION COMPLETED");
      console.log("=".repeat(60));
      console.log(`⏱️  Duration: ${duration} seconds`);
      console.log(`🎯 Task: ${TASK}`);
      console.log(`📋 Result:\n${result}`);
      console.log("=".repeat(60));
    } catch (error) {
      console.error(`❌ Task execution failed: ${error}`);
      process.exit(1);
    }
  } catch (error) {
    console.log(`❌ Failed to start Steel browser: ${error}`);
    console.log("Please check your STEEL_API_KEY and internet connection.");
    process.exit(1);
  } finally {
    await computer.cleanup();
  }
}

main().catch(console.error);
