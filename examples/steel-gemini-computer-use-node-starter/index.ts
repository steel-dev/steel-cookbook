/*
 * Gemini AI agent for autonomous web interactions with Steel computers.
 * https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-gemini-computer-use-node-starter
 */

import * as dotenv from "dotenv";
import { Steel } from "steel-sdk";
import {
  GoogleGenAI,
  Content,
  Part,
  FunctionCall,
  FunctionResponse,
  Tool,
  Environment,
  GenerateContentConfig,
  GenerateContentResponse,
  Candidate,
  FinishReason,
} from "@google/genai";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "your-gemini-api-key-here";
const TASK = process.env.TASK || "Go to Steel.dev and find the latest news";

const MODEL = "gemini-2.5-computer-use-preview-10-2025";
const MAX_COORDINATE = 1000;

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
  - Chromium is already open; interact only through computer use actions (mouse, keyboard, scroll, screenshots).
  - Today's date is ${formatToday()}.
  </BROWSER_ENV>
  
  <BROWSER_CONTROL>
  - When viewing pages, zoom out or scroll so all relevant content is visible.
  - When typing into any input:
    * Clear it first with Ctrl+A, then Delete.
    * After submitting (pressing Enter or clicking a button), wait for the page to load.
  - Computer tool calls are slow; batch related actions into a single call whenever possible.
  - You may act on the user's behalf on sites where they are already authenticated.
  - Assume any required authentication/Auth Contexts are already configured before the task starts.
  - If the first screenshot is black:
    * Click near the center of the screen.
    * Take another screenshot.
  </BROWSER_CONTROL>
  
  <TASK_EXECUTION>
  - You receive exactly one natural-language task and no further user feedback.
  - Do not ask the user clarifying questions; instead, make reasonable assumptions and proceed.
  - For complex tasks, quickly plan a short, ordered sequence of steps before acting.
  - Prefer minimal, high-signal actions that move directly toward the goal.
  - Keep your final response concise and focused on fulfilling the task (e.g., a brief summary of findings or results).
  </TASK_EXECUTION>`;

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
  button: "left" | "right" | "middle";
  coordinates: Coordinates;
  num_clicks?: number;
};

type DragMouseRequest = BaseActionRequest & {
  action: "drag_mouse";
  path: Coordinates[];
};

type ScrollRequest = BaseActionRequest & {
  action: "scroll";
  coordinates: Coordinates;
  delta_x: number;
  delta_y: number;
};

type PressKeyRequest = BaseActionRequest & {
  action: "press_key";
  keys: string[];
};

type TypeTextRequest = BaseActionRequest & {
  action: "type_text";
  text: string;
};

type WaitRequest = BaseActionRequest & {
  action: "wait";
  duration: number;
};

type TakeScreenshotRequest = {
  action: "take_screenshot";
};

type ComputerActionRequest =
  | MoveMouseRequest
  | ClickMouseRequest
  | DragMouseRequest
  | ScrollRequest
  | PressKeyRequest
  | TypeTextRequest
  | WaitRequest
  | TakeScreenshotRequest;

interface SteelComputerResponse {
  base64_image?: string;
}

interface ActionResult {
  screenshotBase64: string;
  url?: string;
}

class Agent {
  private client: GoogleGenAI;
  private steel: Steel;
  private session: Steel.Session | null = null;
  private contents: Content[];
  private tools: Tool[];
  private config: GenerateContentConfig;
  private viewportWidth: number;
  private viewportHeight: number;
  private currentUrl: string;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    this.steel = new Steel({ steelAPIKey: STEEL_API_KEY });
    this.contents = [];
    this.currentUrl = "about:blank";

    this.viewportWidth = 1280;
    this.viewportHeight = 768;

    this.tools = [
      {
        computerUse: {
          environment: Environment.ENVIRONMENT_BROWSER,
        },
      },
    ];

    this.config = {
      tools: this.tools,
    };
  }

  private denormalizeX(x: number): number {
    return Math.round((x / MAX_COORDINATE) * this.viewportWidth);
  }

  private denormalizeY(y: number): number {
    return Math.round((y / MAX_COORDINATE) * this.viewportHeight);
  }

  private center(): Coordinates {
    return [
      Math.floor(this.viewportWidth / 2),
      Math.floor(this.viewportHeight / 2),
    ];
  }

  private normalizeKey(key: string): string {
    if (!key) return key;
    const k = key.trim();
    const upper = k.toUpperCase();
    const synonyms: Record<string, string> = {
      ENTER: "Enter",
      RETURN: "Enter",
      ESC: "Escape",
      ESCAPE: "Escape",
      TAB: "Tab",
      BACKSPACE: "Backspace",
      DELETE: "Delete",
      SPACE: "Space",
      CTRL: "Control",
      CONTROL: "Control",
      ALT: "Alt",
      SHIFT: "Shift",
      META: "Meta",
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

  async initialize(): Promise<void> {
    this.session = await this.steel.sessions.create({
      dimensions: { width: this.viewportWidth, height: this.viewportHeight },
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
    const resp = (await this.steel.sessions.computer(this.session!.id, {
      action: "take_screenshot",
    })) as SteelComputerResponse;
    const img = resp?.base64_image;
    if (!img) throw new Error("No screenshot returned from Steel");
    return img;
  }

  private async executeComputerAction(
    functionCall: FunctionCall
  ): Promise<ActionResult> {
    const name = functionCall.name ?? "";
    const args = (functionCall.args ?? {}) as Record<string, unknown>;

    let body: ComputerActionRequest | null = null;

    switch (name) {
      case "open_web_browser": {
        const screenshot = await this.takeScreenshot();
        return { screenshotBase64: screenshot, url: this.currentUrl };
      }

      case "click_at": {
        const x = this.denormalizeX(args.x as number);
        const y = this.denormalizeY(args.y as number);
        body = {
          action: "click_mouse",
          button: "left",
          coordinates: [x, y],
          screenshot: true,
        };
        break;
      }

      case "hover_at": {
        const x = this.denormalizeX(args.x as number);
        const y = this.denormalizeY(args.y as number);
        body = {
          action: "move_mouse",
          coordinates: [x, y],
          screenshot: true,
        };
        break;
      }

      case "type_text_at": {
        const x = this.denormalizeX(args.x as number);
        const y = this.denormalizeY(args.y as number);
        const text = args.text as string;
        const pressEnter = args.press_enter !== false;
        const clearBeforeTyping = args.clear_before_typing !== false;

        await this.steel.sessions.computer(this.session!.id, {
          action: "click_mouse",
          button: "left",
          coordinates: [x, y],
        });

        if (clearBeforeTyping) {
          await this.steel.sessions.computer(this.session!.id, {
            action: "press_key",
            keys: ["Control", "a"],
          });
          await this.steel.sessions.computer(this.session!.id, {
            action: "press_key",
            keys: ["Backspace"],
          });
        }

        await this.steel.sessions.computer(this.session!.id, {
          action: "type_text",
          text: text,
        });

        if (pressEnter) {
          await this.steel.sessions.computer(this.session!.id, {
            action: "press_key",
            keys: ["Enter"],
          });
        }

        await this.steel.sessions.computer(this.session!.id, {
          action: "wait",
          duration: 1,
        });

        const screenshot = await this.takeScreenshot();
        return { screenshotBase64: screenshot, url: this.currentUrl };
      }

      case "scroll_document": {
        const direction = args.direction as string;
        let keys: string[];
        if (direction === "down") {
          keys = ["PageDown"];
        } else if (direction === "up") {
          keys = ["PageUp"];
        } else if (direction === "left" || direction === "right") {
          const [cx, cy] = this.center();
          const delta = direction === "left" ? -400 : 400;
          body = {
            action: "scroll",
            coordinates: [cx, cy],
            delta_x: delta,
            delta_y: 0,
            screenshot: true,
          };
          break;
        } else {
          keys = ["PageDown"];
        }
        body = {
          action: "press_key",
          keys: keys,
          screenshot: true,
        };
        break;
      }

      case "scroll_at": {
        const x = this.denormalizeX(args.x as number);
        const y = this.denormalizeY(args.y as number);
        const direction = args.direction as string;
        const magnitude = this.denormalizeY((args.magnitude as number) ?? 800);

        let deltaX = 0;
        let deltaY = 0;
        if (direction === "down") {
          deltaY = magnitude;
        } else if (direction === "up") {
          deltaY = -magnitude;
        } else if (direction === "right") {
          deltaX = magnitude;
        } else if (direction === "left") {
          deltaX = -magnitude;
        }

        body = {
          action: "scroll",
          coordinates: [x, y],
          delta_x: deltaX,
          delta_y: deltaY,
          screenshot: true,
        };
        break;
      }

      case "wait_5_seconds": {
        body = {
          action: "wait",
          duration: 5,
          screenshot: true,
        };
        break;
      }

      case "go_back": {
        body = {
          action: "press_key",
          keys: ["Alt", "ArrowLeft"],
          screenshot: true,
        };
        break;
      }

      case "go_forward": {
        body = {
          action: "press_key",
          keys: ["Alt", "ArrowRight"],
          screenshot: true,
        };
        break;
      }

      case "search": {
        await this.steel.sessions.computer(this.session!.id, {
          action: "press_key",
          keys: ["Control", "l"],
        });
        await this.steel.sessions.computer(this.session!.id, {
          action: "type_text",
          text: "https://www.google.com",
        });
        await this.steel.sessions.computer(this.session!.id, {
          action: "press_key",
          keys: ["Enter"],
        });
        await this.steel.sessions.computer(this.session!.id, {
          action: "wait",
          duration: 2,
        });
        this.currentUrl = "https://www.google.com";
        const screenshot = await this.takeScreenshot();
        return { screenshotBase64: screenshot, url: this.currentUrl };
      }

      case "navigate": {
        let url = args.url as string;
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          url = "https://" + url;
        }
        await this.steel.sessions.computer(this.session!.id, {
          action: "press_key",
          keys: ["Control", "l"],
        });
        await this.steel.sessions.computer(this.session!.id, {
          action: "type_text",
          text: url,
        });
        await this.steel.sessions.computer(this.session!.id, {
          action: "press_key",
          keys: ["Enter"],
        });
        await this.steel.sessions.computer(this.session!.id, {
          action: "wait",
          duration: 2,
        });
        this.currentUrl = url;
        const screenshot = await this.takeScreenshot();
        return { screenshotBase64: screenshot, url: this.currentUrl };
      }

      case "key_combination": {
        const keysStr = args.keys as string;
        const keys = keysStr.split("+").map((k) => k.trim());
        const normalizedKeys = this.normalizeKeys(keys);
        body = {
          action: "press_key",
          keys: normalizedKeys,
          screenshot: true,
        };
        break;
      }

      case "drag_and_drop": {
        const startX = this.denormalizeX(args.x as number);
        const startY = this.denormalizeY(args.y as number);
        const endX = this.denormalizeX(args.destination_x as number);
        const endY = this.denormalizeY(args.destination_y as number);
        body = {
          action: "drag_mouse",
          path: [
            [startX, startY],
            [endX, endY],
          ],
          screenshot: true,
        };
        break;
      }

      default: {
        console.log(`Unknown action: ${name}, taking screenshot`);
        const screenshot = await this.takeScreenshot();
        return { screenshotBase64: screenshot, url: this.currentUrl };
      }
    }

    if (body) {
      const resp = (await this.steel.sessions.computer(
        this.session!.id,
        body
      )) as SteelComputerResponse;
      const img = resp?.base64_image;
      if (img) {
        return { screenshotBase64: img, url: this.currentUrl };
      }
    }

    const screenshot = await this.takeScreenshot();
    return { screenshotBase64: screenshot, url: this.currentUrl };
  }

  private extractFunctionCalls(candidate: Candidate): FunctionCall[] {
    const functionCalls: FunctionCall[] = [];
    if (!candidate.content?.parts) return functionCalls;

    for (const part of candidate.content.parts) {
      if (part.functionCall) {
        functionCalls.push(part.functionCall);
      }
    }
    return functionCalls;
  }

  private extractText(candidate: Candidate): string {
    if (!candidate.content?.parts) return "";
    const texts: string[] = [];
    for (const part of candidate.content.parts) {
      if (part.text) {
        texts.push(part.text);
      }
    }
    return texts.join(" ").trim();
  }

  private buildFunctionResponseParts(
    functionCalls: FunctionCall[],
    results: ActionResult[]
  ): Part[] {
    const parts: Part[] = [];

    for (let i = 0; i < functionCalls.length; i++) {
      const fc = functionCalls[i];
      const result = results[i];

      const functionResponse: FunctionResponse = {
        name: fc.name ?? "",
        response: { url: result.url ?? this.currentUrl },
      };
      parts.push({ functionResponse });

      parts.push({
        inlineData: {
          mimeType: "image/png",
          data: result.screenshotBase64,
        },
      });
    }

    return parts;
  }

  async executeTask(
    task: string,
    printSteps: boolean = true,
    maxIterations: number = 50
  ): Promise<string> {
    this.contents = [
      {
        role: "user",
        parts: [{ text: BROWSER_SYSTEM_PROMPT }, { text: task }],
      },
    ];

    let iterations = 0;
    let consecutiveNoActions = 0;

    console.log(`🎯 Executing task: ${task}`);
    console.log("=".repeat(60));

    while (iterations < maxIterations) {
      iterations++;

      try {
        const response: GenerateContentResponse =
          await this.client.models.generateContent({
            model: MODEL,
            contents: this.contents,
            config: this.config,
          });

        if (!response.candidates || response.candidates.length === 0) {
          console.log("❌ No candidates in response");
          break;
        }

        const candidate = response.candidates[0];

        if (candidate.content) {
          this.contents.push(candidate.content);
        }

        const reasoning = this.extractText(candidate);
        const functionCalls = this.extractFunctionCalls(candidate);

        if (
          !functionCalls.length &&
          !reasoning &&
          candidate.finishReason === FinishReason.MALFORMED_FUNCTION_CALL
        ) {
          console.log("⚠️ Malformed function call, retrying...");
          continue;
        }

        if (!functionCalls.length) {
          if (reasoning) {
            if (printSteps) {
              console.log(`\n💬 ${reasoning}`);
            }
            console.log("✅ Task complete - model provided final response");
            break;
          }
          consecutiveNoActions++;
          if (consecutiveNoActions >= 3) {
            console.log(
              "⚠️ No actions for 3 consecutive iterations - stopping"
            );
            break;
          }
          continue;
        }

        consecutiveNoActions = 0;

        if (printSteps && reasoning) {
          console.log(`\n💭 ${reasoning}`);
        }

        const results: ActionResult[] = [];
        for (const fc of functionCalls) {
          const actionName = fc.name ?? "unknown";
          const actionArgs = fc.args ?? {};
          if (printSteps) {
            console.log(`🔧 ${actionName}(${JSON.stringify(actionArgs)})`);
          }

          if (actionArgs) {
            const safetyDecision = actionArgs.safety_decision as
              | Record<string, unknown>
              | undefined;
            if (safetyDecision?.decision === "require_confirmation") {
              console.log(
                `⚠️ Safety confirmation required: ${safetyDecision.explanation}`
              );
              console.log("✅ Auto-acknowledging safety check");
            }
          }

          const result = await this.executeComputerAction(fc);
          results.push(result);
        }

        const functionResponseParts = this.buildFunctionResponseParts(
          functionCalls,
          results
        );
        this.contents.push({
          role: "user",
          parts: functionResponseParts,
        });
      } catch (error) {
        console.error(`❌ Error during task execution: ${error}`);
        throw error;
      }
    }

    if (iterations >= maxIterations) {
      console.warn(
        `⚠️ Task execution stopped after ${maxIterations} iterations`
      );
    }

    for (let i = this.contents.length - 1; i >= 0; i--) {
      const content = this.contents[i];
      if (content.role === "model") {
        const text = content.parts
          ?.filter((p) => p.text)
          .map((p) => p.text)
          .join(" ")
          .trim();
        if (text) {
          return text;
        }
      }
    }

    return "Task execution completed (no final message)";
  }
}

async function main(): Promise<void> {
  console.log("🚀 Steel + Gemini Computer Use Assistant");
  console.log("=".repeat(60));

  if (STEEL_API_KEY === "your-steel-api-key-here") {
    console.warn(
      "⚠️ WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key"
    );
    console.warn(
      "   Get your API key at: https://app.steel.dev/settings/api-keys"
    );
    throw new Error("Set STEEL_API_KEY");
  }

  if (GEMINI_API_KEY === "your-gemini-api-key-here") {
    console.warn(
      "⚠️ WARNING: Please replace 'your-gemini-api-key-here' with your actual Gemini API key"
    );
    console.warn("   Get your API key at: https://aistudio.google.com/apikey");
    throw new Error("Set GEMINI_API_KEY");
  }

  console.log("\nStarting Steel session...");
  const agent = new Agent();

  try {
    await agent.initialize();
    console.log("✅ Steel session started!");

    const startTime = Date.now();
    const result = await agent.executeTask(TASK, true, 50);
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
