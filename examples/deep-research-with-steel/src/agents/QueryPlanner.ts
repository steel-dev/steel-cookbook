import { generateStructuredOutput } from "../providers/providers";
import { z } from "zod";
import {
  ResearchPlan,
  SubQuery,
  SearchStrategy,
  DEFAULT_SEARCH_STRATEGY,
  ResearchEvaluation,
} from "../core/interfaces";

// Schemas for structured AI output
const SubQuerySchema = z.object({
  query: z.string().describe("Specific search query"),
  researchGoal: z
    .string()
    .describe(
      "Goal and approach for this query, including follow-up directions"
    ),
  priority: z
    .enum(["high", "medium", "low"])
    .describe("Priority level for this sub-query"),
});

const ResearchPlanSchema = z.object({
  subQueries: z
    .array(SubQuerySchema)
    .describe("List of search queries to execute"),
  strategy: z.object({
    searchType: z
      .enum(["comprehensive", "focused"])
      .describe("Type of search strategy"),
    approach: z.string().describe("Overall approach for the research"),
  }),
  estimatedSteps: z.number().describe("Estimated number of steps needed"),
});

export class QueryPlanner {
  private provider: any;

  constructor(provider: any) {
    this.provider = provider;
  }

  /**
   * Generate a research plan from the original query
   */
  async planResearch(
    query: string,
    depth: number = 3,
    breadth: number = 5
  ): Promise<ResearchPlan> {
    // Validate input
    if (!query || query.trim().length === 0) {
      throw new Error("Query cannot be empty");
    }

    if (depth < 1 || depth > 10) {
      throw new Error("Depth must be between 1 and 10");
    }

    if (breadth < 1 || breadth > 10) {
      throw new Error("Breadth must be between 1 and 10");
    }

    const result = await generateStructuredOutput(
      this.provider,
      this.buildPlanningPrompt(query, depth, breadth),
      ResearchPlanSchema
    );

    // Convert to our internal format
    const subQueries: SubQuery[] = result.subQueries.map((sq, index) => ({
      id: `sq_${Date.now()}_${index}`,
      query: sq.query,
      priority: this.convertPriority(sq.priority),
      category: this.categorizeQuery(sq.query),
    }));

    const searchStrategy: SearchStrategy = {
      ...DEFAULT_SEARCH_STRATEGY,
      maxDepth: depth,
      maxBreadth: breadth,
    };

    return {
      id: `plan_${Date.now()}`,
      originalQuery: query,
      subQueries,
      searchStrategy,
      estimatedSteps: result.estimatedSteps,
    };
  }

  /**
   * Refine an existing research plan based on findings
   */
  async refinePlan(
    originalPlan: ResearchPlan,
    findings: any[],
    gaps: string[]
  ): Promise<ResearchPlan> {
    const refinementPrompt = this.buildRefinementPrompt(
      originalPlan,
      findings,
      gaps
    );

    const result = await generateStructuredOutput(
      this.provider,
      refinementPrompt,
      ResearchPlanSchema
    );

    // Generate refined sub-queries
    const refinedSubQueries: SubQuery[] = result.subQueries.map(
      (sq, index) => ({
        id: `refined_sq_${Date.now()}_${index}`,
        query: sq.query,
        priority: this.convertPriority(sq.priority),
        category: this.categorizeQuery(sq.query),
      })
    );

    return {
      ...originalPlan,
      subQueries: refinedSubQueries,
      estimatedSteps: result.estimatedSteps,
    };
  }

  /**
   * Build the initial planning prompt
   */
  private buildPlanningPrompt(
    query: string,
    depth: number,
    breadth: number
  ): string {
    return `You are a research planning expert. Decompose this research query into ${breadth} specific sub-questions that will comprehensively address the topic.

Original Query: "${query}"

Consider:
- Different angles and perspectives on the topic
- Factual vs. analytical aspects
- Current vs. historical context
- Primary sources vs. secondary analysis
- Quantitative data vs. qualitative insights

Create specific, actionable search queries that will yield valuable information. Each query should be:
- Specific enough to get targeted results
- Broad enough to capture relevant information
- Designed to build upon each other logically

Prioritize queries based on their importance to answering the main question.
Estimate the total number of steps needed for comprehensive research (considering ${depth} levels of depth).

Focus on creating queries that will lead to authoritative, up-to-date information.`;
  }

  /**
   * Build refinement prompt for iterative planning
   */
  private buildRefinementPrompt(
    originalPlan: ResearchPlan,
    findings: any[],
    gaps: string[]
  ): string {
    const findingsSummary = findings
      .slice(0, 3)
      .map((f, i) => `${i + 1}. ${f.summary || f.title || "Finding"}`)
      .join("\n");

    return `Based on initial research findings, refine the search strategy for this query.

Original Query: "${originalPlan.originalQuery}"

Initial Findings:
${findingsSummary}

Knowledge Gaps Identified:
${gaps.map((gap, i) => `${i + 1}. ${gap}`).join("\n")}

Generate focused follow-up queries that:
- Address the identified knowledge gaps  
- Build upon what we've already learned
- Avoid redundant searches
- Target more specific or recent information

Prioritize queries that will fill the most critical gaps in our understanding.

Please provide:
1. A list of specific search queries (each with a query string, research goal, and priority)
2. A search strategy with type ("comprehensive" or "focused") and approach description
3. An estimated number of steps needed

Format your response to match the expected structure for research planning.`;
  }

  /**
   * Convert priority string to number for internal use
   */
  private convertPriority(priority: "high" | "medium" | "low"): number {
    switch (priority) {
      case "high":
        return 1;
      case "medium":
        return 0.5;
      case "low":
        return 0.1;
      default:
        return 0.5;
    }
  }

  /**
   * Categorize a query for better organization
   */
  private categorizeQuery(query: string): string {
    const lowerQuery = query.toLowerCase();

    if (
      lowerQuery.includes("data") ||
      lowerQuery.includes("statistic") ||
      lowerQuery.includes("number")
    ) {
      return "statistical";
    } else if (
      lowerQuery.includes("history") ||
      lowerQuery.includes("past") ||
      lowerQuery.includes("evolution")
    ) {
      return "historical";
    } else if (
      lowerQuery.includes("current") ||
      lowerQuery.includes("recent") ||
      lowerQuery.includes("latest")
    ) {
      return "current";
    } else if (
      lowerQuery.includes("compare") ||
      lowerQuery.includes("difference") ||
      lowerQuery.includes("vs")
    ) {
      return "comparative";
    } else if (
      lowerQuery.includes("how") ||
      lowerQuery.includes("process") ||
      lowerQuery.includes("method")
    ) {
      return "procedural";
    } else {
      return "general";
    }
  }

  /**
   * Plan next iteration based on research evaluation (for ContentRefiner)
   */
  async planNextIteration(
    originalQuery: string,
    evaluation: ResearchEvaluation,
    currentPlan: ResearchPlan
  ): Promise<ResearchPlan> {
    // Focus on high-priority research directions
    const prioritizedDirections = evaluation.researchDirections
      .filter((d) => d.priority === "high")
      .slice(0, 3); // Focus on top 3 high-priority directions

    const prompt = `Based on the research evaluation, plan the next iteration of queries.

Original query: ${originalQuery}
Current learnings: ${evaluation.learnings.map((l) => l.content).join("\n")}

High-priority research directions:
${prioritizedDirections
  .map((d) => `- ${d.question}: ${d.rationale}`)
  .join("\n")}

Knowledge gaps identified:
${evaluation.completenessAssessment.knowledgeGaps.join("\n")}

Generate focused queries to address these gaps and directions. Each query should:
- Be specific and actionable
- Target the identified knowledge gaps
- Build upon previous learnings
- Have clear research goals

Provide:
1. A list of specific search queries (each with query, research goal, and priority)
2. A search strategy with type and approach
3. An estimated number of steps needed`;

    const result = await generateStructuredOutput(
      this.provider,
      prompt,
      ResearchPlanSchema
    );

    // Generate refined sub-queries based on evaluation
    const refinedSubQueries: SubQuery[] = result.subQueries.map(
      (sq, index) => ({
        id: `iteration_sq_${Date.now()}_${index}`,
        query: sq.query,
        priority: this.convertPriority(sq.priority),
        category: this.categorizeQuery(sq.query),
      })
    );

    return {
      ...currentPlan,
      subQueries: refinedSubQueries,
      estimatedSteps: result.estimatedSteps,
    };
  }

  /**
   * Validate a research plan
   */
  validatePlan(plan: ResearchPlan): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!plan.originalQuery || plan.originalQuery.trim().length === 0) {
      errors.push("Original query is required");
    }

    if (!plan.subQueries || plan.subQueries.length === 0) {
      errors.push("At least one sub-query is required");
    }

    if (plan.subQueries && plan.subQueries.length > 10) {
      errors.push("Too many sub-queries (maximum 10)");
    }

    // Check for duplicate queries
    const queryTexts = plan.subQueries.map((sq) => sq.query.toLowerCase());
    const duplicates = queryTexts.filter((q, i) => queryTexts.indexOf(q) !== i);
    if (duplicates.length > 0) {
      errors.push("Duplicate sub-queries detected");
    }

    // Validate priorities
    const hasHighPriority = plan.subQueries.some((sq) => sq.priority >= 0.8);
    if (!hasHighPriority) {
      errors.push("At least one high-priority query is recommended");
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }
}
