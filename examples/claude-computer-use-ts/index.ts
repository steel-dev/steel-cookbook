import * as dotenv from "dotenv";
import { Steel } from "steel-sdk";
import Anthropic from "@anthropic-ai/sdk";
import type {
  ImageBlockParam,
  Message,
  MessageParam,
  ToolResultBlockParam,
  ToolUnion,
  ToolUseBlock,
} from "@anthropic-ai/sdk/resources/messages/messages";

dotenv.config();

const STEEL_API_KEY = process.env.STEEL_API_KEY || "your-steel-api-key-here";
const ANTHROPIC_API_KEY =
  process.env.ANTHROPIC_API_KEY || "your-anthropic-api-key-here";
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
  - Chromium is already open; interact only through the computer tools (mouse, keyboard, scroll, screenshots).
  - Today's date is ${formatToday()}.
  </BROWSER_ENV>
  
  <BROWSER_CONTROL>
  - When viewing pages, zoom out or scroll so all relevant content is visible.
  - When typing into any input:
    * Clear it first with Ctrl+A, then Delete.
    * After submitting (pressing Enter or clicking a button), take an extra screenshot to confirm the result and move the mouse away.
  - Each turn is slow; send related actions together in one turn whenever possible.
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

const NOT_EXECUTED =
  "Not executed: an earlier computer action in this turn failed.";

type Coordinates = [number, number];

type MemberInput = {
  coordinate?: Coordinates;
  start_coordinate?: Coordinates;
  text?: string;
  scroll_direction?: "up" | "down" | "left" | "right";
  scroll_amount?: number;
  duration?: number;
  repeat?: number;
};

const SCROLL_DELTAS: Record<
  NonNullable<MemberInput["scroll_direction"]>,
  [number, number]
> = {
  up: [0, -100],
  down: [0, 100],
  left: [-100, 0],
  right: [100, 0],
};

class Agent {
  private client: Anthropic;
  private steel: Steel;
  private session: Steel.Session | null = null;
  private messages: MessageParam[];
  private tools: ToolUnion[];
  private model: string;
  private systemPrompt: string;
  private viewportWidth: number;
  private viewportHeight: number;
  private cursor: Coordinates;

  constructor() {
    this.client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    this.steel = new Steel({ steelAPIKey: STEEL_API_KEY });
    this.model = "claude-opus-5-5";
    this.messages = [];

    this.viewportWidth = 1280;
    this.viewportHeight = 768;
    this.cursor = [
      Math.floor(this.viewportWidth / 2),
      Math.floor(this.viewportHeight / 2),
    ];

    this.systemPrompt = BROWSER_SYSTEM_PROMPT;

    this.tools = [
      {
        type: "computer_toolset_20260801",
        configs: {
          zoom: { enabled: false },
          triple_click: { enabled: false },
          left_mouse_down: { enabled: false },
          left_mouse_up: { enabled: false },
          hold_key: { enabled: false },
        },
      },
    ];
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
        `Session completed. View replay at ${this.session.sessionViewerUrl}`,
      );
    }
  }

  private async act(
    body: Steel.SessionComputerParams,
  ): Promise<Steel.SessionComputerResponse> {
    const resp = await this.steel.sessions.computer(this.session!.id, body);
    if (resp.error) throw new Error(resp.error);
    return resp;
  }

  private async screenshot(): Promise<ImageBlockParam> {
    const resp = await this.act({ action: "take_screenshot" });
    if (!resp.base64_image) throw new Error("Steel returned no screenshot");
    return {
      type: "image",
      source: {
        type: "base64",
        media_type: "image/png",
        data: resp.base64_image,
      },
    };
  }

  private point(coordinate?: Coordinates): Coordinates {
    if (coordinate) this.cursor = [coordinate[0], coordinate[1]];
    return this.cursor;
  }

  private async runMember(name: string, input: MemberInput): Promise<string> {
    switch (name) {
      case "mouse_move": {
        await this.act({
          action: "move_mouse",
          coordinates: this.point(input.coordinate),
        });
        return "OK";
      }
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
      case "left_click_drag": {
        if (!input.start_coordinate || !input.coordinate) {
          throw new Error("left_click_drag needs start_coordinate and coordinate");
        }
        await this.act({
          action: "drag_mouse",
          path: [input.start_coordinate, input.coordinate],
        });
        this.point(input.coordinate);
        return "OK";
      }
      case "scroll": {
        if (input.text) {
          throw new Error("Holding modifier keys during a scroll is not supported");
        }
        const [delta_x, delta_y] =
          SCROLL_DELTAS[input.scroll_direction ?? "down"];
        const coordinates = this.point(input.coordinate);
        for (let i = 0; i < Math.max(1, input.scroll_amount ?? 1); i++) {
          await this.act({ action: "scroll", coordinates, delta_x, delta_y });
        }
        return "OK";
      }
      case "type": {
        await this.act({ action: "type_text", text: input.text ?? "" });
        return "OK";
      }
      case "key": {
        const keys = (input.text ?? "")
          .split("+")
          .map((k) => k.trim())
          .filter(Boolean);
        for (let i = 0; i < Math.max(1, input.repeat ?? 1); i++) {
          await this.act({ action: "press_key", keys });
        }
        return "OK";
      }
      case "wait": {
        await this.act({ action: "wait", duration: input.duration ?? 1 });
        return "OK";
      }
      case "cursor_position": {
        const resp = await this.act({ action: "get_cursor_position" });
        return resp.output ?? `${this.cursor[0]}, ${this.cursor[1]}`;
      }
      default:
        throw new Error(`Unsupported action: ${name}`);
    }
  }

  private async processResponse(
    message: Message,
  ): Promise<{ text: string; hasActions: boolean }> {
    this.messages.push({ role: "assistant", content: message.content });

    let responseText = "";
    const calls: ToolUseBlock[] = [];
    for (const block of message.content) {
      if (block.type === "text") {
        responseText += block.text;
        console.log(block.text);
      } else if (block.type === "tool_use" && block.toolset_name === "computer") {
        calls.push(block);
      }
    }

    if (calls.length === 0) return { text: responseText, hasActions: false };

    const results: ToolResultBlockParam[] = [];
    let failed = false;
    for (const call of calls) {
      console.log(`${call.name}(${JSON.stringify(call.input)})`);
      const result: ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: call.id,
        toolset_name: "computer",
      };
      if (failed) {
        result.content = NOT_EXECUTED;
        result.is_error = true;
      } else {
        try {
          result.content =
            call.name === "screenshot"
              ? [await this.screenshot()]
              : [
                  {
                    type: "text",
                    text: await this.runMember(
                      call.name,
                      call.input as MemberInput,
                    ),
                  },
                ];
        } catch (error) {
          console.log(`Error executing ${call.name}: ${error}`);
          result.content = `Error: ${String(error)}`;
          result.is_error = true;
          failed = true;
        }
      }
      results.push(result);
    }

    const last = results[results.length - 1];
    if (
      !failed &&
      calls[calls.length - 1].name !== "screenshot" &&
      Array.isArray(last.content)
    ) {
      last.content.push(await this.screenshot());
    }

    this.messages.push({ role: "user", content: results });

    return { text: responseText, hasActions: true };
  }

  async executeTask(
    task: string,
    printSteps: boolean = true,
    maxIterations: number = 50,
  ): Promise<string> {
    this.messages = [
      {
        role: "user",
        content: task,
      },
    ];

    let iterations = 0;
    let lastAssistantMessages: string[] = [];

    console.log(`Executing task: ${task}`);
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
        (prevMessage) => similarity(newMessage, prevMessage) > 0.8,
      );
    };

    const extractText = (content: any): string => {
      if (typeof content === "string") return content;
      if (!Array.isArray(content)) return "";
      return content
        .filter((b: any) => b?.type === "text")
        .map((b: any) => b.text ?? "")
        .join("");
    };

    let finalText = "";

    while (iterations < maxIterations) {
      iterations++;

      if (this.messages.length > 0) {
        const lastMessage = this.messages[this.messages.length - 1];
        if (lastMessage?.role === "assistant") {
          const content = extractText(lastMessage.content);
          if (content) {
            if (detectRepetition(content)) {
              console.log("Repetition detected - stopping execution");
              finalText = content;
              break;
            }
            lastAssistantMessages.push(content);
            if (lastAssistantMessages.length > 3) {
              lastAssistantMessages.shift();
            }
          }
        }
      }

      try {
        const response = await this.client.messages.create({
          model: this.model,
          max_tokens: 16000,
          system: this.systemPrompt,
          messages: this.messages,
          tools: this.tools,
        });

        if (response.stop_reason === "refusal") {
          console.log("Claude declined to continue this task");
          finalText = "Claude declined to continue this task";
          break;
        }

        const { text, hasActions } = await this.processResponse(response);

        if (!hasActions) {
          console.log("Task complete - no further actions requested");
          finalText = text;
          break;
        }
      } catch (error) {
        console.error(`Error during task execution: ${error}`);
        throw error;
      }
    }

    if (iterations >= maxIterations) {
      console.warn(
        `Task execution stopped after ${maxIterations} iterations`,
      );
    }

    return finalText || "Task execution completed (no final message)";
  }
}

async function main(): Promise<void> {
  console.log("Steel + Claude Computer Use Assistant");
  console.log("=".repeat(60));

  if (STEEL_API_KEY === "your-steel-api-key-here") {
    console.warn(
      "WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key",
    );
    console.warn(
      "   Get your API key at: https://app.steel.dev/settings/api-keys",
    );
    throw new Error("Set STEEL_API_KEY");
  }

  if (ANTHROPIC_API_KEY === "your-anthropic-api-key-here") {
    console.warn(
      "WARNING: Please replace 'your-anthropic-api-key-here' with your actual Anthropic API key",
    );
    console.warn("   Get your API key at: https://console.anthropic.com/");
    throw new Error("Set ANTHROPIC_API_KEY");
  }

  console.log("\nStarting Steel session...");

  const agent = new Agent();

  try {
    await agent.initialize();
    console.log("Steel session started!");

    const startTime = Date.now();

    try {
      const result = await agent.executeTask(TASK, true, 50);

      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      console.log("\n" + "=".repeat(60));
      console.log("TASK EXECUTION COMPLETED");
      console.log("=".repeat(60));
      console.log(`Duration: ${duration} seconds`);
      console.log(`Task: ${TASK}`);
      console.log(`Result:\n${result}`);
      console.log("=".repeat(60));
    } catch (error) {
      console.error(`Task execution failed: ${error}`);
      throw new Error("Task execution failed");
    }
  } catch (error) {
    console.log(`Failed to start Steel session: ${error}`);
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
