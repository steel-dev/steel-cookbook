/*
 * Claude AI agent for autonomous web task execution with Steel browsers.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-claude-computer-use-mobile-starter
 */

import * as dotenv from "dotenv";
import { chromium } from "playwright";
import type { Browser, Page } from "playwright";
import { Steel } from "steel-sdk";
import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ToolResultBlockParam,
  Message,
} from "@anthropic-ai/sdk/resources/messages";

dotenv.config();

// Replace with your own API keys
const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
const ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY || "your-anthropic-api-key-here";

// Replace with your own task
const TASK = process.env.TASK || `Go to amazon.com, search for 'iPhone 16 Pro Max', find the product page,
    and extract the current price and availability status
    Note: Don't open new tabs or pages, always stay in the same page.`;


const SYSTEM_PROMPT = `You are an expert browser automation assistant operating in an iterative execution loop. Your goal is to efficiently complete tasks using a Chrome browser with full internet access.

<CAPABILITIES>
* You control a mobile Chrome browser tab and can navigate to any website
* You can tap, type, scroll, take screenshots, and interact with mobile web elements  
* You have full internet access and can visit any public website
* You can read content, fill forms, search for information, and perform complex multi-step tasks
* After each action, you receive a screenshot showing the current state

<COORDINATE_SYSTEM>
* The mobile browser viewport has specific dimensions that you must respect
* All coordinates (x, y) must be within the mobile viewport bounds
* X coordinates must be between 0 and the display width (inclusive)
* Y coordinates must be between 0 and the display height (inclusive)
* Always ensure your tap, move, scroll, and drag coordinates are within these bounds
* Mobile elements may be smaller - be precise with coordinate targeting

<AUTONOMOUS_EXECUTION>
* Work completely independently - make decisions and act immediately without asking questions
* Never request clarification, present options, or ask for permission
* Make intelligent assumptions based on task context and mobile UX patterns
* If something is ambiguous, choose the most logical interpretation and proceed
* Take immediate action rather than explaining what you might do
* When the task objective is achieved, immediately declare "TASK_COMPLETED:" - do not provide commentary or ask questions

<REASONING_STRUCTURE>
For each step, you must reason systematically:
* Analyze your previous action's success/failure and current mobile state
* Identify what specific progress has been made toward the goal
* Determine the next immediate objective and how to achieve it on mobile
* Choose the most efficient action sequence to make progress

<EFFICIENCY_PRINCIPLES>
* Combine related actions when possible rather than single-step execution
* Navigate directly to relevant websites without unnecessary exploration
* Use screenshots strategically to understand mobile page state before acting
* Be persistent with alternative approaches if initial attempts fail
* Focus on the specific information or outcome requested

<COMPLETION_CRITERIA>
* MANDATORY: When you complete the task, add couple of new lines and your final message MUST start with "TASK_COMPLETED: [brief summary]"
* MANDATORY: If technical issues prevent completion, add couple of new lines and your final message MUST start with "TASK_FAILED: [reason]"  
* MANDATORY: If you abandon the task, add couple of new lines and your final message MUST start with "TASK_ABANDONED: [explanation]"
* Do not write anything after completing the task except the required completion message
* Do not ask questions, provide commentary, or offer additional help after task completion
* The completion message is the end of the interaction - nothing else should follow

<CRITICAL_REQUIREMENTS>
* This is fully automated execution - work completely independently
* Start by taking a screenshot to understand the current mobile state
* Never tap on browser UI elements
* Navigate to the most relevant website for the task without asking
* Always respect coordinate boundaries - invalid coordinates will fail
* Recognize when the stated objective has been achieved and declare completion immediately
* Focus on the explicit task given, not implied or potential follow-up tasks

Remember: Be thorough but focused. Complete the specific task requested efficiently on the mobile interface and provide clear results.`;

const TYPING_DELAY_MS = 12;
const TYPING_GROUP_SIZE = 50;

const BLOCKED_DOMAINS = [
  "maliciousbook.com",
  "evilvideos.com",
  "darkwebforum.com",
  "shadytok.com",
  "suspiciouspins.com",
  "ilanbigio.com",
];

const MODEL_CONFIGS = {
  "claude-3-7-sonnet-20250219": {
    toolType: "computer_20250124",
    betaFlag: "computer-use-2025-01-24",
    description: "Claude 3.7 Sonnet (newer)",
  },
  "claude-sonnet-4-20250514": {
    toolType: "computer_20250124",
    betaFlag: "computer-use-2025-01-24",
    description: "Claude 4 Sonnet (newest)",
  },
  "claude-opus-4-20250514": {
    toolType: "computer_20250124",
    betaFlag: "computer-use-2025-01-24",
    description: "Claude 4 Opus (newest)",
  },
  "claude-sonnet-4-5-20250929": {
    toolType: "computer_20250124",
    betaFlag: "computer-use-2025-01-24",
    description: "Claude 4 Sonnet 4.5 (latest)",
  }
};

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
  Return: "Enter",
  KP_Enter: "Enter",
  Escape: "Escape",
  BackSpace: "Backspace",
  Delete: "Delete",
  Tab: "Tab",
  ISO_Left_Tab: "Shift+Tab",
  Up: "ArrowUp",
  Down: "ArrowDown",
  Left: "ArrowLeft",
  Right: "ArrowRight",
  Page_Up: "PageUp",
  Page_Down: "PageDown",
  Home: "Home",
  End: "End",
  Insert: "Insert",
  F1: "F1",
  F2: "F2",
  F3: "F3",
  F4: "F4",
  F5: "F5",
  F6: "F6",
  F7: "F7",
  F8: "F8",
  F9: "F9",
  F10: "F10",
  F11: "F11",
  F12: "F12",
  Shift_L: "Shift",
  Shift_R: "Shift",
  Control_L: "Control",
  Control_R: "Control",
  Alt_L: "Alt",
  Alt_R: "Alt",
  Meta_L: "Meta",
  Meta_R: "Meta",
  Super_L: "Meta",
  Super_R: "Meta",
  minus: "-",
  equal: "=",
  bracketleft: "[",
  bracketright: "]",
  semicolon: ";",
  apostrophe: "'",
  grave: "`",
  comma: ",",
  period: ".",
  slash: "/",
};

type ModelName = keyof typeof MODEL_CONFIGS;

interface ModelConfig {
  toolType: string;
  betaFlag: string;
  description: string;
}

function chunks(s: string, chunkSize: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < s.length; i += chunkSize) {
    result.push(s.slice(i, i + chunkSize));
  }
  return result;
}

function pp(obj: any): void {
  console.log(JSON.stringify(obj, null, 2));
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
  private startUrl: string;
  private lastMousePosition: [number, number] | null = null;

  constructor(
    startUrl: string = "https://amazon.com"
  ) {
    this.client = new Steel({
      steelAPIKey: STEEL_API_KEY,
    });
    this.dimensions = [1920, 1080];
    this.startUrl = startUrl;
  }

  getDimensions(): [number, number] {
    return this.dimensions;
  }

  getCurrentUrl(): string {
    return this.page?.url() || "";
  }

  async initialize(): Promise<void> {
    const sessionParams = {
      apiTimeout: 900000,
      solveCaptcha: false,
      deviceConfig: {
        device: 'mobile'
      }
    };

    this.session = await this.client.sessions.create(sessionParams);
    console.log("Steel Session created successfully!");
    console.log(`View live session at: ${this.session.sessionViewerUrl}`);

    // Set dimensions based on the session
    this.dimensions = [this.session.dimensions.width, this.session.dimensions.height];

    const cdpUrl = `${this.session.websocketUrl}&apiKey=${STEEL_API_KEY}`;

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

    this.page = context.pages()[0];

    const [viewportWidth, viewportHeight] = this.dimensions;
    await this.page.setViewportSize({
      width: viewportWidth,
      height: viewportHeight,
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
      const [width, height] = this.dimensions;
      console.log(`Taking screenshot with dimensions: ${width}x${height}`);
      const buffer = await this.page.screenshot({
        fullPage: false,
        clip: { x: 0, y: 0, width, height },
      });
      return buffer.toString("base64");
    } catch (error) {
      console.log(`Screenshot failed, trying CDP fallback: ${error}`);
      try {
        const cdpSession = await this.page.context().newCDPSession(this.page);
        const result = await cdpSession.send("Page.captureScreenshot", {
          format: "png",
          fromSurface: false,
        });
        await cdpSession.detach();
        return result.data;
      } catch (cdpError) {
        console.log(`CDP screenshot also failed: ${cdpError}`);
        throw error;
      }
    }
  }

  private validateAndGetCoordinates(
    coordinate: [number, number] | number[]
  ): [number, number] {
    if (!Array.isArray(coordinate) || coordinate.length !== 2) {
      throw new Error(`${coordinate} must be a tuple or list of length 2`);
    }
    if (!coordinate.every((i) => typeof i === "number" && i >= 0)) {
      throw new Error(
        `${coordinate} must be a tuple/list of non-negative numbers`
      );
    }

    const [x, y] = this.clampCoordinates(coordinate[0], coordinate[1]);
    return [x, y];
  }

  private clampCoordinates(x: number, y: number): [number, number] {
    const [width, height] = this.dimensions;
    const clampedX = Math.max(0, Math.min(x, width - 1));
    const clampedY = Math.max(0, Math.min(y, height - 1));

    if (x !== clampedX || y !== clampedY) {
      console.log(
        `⚠️  Coordinate clamped: (${x}, ${y}) → (${clampedX}, ${clampedY})`
      );
    }

    return [clampedX, clampedY];
  }

  async executeComputerAction(
    action: string,
    text?: string,
    coordinate?: [number, number] | number[],
    scrollDirection?: "up" | "down" | "left" | "right",
    scrollAmount?: number,
    duration?: number,
    key?: string
  ): Promise<string> {
    if (!this.page) throw new Error("Page not initialized");

    if (action === "left_mouse_down" || action === "left_mouse_up") {
      if (coordinate !== undefined) {
        throw new Error(`coordinate is not accepted for ${action}`);
      }

      if (action === "left_mouse_down") {
        await this.page.mouse.down();
      } else {
        await this.page.mouse.up();
      }

      return this.screenshot();
    }

    if (action === "scroll") {
      if (
        !scrollDirection ||
        !["up", "down", "left", "right"].includes(scrollDirection)
      ) {
        throw new Error(
          "scroll_direction must be 'up', 'down', 'left', or 'right'"
        );
      }
      if (scrollAmount === undefined || scrollAmount < 0) {
        throw new Error("scroll_amount must be a non-negative number");
      }

      if (coordinate !== undefined) {
        const [x, y] = this.validateAndGetCoordinates(coordinate);
        await this.page.mouse.move(x, y);
        this.lastMousePosition = [x, y];
      }

      if (text) {
        let modifierKey = text;
        if (modifierKey in CUA_KEY_TO_PLAYWRIGHT_KEY) {
          modifierKey = CUA_KEY_TO_PLAYWRIGHT_KEY[modifierKey];
        }
        await this.page.keyboard.down(modifierKey);
      }

      const scrollMapping = {
        down: [0, 100 * scrollAmount],
        up: [0, -100 * scrollAmount],
        right: [100 * scrollAmount, 0],
        left: [-100 * scrollAmount, 0],
      };
      const [deltaX, deltaY] = scrollMapping[scrollDirection];
      await this.page.mouse.wheel(deltaX, deltaY);

      if (text) {
        let modifierKey = text;
        if (modifierKey in CUA_KEY_TO_PLAYWRIGHT_KEY) {
          modifierKey = CUA_KEY_TO_PLAYWRIGHT_KEY[modifierKey];
        }
        await this.page.keyboard.up(modifierKey);
      }

      return this.screenshot();
    }

    if (action === "hold_key" || action === "wait") {
      if (duration === undefined || duration < 0) {
        throw new Error("duration must be a non-negative number");
      }
      if (duration > 100) {
        throw new Error("duration is too long");
      }

      if (action === "hold_key") {
        if (text === undefined) {
          throw new Error("text is required for hold_key");
        }

        let holdKey = text;
        if (holdKey in CUA_KEY_TO_PLAYWRIGHT_KEY) {
          holdKey = CUA_KEY_TO_PLAYWRIGHT_KEY[holdKey];
        }

        await this.page.keyboard.down(holdKey);
        await new Promise((resolve) => setTimeout(resolve, duration * 1000));
        await this.page.keyboard.up(holdKey);
      } else if (action === "wait") {
        await new Promise((resolve) => setTimeout(resolve, duration * 1000));
      }

      return this.screenshot();
    }

    if (
      [
        "left_click",
        "right_click",
        "double_click",
        "triple_click",
        "middle_click",
      ].includes(action)
    ) {
      if (text !== undefined) {
        throw new Error(`text is not accepted for ${action}`);
      }

      let clickX: number, clickY: number;
      if (coordinate !== undefined) {
        const [x, y] = this.validateAndGetCoordinates(coordinate);
        await this.page.mouse.move(x, y);
        this.lastMousePosition = [x, y];
        clickX = x;
        clickY = y;
      } else if (this.lastMousePosition) {
        [clickX, clickY] = this.lastMousePosition;
      } else {
        const [width, height] = this.dimensions;
        clickX = Math.floor(width / 2);
        clickY = Math.floor(height / 2);
      }

      if (key) {
        let modifierKey = key;
        if (modifierKey in CUA_KEY_TO_PLAYWRIGHT_KEY) {
          modifierKey = CUA_KEY_TO_PLAYWRIGHT_KEY[modifierKey];
        }
        await this.page.keyboard.down(modifierKey);
      }

      if (action === "left_click") {
        await this.page.mouse.click(clickX, clickY);
      } else if (action === "right_click") {
        await this.page.mouse.click(clickX, clickY, { button: "right" });
      } else if (action === "double_click") {
        await this.page.mouse.dblclick(clickX, clickY);
      } else if (action === "triple_click") {
        for (let i = 0; i < 3; i++) {
          await this.page.mouse.click(clickX, clickY);
        }
      } else if (action === "middle_click") {
        await this.page.mouse.click(clickX, clickY, { button: "middle" });
      }

      if (key) {
        let modifierKey = key;
        if (modifierKey in CUA_KEY_TO_PLAYWRIGHT_KEY) {
          modifierKey = CUA_KEY_TO_PLAYWRIGHT_KEY[modifierKey];
        }
        await this.page.keyboard.up(modifierKey);
      }

      return this.screenshot();
    }

    if (action === "mouse_move" || action === "left_click_drag") {
      if (coordinate === undefined) {
        throw new Error(`coordinate is required for ${action}`);
      }
      if (text !== undefined) {
        throw new Error(`text is not accepted for ${action}`);
      }

      const [x, y] = this.validateAndGetCoordinates(coordinate);

      if (action === "mouse_move") {
        await this.page.mouse.move(x, y);
        this.lastMousePosition = [x, y];
      } else if (action === "left_click_drag") {
        await this.page.mouse.down();
        await this.page.mouse.move(x, y);
        await this.page.mouse.up();
        this.lastMousePosition = [x, y];
      }

      return this.screenshot();
    }

    if (action === "key" || action === "type") {
      if (text === undefined) {
        throw new Error(`text is required for ${action}`);
      }
      if (coordinate !== undefined) {
        throw new Error(`coordinate is not accepted for ${action}`);
      }

      if (action === "key") {
        let pressKey = text;

        if (pressKey.includes("+")) {
          const keyParts = pressKey.split("+");
          const modifierKeys = keyParts.slice(0, -1);
          const mainKey = keyParts[keyParts.length - 1];

          const playwrightModifiers: string[] = [];
          for (const mod of modifierKeys) {
            if (["ctrl", "control"].includes(mod.toLowerCase())) {
              playwrightModifiers.push("Control");
            } else if (mod.toLowerCase() === "shift") {
              playwrightModifiers.push("Shift");
            } else if (["alt", "option"].includes(mod.toLowerCase())) {
              playwrightModifiers.push("Alt");
            } else if (["cmd", "meta", "super"].includes(mod.toLowerCase())) {
              playwrightModifiers.push("Meta");
            } else {
              playwrightModifiers.push(mod);
            }
          }

          let finalMainKey = mainKey;
          if (mainKey in CUA_KEY_TO_PLAYWRIGHT_KEY) {
            finalMainKey = CUA_KEY_TO_PLAYWRIGHT_KEY[mainKey];
          }

          pressKey = [...playwrightModifiers, finalMainKey].join("+");
        } else {
          if (pressKey in CUA_KEY_TO_PLAYWRIGHT_KEY) {
            pressKey = CUA_KEY_TO_PLAYWRIGHT_KEY[pressKey];
          }
        }

        await this.page.keyboard.press(pressKey);
      } else if (action === "type") {
        for (const chunk of chunks(text, TYPING_GROUP_SIZE)) {
          await this.page.keyboard.type(chunk, { delay: TYPING_DELAY_MS });
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
      }

      return this.screenshot();
    }

    if (action === "screenshot" || action === "cursor_position") {
      if (text !== undefined) {
        throw new Error(`text is not accepted for ${action}`);
      }
      if (coordinate !== undefined) {
        throw new Error(`coordinate is not accepted for ${action}`);
      }

      return this.screenshot();
    }

    throw new Error(`Invalid action: ${action}`);
  }
}

class ClaudeAgent {
  private client: Anthropic;
  private computer: SteelBrowser;
  private messages: MessageParam[];
  private model: ModelName;
  private modelConfig: ModelConfig;
  private tools: any[];
  private systemPrompt: string;
  private viewportWidth: number;
  private viewportHeight: number;

  constructor(
    computer: SteelBrowser,
    model: ModelName = "claude-sonnet-4-5-20250929"
  ) {
    this.client = new Anthropic({
      apiKey: ANTHROPIC_API_KEY,
    });
    this.computer = computer;
    this.model = model;
    this.messages = [];

    if (!(model in MODEL_CONFIGS)) {
      throw new Error(
        `Unsupported model: ${model}. Available models: ${Object.keys(MODEL_CONFIGS)}`
      );
    }

    this.modelConfig = MODEL_CONFIGS[model];

    const [width, height] = computer.getDimensions();
    this.viewportWidth = width;
    this.viewportHeight = height;

    this.systemPrompt = SYSTEM_PROMPT.replace(
      "<COORDINATE_SYSTEM>",
      `<COORDINATE_SYSTEM>
* The browser viewport dimensions are ${width}x${height} pixels
* The browser viewport has specific dimensions that you must respect`
    );

    this.tools = [
      {
        type: this.modelConfig.toolType,
        name: "computer",
        display_width_px: width,
        display_height_px: height,
        display_number: 1,
      },
    ];
  }

  getViewportInfo(): any {
    return {
      innerWidth: this.viewportWidth,
      innerHeight: this.viewportHeight,
      devicePixelRatio: 1.0,
      screenWidth: this.viewportWidth,
      screenHeight: this.viewportHeight,
      scrollX: 0,
      scrollY: 0,
    };
  }

  validateScreenshotDimensions(screenshotBase64: string): any {
    try {
      const imageBuffer = Buffer.from(screenshotBase64, "base64");

      if (imageBuffer.length === 0) {
        console.log("⚠️  Empty screenshot data");
        return {};
      }

      const viewportInfo = this.getViewportInfo();

      const scalingInfo = {
        screenshot_size: ["unknown", "unknown"],
        viewport_size: [this.viewportWidth, this.viewportHeight],
        actual_viewport: [viewportInfo.innerWidth, viewportInfo.innerHeight],
        device_pixel_ratio: viewportInfo.devicePixelRatio,
        width_scale: 1.0,
        height_scale: 1.0,
      };

      return scalingInfo;
    } catch (e) {
      console.log(`⚠️  Error validating screenshot dimensions: ${e}`);
      return {};
    }
  }

  async processResponse(message: Message): Promise<string> {
    let responseText = "";

    for (const block of message.content) {
      if (block.type === "text") {
        responseText += block.text;
        console.log(block.text);
      } else if (block.type === "tool_use") {
        const toolName = block.name;
        const toolInput = block.input as any;

        console.log(`🔧 ${toolName}(${JSON.stringify(toolInput)})`);

        if (toolName === "computer") {
          const action = toolInput.action;
          const params = {
            text: toolInput.text,
            coordinate: toolInput.coordinate,
            scrollDirection: toolInput.scroll_direction,
            scrollAmount: toolInput.scroll_amount,
            duration: toolInput.duration,
            key: toolInput.key,
          };

          try {
            const screenshotBase64 = await this.computer.executeComputerAction(
              action,
              params.text,
              params.coordinate,
              params.scrollDirection,
              params.scrollAmount,
              params.duration,
              params.key
            );

            if (action === "screenshot") {
              this.validateScreenshotDimensions(screenshotBase64);
            }

            const toolResult: ToolResultBlockParam = {
              type: "tool_result",
              tool_use_id: block.id,
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/png",
                    data: screenshotBase64,
                  },
                },
              ],
            };

            this.messages.push({
              role: "assistant",
              content: [block],
            });
            this.messages.push({
              role: "user",
              content: [toolResult],
            });

            return this.getClaudeResponse();
          } catch (error) {
            console.log(`❌ Error executing ${action}: ${error}`);
            const toolResult: ToolResultBlockParam = {
              type: "tool_result",
              tool_use_id: block.id,
              content: `Error executing ${action}: ${String(error)}`,
              is_error: true,
            };

            this.messages.push({
              role: "assistant",
              content: [block],
            });
            this.messages.push({
              role: "user",
              content: [toolResult],
            });

            return this.getClaudeResponse();
          }
        }
      }
    }

    if (
      responseText &&
      !message.content.some((block) => block.type === "tool_use")
    ) {
      this.messages.push({
        role: "assistant",
        content: responseText,
      });
    }

    return responseText;
  }

  async getClaudeResponse(): Promise<string> {
    try {
      const response = await this.client.beta.messages.create(
        {
          model: this.model,
          max_tokens: 4096,
          messages: this.messages,
          tools: this.tools,
        },
        {
          headers: {
            "anthropic-beta": this.modelConfig.betaFlag,
          },
        }
      );

      return this.processResponse(response);
    } catch (error) {
      const errorMsg = `Error communicating with Claude: ${error}`;
      console.log(`❌ ${errorMsg}`);
      return errorMsg;
    }
  }

  async executeTask(
    task: string,
    printSteps: boolean = true,
    debug: boolean = false,
    maxIterations: number = 50
  ): Promise<string> {
    this.messages = [
      {
        role: "user",
        content: this.systemPrompt,
      },
      {
        role: "user",
        content: task,
      },
    ];

    let iterations = 0;
    let consecutiveNoActions = 0;
    let lastAssistantMessages: string[] = [];

    console.log(`🎯 Executing task: ${task}`);
    console.log("=".repeat(60));

    const isTaskComplete = (
      content: string
    ): { completed: boolean; reason?: string } => {
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

      if (this.messages.length > 0) {
        const lastMessage = this.messages[this.messages.length - 1];
        if (
          lastMessage?.role === "assistant" &&
          typeof lastMessage.content === "string"
        ) {
          const content = lastMessage.content;

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
            lastAssistantMessages.shift();
          }
        }
      }

      if (debug) {
        pp(this.messages);
      }

      try {
        const response = await this.client.beta.messages.create(
          {
            model: this.model,
            max_tokens: 4096,
            messages: this.messages,
            tools: this.tools,
          },
          {
            headers: {
              "anthropic-beta": this.modelConfig.betaFlag,
            },
          }
        );

        if (debug) {
          pp(response);
        }

        for (const block of response.content) {
          if (block.type === "tool_use") {
            hasActions = true;
          }
        }

        await this.processResponse(response);

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

    const assistantMessages = this.messages.filter(
      (item) => item.role === "assistant"
    );
    const finalMessage = assistantMessages[assistantMessages.length - 1];

    if (finalMessage && typeof finalMessage.content === "string") {
      return finalMessage.content;
    }

    return "Task execution completed (no final message)";
  }
}

async function main(): Promise<void> {
  console.log("🚀 Steel + Claude Computer Use Assistant");
  console.log("=".repeat(60));

  if (STEEL_API_KEY === "your-steel-api-key-here") {
    console.warn(
      "⚠️  WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key"
    );
    console.warn(
      "   Get your API key at: https://app.steel.dev/settings/api-keys"
    );
    throw new Error("Set STEEL_API_KEY");
  }

  if (ANTHROPIC_API_KEY === "your-anthropic-api-key-here") {
    console.warn(
      "⚠️  WARNING: Please replace 'your-anthropic-api-key-here' with your actual Anthropic API key"
    );
    console.warn("   Get your API key at: https://console.anthropic.com/");
    throw new Error("Set ANTHROPIC_API_KEY");
  }

  console.log("\nStarting Steel browser session...");

  const computer = new SteelBrowser();

  try {
    await computer.initialize();
    console.log("✅ Steel browser session started!");

    const agent = new ClaudeAgent(computer, "claude-sonnet-4-5-20250929");

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
      throw new Error("Task execution failed");
    }
  } catch (error) {
    console.log(`❌ Failed to start Steel browser: ${error}`);
    console.log("Please check your STEEL_API_KEY and internet connection.");
    throw new Error("Failed to start Steel browser");
  } finally {
    await computer.cleanup();
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("Task execution failed:", error);
    process.exit(1);
  });
