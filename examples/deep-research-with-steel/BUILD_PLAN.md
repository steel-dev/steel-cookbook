# Deep Research Agent - MVP Build Plan

## Project Overview

Build a minimal viable Deep Research agent that works from the terminal - just the core functionality to research queries and generate reports.

## Simplified File Structure

```
deep-research-with-steel/
├── src/
│   ├── agents/
│   │   ├── QueryPlanner.ts
│   │   ├── SearchAgent.ts
│   │   ├── ContentEvaluator.ts
│   │   ├── ContentRefiner.ts
│   │   └── ReportSynthesizer.ts
│   ├── core/
│   │   ├── DeepResearchAgent.ts
│   │   └── interfaces.ts
│   ├── providers/
│   │   └── providers.ts
│   ├── utils/
│   │   └── contentProcessor.ts
│   ├── config.ts
│   └── index.ts (CLI entry point)
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Build Phases (MVP - 4 Phases, 10 Days)

### Phase 1: Setup & Basic Structure (Days 1-2)

**Goal**: Get basic project running with TypeScript and dependencies.

#### Step 1.1: Project Setup

- [ ] Initialize TypeScript project with `tsconfig.json`
- [ ] Set up `package.json` with required dependencies only
- [ ] Create basic folder structure
- [ ] Add `.env.example` with API key placeholders

**Files to create:**

- `package.json`
- `tsconfig.json`
- `.env.example`
- `src/index.ts` (CLI entry point)

#### Step 1.2: Core Interfaces

- [ ] Define essential interfaces from spec
- [ ] Create basic configuration loading
- [ ] Add simple content truncation utility

**Files to create:**

- `src/core/interfaces.ts` - Core interfaces only
- `src/config.ts` - Simple config with env vars
- `src/utils/contentProcessor.ts` - Basic truncation

### Phase 2: Providers & Basic Agents (Days 3-5)

**Goal**: Get AI and Steel providers working, implement basic agents.

#### Step 2.1: Provider Setup

- [ ] Implement AI provider factory (OpenAI/Anthropic/Together)
- [ ] Implement Steel client wrapper
- [ ] Add basic error handling

**Files to create:**

- `src/providers/providers.ts` - All providers in one file

#### Step 2.2: Core Agents (Simplified)

- [ ] QueryPlanner - basic sub-query generation
- [ ] SearchAgent - Steel search and scraping
- [ ] ContentEvaluator - learning extraction and termination logic
- [ ] ContentRefiner - simple continue/stop decisions
- [ ] ReportSynthesizer - basic report generation

**Files to create:**

- `src/agents/QueryPlanner.ts`
- `src/agents/SearchAgent.ts`
- `src/agents/ContentEvaluator.ts`
- `src/agents/ContentRefiner.ts`
- `src/agents/ReportSynthesizer.ts`

### Phase 3: Main Research Loop (Days 6-8)

**Goal**: Wire everything together into working research agent.

#### Step 3.1: Main Agent

- [ ] Implement `DeepResearchAgent` class
- [ ] Wire all components together
- [ ] Implement basic research loop

**Files to create:**

- `src/core/DeepResearchAgent.ts`

#### Step 3.2: Research Loop

- [ ] Plan → Search → Evaluate → Refine → Synthesize flow
- [ ] Depth-based iteration control
- [ ] Learning accumulation
- [ ] Early termination logic

### Phase 4: CLI & Basic Output (Days 9-10)

**Goal**: Make it usable from terminal with basic output.

#### Step 4.1: CLI Interface

- [ ] Simple command-line interface
- [ ] Accept query, depth, breadth parameters
- [ ] Load config from environment variables
- [ ] Basic console output (no fancy UI)

#### Step 4.2: Basic Terminal Output

- [ ] Print progress messages to console
- [ ] Show search queries being executed
- [ ] Display final report
- [ ] Handle and display errors

**Update files:**

- `src/index.ts` - Complete CLI implementation

## MVP Success Criteria

### Must Have

- [ ] Takes a research query from command line
- [ ] Searches the web using Steel
- [ ] Evaluates findings and extracts learnings
- [ ] Decides when to continue or stop research
- [ ] Generates a final report with citations
- [ ] Handles basic errors gracefully

### Example Usage

```bash
npm start "What are the latest developments in AI safety?" --depth=2 --breadth=3
```

## Dependencies (Minimal)

```json
{
  "dependencies": {
    "steel-sdk": "^0.7.0",
    "ai": "^4.0.0",
    "@ai-sdk/openai": "^1.0.0",
    "@ai-sdk/anthropic": "^1.0.0",
    "zod": "^3.22.0",
    "dotenv": "^16.3.0"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "@types/node": "^20.10.0"
  }
}
```

## Key Simplifications for MVP

1. **No fancy UI** - Just console.log statements
2. **No comprehensive testing** - Focus on making it work first
3. **No extensive documentation** - Basic README only
4. **No event system** - Direct method calls
5. **Single file providers** - All in one file for now
6. **Basic error handling** - Try/catch and simple messages
7. **No streaming** - Just return final results
8. **No caching** - Direct API calls every time

This gets you a working deep research agent in 10 days that can be expanded later!
