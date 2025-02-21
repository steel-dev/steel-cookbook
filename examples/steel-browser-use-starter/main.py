"""
Steel Browser Use Starter Template

This script demonstrates how to integrate Steel
with the 'browser-use' framework to create an AI agent that can
perform web interactions via a Steel's cloud-based browser.

@dev: you will need a STEEL_API_KEY & OPENAI_API_KEY in your .env file to run this example.
"""

import os
import sys
import asyncio
from dotenv import load_dotenv
from steel import Steel  # Steel SDK for managing cloud browser sessions
from langchain_openai import ChatOpenAI  # Simplified Chat Model integration
from browser_use import Agent
from browser_use.browser.browser import Browser, BrowserConfig
from browser_use.browser.context import BrowserContext

# Load environment variables from .env
load_dotenv()

# Retrieve API keys from environment variables
STEEL_API_KEY = os.getenv('STEEL_API_KEY')
if not STEEL_API_KEY:
    raise ValueError('STEEL_API_KEY not found in environment variables. '
                     'Please set it in your .env file.')

OPENAI_API_KEY = os.getenv('OPENAI_API_KEY')
if not OPENAI_API_KEY:
    raise ValueError('OPENAI_API_KEY not found in environment variables. '
                     'Please set it in your .env file.')

# Initialize the Steel client with your API key
client = Steel(steel_api_key=STEEL_API_KEY)


async def main():
    """
    Main entry point for the Steel Browser Use Example.

    1. Creates a Steel session, which starts a cloud-based browser session.
    2. Defines a Browser-use Browser and BrowserContext referencing our Steel session via a CDP URL.
    3. Initializes a LangChain ChatModel to define which LLM will power the agent's reasoning. (In this case, a ChatOpenAI model.)
    4. Runs the agent to navigate to execute on instructions. (In this case, go to Steel Docs and summarize what's new in the changelog.)
    5. Cleans up resources by closing the browser and releasing the Steel session.
    """

    session = None
    browser = None
    try:
        # 1. Create a Steel session for cloud-based browser automation
        print("Creating Steel session...")
        session = client.sessions.create(
            # Uncomment or customize the following options if needed:
            # use_proxy=True,
            # solve_captcha=True,
            # session_timeout=1800000,  # e.g., 30 minutes in ms
            # user_agent='MyCustomUserAgent/1.0',
        )

        # Provide a link to view the live session
        print(f"\033[1;93mSteel Session created!\033[0m\n"
              f"View session at \033[1;37m{session.session_viewer_url}\033[0m\n")

        # 2. Construct the CDP URL using the Steel session ID
        cdp_url = f"wss://connect.steel.dev?apiKey={STEEL_API_KEY}&sessionId={session.id}"

        # Initialize a browser-use Browser instance with Steel's CDP URL
        browser = Browser(config=BrowserConfig(cdp_url=cdp_url))
        browser_context = BrowserContext(browser=browser)

        # 3. Create a ChatOpenAI model for agent reasoning
        # You can use any browser-use compatible model you want here like Anthropic, Deepseek, Gemini, etc.
        # See supported models here: https://docs.browser-use.com/customize/supported-models
        model = ChatOpenAI(
            model="gpt-4o",
            temperature=0.3,
            api_key=OPENAI_API_KEY
        )

        # The agent's main instruction
        task = """
        Go to https://docs.steel.dev/, open the changelog, and tell me what's new.
        """

        # 4. Instantiate and run the agent
        agent = Agent(
            task=task,
            llm=model,
            browser=browser,
            browser_context=browser_context,
        )

        print("Running the agent...")
        await agent.run()
        print("Task completed successfully!")

    except Exception as e:
        print(f"An error occurred: {str(e)}")
    finally:
        # Initiate cleanup
        # 5a. Attempt to close the browser if it was created
        if browser:
            print("Closing browser...")
            try:
                await browser.close()
                print("Browser closed.")
            except Exception as e:
                # The browser might already be closed. Log, then continue.
                print(
                    f"Could not close the browser (perhaps already closed): {str(e)}")

        # 5b. Release the session if it still exists
        if session:
            print("Releasing Steel session...")
            try:
                client.sessions.release(session.id)
                print("Steel session released.")
            except Exception as e:
                print(f"Failed to release Steel session: {str(e)}")

        # 5c. Optional:Cancel any lingering asyncio tasks
        pending_tasks = [t for t in asyncio.all_tasks(
        ) if t is not asyncio.current_task()]
        if pending_tasks:
            print(f"Cancelling {len(pending_tasks)} pending tasks...")
            for t in pending_tasks:
                t.cancel()
            await asyncio.gather(*pending_tasks, return_exceptions=True)

        print("Done!")

if __name__ == '__main__':
    asyncio.run(main())
