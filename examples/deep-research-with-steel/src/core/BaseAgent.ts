import { EventEmitter } from "events";
import { ProviderManager } from "../providers/providers";
import { DeepResearchEvent } from "./interfaces";

/**
 * BaseAgent – shared helper functionality for all concrete agents.
 *
 * Responsibility:
 * 1. Hold a reference to the global ProviderManager so that concrete
 *    agents can access any AI / Steel provider without receiving them
 *    piecemeal via constructors.
 * 2. Provide a canonical `getCurrentSessionId()` helper to end the
 *    copy-pasted implementations scattered across agents.
 * 3. Provide a small `emitStructuredEvent` wrapper that guarantees we
 *    always forward structured events both to the agent itself *and*
 *    to the parent orchestrator (DeepResearchAgent).
 */
export abstract class BaseAgent extends EventEmitter {
  protected readonly providerManager: ProviderManager;
  /**
   * Reference to the parent `DeepResearchAgent` (or any `EventEmitter` that
   * exposes `currentSessionId`).  We intentionally keep the type loose to
   * avoid a circular dependency between core modules.
   */
  protected readonly parentEmitter: EventEmitter & {
    currentSessionId?: string;
  };

  constructor(
    providerManager: ProviderManager,
    parentEmitter: EventEmitter & { currentSessionId?: string }
  ) {
    super();
    this.providerManager = providerManager;
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
}
