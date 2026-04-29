# LangGraph Starter (Python)

[LangGraph](https://langchain-ai.github.io/langgraph/) builds agents as state machines: nodes do work, edges route control, and the agent loop is something you compose explicitly rather than something the framework hides for you. LangChain ships the model wrapper (`ChatAnthropic`) and the `@tool` decorator; LangGraph ships the graph runtime, plus prebuilt `ToolNode` and `tools_condition` helpers that turn three nodes and four edges into a tool-calling agent.

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

## The graph is the agent loop

In Mastra, the OpenAI Agents SDK, or the Vercel AI SDK, you hand the framework a list of tools and call `agent.generate(...)`. The framework owns the loop: model call, tool dispatch, model call, stop. LangGraph pulls that loop out into objects you can rewire.

`tools_condition` is the prebuilt that reads the last message in state and returns `"tools"` if it has `tool_calls`, or `END` if it doesn't. We override the `END` mapping so a tool-less assistant message routes to our `format` node instead of stopping. `ToolNode(tools)` runs each pending tool call concurrently and appends `ToolMessage`s back into state. The `tools -> agent` edge is what makes it a loop: after tools finish, the agent runs again with the new messages.

`MessagesState` is a TypedDict with one key, `messages`, plus a built-in reducer (`add_messages`) that appends instead of replacing. We extend it to add a `final_report` slot:

```python
class State(MessagesState):
    final_report: Optional[FinalReport]
```

State updates from each node merge into the dict by key. `agent_node` returns `{"messages": [response]}` (appended via the reducer); `format_node` returns `{"final_report": ...}` (set directly).

If you'd rather skip the explicit construction, `langgraph.prebuilt.create_react_agent(model, tools, prompt=SYSTEM, response_format=FinalReport)` builds the same three-node graph in one call. The explicit version is here because the graph is the point: it's where you'd add a guardrail, a memory writer, or a conditional human-in-the-loop pause.

## Tools share one Steel session

The four tools share one Steel session and one Playwright `page` through module-level globals, so successive calls compose against the same browser state:

```python
@tool
async def navigate(url: str) -> dict:
    """Navigate the open session to a URL and wait for the page to load."""
    if _page is None:
        raise RuntimeError("open_session must be called first.")
    await _page.goto(url, wait_until="domcontentloaded", timeout=45_000)
    return {"url": _page.url, "title": await _page.title()}
```

`open_session` creates the session and connects Playwright over CDP. `navigate` wraps `page.goto`. `snapshot` returns capped `innerText` plus the first 50 anchor tags so the agent never has to guess CSS selectors. `extract` runs N rows by M fields inside one `page.evaluate` (serial CDP round trips against a cloud browser are ~200-300ms each, batching collapses them to one).

`@tool` reads the function signature and docstring to build the JSON schema the model sees. `extract`'s `fields: list[FieldSpec]` becomes a typed array argument; the model gets the field descriptions from `FieldSpec`'s Pydantic metadata.

For concurrent runs, swap the globals for state-scoped storage (an `InjectedState` parameter on the tool, or a context dataclass passed at invoke time). LangGraph runs each graph instance in its own state, so per-run sessions need per-state storage.

## Structured output as a final node

LangChain's `model.with_structured_output(Schema)` returns a runnable that produces a validated Pydantic object. On Anthropic, it works by tool calling under the hood: a `Schema`-shaped tool is bound to the model and the model is forced to call it.

That bites if you also want the model to use real tools in the same call. The model gets confused about whether to keep navigating or to emit the final schema. The clean separation is what the graph already gives us: the agent loop calls real tools through `ToolNode` until it produces a free-text answer, then the `format` node runs `with_structured_output` once on the conversation:

```python
formatter = model.with_structured_output(FinalReport)

async def format_node(state):
    final = await formatter.ainvoke(state["messages"])
    return {"final_report": final}
```

The formatter sees every message including tool results, so it has the data needed to populate `FinalReport` without re-running anything. Cost is one extra cheap pass per run; on Haiku 4.5 that's a few tenths of a cent.

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
- **Add a guardrail node.** Insert a `validate` node before `format` that checks the conversation length or refuses off-topic answers. `add_conditional_edges` from `agent` can route to `validate`, and `validate` can route back to `agent` with a corrective `HumanMessage`.
- **Swap the model.** Any `langchain-*` chat model works. `ChatOpenAI(model="gpt-5-mini")` swaps Anthropic for OpenAI without touching the graph.

## Related

[OpenAI Agents SDK (Python)](../openai-agents-py) for the framework-managed tool loop. [Browser Use](../browser-use) for a higher-level agent. [LangGraph docs](https://langchain-ai.github.io/langgraph/).
