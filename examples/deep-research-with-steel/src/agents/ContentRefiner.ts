/**
 * ContentRefiner Agent - Simple Content Ranking and Filtering
 *
 * OVERVIEW:
 * In THE BRAIN architecture, ContentRefiner has a much simpler role - it just ranks
 * and filters RefinedContent[] to select the best sources for report generation.
 * All strategic decision-making is handled by THE BRAIN (ContentEvaluator).
 *
 * SIMPLIFIED ARCHITECTURE:
 * - Ranks RefinedContent[] by relevance, novelty, authority
 * - Filters to top-N sources for report generation
 * - Returns indices/scores for selected content
 * - NO strategic decision-making (handled by THE BRAIN)
 * - NO learning accumulation (handled by THE BRAIN)
 *
 * INPUTS:
 * - originalQuery: String - The main research question
 * - refinedContent: RefinedContent[] - ALL accumulated summaries
 * - maxSources: Number - Maximum sources to select for report (default 10)
 *
 * OUTPUTS:
 * - RankingResult: Selected indices and scores for report generation
 *
 * POSITION IN RESEARCH FLOW (NEW):
 * 1. QueryPlanner → called ONCE at beginning
 * 2. SearchAgent ↔ ContentEvaluator (THE BRAIN) → research loop
 * 3. **ContentRefiner** → ranks and filters final RefinedContent[]
 * 4. ReportSynthesizer → generates report from filtered summaries
 *
 * RANKING CRITERIA:
 * - Relevance to original query
 * - Content quality and depth
 * - Source authority and credibility
 * - Recency and currency
 * - Diversity of perspectives
 *
 * USAGE EXAMPLE:
 * ```typescript
 * const refiner = new ContentRefiner(providerManager, eventEmitter);
 * const ranking = await refiner.rankAndFilterContent(
 *   "AI in healthcare",
 *   allRefinedContent,
 *   10
 * );
 * const filteredContent = ranking.selectedIndices.map(i => allRefinedContent[i]);
 * ```
 */

import { EventEmitter } from "events";
import { z } from "zod";
// import { ProviderManager } from "../providers/providers"; // Removed - using BaseAgent now
import { BaseAgent } from "../core/BaseAgent";
import { RefinedContent } from "../core/interfaces";
import { EventFactory } from "../core/events";
import { prompts } from "../prompts/prompts";

// NEW: Simple ranking result interface
export interface RankingResult {
  selectedIndices: number[]; // Indices of top-ranked content
  rankings: Array<{
    index: number;
    score: number;
    rationale: string;
  }>;
  reasoning: string; // Overall selection criteria and decisions
}

export class ContentRefiner extends BaseAgent {
  constructor(
    models: {
      planner: any;
      evaluator: any;
      writer: any;
      summary: any;
    },
    parentEmitter: EventEmitter
  ) {
    super(models, parentEmitter);
  }

  /**
   * Rank and filter content for report generation
   *
   * This is the main method in THE BRAIN architecture. It simply ranks
   * RefinedContent[] and returns the top sources for report generation.
   * No complex decision-making - just ranking and filtering.
   */
  async rankAndFilterContent(
    originalQuery: string,
    refinedContent: RefinedContent[],
    maxSources: number = 10
  ): Promise<RankingResult> {
    const sessionId = this.getCurrentSessionId();
    const startTime = Date.now();

    // Emit ranking start
    const toolCallEvent = EventFactory.createToolCallStart(
      sessionId,
      "analyze",
      {
        action: "content_ranking",
        query: originalQuery,
        metadata: {
          totalSources: refinedContent.length,
          maxSources,
        },
      }
    );
    this.emit("tool-call", toolCallEvent);
    const toolCallId = toolCallEvent.toolCallId;

    try {
      // Validate inputs
      if (!refinedContent || refinedContent.length === 0) {
        throw new Error("No refined content provided for ranking");
      }

      // If we have fewer sources than maxSources, return all
      if (refinedContent.length <= maxSources) {
        const allIndices = Array.from(
          { length: refinedContent.length },
          (_, i) => i
        );

        const result: RankingResult = {
          selectedIndices: allIndices,
          rankings: allIndices.map((index) => ({
            index,
            score: 0.8, // Default high score for all content
            rationale: "Included - sufficient content available",
          })),
          reasoning: `All ${refinedContent.length} sources selected (under limit of ${maxSources})`,
        };

        this.emit(
          "tool-result",
          EventFactory.createToolCallEnd(
            sessionId,
            toolCallId,
            "analyze",
            true,
            {
              selectedCount: result.selectedIndices.length,
              totalSources: refinedContent.length,
              selectionType: "all_sources",
            },
            undefined,
            new Date(startTime)
          )
        );

        return result;
      }

      // Use centralized ranking prompt for LLM-powered ranking
      const rankingPrompt = prompts.rankAndRefinePrompt(
        originalQuery,
        refinedContent,
        maxSources
      );
      console.log("================================================");

      console.log("Ranking prompt:", rankingPrompt);
      console.log("================================================");

      // Generate ranking using structured output with proper Zod schema
      const rankingDecision = await this.generateStructured<RankingResult>(
        rankingPrompt,
        z.object({
          selectedIndices: z
            .array(z.number())
            .describe("Array of indices of selected summaries"),
          rankings: z.array(
            z.object({
              index: z.number(),
              score: z.number().min(0).max(1),
              rationale: z.string(),
            })
          ),
          reasoning: z
            .string()
            .describe("Overall selection criteria and decisions"),
        }),
        "evaluator"
      );

      console.log("================================================");
      console.log("Ranking decision:", rankingDecision);
      console.log("================================================");

      // Validate ranking results
      this.validateRankingResult(
        rankingDecision,
        refinedContent.length,
        maxSources
      );

      const toolResultEvent = EventFactory.createToolCallEnd(
        sessionId,
        toolCallId,
        "analyze",
        true,
        {
          selectedCount: rankingDecision.selectedIndices.length,
          totalSources: refinedContent.length,
          averageScore:
            rankingDecision.rankings.reduce((sum, r) => sum + r.score, 0) /
            rankingDecision.rankings.length,
          selectionType: "llm_ranking",
        },
        undefined,
        new Date(startTime)
      );
      this.emit("tool-result", toolResultEvent);

      return rankingDecision;
    } catch (error) {
      // Emit error and provide fallback ranking
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      this.emit(
        "tool-result",
        EventFactory.createToolCallEnd(
          sessionId,
          toolCallId,
          "analyze",
          false,
          undefined,
          errorMessage,
          new Date(startTime)
        )
      );

      // FALLBACK: Simple ranking by recency and length
      const fallbackIndices = refinedContent
        .map((content, index) => ({
          index,
          score:
            content.summary.length / 1000 +
            (Date.now() - content.scrapedAt.getTime()) / 1000000,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, maxSources)
        .map((item) => item.index);

      const fallbackResult: RankingResult = {
        selectedIndices: fallbackIndices,
        rankings: fallbackIndices.map((index) => ({
          index,
          score: 0.6, // Conservative score for fallback
          rationale: "Fallback ranking by content length and recency",
        })),
        reasoning: `Fallback ranking due to error: ${errorMessage}. Selected ${fallbackIndices.length} sources based on content length and recency.`,
      };

      return fallbackResult;
    }
  }

  /**
   * Validate ranking results for consistency
   */
  private validateRankingResult(
    result: RankingResult,
    totalSources: number,
    maxSources: number
  ): void {
    // Check selected indices are valid
    for (const index of result.selectedIndices) {
      if (index < 0 || index >= totalSources) {
        throw new Error(
          `Invalid selected index: ${index}. Must be between 0 and ${
            totalSources - 1
          }`
        );
      }
    }

    // Check we don't exceed maxSources
    if (result.selectedIndices.length > maxSources) {
      throw new Error(
        `Too many sources selected: ${result.selectedIndices.length} > ${maxSources}`
      );
    }

    // Check rankings match selected indices
    const rankingIndices = result.rankings.map((r) => r.index);
    const selectedSet = new Set(result.selectedIndices);
    const rankingSet = new Set(rankingIndices);

    if (
      selectedSet.size !== rankingSet.size ||
      [...selectedSet].some((i) => !rankingSet.has(i))
    ) {
      throw new Error("Mismatch between selectedIndices and rankings");
    }

    // Check scores are valid
    for (const ranking of result.rankings) {
      if (ranking.score < 0 || ranking.score > 1) {
        throw new Error(
          `Invalid score: ${ranking.score}. Must be between 0 and 1`
        );
      }
    }
  }

  /**
   * LEGACY: Get filtered content directly (for backward compatibility)
   */
  async getFilteredContent(
    originalQuery: string,
    refinedContent: RefinedContent[],
    maxSources: number = 10
  ): Promise<RefinedContent[]> {
    const ranking = await this.rankAndFilterContent(
      originalQuery,
      refinedContent,
      maxSources
    );
    return ranking.selectedIndices
      .map((index) => refinedContent[index])
      .filter((content): content is RefinedContent => content !== undefined);
  }
}
