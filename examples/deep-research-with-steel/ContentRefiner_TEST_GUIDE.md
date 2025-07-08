# ContentRefiner Test Guide

## Overview

The ContentRefiner is a critical component of the Deep Research Agent that determines whether to continue searching or move to synthesis based on research evaluation results.

## What the ContentRefiner Does

1. **Decision Making**: Determines whether to continue research, refine the search strategy, or terminate and move to synthesis
2. **Gap Analysis**: Analyzes research gaps and provides recommendations for next steps
3. **Termination Logic**: Implements smart termination based on coverage, confidence, and research directions
4. **Strategy Refinement**: Works with QueryPlanner to generate refined search plans

## How to Test

### Quick Test

```bash
npm run test:content-refiner
```

### Manual Test

```bash
ts-node test/ContentRefiner.test.ts
```

### Test Structure

The test suite includes 8 comprehensive tests:

1. **Initialize** - Verifies the ContentRefiner creates properly with all methods
2. **Simple Decision Making** - Tests the core decision logic with different scenarios
3. **Should Terminate Analysis** - Tests termination conditions and reasons
4. **Analyze Research Gaps** - Tests gap analysis and priority determination
5. **Refine Search Strategy Mock** - Tests refinement logic with mock data
6. **Real API Integration** - Tests with real search results and evaluation
7. **Event Emission** - Verifies proper event emission for progress tracking
8. **Error Handling** - Tests graceful handling of invalid data

## Test Results Explanation

### Expected Output

When you run the test, you should see:

- ✅ 8 tests passed, 0 failed
- Real API calls to search "What is TypeScript?"
- Coverage analysis (typically 0.70 or higher)
- Learning extraction (typically 3-5 learnings)
- Research direction identification (typically 2-4 directions)
- Decision making based on real evaluation data

### Key Test Scenarios

**Termination Conditions:**

- ✅ Early termination when synthesis is recommended
- ✅ High coverage achieved (>0.85)
- ✅ Maximum depth reached
- ✅ No research directions available
- ✅ High confidence + good coverage

**Decision Logic:**

- ✅ "terminate" when evaluation recommends synthesis
- ✅ "terminate" when enough information available
- ✅ "continue" when coverage is low (<0.5)
- ✅ "refine" for moderate coverage scenarios

**Gap Analysis:**

- ✅ High priority when many gaps (>5) or low coverage (<0.5)
- ✅ Low priority when few gaps (<2) and high coverage (>0.7)
- ✅ Proper recommendations based on analysis

## Environment Requirements

Make sure you have these environment variables set in your `.env` file:

- `STEEL_API_KEY` - For web scraping
- `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` - For AI provider

## What the Test Validates

1. **Core Functionality**: All methods work correctly
2. **Decision Logic**: Proper decision making based on evaluation data
3. **API Integration**: Real API calls work with actual search results
4. **Event System**: Progress and tool call events are emitted properly
5. **Error Handling**: Graceful handling of edge cases
6. **Type Safety**: All TypeScript interfaces are properly implemented

## Expected Performance

- **Test Duration**: ~30-45 seconds (includes real API calls)
- **Success Rate**: 100% (8/8 tests should pass)
- **Coverage**: Tests cover all major ContentRefiner methods
- **Real Data**: Uses actual search results from Steel API

## Troubleshooting

If tests fail:

1. Check your `.env` file has the required API keys
2. Verify network connectivity for API calls
3. Ensure TypeScript is compiled correctly
4. Check that all dependencies are installed

## Integration Notes

The ContentRefiner integrates with:

- **QueryPlanner**: For generating refined search plans
- **ContentEvaluator**: For analyzing research evaluation results
- **SearchAgent**: For getting real search results (in tests)
- **Event System**: For progress tracking and tool call transparency

The test demonstrates the full workflow from search → evaluation → refinement decision.
