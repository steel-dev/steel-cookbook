"""
Steel + Skyvern Integration Starter Template

This example demonstrates how to use Skyvern's AI-powered browser automation
with Steel's managed browser infrastructure using remote browser connection.

"""

import os
import asyncio

from dotenv import load_dotenv

# Load environment variables from .env file 
load_dotenv()

# Import required libraries
from steel import Steel
from skyvern import Skyvern


async def main():
    """Main function demonstrating Steel + Skyvern integration"""
    
    # Get API key
    STEEL_API_KEY = os.getenv("STEEL_API_KEY")
    if not STEEL_API_KEY:
        raise ValueError("STEEL_API_KEY must be set in .env file")
    
    # Initialize Steel client
    print("🔧 Initializing Steel client...")
    steel_client = Steel(steel_api_key=STEEL_API_KEY)
    
    session = None
    try:
        # Create Steel browser session
        print("🌐 Creating Steel browser session...")
        session = steel_client.sessions.create()
        print(f"✅ Steel session created!")
        print(f"📱 Session ID: {session.id}")
        print(f"👁️  Live viewer: {session.session_viewer_url}")
        print("-" * 60)
        
        # Generate CDP WebSocket URL for remote browser connection
        cdp_url = f"wss://connect.steel.dev?apiKey={STEEL_API_KEY}&sessionId={session.id}"
        print(f"🔗 CDP URL: {cdp_url[:50]}...")
        
        # Wait a moment for session to be ready
        print("⏳ Waiting for Steel session to initialize...")
        await asyncio.sleep(3)
        
        # Initialize Skyvern with the remote browser CDP URL.
        # Skyvern will use the configuration from the .env file created by `skyvern init`.
        print("🤖 Connecting Skyvern to Steel browser...")
        skyvern = Skyvern(cdp_url=cdp_url)
        
        # Define AI automation task
        task_prompt = """
        Go to https://news.ycombinator.com (Hacker News).
        Find the top story on the front page.
        Extract the title, URL, and number of points.
        Return the information in a structured format.
        """
        
        print("🚀 Starting AI automation task...")
        print(f"📝 Task: {task_prompt.strip()}")
        print("-" * 60)
        
        # Execute the task using Skyvern's AI
        task = await skyvern.run_task(
            prompt=task_prompt,
            data_extraction_schema={
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "The title of the top story"
                    },
                    "url": {
                        "type": "string", 
                        "description": "The URL of the top story"
                    },
                    "points": {
                        "type": "string",
                        "description": "Number of points the story has"
                    },
                    "comments": {
                        "type": "string",
                        "description": "Number of comments on the story"
                    }
                }
            }
        )
        
        # Display results
        print("✅ Task completed successfully!")
        print("📊 Extracted Data:")
        print("-" * 60)
        
        if hasattr(task, 'extracted_data') and task.extracted_data:
            data = task.extracted_data
            print(f"🏆 Title: {data.get('title', 'N/A')}")
            print(f"🔗 URL: {data.get('url', 'N/A')}")
            print(f"⭐ Points: {data.get('points', 'N/A')}")
            print(f"💬 Comments: {data.get('comments', 'N/A')}")
        else:
            print("ℹ️  Task completed but no structured data was extracted")
            print(f"📋 Task Status: {getattr(task, 'status', 'Unknown')}")
            if hasattr(task, 'task_id'):
                print(f"🆔 Task ID: {task.task_id}")
        
        print("-" * 60)
        print(f"🎥 Watch the automation in action: {session.session_viewer_url}")
        
    except Exception as e:
        print(f"❌ Error occurred: {str(e)}")
        print("💡 Make sure you have:")
        print("   1. Valid STEEL_API_KEY in .env file")
        print("   2. Skyvern properly installed (pip install skyvern)")
        print("   3. Internet connection for remote browser access")
        
    finally:
        # Clean up Steel session
        try:
            if session:
                steel_client.sessions.release(session.id)
                print("🧹 Steel session released successfully")
        except Exception as cleanup_error:
            print(f"⚠️  Warning: Could not release session: {cleanup_error}")


if __name__ == "__main__":
    # Run the main demo
    asyncio.run(main())
