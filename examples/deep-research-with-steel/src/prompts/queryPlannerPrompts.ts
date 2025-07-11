export function buildStrategicPlanTextPrompt(
  query: string,
  depth: number,
  breadth: number
): string {
  return `You are a strategic research planner with expertise in breaking down complex questions into logical research approaches. 

Create a comprehensive strategic research plan for this query: "${query}"

Your strategic plan should include:
- Overall research approach and methodology
- Key areas that need to be explored
- Different angles and perspectives to consider (factual, analytical, current, historical)
- Types of information needed (quantitative data, qualitative insights, primary sources, secondary analysis)
- Logical flow and dependencies between different research areas
- Potential challenges and how to address them

Consider research parameters:
- Maximum depth: ${depth} levels
- Target breadth: ${breadth} main areas to explore

Your plan should be comprehensive yet focused, providing clear strategic direction for the research process. Think like an expert researcher planning a thorough investigation.

Write your strategic plan as clear, well-structured text. Do not include JSON formatting - just provide the strategic thinking and approach directly.`;
}

export function buildStrategicPlanningPrompt(
  query: string,
  depth: number,
  breadth: number
): string {
  return `You are a strategic research planner with expertise in breaking down complex questions into logical research approaches. 

Create a comprehensive strategic research plan for this query: "${query}"

Your strategic plan should include:
- Overall research approach and methodology
- Key areas that need to be explored
- Different angles and perspectives to consider (factual, analytical, current, historical)
- Types of information needed (quantitative data, qualitative insights, primary sources, secondary analysis)
- Logical flow and dependencies between different research areas
- Potential challenges and how to address them

Consider research parameters:
- Maximum depth: ${depth} levels
- Target breadth: ${breadth} main areas to explore

Your plan should be comprehensive yet focused, providing clear strategic direction for the research process. Think like an expert researcher planning a thorough investigation.

Return a JSON object with the following structure:
{
  "strategicPlan": "Detailed strategic thinking and approach (comprehensive text explanation of research strategy)",
  "approach": "Concise summary of the overall approach (one sentence overview)",
  "estimatedSteps": ${depth * breadth}
}`;
}

export function buildRefinedStrategicPlanTextPrompt(
  originalQuery: string,
  findings: any[],
  gaps: string[],
  previousStrategicPlan: string
): string {
  const findingsSummary = findings
    .slice(0, 5)
    .map((f, i) => `${i + 1}. ${f.summary || f.title || "Finding"}`)
    .join("\n");

  return `You are a strategic research planner. Based on initial research findings and identified gaps, create an updated strategic research plan.

Original Query: "${originalQuery}"

Previous Strategic Plan:
${previousStrategicPlan}

Research Findings So Far:
${findingsSummary}

Knowledge Gaps Identified:
${gaps.map((gap, i) => `${i + 1}. ${gap}`).join("\n")}

Create an updated strategic research plan that:
- Builds upon what we've already learned
- Specifically addresses the identified knowledge gaps
- Incorporates insights from the findings
- Provides clear direction for follow-up research
- Avoids redundant investigation of already-covered areas

Your updated plan should be comprehensive yet focused on filling the gaps in our current understanding.

Write your refined strategic plan as clear, well-structured text. Do not include JSON formatting - just provide the strategic thinking and approach directly.`;
}

export function buildRefinedStrategicPlanningPrompt(
  originalQuery: string,
  findings: any[],
  gaps: string[],
  previousStrategicPlan: string
): string {
  const findingsSummary = findings
    .slice(0, 5)
    .map((f, i) => `${i + 1}. ${f.summary || f.title || "Finding"}`)
    .join("\n");

  return `You are a strategic research planner. Based on initial research findings and identified gaps, create an updated strategic research plan.

Original Query: "${originalQuery}"

Previous Strategic Plan:
${previousStrategicPlan}

Research Findings So Far:
${findingsSummary}

Knowledge Gaps Identified:
${gaps.map((gap, i) => `${i + 1}. ${gap}`).join("\n")}

Create an updated strategic research plan that:
- Builds upon what we've already learned
- Specifically addresses the identified knowledge gaps
- Incorporates insights from the findings
- Provides clear direction for follow-up research
- Avoids redundant investigation of already-covered areas

Your updated plan should be comprehensive yet focused on filling the gaps in our current understanding.

Return a JSON object with the following structure:
{
  "strategicPlan": "Updated strategic thinking and approach incorporating learnings and addressing gaps",
  "approach": "Refined approach summary focusing on gap-filling strategy",
  "estimatedSteps": ${Math.max(gaps.length, 3)}
}`;
}

export function buildQueryGenerationPrompt(
  freeFormPlan: {
    originalQuery: string;
    strategicPlan: string;
    approach: string;
    estimatedSteps: number;
  },
  maxQueries: number
): string {
  return `Based on the strategic research plan below, extract ${maxQueries} specific, actionable search queries that will execute this research strategy effectively.

Original Query: "${freeFormPlan.originalQuery}"

Strategic Research Plan:
${freeFormPlan.strategicPlan}

Research Approach:
${freeFormPlan.approach}

Extract specific search queries that:
- Are focused and actionable
- Will yield valuable information for the research topic
- Cover different aspects identified in the strategic plan
- Are designed to build upon each other logically
- Will lead to authoritative, up-to-date information

Return a JSON object with the following structure:
{
  "queries": ["search query 1", "search query 2", "search query 3"],
  "strategy": {
    "searchType": "comprehensive",
    "approach": "Updated approach description based on the queries"
  },
  "estimatedSteps": ${freeFormPlan.estimatedSteps}
}

The searchType should be either "comprehensive" or "focused" based on the research needs.`;
}

export function buildPlanningPrompt(
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

Return a JSON object with the following structure:
{
  "subQueries": [
    {
      "query": "Specific search query 1",
      "researchGoal": "Goal and approach for this query",
      "priority": "high"
    },
    {
      "query": "Specific search query 2", 
      "researchGoal": "Goal and approach for this query",
      "priority": "medium"
    }
  ],
  "strategy": {
    "searchType": "comprehensive",
    "approach": "Overall approach for the research"
  },
  "estimatedSteps": ${depth * breadth}
}

Priority should be "high", "medium", or "low". SearchType should be "comprehensive" or "focused".`;
}

export function buildStrategicPlanFromGuidanceTextPrompt(
  originalQuery: string,
  researchDirections: { question: string }[],
  strategicGuidance: string,
  allQueries: string[]
): string {
  return `You are a strategic research planner. Using the following guidance, craft a focused strategic plan for the next iteration.

Original Query: "${originalQuery}"

Strategic Guidance:
${strategicGuidance}

Existing Queries Already Asked:
${allQueries.join("\n")}

New Research Directions Suggested:
${researchDirections.map((d, i) => `${i + 1}. ${d.question}`).join("\n")}

Create a concise strategic plan that:
- Addresses the guidance above
- Avoids duplicating existing queries
- Maximises knowledge gain for the next iteration
- Remains aligned with the overall research objective

Write the plan as clear, well-structured text. Do not output JSON.`;
}
