# Steel + Browser-Use: Manual reCAPTCHA v2 Solver

This example demonstrates how to **manually** solve reCAPTCHA v2 using Steel's CAPTCHA-solving API with the [browser-use](https://github.com/browser-use/browser-use) framework.

The agent opens multiple tabs with different CAPTCHA challenges (Google reCAPTCHA v2 and Google reCAPTCHA v3), but only solves the reCAPTCHA v2 — filtering by the `type` field from Steel's CAPTCHA status API.

Unlike the auto-solving approach, this example gives you full control over the solve lifecycle:

1. **Detect** — Poll `captchas.status()` until a reCAPTCHA v2 task is detected
2. **Solve** — Explicitly request a solve only for tasks with `type="recaptchaV2"`
3. **Verify** — Monitor `isSolvingCaptcha` flag to know when the solve process is complete
4. **Submit** — Let the AI agent submit the form after solving

## Features

- **Manual CAPTCHA control** — No auto-solving; you decide when to trigger the solve
- **reCAPTCHA v2 only** — Filters tasks by `type` field, ignoring non-reCAPTCHAV2 challenges (turnstile, image_to_text, etc.)
- **Multi-page monitoring** — Opens both Google reCAPTCHA v2 and Google reCAPTCHA v3 demos, but only solves reCAPTCHA v2
- **Status polling** — Monitors the full task lifecycle (detected → solving → validating) and uses `isSolvingCaptcha` flag for completion
- **browser-use agent** — AI agent navigates to demo pages and submits the form after solving
- **Clean session management** — Automatic cleanup of Steel sessions

## Prerequisites

- Python 3.11 or higher
- Steel API key ([Get 100 free browser hours](https://app.steel.dev/sign-up))
- Gemini API key ([Get your key](https://aistudio.google.com/app/api-keys))

## Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/steel-dev/steel-cookbook.git
   cd steel-cookbook/examples/steel-browser-use-manual-captcha-starter
   ```

2. **Create and activate a virtual environment:**

   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

3. **Install dependencies:**

   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables:**

   ```bash
   cp .env.example .env
   ```

5. **Edit `.env` with your API keys:**

   ```env
   STEEL_API_KEY=your_steel_api_key_here
   GEMINI_API_KEY=your_gemini_api_key_here
   ```

## Usage

```bash
python main.py
```

## How It Works

### 1. Session Creation

A Steel session is created with `solve_captcha=True` but `auto_captcha_solving` set to `False` in the stealth config. This tells Steel to detect CAPTCHAs but **not** automatically solve them — giving you manual control.

```python
session = client.sessions.create(
    timeout=150000,
    solve_captcha=True,
    stealth_config={"auto_captcha_solving": False},
)
```

### 2. Browser-Use Agent

The AI agent (powered by Gemini 3 Pro) connects to the Steel session via CDP WebSocket and opens multiple CAPTCHA demo pages in separate tabs:

- Google reCAPTCHA v2 demo
- Google reCAPTCHA v3 demo

### 3. Manual Solve Tool

The `solve_recaptcha_v2_manual` tool is registered with browser-use. When the agent encounters CAPTCHAs, it calls this tool which:

- **Polls** `client.sessions.captchas.status(session_id)` every 3 seconds
- **Detects** tasks where `status == "detected"` and `type == "recaptchaV2"`
- **Triggers** `client.sessions.captchas.solve(session_id, task_id=task_id)` only for reCAPTCHA v2 tasks
- **Monitors** `isSolvingCaptcha` flag on each page to determine when the solve process is complete
- **Returns** once `isSolvingCaptcha` becomes `False` (meaning validation is done)

**Note:** The `validating` status means the CAPTCHA is technically solved, but Steel waits a few seconds to check for any errors after submission. The `isSolvingCaptcha` flag becoming `False` indicates the entire process is complete.

### 4. Form Submission

Once the tool reports the CAPTCHA is solved, the agent clicks the "Submit" button and reports the page result.

## Configuration

| Variable             | Description                             | Default         |
| -------------------- | --------------------------------------- | --------------- |
| `MAX_POLL_ATTEMPTS`  | Maximum polling attempts before timeout | `60`            |
| `POLL_INTERVAL_SECS` | Seconds between status polls            | `3.0`           |
| `SOLVE_CAPTCHA_TYPE` | CAPTCHA type to solve (recaptchaV2)     | `"recaptchaV2"` |

## Related Examples

- [`steel-browser-use-captcha-solve-starter`](../steel-browser-use-captcha-solve-starter) — Auto-solving CAPTCHAs with browser-use
- [`steel-browser-use-starter`](../steel-browser-use-starter) — Basic browser-use + Steel integration

## Customization

You can modify the example by:

1. Changing the task in `main.py`
2. Adjusting Steel session parameters
3. Configuring different browser-use settings
4. Using a different LLM models or adjusting its parameters

## Contributing

Feel free to submit issues, fork the repository, and create pull requests for any improvements.

## License

This example is part of the Steel Cookbook and is licensed under the MIT License. See the LICENSE file for details.
