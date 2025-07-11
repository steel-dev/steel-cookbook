/**
 * ReportSynthesizer Agent - Final Report Generation and Content Synthesis
 *
 * OVERVIEW:
 * The ReportSynthesizer is the final component in the research pipeline, responsible for
 * transforming accumulated research findings and learnings into a comprehensive, well-structured
 * report. It synthesizes information from multiple sources into a coherent narrative with
 * proper citations and professional formatting.
 *
 * INPUTS:
 * - findings: SearchResult[] - All search results from research iterations
 * - query: String - The original research question
 * - learnings: Learning[] - Structured learnings extracted by ContentEvaluator
 *
 * OUTPUTS:
 * - ResearchReport: Comprehensive report with:
 *   - Executive Summary
 *   - Structured content with inline citations
 *   - Citation list with source attribution
 *   - Metadata about the research process
 *
 * POSITION IN RESEARCH FLOW:
 * 1. **FINAL SYNTHESIS** (End of research pipeline):
 *    - Receives all accumulated findings and learnings
 *    - Organizes information by learning type and relevance
 *    - Generates comprehensive report with proper structure
 *    - Provides streaming text output for real-time feedback
 *
 * 2. **CONTENT ORGANIZATION**:
 *    - Categorizes learnings by type (factual, analytical, statistical, procedural)
 *    - Creates logical flow and narrative structure
 *    - Implements proper citation formatting
 *    - Generates executive summary and conclusions
 *
 * KEY FEATURES:
 * - Streaming text generation for real-time output
 * - Structured content organization by learning type
 * - Professional report formatting with citations
 * - Executive summary extraction
 * - Comprehensive metadata generation
 * - Source attribution and bibliography
 * - Configurable AI model for writing style
 *
 * REPORT STRUCTURE:
 * 1. Executive Summary (2-3 paragraphs)
 * 2. Key Findings (organized by theme)
 * 3. Detailed Analysis (with inline citations)
 * 4. Statistical Summary (if applicable)
 * 5. Conclusion
 * 6. References/Bibliography
 *
 * TECHNICAL FEATURES:
 * - Streaming text generation with AI SDK
 * - Intelligent content organization
 * - Citation management and formatting
 * - Metadata enrichment
 * - Source diversity analysis
 *
 * USAGE EXAMPLE:
 * ```typescript
 * const synthesizer = new ReportSynthesizer(writerProvider, eventEmitter);
 * synthesizer.on('text', (chunk) => process.stdout.write(chunk));
 * const report = await synthesizer.generateReport(findings, query, learnings);
 * // Returns: ResearchReport with structured content and citations
 * ```
 */

import { streamText } from "ai";
import { EventEmitter } from "events";
import {
  SearchResult,
  Learning,
  ResearchReport,
  Citation,
} from "../core/interfaces";

export class ReportSynthesizer {
  private writerProvider: any;
  private eventEmitter: EventEmitter;

  constructor(writerProvider: any, eventEmitter: EventEmitter) {
    this.writerProvider = writerProvider;
    this.eventEmitter = eventEmitter;
  }

  /**
   * Generate a comprehensive research report from findings and learnings
   *
   * This is the main synthesis method that transforms all accumulated research
   * into a well-structured, professional report. It organizes information by
   * learning type and generates streaming text output for real-time feedback.
   *
   * PROCESS FLOW:
   * 1. Input validation and preprocessing
   * 2. Learning categorization and organization
   * 3. Prompt construction with structured content
   * 4. Streaming text generation with AI
   * 5. Content post-processing and metadata generation
   * 6. Citation and reference management
   *
   * The method streams text updates in real-time while building the complete report.
   */
  async generateReport(
    findings: SearchResult[],
    query: string,
    learnings: Learning[]
  ): Promise<ResearchReport> {
    this.eventEmitter.emit("progress", {
      phase: "synthesizing",
      progress: 90,
    });

    // Validate required inputs
    if (!findings || findings.length === 0) {
      throw new Error("No findings provided for report generation");
    }

    if (!query || query.trim() === "") {
      throw new Error("No query provided for report generation");
    }

    if (!learnings || learnings.length === 0) {
      throw new Error("No learnings provided for report generation");
    }

    // Organize learnings by type for better report structure
    const factualLearnings = learnings.filter((l) => l.type === "factual");
    const analyticalLearnings = learnings.filter(
      (l) => l.type === "analytical"
    );
    const statisticalLearnings = learnings.filter(
      (l) => l.type === "statistical"
    );
    const proceduralLearnings = learnings.filter(
      (l) => l.type === "procedural"
    );

    // Create the comprehensive prompt for AI report generation
    const prompt = this.buildReportPrompt(
      query,
      factualLearnings,
      analyticalLearnings,
      statisticalLearnings,
      proceduralLearnings,
      findings
    );

    // Stream the report generation with real-time text updates
    const stream = await streamText({
      model: this.writerProvider,
      prompt,
      maxTokens: 3000,
      temperature: 0.7,
    });

    let content = "";
    for await (const delta of stream.textStream) {
      content += delta;
      // Stream text updates to listeners for real-time feedback
      this.eventEmitter.emit("text", delta);
    }

    // Extract key components and generate metadata
    const executiveSummary = this.extractExecutiveSummary(content);
    const citations = this.generateCitations(findings);

    const report: ResearchReport = {
      id: this.generateReportId(),
      query,
      executiveSummary,
      content,
      citations,
      metadata: {
        generatedAt: new Date(),
        sourceCount: findings.length,
        model: this.getModelName(),
        researchDepth: this.calculateResearchDepth(findings),
      },
    };

    this.eventEmitter.emit("progress", {
      phase: "synthesizing",
      progress: 100,
    });

    return report;
  }

  /**
   * Build the comprehensive report generation prompt
   *
   * This method constructs a detailed prompt that guides the AI to generate
   * a well-structured report. It organizes learnings by type and provides
   * clear formatting instructions.
   *
   * PROMPT STRUCTURE:
   * 1. Context and query
   * 2. Organized learnings by type
   * 3. Source list for citations
   * 4. Detailed formatting requirements
   * 5. Professional writing guidelines
   */
  private buildReportPrompt(
    query: string,
    factualLearnings: Learning[],
    analyticalLearnings: Learning[],
    statisticalLearnings: Learning[],
    proceduralLearnings: Learning[],
    findings: SearchResult[]
  ): string {
    // Build sections based on available learning types
    const factualSection =
      factualLearnings.length > 0
        ? `FACTUAL FINDINGS:
${factualLearnings
  .map((l, i) => `[${i + 1}] ${l.content} (Source: ${l.sourceUrl})`)
  .join("\n")}`
        : "";

    const analyticalSection =
      analyticalLearnings.length > 0
        ? `ANALYTICAL INSIGHTS:
${analyticalLearnings
  .map((l, i) => `[${i + 1}] ${l.content} (Source: ${l.sourceUrl})`)
  .join("\n")}`
        : "";

    const statisticalSection =
      statisticalLearnings.length > 0
        ? `STATISTICAL DATA:
${statisticalLearnings
  .map((l, i) => `[${i + 1}] ${l.content} (Source: ${l.sourceUrl})`)
  .join("\n")}`
        : "";

    const proceduralSection =
      proceduralLearnings.length > 0
        ? `PROCEDURAL INFORMATION:
${proceduralLearnings
  .map((l, i) => `[${i + 1}] ${l.content} (Source: ${l.sourceUrl})`)
  .join("\n")}`
        : "";

    const sourcesSection = `ALL SOURCES:
${findings
  .map((f, i) => `[${i + 1}] ${f.url} - ${f.title || "Untitled"}`)
  .join("\n")}`;

    return `Write a comprehensive research report for: "${query}"

Use these structured learnings from research:

${factualSection}

${analyticalSection}

${statisticalSection}

${proceduralSection}

${sourcesSection}

Format Requirements:
- Executive Summary (2-3 paragraphs)
- Key Findings (organized by theme)
- Detailed Analysis with inline citations [1], [2], etc.
- Statistical Summary (if applicable)
- Conclusion
- References section

Guidelines:
- Use professional, analytical tone
- Ensure all major learnings are included
- Provide specific citations using [1], [2] format
- Include relevant statistics and data points
- Synthesize information rather than just listing facts
- Draw meaningful conclusions from the research

The report should be comprehensive but well-structured and readable.`;
  }

  /**
   * Extract executive summary from the generated report
   *
   * This method identifies and extracts the executive summary section from
   * the generated report content. It handles various formatting styles and
   * provides fallback extraction methods.
   *
   * EXTRACTION STRATEGIES:
   * 1. Look for explicit "Executive Summary" section
   * 2. Extract first few paragraphs as fallback
   * 3. Provide default message if extraction fails
   */
  private extractExecutiveSummary(content: string): string {
    // Extract the executive summary section
    const lines = content.split("\n");
    const summaryStart = lines.findIndex((line) =>
      line.toLowerCase().includes("executive summary")
    );

    if (summaryStart === -1) {
      // If no explicit executive summary section, try to extract first few paragraphs
      const nonEmptyLines = lines.filter((line) => line.trim() !== "");
      if (nonEmptyLines.length >= 3) {
        return nonEmptyLines.slice(0, 3).join("\n").trim();
      }
      return "Executive summary not found in the generated report.";
    }

    // Find the end of the executive summary section
    const summaryEnd = lines.findIndex(
      (line, i) =>
        i > summaryStart && line.trim() !== "" && line.startsWith("#")
    );

    const summaryLines = lines.slice(
      summaryStart + 1,
      summaryEnd === -1 ? Math.min(summaryStart + 10, lines.length) : summaryEnd
    );

    return summaryLines
      .filter((line) => line.trim() !== "")
      .join("\n")
      .trim();
  }

  /**
   * Generate citation objects from search results
   *
   * This method creates properly formatted citations for all sources used
   * in the research, with sequential numbering and relevant quotes where available.
   *
   * CITATION FORMAT:
   * - Sequential numbering [1], [2], [3]...
   * - URL and title for each source
   * - Access date for web sources
   * - Relevant quote/summary when available
   */
  private generateCitations(findings: SearchResult[]): Citation[] {
    return findings.map((finding, index) => {
      const citation: Citation = {
        id: (index + 1).toString(),
        url: finding.url,
        title: finding.title || "Untitled",
        accessDate: new Date(),
      };

      // Add relevant quote if summary is available
      if (finding.summary) {
        citation.relevantQuote = finding.summary;
      }

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
    // Try to extract model name from the provider
    if (this.writerProvider && this.writerProvider.modelId) {
      return this.writerProvider.modelId;
    }
    return "unknown";
  }

  /**
   * Calculate research depth based on source diversity
   *
   * This method analyzes the diversity of sources used in the research
   * to estimate the research depth. More diverse sources indicate
   * deeper research coverage.
   *
   * DEPTH CALCULATION:
   * - Counts unique domains/sources
   * - Higher domain diversity = higher depth score
   * - Provides insight into research breadth
   */
  private calculateResearchDepth(findings: SearchResult[]): number {
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
