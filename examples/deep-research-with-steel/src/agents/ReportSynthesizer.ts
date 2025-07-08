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

  async generateReport(
    findings: SearchResult[],
    query: string,
    learnings: Learning[]
  ): Promise<ResearchReport> {
    this.eventEmitter.emit("progress", {
      phase: "synthesizing",
      progress: 90,
    });

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

    // Create the comprehensive prompt
    const prompt = this.buildReportPrompt(
      query,
      factualLearnings,
      analyticalLearnings,
      statisticalLearnings,
      proceduralLearnings,
      findings
    );

    // Stream the report generation
    const stream = await streamText({
      model: this.writerProvider,
      prompt,
      maxTokens: 3000,
      temperature: 0.7,
    });

    let content = "";
    for await (const delta of stream.textStream) {
      content += delta;
      // Stream text updates to listeners
      this.eventEmitter.emit("text", delta);
    }

    // Extract executive summary and generate citations
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

  private buildReportPrompt(
    query: string,
    factualLearnings: Learning[],
    analyticalLearnings: Learning[],
    statisticalLearnings: Learning[],
    proceduralLearnings: Learning[],
    findings: SearchResult[]
  ): string {
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

  private generateCitations(findings: SearchResult[]): Citation[] {
    return findings.map((finding, index) => {
      const citation: Citation = {
        id: (index + 1).toString(),
        url: finding.url,
        title: finding.title || "Untitled",
        accessDate: new Date(),
      };
      
      if (finding.summary) {
        citation.relevantQuote = finding.summary;
      }
      
      return citation;
    });
  }

  private generateReportId(): string {
    return `report_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getModelName(): string {
    // Try to extract model name from the provider
    if (this.writerProvider && this.writerProvider.modelId) {
      return this.writerProvider.modelId;
    }
    return "unknown";
  }

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
