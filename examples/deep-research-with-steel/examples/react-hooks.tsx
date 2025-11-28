/**
 * React Hooks for Deep Research Agent
 *
 * This example demonstrates how to use the new AI SDK v5 compliant event system
 * with React hooks for building interactive research UIs.
 */

import { useState, useEffect, useCallback } from "react";
import { DeepResearchAgent } from "../src/core/DeepResearchAgent";
import {
  DeepResearchEvent,
  ResearchReport,
  ResearchOptions,
  ResearchProgressEvent,
  TextStreamEvent,
  ToolCallStartEvent,
  ToolCallEndEvent,
  ResearchMilestoneEvent,
  ResearchErrorEvent,
  ResearchSessionEvent,
} from "../src/core/interfaces";

// Hook for managing research session state
export function useResearchSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [query, setQuery] = useState<string>("");
  const [result, setResult] = useState<ResearchReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startSession = useCallback((newQuery: string) => {
    setQuery(newQuery);
    setIsActive(true);
    setError(null);
    setResult(null);
  }, []);

  const endSession = useCallback(() => {
    setIsActive(false);
    setSessionId(null);
  }, []);

  return {
    sessionId,
    isActive,
    query,
    result,
    error,
    startSession,
    endSession,
    setSessionId,
    setResult,
    setError,
  };
}

// Hook for tracking research progress
export function useResearchProgress() {
  const [progress, setProgress] = useState({
    phase: "initialization" as ResearchProgressEvent["phase"],
    progress: 0,
    currentStep: "",
    totalSteps: 0,
  });

  const [milestones, setMilestones] = useState<ResearchMilestoneEvent[]>([]);

  const updateProgress = useCallback((event: ResearchProgressEvent) => {
    setProgress({
      phase: event.phase,
      progress: event.progress,
      currentStep: event.currentStep || "",
      totalSteps: event.totalSteps || 0,
    });
  }, []);

  const addMilestone = useCallback((event: ResearchMilestoneEvent) => {
    setMilestones((prev) => [...prev, event]);
  }, []);

  return {
    progress,
    milestones,
    updateProgress,
    addMilestone,
  };
}

// Hook for managing tool calls and their status
export function useToolCalls() {
  const [activeCalls, setActiveCalls] = useState<
    Map<string, ToolCallStartEvent>
  >(new Map());
  const [completedCalls, setCompletedCalls] = useState<ToolCallEndEvent[]>([]);

  const startToolCall = useCallback((event: ToolCallStartEvent) => {
    setActiveCalls((prev) => new Map(prev).set(event.toolCallId, event));
  }, []);

  const endToolCall = useCallback((event: ToolCallEndEvent) => {
    setActiveCalls((prev) => {
      const newMap = new Map(prev);
      newMap.delete(event.toolCallId);
      return newMap;
    });
    setCompletedCalls((prev) => [...prev, event]);
  }, []);

  return {
    activeCalls: Array.from(activeCalls.values()),
    completedCalls,
    startToolCall,
    endToolCall,
  };
}

// Hook for real-time text streaming
export function useTextStream() {
  const [content, setContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [chunks, setChunks] = useState<TextStreamEvent[]>([]);

  const addTextChunk = useCallback((event: TextStreamEvent) => {
    setChunks((prev) => [...prev, event]);
    setContent((prev) => prev + event.content);
    setIsStreaming(!event.isComplete);
  }, []);

  const resetStream = useCallback(() => {
    setContent("");
    setChunks([]);
    setIsStreaming(false);
  }, []);

  return {
    content,
    isStreaming,
    chunks,
    addTextChunk,
    resetStream,
  };
}

// Main hook that orchestrates the entire research process
export function useDeepResearch(agent: DeepResearchAgent) {
  const session = useResearchSession();
  const progress = useResearchProgress();
  const toolCalls = useToolCalls();
  const textStream = useTextStream();
  const [events, setEvents] = useState<DeepResearchEvent[]>([]);

  // Event handler that routes events to appropriate hooks
  const handleEvent = useCallback(
    (event: DeepResearchEvent) => {
      setEvents((prev) => [...prev, event]);

      switch (event.type) {
        case "research-session-start":
          session.setSessionId(event.sessionId);
          break;

        case "research-session-end":
          session.setResult(event.result);
          session.endSession();
          break;

        case "research-progress":
          progress.updateProgress(event);
          break;

        case "research-milestone":
          progress.addMilestone(event);
          break;

        case "tool-call-start":
          toolCalls.startToolCall(event);
          break;

        case "tool-call-end":
          toolCalls.endToolCall(event);
          break;

        case "text-stream":
          textStream.addTextChunk(event);
          break;

        case "research-error":
          session.setError(event.error);
          break;
      }
    },
    [session, progress, toolCalls, textStream]
  );

  // Set up event listeners
  useEffect(() => {
    // Listen to all event types
    const eventTypes = [
      "research-session-start",
      "research-session-end",
      "research-progress",
      "research-milestone",
      "tool-call-start",
      "tool-call-end",
      "text-stream",
      "research-error",
    ];

    eventTypes.forEach((eventType) => {
      agent.on(eventType, handleEvent);
    });

    return () => {
      eventTypes.forEach((eventType) => {
        agent.off(eventType, handleEvent);
      });
    };
  }, [agent, handleEvent]);

  // Research function
  const research = useCallback(
    async (query: string, options?: ResearchOptions) => {
      session.startSession(query);
      textStream.resetStream();

      try {
        const result = await agent.research(query, options);
        return result;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        session.setError(errorMessage);
        throw error;
      }
    },
    [agent, session, textStream]
  );

  return {
    // State
    session,
    progress,
    toolCalls,
    textStream,
    events,

    // Actions
    research,

    // Computed values
    isResearching: session.isActive,
    hasError: !!session.error,
    hasResult: !!session.result,
  };
}

// Example React component using the hooks
export function ResearchInterface({ agent }: { agent: DeepResearchAgent }) {
  const research = useDeepResearch(agent);
  const [query, setQuery] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;

    try {
      await research.research(query, { depth: 2, breadth: 3 });
    } catch (error) {
      console.error("Research failed:", error);
    }
  };

  return (
    <div className="research-interface">
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Enter your research question..."
          disabled={research.isResearching}
        />
        <button type="submit" disabled={research.isResearching}>
          {research.isResearching ? "Researching..." : "Start Research"}
        </button>
      </form>

      {research.isResearching && (
        <div className="progress-section">
          <h3>Progress: {research.progress.progress.phase}</h3>
          <div className="progress-bar">
            <div
              style={{ width: `${research.progress.progress.progress}%` }}
              className="progress-fill"
            />
          </div>
          <p>{research.progress.progress.currentStep}</p>

          <div className="tool-calls">
            <h4>Active Tool Calls:</h4>
            {research.toolCalls.activeCalls.map((call) => (
              <div key={call.toolCallId} className="tool-call">
                🔧 {call.toolName}: {JSON.stringify(call.input)}
              </div>
            ))}
          </div>

          <div className="milestones">
            <h4>Milestones:</h4>
            {research.progress.milestones.map((milestone) => (
              <div key={milestone.id} className="milestone">
                ✅ {milestone.milestone}: {milestone.summary}
              </div>
            ))}
          </div>

          {research.textStream.content && (
            <div className="text-stream">
              <h4>Generated Content:</h4>
              <pre>{research.textStream.content}</pre>
              {research.textStream.isStreaming && (
                <span className="cursor">|</span>
              )}
            </div>
          )}
        </div>
      )}

      {research.hasError && (
        <div className="error">
          <h3>Error:</h3>
          <p>{research.session.error}</p>
        </div>
      )}

      {research.hasResult && (
        <div className="result">
          <h3>Research Complete!</h3>
          <div className="report">
            <h4>Executive Summary:</h4>
            <p>{research.session.result?.executiveSummary}</p>

            <h4>Full Report:</h4>
            <div
              dangerouslySetInnerHTML={{
                __html: research.session.result?.content || "",
              }}
            />

            <h4>Citations:</h4>
            <ul>
              {research.session.result?.citations.map((citation) => (
                <li key={citation.id}>
                  <a
                    href={citation.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {citation.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <div className="event-log">
        <h4>Event Log ({research.events.length} events):</h4>
        <div className="events">
          {research.events.slice(-10).map((event) => (
            <div key={event.id} className="event">
              <span className="event-type">{event.type}</span>
              <span className="event-time">
                {event.timestamp.toLocaleTimeString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
