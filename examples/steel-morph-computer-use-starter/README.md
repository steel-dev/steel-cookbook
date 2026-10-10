# Steel Morph Computer Use Example

This example demonstrates how to integrate Steel with Morph Computer Use (`morph-computer-use-v0`) to agentically test code changes in full stack apps. It leverages Steel's session management to provide a secure, cloud-based browser instance for Morph to connect to via the browser-use framework, enabling automated testing of your application changes.

## Features

- Agentically test code changes in full stack apps
- Seamless integration between Steel and Morph Computer Use
- Cloud-based browser automation with Steel sessions
- AI-powered browser interaction using Morph's optimized model
- 10x cheaper and 250% faster than general-purpose models
- Automatic cleanup of resources
- Robust error handling and session management

## Why Morph Computer Use?

`morph-computer-use-v0` is state of the art for agentically testing codegen changes in full stack applications. It's **10x cheaper** and **250% faster** than general-purpose models like Claude Sonnet, making it ideal for automated testing workflows where you need to verify that code changes work correctly in a real browser environment.

## Prerequisites

- Python 3.11 or higher
- Python package manager (Recommended `uv`: `pip install uv`)
- Steel API key (Get 100 free browser hours [here.](https://app.steel.dev/sign-up))
- Morph API key (Get your API key at [morphllm.com](https://morphllm.com))

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/steel-dev/steel-cookbook.git
   cd steel-cookbook/examples/steel-morph-computer-use-starter
   ```

2. **Create and activate a virtual environment:**

   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows, use: .venv\Scripts\activate
   ```

3. **Install the required dependencies:**

   ```bash
   pip install -r requirements.txt
   ```

4. **Set up environment variables:**

   Create a `.env` file in the project directory:

   ```env
   STEEL_API_KEY=your_steel_api_key_here
   MORPH_API_KEY=your_morph_api_key_here
   TASK="Test the checkout flow: add an item to cart, proceed to checkout, and verify the order total is displayed correctly"
   ```

## Usage

Run the example with:

```bash
python main.py
```

The script will:

1. Create a new Steel session
2. Connect browser-use to the Steel session using the WebSocket URL
3. Configure Morph Computer Use model with Morph's OpenAI-compatible endpoint
4. Execute the test task (e.g., testing checkout flow, login functionality, etc.)
5. Automatically clean up resources when done

## How It Works

1. **Session Creation**: The script creates a Steel session with optional proxy and CAPTCHA-solving capabilities.

2. **Browser Integration**: The WebSocket URL from the Steel session is passed to browser-use's BrowserSession configuration.

3. **Morph Model Configuration**: Morph Computer Use is configured using `ChatOpenAI` from `browser_use.llm` with:
   - Model: `morph-computer-use-v0`
   - Base URL: `https://api.morphllm.com/v1` (Morph's OpenAI-compatible endpoint)
   - API key from environment variables

4. **AI Agent Setup**: A browser-use Agent is created with:
   - The specified task
   - Morph Computer Use language model
   - Browser instance connected to Steel

5. **Execution**: The agent runs autonomously, performing the specified task.

6. **Cleanup**: Resources are properly released, including:
   - Closing the browser connection
   - Releasing the Steel session

## Error Handling

The example includes comprehensive error handling:

- Validation of required environment variables
- Try/except blocks for session management
- Proper cleanup in case of failures
- Informative error messages

## Customization

You can modify the example by:

1. Changing the test task in `main.py` or via the `TASK` environment variable (e.g., "Test login flow", "Verify API endpoint returns correct data", "Test user registration process")
2. Adjusting Steel session parameters
3. Configuring different browser-use settings
4. Adjusting Morph model parameters (temperature, etc.)

## Morph API Configuration

Morph Computer Use uses an OpenAI-compatible API endpoint, making it easy to integrate with existing tools:

- **Base URL**: `https://api.morphllm.com/v1`
- **Model**: `morph-computer-use-v0`
- **Compatibility**: Works with any OpenAI-compatible SDK or library

## Contributing

Feel free to submit issues, fork the repository, and create pull requests for any improvements.

## License

This example is part of the Steel Cookbook and is licensed under the MIT License. See the LICENSE file for details.

