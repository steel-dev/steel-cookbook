# LangGraph Starter (Python)

[LangGraph](https://langchain-ai.github.io/langgraph/) builds agents as state machines: nodes do work, edges route control, and the agent loop is something you compose explicitly. LangChain ships the model wrapper (`ChatAnthropic`) and the `@tool` decorator; LangGraph ships the graph runtime, plus prebuilt `ToolNode` and `tools_condition` helpers.

This recipe is a four-tool browser agent: `open_session`, `navigate`, `snapshot`, `extract`. Each tool drives a Steel cloud session over Playwright. The graph has three nodes (`agent`, `tools`, `format`) and runs against `github.com/trending/python`, returning a Pydantic-validated `FinalReport`.

```python
graph = StateGraph(State)
graph.add_node("agent", agent_node)
graph.add_node("tools", ToolNode(tools))
graph.add_node("format", format_node)

graph.add_edge(START, "agent")
graph.add_conditional_edges(
    "agent",
    tools_condition,
    {"tools": "tools", END: "format"},
)
graph.add_edge("tools", "agent")
graph.add_edge("format", END)

app = graph.compile()
```

If you'd rather skip the explicit construction, `langgraph.prebuilt.create_react_agent(model, tools, prompt=SYSTEM, response_format=FinalReport)` builds the same three-node graph in one call.

## Run it

```bash
cd examples/langgraph
cp .env.example .env          # set STEEL_API_KEY and ANTHROPIC_API_KEY
uv sync
uv run playwright install chromium
uv run main.py
```

Get keys at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys) and [console.anthropic.com](https://console.anthropic.com/). Each tool call prints its latency; the `open_session` tool returns a Live View URL you can open in another tab to watch the agent work.

Your output varies. Structure looks like this:

```text
Steel + LangGraph Starter
============================================================
    open_session: 1840ms
  step: agent -> navigate | 1207 tokens
    navigate: 712ms
  step: agent -> snapshot | 1502 tokens
    snapshot: 412ms (3812 chars, 49 links)
  step: agent -> extract | 1741 tokens
    extract: 198ms (3 rows)
  step: agent -> (text only) | 4998 tokens
  step: format

Agent finished.

{
  "summary": "Three trending Python repos focused on agentic workflows...",
  "repos": [
    {
      "name": "owner/repo",
      "url": "https://github.com/owner/repo",
      "stars": "1,240",
      "description": "..."
    },
    ...
  ]
}

Releasing Steel session...
Session released. Replay: https://app.steel.dev/sessions/ab12cd34...
```

A run takes ~20 to 40 seconds and a few cents of Steel session time plus Anthropic tokens. The `finally` block calls `steel.sessions.release()`. Skip it and the session keeps billing until the default 5-minute timeout.

## Make it yours

- **Use the prebuilt.** Replace the explicit graph with `create_react_agent(model, tools, prompt=SYSTEM, response_format=FinalReport)` from `langgraph.prebuilt`. Same behavior, three lines.
- **Add a checkpointer.** Pass `checkpointer=MemorySaver()` to `graph.compile(...)` and a `thread_id` in the run config. The graph snapshots state after every node, so a crashed run can resume from the last checkpoint. Use `SqliteSaver` (from `langgraph-checkpoint-sqlite`) for persistence across processes.
- **Stream events.** Swap `app.ainvoke(...)` for `async for event in app.astream_events(..., version="v2")`. You'll see `on_tool_start`, `on_tool_end`, and `on_chat_model_stream` events you can pipe to a UI.
- **Trace with LangSmith.** Set `LANGSMITH_API_KEY` and `LANGSMITH_TRACING=true` in `.env`. No code changes; every node and tool call shows up at [smith.langchain.com](https://smith.langchain.com).
- **Swap the model.** Any `langchain-*` chat model works. `ChatOpenAI(model="gpt-5-mini")` swaps Anthropic for OpenAI without touching the graph.

## Related

[OpenAI Agents SDK (Python)](../openai-agents-py) · [Browser Use](../browser-use) · [LangGraph docs](https://langchain-ai.github.io/langgraph/)
