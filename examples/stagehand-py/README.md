# Stagehand Starter (Python)

Stagehand v3 ships two LLM-backed primitives that replace CSS selectors with natural language:

- `sessions.extract(instruction, schema)`: describe what you want, pass a JSON schema, get structured data back.
- `sessions.act(instruction)`: describe an action, Stagehand decides whether to click, type, or scroll.

Both run inside an embedded local Stagehand server that drives a Steel-hosted Chrome over CDP. You get the reasoning (Stagehand), the browser (Steel, with stealth, proxies, live viewer), and the Python async story tying them together.

```python
stagehand = AsyncStagehand(
    server="local",
    model_api_key=OPENAI_API_KEY,
    local_ready_timeout_s=30.0,
)

stagehand_session = await stagehand.sessions.start(
    model_name="openai/gpt-5",
    browser={
        "type": "local",
        "launchOptions": {
            "cdpUrl": f"{session.websocket_url}&apiKey={STEEL_API_KEY}",
        },
    },
)
session_id = stagehand_session.data.session_id
```

`server="local"` boots an embedded Stagehand server in-process. `browser.type="local"` with a `cdpUrl` tells that server to attach to a browser you already have, which is the Steel session. `model_name` is the LLM that interprets every instruction.

The Python SDK is async-first. Every `extract`, `act`, and `navigate` call returns a coroutine, and this starter uses `asyncio.run(main())` as the entry point. There is no sync wrapper; plan to `await` each step.

## The v3 streaming shape

Unlike the TypeScript SDK, where `stagehand.extract(...)` resolves directly to data, the Python v3 SDK exposes extract and act as SSE streams. You iterate events, watch for `finished` or `error`, and pick up the payload from the terminating event. The starter wraps that pattern in `_stream_to_result`:

```python
async def _stream_to_result(stream, label):
    result_payload = None
    async for event in stream:
        if event.type == "log":
            print(f"[{label}][log] {event.data.message}")
            continue
        status = event.data.status
        if status == "finished":
            result_payload = event.data.result
        elif status == "error":
            raise RuntimeError(f"{label} stream: {event.data.error or 'unknown'}")
    return result_payload
```

The `log` events are Stagehand's internal reasoning trace (which element it picked, why, how confident). Print them during development, silence them in production.

## Typed extraction

`sessions.extract` takes a JSON schema dict and returns data that conforms to it. No Zod, no pydantic required. A plain Python dict is enough:

```python
STORY_SCHEMA = {
    "type": "object",
    "properties": {
        "stories": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "title": {"type": "string"},
                    "rank": {"type": "integer"},
                },
                "required": ["title", "rank"],
            },
        }
    },
    "required": ["stories"],
}

extract_stream = stagehand.sessions.extract(
    id=session_id,
    instruction="Extract the titles and ranks of the first 5 stories on the page",
    schema=STORY_SCHEMA,
    stream_response=True,
    x_stream_response="true",
)
stories = await _stream_to_result(extract_stream, "extract")
```

Stagehand constrains the LLM's output against the schema, so `stories["stories"]` is a list of dicts with the keys you asked for. If you'd rather work with dataclasses or pydantic models, pass the JSON schema here and validate on your side once the stream resolves.

## Natural-language action

`sessions.act` takes an instruction and no selector. Stagehand inspects the DOM, picks the matching element, and acts:

```python
act_stream = stagehand.sessions.act(
    id=session_id,
    instruction="click the 'new' link in the top navigation",
    stream_response=True,
    x_stream_response="true",
)
await _stream_to_result(act_stream, "act")
```

Phrase instructions the way you'd describe the action to a person: "click the 'Add to Cart' button", "type user@example.com in the email field", "scroll to the pricing table". Stagehand handles the mapping.

## Run it

```bash
cd examples/stagehand-py
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
pip install -r requirements.txt
python main.py
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [platform.openai.com](https://platform.openai.com/api-keys). The script prints a session viewer URL as it starts. Open it in another tab to watch Stagehand work.

Your output varies. Structure looks like this:

```text
Creating Steel session...
Steel Session created!
View session at https://app.steel.dev/sessions/ab12cd34…

Initializing Stagehand...
Connected to browser via Stagehand
Navigating to Hacker News...
Extracting top stories using AI...

Top 5 Hacker News Stories:
1. Claude 4.7 Opus released today
2. Show HN: A browser extension for reading on slow connections
3. …

Navigating to HN's 'new' section via a natural-language click...
Navigated to new stories!

Automation completed successfully!
```

A full run takes ~30 seconds and costs a few cents of Steel session time plus OpenAI tokens for each `extract` / `act` call. The `finally` block in `main()` calls `stagehand.sessions.end`, `stagehand.close()`, and `client.sessions.release()`. Keep all three. Forgetting the last one keeps the Steel browser running until the default 5-minute timeout.

## Make it yours

- **Swap the schema and prompt.** `STORY_SCHEMA` and the `sessions.extract` instruction in `main.py` are the only parts tied to the Hacker News demo. Replace them with whatever shape you need to read: invoice lines, product grids, table rows.
- **Chain acts and extracts.** Break a task into natural-language steps, one `await _stream_to_result(...)` per step. Login, navigate, filter, extract.
- **Try another model.** `openai/gpt-5` is a reasonable default; Claude and Gemini also work. Change `model_name` on `sessions.start` and point `model_api_key` at the matching provider.
- **Turn on Steel stealth.** Uncomment `use_proxy`, `solve_captcha`, or `session_timeout` in the `client.sessions.create()` call for sites with anti-bot.

## Related

[TypeScript version](../stagehand-ts) · [Stagehand docs](https://docs.stagehand.dev)
