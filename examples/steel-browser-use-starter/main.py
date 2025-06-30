"""
Steel Browser Use Starter Template
Integrates Steel with browser-use framework to create an AI agent for web interactions.
Requires STEEL_API_KEY & OPENAI_API_KEY in .env file.
"""

import os
import asyncio
from dotenv import load_dotenv
from steel import Steel
from browser_use import Agent, BrowserSession
from browser_use.llm import ChatOpenAI
from browser_use import Agent

# 1. Initialize environment and clients
load_dotenv()

# Get API keys
STEEL_API_KEY = os.getenv("STEEL_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
if not STEEL_API_KEY or not OPENAI_API_KEY:
    raise ValueError("STEEL_API_KEY and OPENAI_API_KEY must be set in .env file")

# Initialize Steel client and create session
client = Steel(steel_api_key=STEEL_API_KEY)


# 2. Create a Steel session to get a remote browser instance for your browser-use agent.
print("Creating Steel session...")
session = client.sessions.create()
print(f"Session created at {session.session_viewer_url}")

print(
    f"\033[1;93mSteel Session created!\033[0m\n"
    f"View session at \033[1;37m{session.session_viewer_url}\033[0m\n"
)

# Connect browser-use to Steel
# Replace YOUR_STEEL_API_KEY with your actual API key
cdp_url = f"wss://connect.steel.dev?apiKey={STEEL_API_KEY}&sessionId={session.id}"

# Create and configure the AI agent
model = ChatOpenAI(model="gpt-4o", temperature=0.3, api_key=OPENAI_API_KEY)

# The agent's main instruction
task = """
Go to https://docs.steel.dev/, open the changelog, and tell me what's new.
"""

agent = Agent(task=task, llm=model, browser_session=BrowserSession(cdp_url=cdp_url))

# 5. Run the agent and handle cleanup


async def main():
    try:
        await agent.run()
    except Exception as e:
        print(f"Error: {e}")
    finally:
        # Clean up resources
        if session:
            client.sessions.release(session.id)
            print("Session released")
        print("Done!")


if __name__ == "__main__":
    asyncio.run(main())
