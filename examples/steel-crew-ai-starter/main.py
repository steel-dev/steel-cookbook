import os
import warnings
from datetime import datetime
from textwrap import dedent
from typing import List, Optional, Type

from crewai import Agent, Process, Task
from crewai import Crew as CrewAI
from crewai.agents.agent_builder.base_agent import BaseAgent
from crewai.project import CrewBase, agent, crew, task
from crewai.tools import BaseTool, EnvVar
from dotenv import load_dotenv
from pydantic import BaseModel, ConfigDict, Field, PrivateAttr
from steel import Steel

warnings.filterwarnings("ignore", category=SyntaxWarning, module="pysbd")

load_dotenv()

# Replace with your own API keys
STEEL_API_KEY = os.getenv('STEEL_API_KEY') or "your-steel-api-key-here"

# Replace with your own task
TASK = os.getenv('TASK') or 'Research AI LLMs and summarize key developments'


class SteelScrapeWebsiteToolSchema(BaseModel):
    url: str = Field(description="Website URL")


class SteelScrapeWebsiteTool(BaseTool):
    model_config = ConfigDict(arbitrary_types_allowed=True, validate_assignment=True, frozen=False)
    name: str = "Steel web scrape tool"
    description: str = "Scrape webpages using Steel and return the contents"
    args_schema: Type[BaseModel] = SteelScrapeWebsiteToolSchema
    api_key: Optional[str] = None
    formats: Optional[List[str]] = None
    proxy: Optional[bool] = None
    
    _steel: Optional[Steel] = PrivateAttr(None)
    package_dependencies: List[str] = ["steel-sdk"]
    env_vars: List[EnvVar] = [
        EnvVar(name="STEEL_API_KEY", description="API key for Steel services", required=True),
    ]
    
    def __init__(
            self,
            api_key: Optional[str] = None,
            formats: Optional[List[str]] = None,
            proxy: Optional[bool] = None,
            **kwargs
    ):
        super().__init__(**kwargs)
        self.api_key = api_key or os.getenv("STEEL_API_KEY")
        if not self.api_key:
            raise EnvironmentError("STEEL_API_KEY environment variable or api_key is required")
        
        self._steel = Steel(steel_api_key=self.api_key)
        self.formats = formats or ["markdown"]
        self.proxy = proxy


    def _run(self, url: str):
        if not self._steel:
            raise RuntimeError("Steel not properly initialized")
        
        return self._steel.scrape(url=url, use_proxy=self.proxy, format=self.formats, region="iad")


@CrewBase
class Crew():
    """Crew crew"""

    agents: List[BaseAgent]
    tasks: List[Task]

    @agent
    def researcher(self) -> Agent:
        return Agent(
            role="Instruction-Following Web Researcher",
            goal="Understand and execute: {task}. Find, verify, and extract the most relevant information using the web.",
            backstory="You specialize in decomposing and executing complex instructions like '{task}', using web research, verification, and synthesis to produce precise, actionable findings.",
            tools=[SteelScrapeWebsiteTool()],
            verbose=True
        )

    @agent
    def reporting_analyst(self) -> Agent:
        return Agent(
            role="Instruction-Following Reporting Analyst",
            goal="Transform research outputs into a clear, complete report that fulfills: {task}",
            backstory="You convert research into exhaustive, well-structured reports that directly address the original instruction '{task}', ensuring completeness and clarity.",
            tools=[SteelScrapeWebsiteTool()],
            verbose=True
        )

    @task
    def research_task(self) -> Task:
        return Task(
            description=dedent("""
                Interpret and execute the following instruction: {task}
                Use the web as needed. Cite and include key sources.
                Consider the current year: {current_year}.
            """),
            expected_output="A structured set of findings and sources that directly satisfy the instruction: {task}",
            agent=self.researcher()
        )

    @task
    def reporting_task(self) -> Task:
        return Task(
            description=dedent("""
                Review the research context and produce a complete report that fulfills the instruction.
                Ensure completeness, accuracy, and clear structure. Include citations.
            """),
            expected_output="A comprehensive markdown report that satisfies the instruction: {task}. Formatted as markdown without '```'",
            agent=self.reporting_analyst(),
        )

    @crew
    def crew(self) -> CrewAI:
        """Creates the Crew crew"""
        return CrewAI(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True,
        )


def main():
    print("🚀 Steel + CrewAI Starter")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("⚠️  WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key")
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        return

    inputs = {
        'task': TASK,
        'current_year': str(datetime.now().year)
    }

    try:
        print("Running crew...")
        Crew().crew().kickoff(inputs=inputs)
        print("\nReport written to report.md")
    except Exception as e:
        print(f"An error occurred while running the crew: {e}")


if __name__ == "__main__":
    main()
