"""
AI-powered browser automation using browser-use library with Steel browsers.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/browser-use
"""

import os
import sys
import time
import asyncio
from dotenv import load_dotenv
from steel import Steel
from browser_use import Agent, Browser
from browser_use.llm import ChatOpenAI

load_dotenv()

# Replace with your own API keys
STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or "your-openai-api-key-here"

# Replace with your own task
TASK = os.getenv("TASK") or "Go to Wikipedia and search for machine learning"


async def main():
    print("Steel + Browser Use Assistant")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key")
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        sys.exit(1)

    if OPENAI_API_KEY == "your-openai-api-key-here":
        print("WARNING: Please replace 'your-openai-api-key-here' with your actual OpenAI API key")
        print("   Get your API key at: https://platform.openai.com/api-keys")
        sys.exit(1)

    print("\nStarting Steel browser session...")

    client = Steel(steel_api_key=STEEL_API_KEY)

    try:
        session = client.sessions.create()
    except Exception as e:
        print(f"Failed to start Steel browser: {e}")
        print("Please check your STEEL_API_KEY and internet connection.")
        sys.exit(1)

    print(
        f"\033[1;93mSteel Session created!\033[0m\n"
        f"View session at \033[1;37m{session.session_viewer_url}\033[0m\n"
    )

    try:
        model = ChatOpenAI(model="gpt-6.1-sol", api_key=OPENAI_API_KEY)
        agent = Agent(task=TASK, llm=model, browser=Browser(cdp_url=session.websocket_url))

        start_time = time.time()

        print(f"Executing task: {TASK}")
        print("=" * 60)

        result = await agent.run()
        if result.has_errors():
            raise RuntimeError(result.errors()[0])

        duration = f"{(time.time() - start_time):.1f}"

        print("\n" + "=" * 60)
        print("TASK EXECUTION COMPLETED")
        print("=" * 60)
        print(f"Duration: {duration} seconds")
        print(f"Task: {TASK}")
        if result.final_result():
            print(f"Result:\n{result.final_result()}")
        print("=" * 60)

    except Exception as e:
        print(f"Task execution failed: {e}")
        raise
    finally:
        print("Releasing Steel session...")
        client.sessions.release(session.id)
        print(f"Session completed. View replay at {session.session_viewer_url}")
        print("Done!")


if __name__ == "__main__":
    asyncio.run(main())
