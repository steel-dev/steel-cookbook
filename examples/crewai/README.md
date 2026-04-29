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

The `{task}` placeholder is interpolated from the `inputs` dict passed to `kickoff()`, so the same crew runs against any research prompt without a code edit. `gpt-5-nano` is cheap enough for iteration; swap `llm=` for anything LiteLLM supports.

## The Steel tool

CrewAI tools are Pydantic-described callables. `SteelScrapeWebsiteTool` subclasses `BaseTool`, declares `args_schema = SteelScrapeWebsiteToolSchema` (a single `url: str` field), and implements `_run`.

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

No session lifecycle to manage: `scrape()` is one-shot and returns markdown by default (`formats=["markdown"]`, set in `__init__`). The agent decides when to call the tool based on `name`, `description`, and `args_schema`. `env_vars` declares `STEEL_API_KEY` so CrewAI's introspection knows what the tool requires.

Both agents get the same tool instance. In practice the researcher drives it; giving the analyst access is a low-cost hedge so it can pull one more citation if the researcher skipped something. For full browser control (clicks, forms, login walls), wrap a Steel session with Playwright and expose the page as a tool. For read-only fetch-and-parse, `scrape()` is enough.

## The crew

Two `@task` methods define the work. `research_task` interpolates `{task}` and `{current_year}` into its description and is bound to `self.researcher()`. `reporting_task` reads the researcher's output from the shared crew context; the analyst never needs the original URL.

The starter imports CrewAI's `Crew` under an alias so the local `Crew` class (the `@CrewBase`-decorated one) doesn't collide with the framework type:

```python
from crewai import Crew as CrewAI
```

That's why the `@crew` factory below returns `CrewAI`, not `Crew`:

```python
@crew
def crew(self) -> CrewAI:
    return CrewAI(
        agents=self.agents,
        tasks=self.tasks,
        process=Process.sequential,
        verbose=True,
    )
```

`Process.sequential` runs tasks in declaration order and pipes each task's output into the next task's context. `Process.hierarchical` is the alternative (a manager agent delegates); sequential is the right default for a research-then-report flow. The `@CrewBase` decorator on `Crew` is what turns the `@agent` and `@task` methods into the `self.agents` and `self.tasks` lists referenced above.

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

A run takes ~60-90 seconds: a few OpenAI tokens per agent turn plus one Steel scrape per URL the researcher visits (usually 2-4). `report.md` is overwritten each run; rename it if you want to keep a history.

## Make it yours

- **Change the task.** Set `TASK="Find the top 3 open-source vector databases and compare licensing"` in `.env` and rerun. No code edit needed; the crew reinterprets the instruction.
- **Add an agent.** Slot a fact-checker between researcher and analyst with a new `@agent` and `@task`. `Process.sequential` picks them up in declaration order.
- **Mix models.** The researcher can stay on `gpt-5-nano` while the analyst runs `gpt-5` or `claude-sonnet-4-6`. Set `llm=` independently on each `Agent`.
- **Tighten the scraper.** Pass `proxy=True` to `SteelScrapeWebsiteTool()` for sites that block datacenter IPs, or `formats=["html"]` if the markdown conversion strips something you need.

## Related

[CrewAI docs](https://docs.crewai.com) · [CrewAI tools reference](https://docs.crewai.com/en/concepts/tools)
