import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { generateObject, generateText, streamText } from "ai";
import Steel from "steel-sdk";
import { DeepResearchConfig } from "../core/interfaces";
import { z } from "zod";

// Provider types
export type Provider =
  | ReturnType<typeof createOpenAI>
  | ReturnType<typeof createAnthropic>;

// Provider configuration interface
export interface ProviderConfig {
  name: "openai" | "anthropic" | "together";
  apiKey: string;
  model: string;
}

// AI Provider Factory
export class AIProviderFactory {
  static createProvider(config: ProviderConfig): any {
    try {
      switch (config.name) {
        case "openai":
          return createOpenAI({ apiKey: config.apiKey })(config.model);
        case "anthropic":
          return createAnthropic({ apiKey: config.apiKey })(config.model);
        case "together":
          // Together AI uses OpenAI-compatible API
          return createOpenAI({
            apiKey: config.apiKey,
            baseURL: "https://api.together.xyz/v1",
          })(config.model);
        default:
          throw new Error(`Unsupported AI provider: ${config.name}`);
      }
    } catch (error) {
      throw new Error(
        `Failed to create AI provider ${config.name}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  static async testProvider(provider: any): Promise<boolean> {
    try {
      const { text } = await generateText({
        model: provider,
        prompt: "Hello, respond with 'test successful'",
        maxTokens: 10,
      });
      return text.toLowerCase().includes("test successful");
    } catch (error) {
      console.error("Provider test failed:", error);
      return false;
    }
  }
}

// Steel Client Wrapper
export class SteelClient {
  private client: Steel;
  private retryAttempts: number;
  private timeout: number;
  private originalApiKey: string | undefined;

  constructor(
    apiKey: string,
    retryAttempts: number = 3,
    timeout: number = 30000
  ) {
    // Store original STEEL_API_KEY and temporarily set the test key
    this.originalApiKey = process.env.STEEL_API_KEY;
    process.env.STEEL_API_KEY = apiKey;
    
    // Steel client reads from environment variable
    this.client = new Steel();
    this.retryAttempts = retryAttempts;
    this.timeout = timeout;
  }

  // Restore original API key when done
  private restoreApiKey() {
    if (this.originalApiKey !== undefined) {
      process.env.STEEL_API_KEY = this.originalApiKey;
    }
  }

  async scrape(
    url: string,
    options: {
      format?: Array<"html" | "readability" | "cleaned_html" | "markdown">;
      timeout?: number;
    } = {}
  ): Promise<any> {
    const maxRetries = this.retryAttempts;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.client.scrape({
          url,
          format: options.format || ["markdown"],
        });

        // Basic validation
        if (!result) {
          throw new Error("No result returned from Steel API");
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxRetries) {
          throw new Error(
            `Steel scraping failed after ${maxRetries} attempts: ${lastError.message}`
          );
        }

        // Wait before retrying (exponential backoff)
        await new Promise((resolve) =>
          setTimeout(resolve, Math.pow(2, attempt) * 1000)
        );
      }
    }

    throw lastError;
  }

  async testConnection(): Promise<boolean> {
    try {
      // Test with a simple, reliable URL
      const result = await this.scrape("https://example.com");
      return !!result;
    } catch (error) {
      console.error("Steel connection test failed:", error);
      return false;
    } finally {
      this.restoreApiKey();
    }
  }

  // Clean up method to restore original API key
  cleanup() {
    this.restoreApiKey();
  }
}

// Main Provider Manager
export class ProviderManager {
  private aiProvider: any;
  private aiWriter: any;
  private steelClient: SteelClient;
  private config: DeepResearchConfig;

  constructor(config: DeepResearchConfig) {
    this.config = config;
    this.aiProvider = AIProviderFactory.createProvider(config.ai.provider);
    this.aiWriter = AIProviderFactory.createProvider(config.ai.writer);
    this.steelClient = new SteelClient(
      config.steel.apiKey,
      config.search.retryAttempts,
      config.search.timeout
    );
  }

  getAIProvider(): any {
    return this.aiProvider;
  }

  getAIWriter(): any {
    return this.aiWriter;
  }

  getSteelClient(): SteelClient {
    return this.steelClient;
  }

  async testAllProviders(): Promise<{
    ai: boolean;
    writer: boolean;
    steel: boolean;
  }> {
    const results = await Promise.allSettled([
      AIProviderFactory.testProvider(this.aiProvider),
      AIProviderFactory.testProvider(this.aiWriter),
      this.steelClient.testConnection(),
    ]);

    return {
      ai: results[0].status === "fulfilled" && results[0].value,
      writer: results[1].status === "fulfilled" && results[1].value,
      steel: results[2].status === "fulfilled" && results[2].value,
    };
  }
}

// Helper functions for common operations
export async function generateStructuredOutput<T>(
  provider: any,
  prompt: string,
  schema: z.ZodType<T>
): Promise<T> {
  try {
    const { object } = await generateObject({
      model: provider,
      prompt,
      schema,
    });
    return object;
  } catch (error) {
    throw new Error(
      `Failed to generate structured output: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function generateTextOutput(
  provider: any,
  prompt: string,
  options: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
  try {
    const { text } = await generateText({
      model: provider,
      prompt,
      maxTokens: options.maxTokens || 1000,
      temperature: options.temperature || 0.7,
    });
    return text;
  } catch (error) {
    throw new Error(
      `Failed to generate text: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

export async function* streamTextOutput(
  provider: any,
  prompt: string,
  options: { maxTokens?: number; temperature?: number } = {}
): AsyncGenerator<string, void, unknown> {
  try {
    const stream = await streamText({
      model: provider,
      prompt,
      maxTokens: options.maxTokens || 1000,
      temperature: options.temperature || 0.7,
    });

    for await (const delta of stream.textStream) {
      yield delta;
    }
  } catch (error) {
    throw new Error(
      `Failed to stream text: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
