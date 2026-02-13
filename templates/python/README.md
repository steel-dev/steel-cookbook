# Steel + [Framework] Starter

<!-- ABOUTME: This is the Python example README template for steel-cookbook. Each section is designed to be concise while maintaining consistency across examples. -->

[Brief 1-2 sentence description explaining what this example does]

![Difficulty](https://img.shields.io/badge/Difficulty-Beginner%2FIntermediate%2FAdvanced-green%2Cyellow%2Cred)
![Time](https://img.shields.io/badge/Time-5%20min%2F10%20min%2F30%20min-blue)
![Tech](https://img.shields.io/badge/Python-green)

---

## TL;DR

[TIME] minute read. [KEY_OUTCOME]

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd examples/[EXAMPLE_SLUG]
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Add your API keys to .env
python main.py
```

---

## What You'll Learn

- **[Learning Point 1]**: Brief explanation
- **[Learning Point 2]**: Brief explanation
- **[Learning Point 3]**: Brief explanation

---

## Installation

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd examples/[EXAMPLE_SLUG]
```

### Create virtual environment

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
```

### Install dependencies

```bash
pip install -r requirements.txt
```

---

## Quick Start

The script will:

- [What happens 1]
- [What happens 2]
- [What happens 3]

### 1. Configure environment

Create `.env`:

```env
STEEL_API_KEY=your_steel_api_key_here
[OTHER_ENV_VARS]
```

Get your free API key: [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys)

### 2. Run

```bash
python main.py
```

---

## Configuration

Customize by editing `main.py`:

```python
session = client.sessions.create(
    use_proxy=True,           # Use Steel's proxy network
    solve_captcha=True,       # Enable CAPTCHA solving
    session_timeout=1800000,   # 30 minute timeout (default: 5 mins)
    user_agent='custom-ua',    # Custom User-Agent
)
```

---

## Error Handling

The template includes proper cleanup:

```python
try:
    # Your automation code
    pass
finally:
    # Cleanup runs even if there's an error
    if browser:
        browser.close()
    if session:
        client.sessions.release(session.id)
```

---

## Testing

This template includes a comprehensive test suite to verify your automation code.

### Test Structure

```
tests/
├── __init__.py           # Test package marker
├── conftest.py            # Pytest fixtures and configuration
├── test_main.py           # Unit tests for main.py logic
└── test_integration.py    # Integration tests with Steel SDK
```

### Running Tests

```bash
# Activate virtual environment
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Run all tests
pytest

# Run with verbose output
pytest -v

# Run only unit tests (no API calls)
pytest -m unit

# Run only integration tests (requires STEEL_API_KEY)
pytest -m integration
```

### Test Environment

For integration tests, create a `.env.test.local` file:

```bash
cp .env.test .env.test.local
# Add your STEEL_API_KEY to .env.test.local
```

The `.env.test.local` file is gitignored for security.

### Test Types

- **Unit tests** (`test_main.py`): Test logic without external dependencies
  - Environment variable loading
  - API key validation
  - Session configuration options
  - Error handling patterns

- **Integration tests** (`test_integration.py`): Test with real Steel API
  - Actual session creation
  - Session viewer URLs
  - Session cleanup
  - Client initialization

### Writing Your Own Tests

Add tests following the existing patterns:

```python
# tests/test_main.py
import pytest

class TestMyFeature:
    def test_my_automation_logic(self):
        # Test your specific automation logic
        assert True
```

```python
# tests/test_integration.py
import pytest
from steel import Steel

@pytest.mark.integration
def test_my_automation_with_steel(requires_api_key):
    client = Steel(steel_api_key=requires_api_key)
    session = client.sessions.create()
    # Test your automation with real session
    client.sessions.release(session.id)
```

---

## Support

- [Steel Documentation](https://docs.steel.dev)
- [API Reference](https://docs.steel.dev/api-reference)
- [Discord Community](https://discord.gg/steel-dev)
