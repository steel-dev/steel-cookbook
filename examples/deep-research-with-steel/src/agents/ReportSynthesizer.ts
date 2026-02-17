/**
 * ReportSynthesizer Agent - Final Report Generation and Content Synthesis
 *
 * OVERVIEW:
 * The ReportSynthesizer is the final component in the research pipeline, responsible for
 * transforming filtered research summaries into a comprehensive, well-structured
 * report using structured AI generation. It generates both the executive summary and
 * main report content simultaneously in a structured format.
 *
 * CORRECT ARCHITECTURE FLOW:
 * THE BRAIN (ContentEvaluator) → ContentRefiner → ReportSynthesizer
 * - THE BRAIN decides when research is complete
 * - ContentRefiner filters/ranks RefinedContent[] and returns filtered list
 * - ReportSynthesizer generates structured report from filtered RefinedContent[] only
 *
 * INPUTS:
 * - filteredSummaries: RefinedContent[] - Filtered summaries from ContentRefiner
 * - query: String - The original research question
 *
 * OUTPUTS:
 * - ResearchReport: Comprehensive report with:
 *   - Executive Summary (generated structurally)
 *   - Report Content (generated structurally)
 *   - Citation list with source attribution
 *   - Metadata about the research process
 *
 * POSITION IN RESEARCH FLOW:
 * 1. **FINAL SYNTHESIS** (End of research pipeline):
 *    - Receives filtered summaries from ContentRefiner
 *    - Generates comprehensive report using centralized reportPrompt with structured output
 *    - Provides streaming structured output for real-time feedback
 *
 * 2. **CONTENT ORGANIZATION**:
 *    - Uses AI to synthesize filtered summaries into coherent narrative
 *    - Implements proper citation formatting
 *    - Generates executive summary and main content simultaneously
 *
 * KEY FEATURES:
 * - Structured generation for executive summary and report content
 * - Professional report formatting with citations
 * - Comprehensive metadata generation
 * - Source attribution and bibliography
 * - Uses centralized reportPrompt from prompts module
 * - Real-time streaming of structured data
 *
 * REPORT STRUCTURE:
 * 1. Executive Summary (generated separately)
 * 2. Report Content with:
 *    - Background & Context
 *    - Key Findings (organized by theme)
 *    - Detailed Analysis (with inline citations)
 *    - Conclusions & Recommendations
 *    - References/Bibliography
 *
 * TECHNICAL FEATURES:
 * - Structured output generation with AI SDK
 * - Citation management and formatting
 * - Metadata enrichment
 * - Source diversity analysis
 * - Streaming structured data support
 *
 * USAGE EXAMPLE:
 * ```typescript
 * const synthesizer = new ReportSynthesizer(writerProvider, eventEmitter);
 * const report = await synthesizer.generateReport(filteredSummaries, query);
 * // Returns: ResearchReport with structured content and citations
 * ```
 */

import { EventEmitter } from "events";
import { z } from "zod";
import { RefinedContent, ResearchReport, Citation } from "../core/interfaces";
import { prompts } from "../prompts/prompts";
import { BaseAgent } from "../core/BaseAgent";
import { EventFactory } from "../core/events";

// Zod schema for structured report generation
const StructuredReportSchema = z.object({
  executiveSummary: z
    .string()
    .describe(
      "3-4 paragraph executive summary highlighting key findings, implications, and conclusions"
    ),
  reportContent: z
    .string()
    .describe(
      "Complete research report with Background & Context, Key Findings, Analysis & Insights, Conclusions & Recommendations, and References sections. Use Markdown formatting with proper headings, lists, and structure. Include inline citations using [1], [2] format."
    ),
});

type StructuredReportOutput = z.infer<typeof StructuredReportSchema>;

export class ReportSynthesizer extends BaseAgent {
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
   * Generate a comprehensive research report from filtered summaries using structured output
   *
   * This is the main synthesis method that transforms filtered research summaries
   * into a well-structured, professional report. It uses the centralized reportPrompt
   * and generates structured output with both executive summary and report content.
   *
   * CORRECT ARCHITECTURE: Works with filtered RefinedContent[] from ContentRefiner,
   * NOT learnings from THE BRAIN.
   *
   * PROCESS FLOW:
   * 1. Input validation and preprocessing
   * 2. Report prompt construction using centralized prompts
   * 3. Structured generation with AI (executive summary + report content)
   * 4. Content post-processing and metadata generation
   * 5. Citation and reference management
   *
   * The method generates structured output for both executive summary and report content.
   */
  async generateReport(
    filteredSummaries: RefinedContent[], // NEW: Filtered summaries from ContentRefiner
    query: string
  ): Promise<ResearchReport> {
    const sessionId = this.getCurrentSessionId();
    const startTime = Date.now();

    // Emit tool call start for report generation
    const toolCallEvent = EventFactory.createToolCallStart(
      sessionId,
      "analyze",
      {
        action: "report_synthesis",
        query,
        metadata: {
          sourceCount: filteredSummaries.length,
          totalContentLength: filteredSummaries.reduce(
            (sum, s) => sum + s.summary.length,
            0
          ),
        },
      }
    );
    this.emit("tool-call", toolCallEvent);
    const toolCallId = toolCallEvent.toolCallId;

    try {
      // Validate required inputs
      if (!filteredSummaries || filteredSummaries.length === 0) {
        throw new Error("No filtered summaries provided for report generation");
      }

      if (!query || query.trim() === "") {
        throw new Error("No query provided for report generation");
      }

      // Use centralized reportPrompt for consistent report generation
      const prompt = prompts.reportPrompt(query, filteredSummaries);

      console.log(" =================================");
      console.log(" =REPORT PROMPT");
      console.log(prompt);
      console.log(" =================================");

      // Generate structured report with executive summary and content using BaseAgent helper
      const structuredOutput =
        await this.generateStructured<StructuredReportOutput>(
          prompt,
          StructuredReportSchema,
          "writer",
          {
            maxTokens: 10000, // Increased for more comprehensive reports
            temperature: 0.3,
            streaming: true, // Enable streaming for real-time updates
          }
        );

      // Generate citations from filtered summaries
      const citations = this.generateCitations(filteredSummaries);

      const report: ResearchReport = {
        id: this.generateReportId(),
        query,
        executiveSummary: structuredOutput.executiveSummary,
        content: structuredOutput.reportContent,
        citations,
        metadata: {
          generatedAt: new Date(),
          sourceCount: filteredSummaries.length,
          model: this.getModelName(),
          researchDepth: this.calculateResearchDepth(filteredSummaries),
        },
      };

      // Emit successful tool result
      const toolResultEvent = EventFactory.createToolCallEnd(
        sessionId,
        toolCallId,
        "synthesize",
        true,
        {
          reportId: report.id,
          citationCount: report.citations.length,
          contentLength: report.content.length,
          executiveSummaryLength: report.executiveSummary.length,
          researchDepth: report.metadata.researchDepth,
        },
        undefined,
        new Date(startTime)
      );
      this.emit("tool-result", toolResultEvent);

      return report;
    } catch (error) {
      // Emit error result
      const toolErrorEvent = EventFactory.createToolCallEnd(
        sessionId,
        toolCallId,
        "synthesize",
        false,
        undefined,
        error instanceof Error ? error.message : String(error),
        new Date(startTime)
      );
      this.emit("tool-result", toolErrorEvent);

      throw error;
    }
  }

  /**
   * Generate citation objects from refined content
   *
   * This method creates properly formatted citations for all sources used
   * in the research, with sequential numbering and relevant quotes where available.
   *
   * NEW ARCHITECTURE: Works with RefinedContent[] which always has summary data.
   *
   * CITATION FORMAT:
   * - Sequential numbering [1], [2], [3]...
   * - URL and title for each source
   * - Access date for web sources
   * - Relevant quote/summary from summarized content
   */
  private generateCitations(findings: RefinedContent[]): Citation[] {
    return findings.map((finding, index) => {
      const citation: Citation = {
        id: (index + 1).toString(),
        url: finding.url,
        title: finding.title,
        accessDate: finding.scrapedAt, // Use actual scrape date instead of citation generation date
      };

      // RefinedContent always has summary data
      citation.relevantQuote = finding.summary;

      return citation;
    });
  }

  /**
   * Generate unique report ID
   *
   * Creates a unique identifier for the research report combining
   * timestamp and random string for uniqueness.
   */
  private generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get the AI model name for metadata
   *
   * Extracts the model name from the AI provider for inclusion in
   * report metadata. Useful for tracking which model generated the report.
   */
  private getModelName(): string {
    try {
      // Get the writer provider and extract model name
      const writerProvider = this.getLLM("writer");
      if (writerProvider && writerProvider.modelId) {
        return writerProvider.modelId;
      }
      return "ai-writer-model";
    } catch (error) {
      return "unknown";
    }
  }

  /**
   * Calculate research depth based on source diversity
   *
   * This method analyzes the diversity of sources used in the research
   * to estimate the research depth. More diverse sources indicate
   * deeper research coverage.
   *
   * NEW ARCHITECTURE: Works with RefinedContent[] from summarized research.
   *
   * DEPTH CALCULATION:
   * - Counts unique domains/sources
   * - Higher domain diversity = higher depth score
   * - Provides insight into research breadth
   */
  private calculateResearchDepth(findings: RefinedContent[]): number {
    // Calculate research depth based on number of sources and their diversity
    const uniqueDomains = new Set(
      findings.map((f) => {
        try {
          return new URL(f.url).hostname;
        } catch {
          return f.url;
        }
      })
    );

    // Simple depth calculation: number of unique domains
    return uniqueDomains.size;
  }
}
