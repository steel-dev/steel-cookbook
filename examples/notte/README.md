# Notte Starter (Python)

Notte builds its agent on top of a perception layer instead of raw pixels. Each step, `notte.Session` flattens the live DOM into a compact action space (labeled interactive elements, form fields, section headings) and hands that structured view to the reasoning model. The model picks an action by id, Notte translates it back into a browser command, the loop repeats. Shorter prompts per step, no invented selectors.

This recipe points that loop at a Steel session instead of a locally-launched browser. Perception and reasoning stay on your machine; Chrome runs on Steel's cloud with stealth, proxies, and a live viewer attached.

```python
with notte.Session(cdp_url=cdp_url) as notte_session:
    agent = notte.Agent(
        session=notte_session,
        max_steps=5,
        reasoning_model="gemini/gemini-2.5-flash",
    )
    response = agent.run(task=TASK)
```

`notte.Session(cdp_url=...)` is the integration surface. Steel exposes a CDP endpoint on every `client.sessions.create()`; pass it in and Notte skips its default `patchright.chromium.launch()` path entirely.

## The pieces

**`notte.Session`** is the browser handle. Given a `cdp_url`, it attaches to the remote Chrome, drives a perception pipeline against each page, and exposes the resulting action space to the agent. The default `perception_type` is `"fast"` (heuristic parser). Pass `perception_type="deep"` on pages where the fast path misses elements, like heavy SPAs or custom widgets; slower per step, more reliable grounding.

**`notte.Agent`** wraps the perception-plan-act cycle. Two knobs carry most of the behavior:

- `max_steps` caps iterations. The starter uses 5, which covers the default Wikipedia task. Sign-in / filter / extract flows typically want 15 to 30. The agent exits early when it marks the task complete, so a generous ceiling is cheap.
- `reasoning_model` is the LLM that reads observations and picks actions. The starter uses `gemini/gemini-2.5-flash` for latency and cost. `openai/gpt-5` and `anthropic/claude-sonnet-4-6` also work; set the matching provider key in `.env`.

**`agent.run(task=...)`** is synchronous and returns an `AgentResponse`. `response.answer` holds the final output, typically the extracted content or confirmation text. The starter prints it after tearing down the session.

## Run it

```bash
cd examples/notte
cp .env.example .env          # set STEEL_API_KEY and GEMINI_API_KEY
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python main.py
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [aistudio.google.com](https://aistudio.google.com/app/apikey). The session viewer URL prints twice as the script starts (once plain, once highlighted). Open it in another tab to watch the agent drive the page.

Your output varies. Structure looks like this:

```text
Steel + Notte Assistant
============================================================

Starting Steel browser session...
Steel browser session started!
View live session at: https://app.steel.dev/sessions/ab12cd34...

Executing task: Go to Wikipedia and search for machine learning
============================================================

============================================================
TASK EXECUTION COMPLETED
============================================================
Duration: 24.3 seconds
Task: Go to Wikipedia and search for machine learning
Result:
Machine learning is a field of artificial intelligence...
============================================================

Releasing Steel session...
Session completed. View replay at https://app.steel.dev/sessions/ab12cd34...
Done!
```

A default run takes ~25 seconds and costs a few cents of Steel session time plus Gemini tokens across the step loop. The `finally` block that calls `client.sessions.release(session.id)` is load-bearing. Steel bills per session-minute, so skipping release keeps the browser running until the default 5-minute timeout.

## Make it yours

- **Change the task.** Set `TASK` in `.env` or edit the default in `main.py`. "Search Amazon for mechanical keyboards under $150 and list the top three by rating." Any sentence works; the agent decomposes it against the perception space on its own.
- **Raise `max_steps`.** Bump the ceiling on `notte.Agent(...)` for multi-page flows (login, filter, paginate, extract). Overshooting is free since the agent halts on completion.
- **Swap the reasoning model.** Change `reasoning_model` on `notte.Agent`. Flash for speed, GPT-5 or Sonnet for ambiguity. Matching API key goes in `.env`.
- **Switch to deep perception.** Pass `perception_type="deep"` to `notte.Session(...)` when the fast heuristics miss elements.
- **Turn on stealth.** Add `use_proxy=True`, `solve_captcha=True`, or `session_timeout=1800000` to `client.sessions.create()` for sites with anti-bot.

## Related

[Notte docs](https://docs.notte.cc) · [Notte on GitHub](https://github.com/nottelabs/notte)
