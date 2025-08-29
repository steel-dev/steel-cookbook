"""
AI-powered browser automation using notte-sdk with Steel browsers.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/steel-notte-starter
"""

import os
import time
import asyncio
from dotenv import load_dotenv
from steel import Steel
import notte

load_dotenv()

# Replace with your own API keys
STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or "your-gemini-api-key-here"

# Replace with your own task
TASK = os.getenv("TASK") or "Go to Wikipedia and search for machine learning"

async def main():
    print("🚀 Steel + Notte Assistant")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("⚠️  WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key")
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        return

    if GEMINI_API_KEY == "your-gemini-api-key-here":
        print("⚠️  WARNING: Please replace 'your-gemini-api-key-here' with your actual Gemini API key")
        print("   Get your API key at: https://console.cloud.google.com/apis/credentials")
        return

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

        start_time = time.time()

        print(f"🎯 Executing task: {TASK}")
        print("=" * 60)

        try:
            with notte.Session(cdp_url=cdp_url) as notte_session:
                agent = notte.Agent(
                    session=notte_session,
                    max_steps=5,
                    reasoning_model="gemini/gemini-2.0-flash"
                )
                response = agent.run(task=TASK)

                duration = f"{(time.time() - start_time):.1f}"

                print("\n" + "=" * 60)
                print("🎉 TASK EXECUTION COMPLETED")
                print("=" * 60)
                print(f"⏱️  Duration: {duration} seconds")
                print(f"🎯 Task: {TASK}")
                if response:
                    print(f"📋 Result:\n{response.answer}")
                print("=" * 60)

        except Exception as e:
            print(f"❌ Task execution failed: {e}")
        finally:
            if session:
                print("Releasing Steel session...")
                client.sessions.release(session.id)
                print(f"Session completed. View replay at {session.session_viewer_url}")
            print("Done!")

    except Exception as e:
        print(f"❌ Failed to start Steel browser: {e}")
        print("Please check your STEEL_API_KEY and internet connection.")


if __name__ == "__main__":
    asyncio.run(main())