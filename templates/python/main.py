"""
Web automation using Steel's cloud browsers.
https://github.com/steel-dev/steel-cookbook/
"""

import os
import sys
from dotenv import load_dotenv
from steel import Steel

# Load environment variables from .env file
load_dotenv()

# Replace with your own API key
STEEL_API_KEY = os.getenv('STEEL_API_KEY') or "your-steel-api-key-here"

# Initialize Steel client with API key from environment variables
client = Steel(
    steel_api_key=STEEL_API_KEY,
)

def main():
    print("🚀 Steel Python Starter")
    print("=" * 60)

    if STEEL_API_KEY == "your-steel-api-key-here":
        print("⚠️  WARNING: Please replace 'your-steel-api-key-here' with your actual Steel API key")
        print("   Get your API key at: https://app.steel.dev/settings/api-keys")
        sys.exit(1)
    session = None

    try:
        print("Creating Steel session...")

        # Create a new Steel session with all available options
        session = client.sessions.create(
            # === Basic Options ===
            # use_proxy=True,              # Use Steel's proxy network (residential IPs)
            # proxy_url='http://...',      # Use your own proxy (format: protocol://username:password@host:port)
            # solve_captcha=True,          # Enable automatic CAPTCHA solving
            # session_timeout=1800000,     # Session timeout in ms (default: 5 mins)
            # === Browser Configuration ===
            # user_agent='custom-ua',      # Set a custom User-Agent
        )

        print(f"""\033[1;93mSteel Session created successfully!\033[0m
You can view the session live at \033[1;37m{session.session_viewer_url}\033[0m
        """)

        # ============================================================
        # Your Automations Go Here!
        # ============================================================

        # Replace this section with your cookbook example.
        print("Add your automation code here.")

        # ============================================================
        # End of Automations
        # ============================================================

    except Exception as e:
        print(f"An error occurred: {e}")
        raise
    finally:
        if session:
            print("Releasing session...")
            client.sessions.release(session.id)
            print("Session released")

        print("Done!")


if __name__ == "__main__":
    main()
