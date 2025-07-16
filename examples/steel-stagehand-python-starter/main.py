import asyncio
import os
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from steel import Steel
from stagehand import StagehandConfig, Stagehand

# Load environment variables
load_dotenv()

STEEL_API_KEY = os.getenv("STEEL_API_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Define Pydantic models for structured data extraction
class Story(BaseModel):
    title: str = Field(..., description="Story title")
    rank: int = Field(..., description="Story rank number")

class Stories(BaseModel):
    stories: list[Story] = Field(..., description="List of top stories")

async def main():
    session = None
    stagehand = None
    client = None
    
    try:
        print("Creating Steel session...")
        
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
        
        config = StagehandConfig(
            env="LOCAL",  # Using LOCAL env to connect to Steel session
            model_name="gpt-4o-mini",  # or "gpt-4o" for better performance
            model_api_key=OPENAI_API_KEY,
            # Connect to Steel session via CDP
            local_browser_launch_options={
                "cdp_url": f"wss://connect.steel.dev?apiKey={STEEL_API_KEY}&sessionId={session.id}",
            }
        )
        
        stagehand = Stagehand(config)
        
        print("Initializing Stagehand...")
        await stagehand.init()
        
        print("Connected to browser via Stagehand")
        
        print("Navigating to Hacker News...")
        await stagehand.page.goto("https://news.ycombinator.com")
        
        print("Extracting top stories using AI...")
        
        stories_data = await stagehand.page.extract(
            "Extract the titles and ranks of the first 5 stories on the page",
            schema=Stories
        )
        
        print("\n\033[1;92mTop 5 Hacker News Stories:\033[0m")
        for story in stories_data.stories:
            print(f"{story.rank}. {story.title}")
        
        print("\nLooking for search functionality...")
        
        try:
            observe_result = await stagehand.page.observe("find the search link or button if it exists")
            print(f"Observed: {observe_result}")
            
            await stagehand.page.act("click on the search link if it exists")
            print("Found and clicked search functionality!")
            
            await stagehand.page.act("type 'AI' in the search box")
            print("Typed 'AI' in search box")
            
        except Exception as error:
            print(f"No search functionality found or accessible: {error}")
        
        await asyncio.sleep(2)
        
        print("\n\033[1;92mAutomation completed successfully!\033[0m")
        
    except Exception as error:
        print(f"Error during automation: {error}")
        import traceback
        traceback.print_exc()
    
    finally:
        if stagehand:
            print("Closing Stagehand...")
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