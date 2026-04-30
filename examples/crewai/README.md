# CrewAI Starter (Python)

CrewAI composes LLM work out of three primitives: an `Agent` (role, goal, tools), a `Task` (description + expected output), and a `Crew` that runs them in order. This recipe wires two agents, a `researcher` and a `reporting_analyst`, to a single custom tool that calls Steel's scrape API. The researcher gathers sources; the analyst turns them into `report.md`.

```python
@agent
def researcher(self) -> Agent:
    return Agent(
        role="Instruction-Following Web Researcher",
        goal="Understand and execute: {task}. Find, verify, and extract ...",
        backstory="You specialize in decomposing and executing complex ...",
        tools=[SteelScrapeWebsiteTool()],
        llm="gpt-5-nano",
        verbose=True,
    )
```

The `{task}` placeholder is interpolated from the `inputs` dict passed to `kickoff()`, so the same crew runs against any research prompt without a code edit.

`SteelScrapeWebsiteTool` subclasses `BaseTool`, declares `args_schema = SteelScrapeWebsiteToolSchema` (a single `url: str` field), and implements `_run`:

```python
class SteelScrapeWebsiteTool(BaseTool):
    name: str = "Steel web scrape tool"
    description: str = "Scrape webpages using Steel and return the contents"
    args_schema: Type[BaseModel] = SteelScrapeWebsiteToolSchema

    def _run(self, url: str):
        return self._steel.scrape(
            url=url, use_proxy=self.proxy, format=self.formats, region="iad",
        )
```

No session lifecycle to manage: `scrape()` is one-shot and returns markdown by default.

## Run it

```bash
cd examples/crewai
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
uv run main.py
```

Get keys from [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys) and [platform.openai.com](https://platform.openai.com/api-keys). Default `TASK` is `"Research AI LLMs and summarize key developments"`; override via the `TASK` env var or edit `main.py`.

Your output varies. Structure looks like this:

```text
Steel + CrewAI Starter
============================================================
Running crew...

# Agent: Instruction-Following Web Researcher
## Task: Interpret and execute the following instruction...
## Using tool: Steel web scrape tool
## Tool Input: {"url": "https://..."}
## Tool Output: # Page title ... (markdown)
## Final Answer: - Finding 1 ... - Finding 2 ...

# Agent: Instruction-Following Reporting Analyst
## Task: Review the research context and produce a complete report...
## Final Answer: # AI LLMs ... (full markdown report)

Report written to report.md
```

A run takes ~60-90 seconds. `report.md` is overwritten each run.

## Make it yours

- **Change the task.** Set `TASK="Find the top 3 open-source vector databases and compare licensing"` in `.env` and rerun.
- **Add an agent.** Slot a fact-checker between researcher and analyst with a new `@agent` and `@task`. `Process.sequential` picks them up in declaration order.
- **Mix models.** The researcher can stay on `gpt-5-nano` while the analyst runs `gpt-5` or `claude-sonnet-4-6`. Set `llm=` independently on each `Agent`.
- **Tighten the scraper.** Pass `proxy=True` to `SteelScrapeWebsiteTool()` for sites that block datacenter IPs, or `formats=["html"]` if the markdown conversion strips something you need.

## Related

[CrewAI docs](https://docs.crewai.com) · [CrewAI tools reference](https://docs.crewai.com/en/concepts/tools)
