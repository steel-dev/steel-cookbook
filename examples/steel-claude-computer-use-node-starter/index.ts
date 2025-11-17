import * as dotenv from "dotenv";
import { Steel } from "steel-sdk";
import Anthropic from "@anthropic-ai/sdk";
import type {
  MessageParam,
  ToolResultBlockParam,
  Message,
} from "@anthropic-ai/sdk/resources/messages";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
const ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY || "your-anthropic-api-key-here";
const TASK =
  process.env.TASK ||
  "Go to Wikipedia and search for machine learning, summarize the best answer";

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
  - Chromium is already open; interact only through the "computer" tool (mouse, keyboard, scroll, screenshots).
  - Today's date is ${formatToday()}.
  </BROWSER_ENV>
  
  <BROWSER_CONTROL>
  - When viewing pages, zoom out or scroll so all relevant content is visible.
  - When typing into any input:
    * Clear it first with Ctrl+A, then Delete.
    * After submitting (pressing Enter or clicking a button), take an extra screenshot to confirm the result and move the mouse away.
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

class Agent {
  private client: Anthropic;
  private steel: Steel;
  private session: Steel.Session | null = null;
  private messages: MessageParam[];
  private tools: any[];
  private model: string;
  private systemPrompt: string;
  private viewportWidth: number;
  private viewportHeight: number;

  constructor() {
    this.client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    this.steel = new Steel({ steelAPIKey: STEEL_API_KEY });
    this.model = "claude-sonnet-4-5";
    this.messages = [];

    this.viewportWidth = 1280;
    this.viewportHeight = 768;

    this.systemPrompt = BROWSER_SYSTEM_PROMPT;

    this.tools = [
      {
        type: "computer_20250124",
        name: "computer",
        display_width_px: this.viewportWidth,
        display_height_px: this.viewportHeight,
        display_number: 1,
      },
    ];
  }

  private center(): [number, number] {
    return [
      Math.floor(this.viewportWidth / 2),
      Math.floor(this.viewportHeight / 2),
    ];
  }

  private splitKeys(k?: string): string[] {
    return k
      ? k
          .split("+")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
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
    }
  }

  private async takeScreenshot(): Promise<string> {
    const resp: any = await this.steel.sessions.computer(this.session!.id, {
      action: "take_screenshot",
    });
    const img: string | undefined = resp?.base64_image;
    if (!img) throw new Error("No screenshot returned from Input API");
    return img;
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
    const coords =
      coordinate && Array.isArray(coordinate) && coordinate.length === 2
        ? [coordinate[0], coordinate[1]]
        : this.center();

    let body: Record<string, any> | null = null;

    switch (action) {
      case "mouse_move": {
        body = {
          action: "move_mouse",
          coordinates: coords,
          screenshot: true,
        };
        const hk = this.splitKeys(key);
        if (hk.length) body.hold_keys = hk;
        break;
      }
      case "left_mouse_down":
      case "left_mouse_up": {
        body = {
          action: "click_mouse",
          button: "left",
          click_type: action === "left_mouse_down" ? "down" : "up",
          coordinates: coords,
          screenshot: true,
        };
        const hk = this.splitKeys(key);
        if (hk.length) body.hold_keys = hk;
        break;
      }
      case "left_click":
      case "right_click":
      case "middle_click":
      case "double_click":
      case "triple_click": {
        const buttonMap: Record<string, string> = {
          left_click: "left",
          right_click: "right",
          middle_click: "middle",
          double_click: "left",
          triple_click: "left",
        };
        const clicks =
          action === "double_click" ? 2 : action === "triple_click" ? 3 : 1;
        body = {
          action: "click_mouse",
          button: buttonMap[action],
          coordinates: coords,
          screenshot: true,
        };
        if (clicks > 1) body.num_clicks = clicks;
        const hk = this.splitKeys(key);
        if (hk.length) body.hold_keys = hk;
        break;
      }
      case "left_click_drag": {
        const [endX, endY] = coords as [number, number];
        const [startX, startY] = this.center();
        body = {
          action: "drag_mouse",
          path: [
            [startX, startY],
            [endX, endY],
          ],
          screenshot: true,
        };
        const hk = this.splitKeys(key);
        if (hk.length) body.hold_keys = hk;
        break;
      }
      case "scroll": {
        const step = 100;
        const map: Record<string, [number, number]> = {
          down: [0, step * (scrollAmount as number)],
          up: [0, -step * (scrollAmount as number)],
          right: [step * (scrollAmount as number), 0],
          left: [-(step * (scrollAmount as number)), 0],
        };
        const [delta_x, delta_y] = map[scrollDirection as string];
        body = {
          action: "scroll",
          coordinates: coords,
          delta_x,
          delta_y,
          screenshot: true,
        };
        const hk = this.splitKeys(text);
        if (hk.length) body.hold_keys = hk;
        break;
      }
      case "hold_key": {
        const keys = this.splitKeys(text);
        body = {
          action: "press_key",
          keys,
          duration,
          screenshot: true,
        };
        break;
      }
      case "key": {
        const keys = this.splitKeys(text);
        body = {
          action: "press_key",
          keys,
          screenshot: true,
        };
        break;
      }
      case "type": {
        body = {
          action: "type_text",
          text,
          screenshot: true,
        };
        const hk = this.splitKeys(key);
        if (hk.length) body.hold_keys = hk;
        break;
      }
      case "wait": {
        body = {
          action: "wait",
          duration,
          screenshot: true,
        };
        break;
      }
      case "screenshot": {
        return this.takeScreenshot();
      }
      case "cursor_position": {
        await this.steel.sessions.computer(this.session!.id, {
          action: "get_cursor_position",
        });
        return this.takeScreenshot();
      }
      default:
        throw new Error(`Invalid action: ${action}`);
    }

    const resp: any = await this.steel.sessions.computer(
      this.session!.id,
      body! as any
    );
    const img: string | undefined = resp?.base64_image;
    if (img) return img;
    return this.takeScreenshot();
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
            const screenshotBase64 = await this.executeComputerAction(
              action,
              params.text,
              params.coordinate,
              params.scrollDirection,
              params.scrollAmount,
              params.duration,
              params.key
            );

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
      const response = await this.client.beta.messages.create({
        model: this.model,
        max_tokens: 4096,
        messages: this.messages,
        tools: this.tools,
        betas: ["computer-use-2025-01-24"],
      });

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

    const detectRepetition = (newMessage: string): boolean => {
      if (lastAssistantMessages.length < 2) return false;
      const similarity = (str1: string, str2: string): number => {
        const words1 = str1.toLowerCase().split(/\s/);
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
        console.log(JSON.stringify(this.messages, null, 2));
      }

      try {
        const response = await this.client.beta.messages.create({
          model: this.model,
          max_tokens: 4096,
          messages: this.messages,
          tools: this.tools,
          betas: ["computer-use-2025-01-24"],
        });

        if (debug) {
          console.log(JSON.stringify(response, null, 2));
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

  console.log("\nStarting Steel session...");

  const agent = new Agent();

  try {
    await agent.initialize();
    console.log("✅ Steel session started!");

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
    console.log(`❌ Failed to start Steel session: ${error}`);
    console.log("Please check your STEEL_API_KEY and internet connection.");
    throw new Error("Failed to start Steel session");
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
