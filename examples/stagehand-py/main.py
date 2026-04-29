"""
AI-powered browser automation using Stagehand with Steel browsers.
https://github.com/steel-dev/steel-cookbook/tree/main/examples/stagehand-py
"""

import asyncio
import os
import sys
from dotenv import load_dotenv
from steel import Steel
from stagehand import AsyncStagehand

# Load environment variables
load_dotenv()

# Replace with your own API keys
STEEL_API_KEY = os.getenv("STEEL_API_KEY") or "your-steel-api-key-here"
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY") or "your-openai-api-key-here"


STORY_SCHEMA = {
    "type": "object",
    "properties": {
        "stories": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "Story title"},
                    "rank": {"type": "integer", "description": "Story rank number"},
                },
                "required": ["title", "rank"],
            },
        }
    },
    "required": ["stories"],
}


async def _stream_to_result(stream, label):
    """Drain a Stagehand SSE stream and return the final result payload."""
    result_payload = None
    async for event in stream:
        if event.type == "log":
            print(f"[{label}][log] {event.data.message}")
            continue
        status = event.data.status
        if status == "finished":
            result_payload = event.data.result
        elif status == "error":
            error_message = event.data.error or "unknown error"
            raise RuntimeError(f"{label} stream reported error: {error_message}")
    return result_payload


async def main():
    print("Steel + Stagehand Python Starter")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key")
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        sys.exit(1)

    if OPENAI_API_KEY == "your-openai-api-key-here":
        print("WARNING: Please replace 'your-openai-api-key-here' with your actual OpenAI API key")
        print("   Get your API key at: https://platform.openai.com/")
        sys.exit(1)

    session = None
    session_id = None
    stagehand = None
    client = None

    try:
        print("\nCreating Steel session...")

        # Initialize Steel client with the API key from environment variables
        client = Steel(steel_api_key=STEEL_API_KEY)

        session = client.sessions.create(
            # === Basic Options ===
            # use_proxy=True,              # Use Steel's proxy network (residential IPs)
            # proxy_url='http://...',      # Use your own proxy (format: protocol://username:password@host:port)
            # solve_captcha=True,          # Enable automatic CAPTCHA solving
            # session_timeout=1800000,     # Session timeout in ms (default: 5 mins)
            # === Browser Configuration ===
            # user_agent='custom-ua',      # Set a custom User-Agent
        )

        print(f"\033[1;93mSteel Session created!\033[0m")
        print(f"View session at \033[1;37m{session.session_viewer_url}\033[0m")

        cdp_url = f"{session.websocket_url}&apiKey={STEEL_API_KEY}"

        # Stagehand v3: embedded local server drives a Steel-hosted browser over CDP.
        stagehand = AsyncStagehand(
            server="local",
            model_api_key=OPENAI_API_KEY,
            local_ready_timeout_s=30.0,
        )

        print("Initializing Stagehand...")
        stagehand_session = await stagehand.sessions.start(
            model_name="openai/gpt-5",
            browser={
                "type": "local",
                "launchOptions": {
                    "cdpUrl": cdp_url,
                },
            },
        )
        session_id = stagehand_session.data.session_id
        print("Connected to browser via Stagehand")

        print("Navigating to Hacker News...")
        await stagehand.sessions.navigate(
            id=session_id,
            url="https://news.ycombinator.com",
        )

        print("Extracting top stories using AI...")

        extract_stream = await stagehand.sessions.extract(
            id=session_id,
            instruction="Extract the titles and ranks of the first 5 stories on the page",
            schema=STORY_SCHEMA,
            stream_response=True,
            x_stream_response="true",
        )
        stories_data = await _stream_to_result(extract_stream, "extract")

        print("\n\033[1;92mTop 5 Hacker News Stories:\033[0m")
        for story in (stories_data or {}).get("stories", []):
            print(f"{story['rank']}. {story['title']}")

        print("\nNavigating to HN's 'new' section via a natural-language click...")

        try:
            act_stream = await stagehand.sessions.act(
                id=session_id,
                input="click the 'new' link in the top navigation",
                stream_response=True,
                x_stream_response="true",
            )
            await _stream_to_result(act_stream, "act")
            print("Navigated to new stories!")

        except Exception as error:
            print(f"Could not navigate to new stories: {error}")

        await asyncio.sleep(2)

        print("\n\033[1;92mAutomation completed successfully!\033[0m")

    except Exception as error:
        print(f"Error during automation: {error}")
        import traceback
        traceback.print_exc()
        raise

    finally:
        if stagehand and session_id:
            print("Ending Stagehand session...")
            try:
                await stagehand.sessions.end(id=session_id)
            except Exception as error:
                print(f"Error ending Stagehand session: {error}")

        if stagehand:
            print("Closing Stagehand client...")
            try:
                await stagehand.close()
            except Exception as error:
                print(f"Error closing Stagehand: {error}")

        if session and client:
            print("Releasing Steel session...")
            try:
                client.sessions.release(session.id)
                print("Steel session released successfully")
            except Exception as error:
                print(f"Error releasing session: {error}")


# Run the main function
if __name__ == "__main__":
    asyncio.run(main())
