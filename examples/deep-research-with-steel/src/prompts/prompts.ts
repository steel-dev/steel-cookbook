/**
 * Centralized Prompts Module for Deep Research Agent
 *
 * This module contains all prompt templates and helper functions used throughout
 * the Deep Research system. It provides consistent prompt generation for all
 * AI interactions across planning, searching, evaluation, and report synthesis.
 *
 * CORRECT PRD FLOW:
 * 1. QueryPlanner → called ONCE at beginning, generates initial queries
 * 2. SearchAgent → executes queries, returns RefinedContent[]
 * 3. ContentEvaluator → THE BRAIN: decides if done + generates new queries if needed
 * 4. Loop: SearchAgent ↔ ContentEvaluator until done
 * 5. ContentRefiner → ranks and filters results for report
 * 6. ReportSynthesizer → generates final report from filtered summaries
 *
 * PROMPT CATEGORIES:
 * - Planning: Initial strategic research planning (called once)
 * - Summarization: Content summarization for web pages (≤ summaryTokens)
 * - Evaluation: Research evaluation + termination decisions + new query generation
 * - Ranking: Filtering and ranking summaries for report generation
 * - Reporting: Final report generation from filtered summaries
 */

import {
  Learning,
  ResearchPlan,
  SearchResult,
  ResearchEvaluation,
  RefinedContent,
} from "../core/interfaces";

// ==============================================================================
// PLANNING PROMPTS (Called once at beginning)
// ==============================================================================

/**
 * System prompt for generating strategic research plans
 */
export const planningPrompt = (
  query: string,
  depth: number,
  breadth: number
): string => {
  return `You are a strategic research planner with expertise in breaking down complex questions into logical research approaches. For context, today's date is ${new Date().toLocaleDateString()}.

<query>
Create a comprehensive strategic research plan for this query: "${query}"
</query>

<strategic_plan_requirements>
Your strategic plan should include:
- Overall research approach and methodology
- Key areas that need to be explored
- Different angles and perspectives to consider (factual, analytical, current, historical)
- Types of information needed (quantitative data, qualitative insights, primary sources, secondary analysis)
- Logical flow and dependencies between different research areas
- Potential challenges and how to address them
</strategic_plan_requirements>

<research_parameters>Consider research parameters:
- Maximum depth: ${depth} levels
- Target breadth: ${breadth} main areas to explore
</research_parameters>

<strategic_plan_guidelines>
Your plan should be comprehensive yet focused, providing clear strategic direction for the research process. Think like an expert researcher planning a thorough investigation.
</strategic_plan_guidelines>

<output_format>
Write your strategic plan as clear, well-structured text. Do not include JSON formatting - just provide the strategic thinking and approach directly.
</output_format>`;
};

/**
 * Prompt for extracting structured queries from strategic plans
 */
export const queryExtractPrompt = (
  freeFormPlan: {
    originalQuery: string;
    strategicPlan: string;
    approach: string;
    estimatedSteps: number;
  },
  maxQueries: number
): string => {
  return `Based on the strategic research plan below, extract ${maxQueries} specific, actionable search queries that represent the FIRST PRIORITY research tasks. These are the foundational queries that must be answered before subsequent research iterations can be effective. For context, today's date is ${new Date().toLocaleDateString()}.

<original_query>
Original Query: "${freeFormPlan.originalQuery}"
</original_query>

<strategic_research_plan>
Strategic Research Plan:
${freeFormPlan.strategicPlan}
</strategic_research_plan>

<research_approach>
Research Approach:
${freeFormPlan.approach}
</research_approach>

<critical_thinking_guidelines>
CRITICAL: Analyze the research plan to identify DEPENDENCY CHAINS and FOUNDATIONAL KNOWLEDGE GAPS. Your job is to select the queries that:

1. **FOUNDATIONAL PRIORITY**: Provide essential baseline knowledge that enables all other research
2. **DEPENDENCY ANALYSIS**: Must be answered BEFORE other questions can be meaningfully researched
3. **MAXIMUM CLARITY**: Will unlock the most additional research directions for future iterations
4. **PARALLEL EXECUTION**: Can be researched simultaneously without depending on each other's results

STRATEGIC THINKING:
- What core facts/entities/definitions must be established first?
- Which research areas are prerequisites for others?
- What foundational knowledge would clarify the scope and direction of future queries?
- Which queries provide the broadest foundation for subsequent research?

Examples of dependency thinking:
- If researching "companies with X characteristic", first find the companies, then research their characteristics
- If researching "comparison between A and B", first establish what A and B are individually
- If researching "impact of X on Y", first establish what X is and how it works

Extract specific search queries that:
- Are focused and actionable for immediate execution
- Represent the logical STARTING POINTS of the research
- Can be executed in parallel (no dependencies between them)
- Will provide foundational clarity that enables effective follow-up research
- Target authoritative, up-to-date information sources
</critical_thinking_guidelines>

<output_format>
Return a JSON object with the following structure:
{
  "queries": ["foundational query 1", "foundational query 2", "foundational query 3"],
  "strategy": {
    "searchType": "comprehensive",
    "approach": "Updated approach description emphasizing foundational research priorities",
    "rationale": "Brief explanation of why these specific queries were chosen as first priorities"
  },
  "estimatedSteps": ${freeFormPlan.estimatedSteps}
}


The searchType should be either "comprehensive" or "focused" based on the research needs.
</output_format>
`;
};

// ==============================================================================
// SUMMARIZATION PROMPTS
// ==============================================================================

/**
 * System prompt for summarizing web page content to specific token limit
 * This creates RefinedContent from raw scraped content
 */
export const summaryPrompt = (
  content: string,
  query: string,
  maxTokens: number = 500
): string => {
  return `Summarize the following web page content in relation to the research query: "${query}". For context, today's date is ${new Date().toLocaleDateString()}.

<content_to_summarize>
${content}
</content_to_summarize>

<summary_guidelines>
Create a focused summary that:
- Directly addresses the research query
- Preserves key facts, statistics, and specific details
- Includes relevant entities, dates, and numbers
- Maintains important context and relationships
- Captures the main insights and conclusions
- Is concise and stays within approximately ${maxTokens} tokens
</summary_guidelines>

<output_format>
Focus on information that would be valuable for someone researching: "${query}"

The summary should be comprehensive yet concise, capturing the most relevant information for the research topic.
</output_format>
`;
};

/**
 * Helper function to build summarization prompts with content truncation
 */
export const buildSummaryPrompt = (
  rawContent: string,
  query: string,
  maxTokens: number = 500,
  maxContentLength: number = 25000
): string => {
  // Truncate content if too long to prevent context overflow
  const truncatedContent =
    rawContent.length > maxContentLength
      ? rawContent.substring(0, maxContentLength) + "..."
      : rawContent;

  return summaryPrompt(truncatedContent, query, maxTokens);
};

// ==============================================================================
// EVALUATION PROMPTS (The Brain - Controls Research Loop)
// ==============================================================================

/**
 * System prompt for evaluating research findings and making termination decisions
 * THE BRAIN: Decides if research is complete AND generates new queries if needed
 */
export const evaluationPrompt = (
  originalQuery: string,
  currentPlan: ResearchPlan,
  refinedContent: RefinedContent[],
  currentDepth: number,
  maxDepth: number
): string => {
  return `You are the research evaluation brain. Analyze these findings and make critical decisions about research continuation. For context, today's date is ${new Date().toLocaleDateString()}.

<original_query>
Original Query: "${originalQuery}"
</original_query>

<current_research_plan>
Current research plan context:
Strategic Plan: ${currentPlan.strategicPlan || "No strategic plan provided"}
Sub-queries being researched: ${currentPlan.subQueries
    .map((sq) => `- ${sq.query}`)
    .join("\n")}
</current_research_plan>

<research_findings>
Research findings from web scraping:
${refinedContent
  .map(
    (content, i) => `[${i + 1}] ${content.title} (${content.url})
Summary: ${content.summary}`
  )
  .join("\n\n")}
</research_findings>

<research_depth>
Research depth: ${currentDepth}/${maxDepth}
</research_depth>

<responsibilities>
Your responsibilities:
1. Extract key learnings with high specificity (include entities, numbers, dates)
2. Assess research completeness - do we have enough information to answer the original query in depth?
3. Identify critical knowledge gaps that need to be filled
4. If research is incomplete, generate specific search queries to fill those gaps
5. Make termination decision based on completeness and depth constraints
</responsibilities>

<output_format>
Return structured evaluation with:
- Extracted learnings for decision-making
- Completeness assessment with clear reasoning
- If incomplete: specific new search queries to execute
- Clear termination decision with rationale
</output_format>
`;
};

// ==============================================================================
// RANKING & FILTERING PROMPTS (Results Processing)
// ==============================================================================

/**
 * Prompt for ranking and filtering summaries for report generation
 * Takes RefinedContent[] and returns indices/scores for filtered summaries
 */
export const rankAndRefinePrompt = (
  originalQuery: string,
  refinedContent: RefinedContent[],
  maxSources: number = 10
): string => {
  return `You are tasked with ranking and filtering research summaries to select the most valuable content for report generation. For context, today's date is ${new Date().toLocaleDateString()}.

<original_query>
Original Query: "${originalQuery}"
</original_query>

<available_summaries>
Available summaries:
${refinedContent
  .map(
    (content, i) => `[${i}] ${content.title} (${content.url})
Summary: ${content.summary}
Scraped: ${content.scrapedAt.toISOString()}`
  )
  .join("\n\n")}
</available_summaries>

<ranking_criteria>
Rank these summaries based on:
1. Relevance to the original query
2. Quality and depth of information
3. Recency and currency of information
4. Authority and credibility of the source
5. Novelty and unique insights provided

Select the top ${maxSources} most valuable summaries for report generation.

Focus on selecting summaries that together provide comprehensive coverage of the research topic.
</ranking_criteria>

<output_format>
Return structured rankings with:
- selectedIndices: array of indices of selected summaries
- rankings: array of {index, score, rationale} for each selected summary
- reasoning: overall selection criteria and decisions
</output_format>
`;
};

// ==============================================================================
// REPORT SYNTHESIS PROMPTS
// ==============================================================================

/**
 * System prompt for generating comprehensive research reports
 * Takes filtered_summaries[] (raw summaries) and generates markdown report
 * OPTIMIZED: Enhanced for better synthesis, structure, and analytical depth
 */
export const reportPrompt = (
  query: string,
  filteredSummaries: RefinedContent[]
): string => {
  const summariesText = filteredSummaries
    .map(
      (content, i) => `[${i + 1}] **${content.title}**
Source: ${content.url}
Content: ${content.summary}`
    )
    .join("\n\n");

  return `You are an expert research analyst tasked with synthesizing findings into a comprehensive, publication-quality research report. You will generate both an executive summary and the complete report content as separate structured outputs. For context, today's date is ${new Date().toLocaleDateString()}.

<research_question>
"${query}"
</research_question>

<source_material>
${summariesText}
</source_material>

<structured_output_requirements>
You must provide your response in the following structured format:

1. **executiveSummary**: A 3-4 paragraph executive summary that highlights key findings, implications, and conclusions. This should be standalone and provide the most important insights from your research.
2. **reportContent**: The complete research report content formatted in Markdown. Begin with an engaging introduction that sets the stage for the topic, and end with a thoughtful conclusion that synthesizes the main insights and implications. In between, organize the content in the way you believe best communicates the findings, depth, and nuances of the research question. You may use thematic sections, narrative flow, or any structure that allows for deep exploration and clear explanation of the subject. Use evidence, examples, and citations as needed to support your analysis. 

Use proper Markdown formatting with headings, bullet points, lists, and tables where appropriate.
</structured_output_requirements>

<quality_standards>
- **Analytical Depth**: Go beyond summarizing - identify patterns, contradictions, and implications
- **Evidence Integration**: Weave multiple sources together to build compelling arguments
- **Critical Thinking**: Evaluate source reliability, identify knowledge gaps, note limitations
- **Professional Tone**: Authoritative but accessible, suitable for executive briefings
- **Date Awareness**: Include the current date at the top of the report.
</quality_standards>

<research_report_standards>
- Prioritize authoritative, recent, and reputable sources. Actively note publication dates and source credibility.
- Always prioritize primary sources over secondary
- Read technical documentation when possible for technical topics
- Cross-reference facts or viewpoints across multiple sources. If sources conflict, investigate further or note the discrepancy
- Never artificially limit quotations that would improve the research quality or depth.
</research_report_standards>

<answer_requirements>
- The word count recommendation for the research report is >= 1500-2000 words. The length could also increase if:
  - you have more relevant information
  - the research topic is more complex
  - the user requested for more detail
- However, the word count is not a strict rule. The report should be focused and easy to understand. All information presented should be relevant and meaningful. You should prioritize quality and readability.
- Base ALL statements on researched information, not assumptions
- Cite sources naturally within your response
- Flag any information you cannot verify, or information with less than 95% certainty, with "uncertain" or similar qualifier
- Present conflicting viewpoints when sources disagree
- NEVER fabricate information or citations; NEVER assume any information
- Do not present irrelevant information. Do not present your own opinions on the topic unless directly asked by the user.
- Never use phrases like "It's worth noting," "It's important to understand," or similar AI-isms. Don't start with broad context unless specifically relevant. Avoid numbered insights or takeaways unless requested. Avoid meta-commentary about the research process.
</answer_requirements>

<mandatory_styling_formatting>
- Write like an expert journalist or researcher who is knowledgable in the research topic, not an AI assistant. Write in a readable way — avoid using unnecessary adjectives or extremely complex sentences. Write with authority while acknowledging limitations honestly if needed. Lead with the most important findings. Make use of specific examples, case studies, and concrete details.
- Use markdown formatting for the reportContent.
- Use appropriate Markdown formatting for clarity
- Use headings, lists, and paragraphs for structure
- Only use tables for simple comparisons
- Use bold text to highlight all the key words and ideas.
- Use clear section breaks for different aspects of complex topics
- For the "Sources" section (if applicable): Use a numbered list. Use standard, concise APA format.
- **Precise Citations**: Use [1], [2] format with specific attribution to source insights
</mandatory_styling_formatting>

<synthesis_guidelines>
- **Cross-Reference Sources**: Identify where sources agree, disagree, or complement each other
- **Extract Insights**: Look for trends, patterns, and emerging themes across sources
- **Quantitative Focus**: Highlight specific numbers, percentages, dates, and measurable outcomes
- **Context Building**: Connect findings to broader industry/domain trends when relevant
- **Gap Identification**: Note what questions remain unanswered or under-researched
</synthesis_guidelines>

<executive_summary_excellence>
Your executive summary should:
- Lead with the most significant finding or conclusion
- Quantify impact where possible (numbers, percentages, scale)
- Address practical implications for stakeholders
- Preview the most compelling insights from the full report
</executive_summary_excellence>

Generate a report that demonstrates sophisticated analysis and provides genuine educational value to the user seeking to understand: "${query}"`;
};

/**
 * Simplified report prompt for answer mode (concise responses)
 */
export const answerPrompt = (
  query: string,
  filteredSummaries: RefinedContent[]
): string => {
  const keySummaries = filteredSummaries.slice(0, 5); // Top 5 summaries for concise answer

  return `Provide a concise, direct answer to: "${query}"

Key research findings:
${keySummaries.map((content, i) => `${i + 1}. ${content.summary}`).join("\n")}

Sources:
${keySummaries.map((content, i) => `[${i + 1}] ${content.url}`).join("\n")}

Constraints:
- Maximum 250 words for the answer
- Be direct and factual
- Include the most important information only
- No additional formatting or explanation`;
};

// ==============================================================================
// HELPER FUNCTIONS
// ==============================================================================

/**
 * Helper function to validate prompt inputs
 */
export const validatePromptInputs = (inputs: Record<string, any>): boolean => {
  for (const [key, value] of Object.entries(inputs)) {
    if (value === undefined || value === null) {
      console.warn(`Prompt input '${key}' is undefined or null`);
      return false;
    }
  }
  return true;
};

/**
 * Helper function to truncate content for prompts
 */
export const truncateContent = (
  content: string,
  maxLength: number = 25000
): string => {
  if (content.length <= maxLength) {
    return content;
  }
  return content.substring(0, maxLength) + "...";
};

/**
 * Helper function to format RefinedContent for prompts
 */
export const formatRefinedContent = (content: RefinedContent[]): string => {
  return content
    .map((c, i) => `[${i + 1}] ${c.title} (${c.url})\n${c.summary}`)
    .join("\n\n");
};

/**
 * Helper function to format sources for citations
 */
export const formatSources = (content: RefinedContent[]): string => {
  return content.map((c, i) => `[${i + 1}] ${c.url} - ${c.title}`).join("\n");
};

/**
 * Helper function to format learnings by type (for evaluation only)
 */
export const formatLearningsByType = (
  learnings: Learning[],
  type: string
): string => {
  const filtered = learnings.filter((l) => l.type === type);
  return filtered.length > 0
    ? filtered
        .map((l, i) => `[${i + 1}] ${l.content} (Source: ${l.sourceUrl})`)
        .join("\n")
    : "";
};

// ==============================================================================
// EXPORTS
// ==============================================================================

export const prompts = {
  planningPrompt,
  queryExtractPrompt,
  summaryPrompt,
  buildSummaryPrompt,
  evaluationPrompt,
  rankAndRefinePrompt,
  reportPrompt,
  answerPrompt,
  validatePromptInputs,
  truncateContent,
  formatRefinedContent,
  formatSources,
  formatLearningsByType,
};

export default prompts;
