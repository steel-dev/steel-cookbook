/*
 * OpenAI AI agent for autonomous web interactions with Steel computers (no Playwright).
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-oai-computer-use-node-starter
 */

import * as dotenv from "dotenv";
import { Steel } from "steel-sdk";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "your-openai-api-key-here";
const TASK = process.env.TASK || "Go to Steel.dev and find the latest news";

function formatToday(): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "2-digit",
    year: "numeric",
  }).format(new Date());
}

const BROWSER_SYSTEM_PROMPT = `<BROWSER_ENV>
  - You control a headful Chromium browser running in a VM with internet access.
  - Interact only through the computer tool (mouse/keyboard/scroll/screenshots). Do not call navigation functions.
  - Today's date is ${formatToday()}.
  </BROWSER_ENV>
  
  <BROWSER_CONTROL>
  - Before acting, take a screenshot to observe state.
  - When typing into any input:
    * Clear with Ctrl/⌘+A, then Delete.
    * After submitting (Enter or clicking a button), take another screenshot and move the mouse aside.
  - Computer calls are slow; batch related actions together.
  - Zoom out or scroll so all relevant content is visible before reading.
  - If the first screenshot is black, click near center and screenshot again.
  </BROWSER_CONTROL>
  
  <TASK_EXECUTION>
  - You receive exactly one natural-language task and no further user feedback.
  - Do not ask clarifying questions; make reasonable assumptions and proceed.
  - Prefer minimal, high-signal actions that move directly toward the goal.
  - Keep the final response concise and focused on fulfilling the task.
  </TASK_EXECUTION>`;

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
      }
    | string;
}
interface ResponseItem {
  id: string;
  output: (MessageItem | FunctionCallItem | ComputerCallItem)[];
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

type Coordinates = [number, number];
interface BaseActionRequest {
  screenshot?: boolean;
  hold_keys?: string[];
}
type MoveMouseRequest = BaseActionRequest & {
  action: "move_mouse";
  coordinates: Coordinates;
};
type ClickMouseRequest = BaseActionRequest & {
  action: "click_mouse";
  button: "left" | "right" | "middle" | "back" | "forward";
  coordinates?: Coordinates;
  num_clicks?: number;
  click_type?: "down" | "up" | "click";
};
type DragMouseRequest = BaseActionRequest & {
  action: "drag_mouse";
  path: Coordinates[];
};
type ScrollRequest = BaseActionRequest & {
  action: "scroll";
  coordinates?: Coordinates;
  delta_x?: number;
  delta_y?: number;
};
type PressKeyRequest = BaseActionRequest & {
  action: "press_key";
  keys: string[];
  duration?: number;
};
type TypeTextRequest = BaseActionRequest & {
  action: "type_text";
  text: string;
};
type WaitRequest = BaseActionRequest & {
  action: "wait";
  duration: number;
};
type TakeScreenshotRequest = { action: "take_screenshot" };
type GetCursorPositionRequest = { action: "get_cursor_position" };
type ComputerActionRequest =
  | MoveMouseRequest
  | ClickMouseRequest
  | DragMouseRequest
  | ScrollRequest
  | PressKeyRequest
  | TypeTextRequest
  | WaitRequest
  | TakeScreenshotRequest
  | GetCursorPositionRequest;

class Agent {
  private steel: Steel;
  private session: any | null = null;
  private model: string;
  private tools: any[];
  private viewportWidth: number;
  private viewportHeight: number;
  private systemPrompt: string;
  private printSteps: boolean = true;
  private autoAcknowledgeSafety: boolean = true;

  constructor() {
    this.steel = new Steel({ steelAPIKey: STEEL_API_KEY });
    this.model = "computer-use-preview";
    this.viewportWidth = 1280;
    this.viewportHeight = 768;
    this.systemPrompt = BROWSER_SYSTEM_PROMPT;
    this.tools = [
      {
        type: "computer-preview",
        display_width: this.viewportWidth,
        display_height: this.viewportHeight,
        environment: "browser",
      },
    ];
  }

  private center(): [number, number] {
    return [
      Math.floor(this.viewportWidth / 2),
      Math.floor(this.viewportHeight / 2),
    ];
  }

  private toNumber(v: any, def = 0): number {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      return Number.isFinite(n) ? n : def;
    }
    return def;
  }

  private toCoords(x?: any, y?: any): Coordinates {
    const xx = this.toNumber(x, this.center()[0]);
    const yy = this.toNumber(y, this.center()[1]);
    return [xx, yy];
  }

  async initialize(): Promise<void> {
    const width = this.viewportWidth;
    const height = this.viewportHeight;
    this.session = await this.steel.sessions.create({
      dimensions: { width, height },
      blockAds: true,
      timeout: 900000,
    });
    console.log("Steel Session created successfully!");
    console.log(`View live session at: ${this.session.sessionViewerUrl}`);
  }

  async cleanup(): Promise<void> {
    if (this.session) {
      console.log("Releasing Steel session...");
      await this.steel.sessions.release(this.session.id);
      console.log(
        `Session completed. View replay at ${this.session.sessionViewerUrl}`
      );
      this.session = null;
    }
  }

  private async takeScreenshot(): Promise<string> {
    const resp: any = await this.steel.sessions.computer(this.session!.id, {
      action: "take_screenshot",
    });
    const img: string | undefined = resp?.base64_image;
    if (!img) throw new Error("No screenshot returned from Steel");
    return img;
  }

  private splitKeys(k?: string | string[]): string[] {
    if (Array.isArray(k)) return k.filter(Boolean) as string[];
    if (!k) return [];
    return k
      .split("+")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  private mapButton(btn?: string): ClickMouseRequest["button"] {
    const b = (btn || "left").toLowerCase();
    if (b === "right" || b === "middle" || b === "back" || b === "forward")
      return b;
    return "left";
  }

  private normalizeKey(key: string): string {
    if (!key) return key;
    const k = String(key).trim();
    const upper = k.toUpperCase();
    const synonyms: Record<string, string> = {
      ENTER: "Enter",
      RETURN: "Enter",
      ESC: "Escape",
      ESCAPE: "Escape",
      TAB: "Tab",
      BACKSPACE: "Backspace",
      BKSP: "Backspace",
      DELETE: "Delete",
      DEL: "Delete",
      SPACE: "Space",
      CTRL: "Control",
      CONTROL: "Control",
      ALT: "Alt",
      SHIFT: "Shift",
      META: "Meta",
      SUPER: "Meta",
      CMD: "Meta",
      COMMAND: "Meta",
      UP: "ArrowUp",
      DOWN: "ArrowDown",
      LEFT: "ArrowLeft",
      RIGHT: "ArrowRight",
      ARROWUP: "ArrowUp",
      ARROWDOWN: "ArrowDown",
      ARROWLEFT: "ArrowLeft",
      ARROWRIGHT: "ArrowRight",
      HOME: "Home",
      END: "End",
      PAGEUP: "PageUp",
      PAGEDOWN: "PageDown",
      INSERT: "Insert",
    };
    if (upper in synonyms) return synonyms[upper];
    if (upper.startsWith("F") && /^\d+$/.test(upper.slice(1))) {
      return "F" + upper.slice(1);
    }
    return k;
  }

  private normalizeKeys(keys: string[]): string[] {
    return keys.map((k) => this.normalizeKey(k));
  }

  private async executeComputerAction(
    actionType: string,
    actionArgs: any
  ): Promise<string> {
    let body: ComputerActionRequest | null = null;

    switch (actionType) {
      case "move": {
        const coords = this.toCoords(actionArgs.x, actionArgs.y);
        body = {
          action: "move_mouse",
          coordinates: coords,
          screenshot: true,
        };
        break;
      }
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
      case "doubleClick":
      case "double_click": {
        const coords = this.toCoords(actionArgs.x, actionArgs.y);
        body = {
          action: "click_mouse",
          button: "left",
          coordinates: coords,
          num_clicks: 2,
          screenshot: true,
        };
        break;
      }
      case "drag": {
        const path = Array.isArray(actionArgs.path) ? actionArgs.path : [];
        const steelPath: Coordinates[] = path.map((p: any) =>
          this.toCoords(p.x, p.y)
        );
        if (steelPath.length < 2) {
          const [cx, cy] = this.center();
          steelPath.unshift([cx, cy]);
        }
        body = {
          action: "drag_mouse",
          path: steelPath,
          screenshot: true,
        };
        break;
      }
      case "scroll": {
        const coords =
          actionArgs.x != null || actionArgs.y != null
            ? this.toCoords(actionArgs.x, actionArgs.y)
            : undefined;
        const delta_x = this.toNumber(actionArgs.scroll_x, 0);
        const delta_y = this.toNumber(actionArgs.scroll_y, 0);
        body = {
          action: "scroll",
          ...(coords ? { coordinates: coords } : {}),
          ...(delta_x !== 0 ? { delta_x } : {}),
          ...(delta_y !== 0 ? { delta_y } : {}),
          screenshot: true,
        };
        break;
      }
      case "type": {
        const text = typeof actionArgs.text === "string" ? actionArgs.text : "";
        body = {
          action: "type_text",
          text,
          screenshot: true,
        };
        break;
      }
      case "keypress": {
        const keys = Array.isArray(actionArgs.keys)
          ? actionArgs.keys
          : this.splitKeys(actionArgs.keys);
        const normalized = this.normalizeKeys(keys);
        body = {
          action: "press_key",
          keys: normalized,
          screenshot: true,
        };
        break;
      }
      case "wait": {
        const ms = this.toNumber(actionArgs.ms, 1000);
        const seconds = Math.max(0.001, ms / 1000);
        body = {
          action: "wait",
          duration: seconds,
          screenshot: true,
        };
        break;
      }
      case "screenshot": {
        return this.takeScreenshot();
      }
      default: {
        return this.takeScreenshot();
      }
    }

    const resp: any = await this.steel.sessions.computer(
      this.session!.id,
      body!
    );
    const img: string | undefined = resp?.base64_image;
    if (img) return img;
    return this.takeScreenshot();
  }

  private async handleItem(
    item: MessageItem | FunctionCallItem | ComputerCallItem
  ): Promise<OutputItem[]> {
    if (item.type === "message") {
      if (this.printSteps) {
        console.log(item.content[0].text);
      }
      return [];
    }
    if (item.type === "function_call") {
      if (this.printSteps) {
        console.log(`${item.name}(${item.arguments})`);
      }
      return [
        {
          type: "function_call_output",
          call_id: item.call_id,
          output: "success",
        },
      ];
    }
    if (item.type === "computer_call") {
      const { action } = item;
      const actionType = action.type;
      const { type, ...actionArgs } = action;

      if (this.printSteps) {
        console.log(`${actionType}(${JSON.stringify(actionArgs)})`);
      }

      const screenshotBase64 = await this.executeComputerAction(
        actionType,
        actionArgs
      );

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
    let lastAssistantTexts: string[] = [];

    console.log(`🎯 Executing task: ${task}`);
    console.log("=".repeat(60));

    const detectRepetition = (text: string): boolean => {
      if (lastAssistantTexts.length < 2) return false;
      const words1 = text.toLowerCase().split(/\s+/);
      return lastAssistantTexts.some((prev) => {
        const words2 = prev.toLowerCase().split(/\s+/);
        const common = words1.filter((w) => words2.includes(w));
        return common.length / Math.max(words1.length, words2.length) > 0.8;
      });
    };

    while (iterations < maxIterations) {
      iterations++;
      let hasActions = false;

      if (
        newItems.length > 0 &&
        newItems[newItems.length - 1]?.role === "assistant"
      ) {
        const last = newItems[newItems.length - 1];
        const content = last.content?.[0]?.text;
        if (content) {
          if (detectRepetition(content)) {
            console.log("🔄 Repetition detected - stopping execution");
            lastAssistantTexts.push(content);
            break;
          }
          lastAssistantTexts.push(content);
          if (lastAssistantTexts.length > 3) lastAssistantTexts.shift();
        }
      }

      try {
        const response = await createResponse({
          model: this.model,
          input: [...inputItems, ...newItems],
          tools: this.tools,
          truncation: "auto",
        });

        if (!response.output) {
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
  console.log("🚀 Steel + OpenAI Computer Use Assistant (Steel actions)");
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
  if (OPENAI_API_KEY === "your-openai-api-key-here") {
    console.warn(
      "⚠️  WARNING: Please replace 'your-openai-api-key-here' with your actual OpenAI API key"
    );
    console.warn("   Get your API key at: https://platform.openai.com/");
    throw new Error("Set OPENAI_API_KEY");
  }

  console.log("\nStarting Steel session...");
  const agent = new Agent();

  try {
    await agent.initialize();
    console.log("✅ Steel session started!");

    const startTime = Date.now();
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
    console.log(`❌ Failed to run: ${error}`);
    throw error;
  } finally {
    await agent.cleanup();
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
