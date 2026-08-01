"""
Agentically test code changes in full stack apps using Morph Computer Use with Steel browsers.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-morph-computer-use-starter
"""

import os
import sys
import time
import asyncio
from dotenv import load_dotenv
from steel import Steel
from browser_use import Agent, BrowserSession
from browser_use.llm import ChatOpenAI

load_dotenv()

# Replace with your own API keys
STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
MORPH_API_KEY = os.getenv("MORPH_API_KEY") or "your-morph-api-key-here"

# Replace with your own task
TASK = os.getenv("TASK") or "Test the checkout flow: add an item to cart, proceed to checkout, and verify the order total is displayed correctly"

async def main():
    print("🚀 Steel + Morph Computer Use Assistant")
    print("=" * 60)
    
    if STEEL_API_KEY == "your-steel-api-key-here":
        print("⚠️  WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key")
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        sys.exit(1)
    
    if MORPH_API_KEY == "your-morph-api-key-here":
        print("⚠️  WARNING: Please replace 'your-morph-api-key-here' with your actual Morph API key")
        print("   Get your API key at: https://morphllm.com")
        sys.exit(1)

    print("\nStarting Steel browser session...")

    client = Steel(steel_api_key=STEEL_API_KEY)

    try:
        session = client.sessions.create()
        print("✅ Steel browser session started!")
        print(f"View live session at: {session.session_viewer_url}")

        print(
            f"\033[1;93mSteel Session created!\033[0m\n"
            f"View session at \033[1;37m{session.session_viewer_url}\033[0m\n"
        )

        cdp_url = f"{session.websocket_url}&apiKey={STEEL_API_KEY}"

        # Configure Morph Computer Use model
        # Morph is OpenAI-compatible, so we use ChatOpenAI with Morph's endpoint
        model = ChatOpenAI(
            model="morph-computer-use-v0",
            base_url="https://api.morphllm.com/v1",
            api_key=MORPH_API_KEY,
            temperature=0.3,
        )

        # Create the agent with Morph model and Steel browser session
        agent = Agent(
            task=TASK,
            llm=model,
            browser_session=BrowserSession(cdp_url=cdp_url)
        )

        start_time = time.time()

        print(f"🎯 Executing task: {TASK}")
        print("=" * 60)

        try:
            result = await agent.run()
            
            duration = f"{(time.time() - start_time):.1f}"
            
            print("\n" + "=" * 60)
            print("🎉 TASK EXECUTION COMPLETED")
            print("=" * 60)
            print(f"⏱️  Duration: {duration} seconds")
            print(f"🎯 Task: {TASK}")
            if result:
                print(f"📋 Result:\n{result}")
            print("=" * 60)
            
        except Exception as e:
            print(f"❌ Task execution failed: {e}")
            raise
        finally:
            if session:
                print("Releasing Steel session...")
                client.sessions.release(session.id)
                print(f"Session completed. View replay at {session.session_viewer_url}")
            print("Done!")

    except Exception as e:
        print(f"❌ Failed to start Steel browser: {e}")
        print("Please check your STEEL_API_KEY and internet connection.")
        raise


if __name__ == "__main__":
    asyncio.run(main())

