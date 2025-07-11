import {
  BaseEvent,
  ToolCallStartEvent,
  ToolCallProgressEvent,
  ToolCallEndEvent,
  ResearchProgressEvent,
  TextStreamEvent,
  ResearchMilestoneEvent,
  ResearchErrorEvent,
  ResearchSessionEvent,
  DeepResearchEvent,
} from "./interfaces";

/**
 * EventFactory – centralised helpers to construct strongly-typed events
 * used throughout the Deep Research system.  Extracted from interfaces.ts
 * to reduce the size of that omnibus file and to eliminate circular
 * dependency issues when only the event helpers are needed.
 */
export class EventFactory {
  private static generateId(): string {
    return `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static createToolCallStart(
    sessionId: string,
    toolName: "search" | "scrape" | "screenshot" | "analyze",
    input: any,
    metadata?: Record<string, any>
  ): ToolCallStartEvent {
    const toolCallId = `tool_${Date.now()}_${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    const event: ToolCallStartEvent = {
      id: this.generateId(),
      sessionId,
      type: "tool-call-start",
      timestamp: new Date(),
      toolCallId,
      toolName,
      input,
    } as ToolCallStartEvent;
    if (metadata) {
      event.metadata = metadata;
    }
    return event;
  }

  static createToolCallEnd(
    sessionId: string,
    toolCallId: string,
    toolName: string,
    success: boolean,
    output?: any,
    error?: string,
    startTime?: Date,
    metadata?: Record<string, any>
  ): ToolCallEndEvent {
    const endTime = new Date();
    const duration = startTime ? endTime.getTime() - startTime.getTime() : 0;

    const event: ToolCallEndEvent = {
      id: this.generateId(),
      sessionId,
      type: "tool-call-end",
      timestamp: endTime,
      toolCallId,
      toolName,
      success,
      duration,
    } as ToolCallEndEvent;
    if (output) event.output = output;
    if (error) event.error = error;
    if (metadata) event.metadata = metadata;
    return event;
  }

  static createProgress(
    sessionId: string,
    phase: ResearchProgressEvent["phase"],
    progress: number,
    currentStep?: string,
    totalSteps?: number,
    metadata?: Record<string, any>
  ): ResearchProgressEvent {
    const event: ResearchProgressEvent = {
      id: this.generateId(),
      sessionId,
      type: "research-progress",
      timestamp: new Date(),
      phase,
      progress,
    } as ResearchProgressEvent;
    if (currentStep) event.currentStep = currentStep;
    if (totalSteps) event.totalSteps = totalSteps;
    if (metadata) event.metadata = metadata;
    return event;
  }

  static createTextStream(
    sessionId: string,
    content: string,
    source: "synthesis" | "analysis" | "planning",
    isComplete: boolean = false,
    chunkIndex?: number,
    metadata?: Record<string, any>
  ): TextStreamEvent {
    const event: TextStreamEvent = {
      id: this.generateId(),
      sessionId,
      type: "text-stream",
      timestamp: new Date(),
      content,
      source,
      isComplete,
    } as TextStreamEvent;
    if (chunkIndex !== undefined) event.chunkIndex = chunkIndex;
    if (metadata) event.metadata = metadata;
    return event;
  }

  static createMilestone(
    sessionId: string,
    milestone: ResearchMilestoneEvent["milestone"],
    data: any,
    summary?: string,
    metadata?: Record<string, any>
  ): ResearchMilestoneEvent {
    const event: ResearchMilestoneEvent = {
      id: this.generateId(),
      sessionId,
      type: "research-milestone",
      timestamp: new Date(),
      milestone,
      data,
    } as ResearchMilestoneEvent;
    if (summary) event.summary = summary;
    if (metadata) event.metadata = metadata;
    return event;
  }

  static createError(
    sessionId: string,
    error: string,
    recoverable: boolean = true,
    code?: string,
    phase?: string,
    context?: Record<string, any>
  ): ResearchErrorEvent {
    const event: ResearchErrorEvent = {
      id: this.generateId(),
      sessionId,
      type: "research-error",
      timestamp: new Date(),
      error,
      recoverable,
    } as ResearchErrorEvent;
    if (code) event.code = code;
    if (phase) event.phase = phase;
    if (context) event.context = context;
    return event;
  }

  static createSessionStart(
    sessionId: string,
    query: string,
    options?: Record<string, any>,
    metadata?: Record<string, any>
  ): ResearchSessionEvent {
    const event: ResearchSessionEvent = {
      id: this.generateId(),
      sessionId,
      type: "research-session-start",
      timestamp: new Date(),
      query,
    } as ResearchSessionEvent;
    if (options) event.options = options;
    if (metadata) event.metadata = metadata;
    return event;
  }

  static createSessionEnd(
    sessionId: string,
    query: string,
    result: any,
    metadata?: Record<string, any>
  ): ResearchSessionEvent {
    const event: ResearchSessionEvent = {
      id: this.generateId(),
      sessionId,
      type: "research-session-end",
      timestamp: new Date(),
      query,
      result,
    } as ResearchSessionEvent;
    if (metadata) event.metadata = metadata;
    return event;
  }
}

// Re-export the event types so consumers can import from this module only.
export type {
  BaseEvent,
  ToolCallStartEvent,
  ToolCallProgressEvent,
  ToolCallEndEvent,
  ResearchProgressEvent,
  TextStreamEvent,
  ResearchMilestoneEvent,
  ResearchErrorEvent,
  ResearchSessionEvent,
  DeepResearchEvent,
} from "./interfaces";
