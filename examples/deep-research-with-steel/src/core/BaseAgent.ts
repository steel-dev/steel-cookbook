import { EventEmitter } from "events";
import { generateObject, generateText, streamText, streamObject } from "ai";
import { z } from "zod";
import type { LanguageModel } from "ai";
import {
  DeepResearchEvent,
  TextStreamEvent,
  ToolCallStartEvent,
  ToolCallEndEvent,
  ResearchErrorEvent,
} from "./interfaces";

/**
 * LLM Provider Types for BaseAgent
 */
export type LLMKind = "planner" | "summary" | "writer" | "evaluator";

/**
 * Streaming options for BaseAgent helpers
 */
export interface StreamingOptions {
  maxTokens?: number;
  temperature?: number;
  streaming?: boolean;
  source?: "synthesis" | "analysis" | "planning";
}

/**
 * Structured generation options
 */
export interface StructuredOptions {
  maxTokens?: number;
  temperature?: number;
  streaming?: boolean;
}

/**
 * BaseAgent – shared helper functionality for all concrete agents.
 *
 * Responsibility:
 * 1. Hold references to the specific AI models needed by agents.
 * 2. Provide a canonical `getCurrentSessionId()` helper to end the
 *    copy-pasted implementations scattered across agents.
 * 3. Provide a small `emitStructuredEvent` wrapper that guarantees we
 *    always forward structured events both to the agent itself *and*
 *    to the parent orchestrator (DeepResearchAgent).
 * 4. Provide streaming helpers that emit proper events for AI SDK v5
 * 5. Provide structured output helpers with Zod validation
 * 6. Provide static utilities for agent patterns
 */
export abstract class BaseAgent extends EventEmitter {
  protected readonly models: {
    planner: LanguageModel;
    evaluator: LanguageModel;
    writer: LanguageModel;
    summary: LanguageModel;
  };
  /**
   * Reference to the parent `DeepResearchAgent` (or any `EventEmitter` that
   * exposes `currentSessionId`).  We intentionally keep the type loose to
   * avoid a circular dependency between core modules.
   */
  protected readonly parentEmitter: EventEmitter & {
    currentSessionId?: string;
  };

  constructor(
    models: {
      planner: LanguageModel;
      evaluator: LanguageModel;
      writer: LanguageModel;
      summary: LanguageModel;
    },
    parentEmitter: EventEmitter & { currentSessionId?: string }
  ) {
    super();
    this.models = models;
    this.parentEmitter = parentEmitter;
  }

  /**
   * Retrieve the session id that the root agent generated for the current
   * research run.  If we cannot locate it we lazily create a throw-away id so
   * that unit tests and standalone agent usage keep working.
   */
  protected getCurrentSessionId(): string {
    const inParent = this.parentEmitter?.currentSessionId;
    if (typeof inParent === "string" && inParent.length > 0) {
      return inParent;
    }
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Helper to bubble a structured event up to the parent orchestrator while
   * also emitting it locally so that sibling listeners attached to the
   * concrete agent still receive it.
   */
  protected emitStructuredEvent(event: DeepResearchEvent): void {
    this.emit(event.type, event);
    this.parentEmitter.emit(event.type, event);
  }

  /**
   * Provider helper - get appropriate LLM for different tasks
   * This prevents subclasses from importing provider layer directly
   */
  protected getLLM(kind: LLMKind): LanguageModel {
    switch (kind) {
      case "planner":
        return this.models.planner;
      case "evaluator":
        return this.models.evaluator;
      case "summary":
        return this.models.summary;
      case "writer":
        return this.models.writer;
      default:
        throw new Error(`Unknown LLM kind: ${kind}`);
    }
  }

  /**
   * Generate text using the AI provider with streaming support
   */
  protected async streamTextHelper(
    kind: LLMKind,
    prompt: string,
    options: StreamingOptions = {}
  ): Promise<string> {
    const llm = this.getLLM(kind);

    if (options.streaming) {
      // Use streaming with event emission
      const { textStream } = await streamText({
        model: llm,
        prompt,
        maxOutputTokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
      });

      let fullText = "";
      for await (const chunk of textStream) {
        fullText += chunk;
        // Create a proper structured event
        const textEvent: TextStreamEvent = {
          id: `text_${Date.now()}`,
          sessionId: this.getCurrentSessionId(),
          timestamp: new Date(),
          type: "text-stream",
          content: chunk,
          source: options.source || "analysis",
          isComplete: false,
        };
        this.emitStructuredEvent(textEvent);
      }
      return fullText;
    } else {
      // Use non-streaming generation
      const { text } = await generateText({
        model: llm,
        prompt,
        maxOutputTokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
      });
      return text;
    }
  }

  /**
   * Stream object helper that emits partial object events
   * Built around AI SDK 5 streamObject
   */
  protected async streamObjectHelper<T>(
    prompt: string,
    schema: z.ZodType<T>,
    kind: LLMKind,
    options: StreamingOptions | StructuredOptions = {}
  ): Promise<T> {
    const model = this.getLLM(kind);
    const sessionId = this.getCurrentSessionId();
    const streamId = `stream_obj_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    try {
      const stream = await streamObject({
        model,
        prompt,
        schema,
        maxOutputTokens: options.maxTokens || 1000,
        temperature: options.temperature || 0.7,
      });

      let partialObject: Partial<T> = {};
      let chunkIndex = 0;
      let previousContent = { executiveSummary: "", reportContent: "" };

      for await (const delta of stream.partialObjectStream) {
        partialObject = { ...partialObject, ...delta };
        chunkIndex++;

        // Emit partial object event (using text-stream type for now)
        const deltaEvent: TextStreamEvent = {
          id: streamId,
          sessionId,
          timestamp: new Date(),
          type: "text-stream",
          content: JSON.stringify(partialObject, null, 2),
          source: (options as any).source || "analysis",
          isComplete: false,
          chunkIndex,
        };
        this.emitStructuredEvent(deltaEvent);

        // For structured output with executiveSummary and reportContent (report generation), emit incremental text
        if (partialObject && typeof partialObject === "object") {
          const currentObj = partialObject as any;

          // Only extract text if this looks like a report structure (has both executiveSummary and reportContent fields)
          if (
            currentObj.hasOwnProperty("executiveSummary") ||
            currentObj.hasOwnProperty("reportContent")
          ) {
            // Check for executiveSummary updates
            if (
              currentObj.executiveSummary &&
              currentObj.executiveSummary !== previousContent.executiveSummary
            ) {
              const newSummaryText = currentObj.executiveSummary.slice(
                previousContent.executiveSummary.length
              );
              if (newSummaryText) {
                this.emit("text", newSummaryText);
              }
              previousContent.executiveSummary = currentObj.executiveSummary;
            }

            // Check for reportContent updates
            if (
              currentObj.reportContent &&
              currentObj.reportContent !== previousContent.reportContent
            ) {
              const newReportText = currentObj.reportContent.slice(
                previousContent.reportContent.length
              );
              if (newReportText) {
                this.emit("text", newReportText);
              }
              previousContent.reportContent = currentObj.reportContent;
            }
          }
        }
      }

      const finalObject = await stream.object;

      // Emit any final text that might have been missed
      if (finalObject && typeof finalObject === "object") {
        const finalObj = finalObject as any;

        // Only extract text if this looks like a report structure
        if (
          finalObj.hasOwnProperty("executiveSummary") ||
          finalObj.hasOwnProperty("reportContent")
        ) {
          // Check for any final executiveSummary updates
          if (
            finalObj.executiveSummary &&
            finalObj.executiveSummary !== previousContent.executiveSummary
          ) {
            const newSummaryText = finalObj.executiveSummary.slice(
              previousContent.executiveSummary.length
            );
            if (newSummaryText) {
              this.emit("text", newSummaryText);
            }
          }

          // Check for any final reportContent updates
          if (
            finalObj.reportContent &&
            finalObj.reportContent !== previousContent.reportContent
          ) {
            const newReportText = finalObj.reportContent.slice(
              previousContent.reportContent.length
            );
            if (newReportText) {
              this.emit("text", newReportText);
            }
          }
        }
      }

      // Emit final object event
      const endEvent: TextStreamEvent = {
        id: streamId,
        sessionId,
        timestamp: new Date(),
        type: "text-stream",
        content: JSON.stringify(finalObject, null, 2),
        source: (options as any).source || "analysis",
        isComplete: true,
        chunkIndex,
      };
      this.emitStructuredEvent(endEvent);

      return finalObject;
    } catch (error) {
      // Emit error event
      const errorEvent: ResearchErrorEvent = {
        id: streamId,
        sessionId,
        timestamp: new Date(),
        type: "research-error",
        error: error instanceof Error ? error.message : String(error),
        phase: "object-streaming",
        recoverable: false,
      };
      this.emitStructuredEvent(errorEvent);
      throw error;
    }
  }

  /**
   * Structured output helper - thin wrapper around generateObject with Zod validation
   * Provides unified error handling and event emission
   */
  protected async generateStructured<T>(
    prompt: string,
    schema: z.ZodType<T>,
    kind: LLMKind,
    options: StructuredOptions = {}
  ): Promise<T> {
    const model = this.getLLM(kind);
    const sessionId = this.getCurrentSessionId();
    const callId = `struct_gen_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;

    try {
      // Emit tool-call-start event
      const startEvent: ToolCallStartEvent = {
        id: callId,
        sessionId,
        timestamp: new Date(),
        type: "tool-call-start",
        toolCallId: callId,
        toolName: "analyze",
        input: {
          action: "generate-structured",
          metadata: { kind, streaming: options.streaming || false },
        },
      };
      this.emitStructuredEvent(startEvent);

      let result: T;

      if (options.streaming) {
        // Use streaming version
        result = await this.streamObjectHelper(prompt, schema, kind, options);
      } else {
        // Use regular generation
        const { object } = await generateObject({
          model,
          prompt,
          schema,
          maxOutputTokens: options.maxTokens || 1000,
          temperature: options.temperature || 0.7,
        });
        result = object;
      }

      // Emit tool-call-end event
      const endEvent: ToolCallEndEvent = {
        id: callId,
        sessionId,
        timestamp: new Date(),
        type: "tool-call-end",
        toolCallId: callId,
        toolName: "analyze",
        success: true,
        output: {
          data: result,
          metadata: { kind, type: "structured-output" },
        },
        duration: Date.now() - new Date(startEvent.timestamp).getTime(),
      };
      this.emitStructuredEvent(endEvent);

      return result;
    } catch (error) {
      // Emit error event
      const errorEvent: ResearchErrorEvent = {
        id: callId,
        sessionId,
        timestamp: new Date(),
        type: "research-error",
        error: error instanceof Error ? error.message : String(error),
        phase: "structured-generation",
        recoverable: false,
        context: { kind, prompt: prompt.slice(0, 100) + "..." },
      };
      this.emitStructuredEvent(errorEvent);
      throw error;
    }
  }

  /**
   * Static utility for preparing step context
   * Provides canonical pattern for step preparation
   */
  static defaultPrepareStep(
    stepNo: number,
    stepName: string,
    totalSteps?: number
  ): {
    stepNo: number;
    stepName: string;
    totalSteps?: number;
    timestamp: Date;
  } {
    const result: {
      stepNo: number;
      stepName: string;
      totalSteps?: number;
      timestamp: Date;
    } = {
      stepNo,
      stepName,
      timestamp: new Date(),
    };

    if (totalSteps !== undefined) {
      result.totalSteps = totalSteps;
    }

    return result;
  }

  /**
   * Static utility for stop conditions
   * Provides canonical pattern for termination logic
   */
  static defaultStopWhen(
    currentDepth: number,
    maxDepth: number,
    completeness: number,
    minCompleteness: number = 0.8
  ): { shouldStop: boolean; reason?: string } {
    if (currentDepth >= maxDepth) {
      return { shouldStop: true, reason: "max-depth-reached" };
    }

    if (completeness >= minCompleteness) {
      return { shouldStop: true, reason: "completeness-threshold-met" };
    }

    return { shouldStop: false };
  }

  /**
   * Static utility for timeout handling
   * Provides canonical pattern for timeout logic
   */
  static defaultTimeoutHandler(
    startTime: Date,
    maxDuration: number
  ): { shouldTimeout: boolean; elapsed: number } {
    const elapsed = Date.now() - startTime.getTime();
    return {
      shouldTimeout: elapsed > maxDuration,
      elapsed,
    };
  }

  /**
   * Protected helper for generating regular text (non-streaming)
   * Provides consistent interface for text generation
   */
  protected async generateText(
    prompt: string,
    kind: LLMKind,
    options: { maxTokens?: number; temperature?: number } = {}
  ): Promise<string> {
    const model = this.getLLM(kind);

    const { text } = await generateText({
      model,
      prompt,
      maxOutputTokens: options.maxTokens || 1000,
      temperature: options.temperature || 0.7,
    });

    return text;
  }
}
