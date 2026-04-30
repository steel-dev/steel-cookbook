# Notte Starter (Python)

Notte builds its agent on top of a perception layer. Each step, `notte.Session` flattens the live DOM into a compact action space (labeled interactive elements, form fields, section headings) and hands that structured view to the reasoning model. The model picks an action by id, Notte translates it back into a browser command.

This recipe points that loop at a Steel session instead of a locally-launched browser.

```python
with notte.Session(cdp_url=cdp_url) as notte_session:
    agent = notte.Agent(
        session=notte_session,
        max_steps=5,
        reasoning_model="gemini/gemini-2.5-flash",
    )
    response = agent.run(task=TASK)
```

`notte.Session(cdp_url=...)` is the integration surface. The default `perception_type` is `"fast"` (heuristic parser); pass `perception_type="deep"` on pages where the fast path misses elements.

`max_steps` caps iterations. The starter uses 5; sign-in / filter / extract flows typically want 15 to 30. The agent exits early when it marks the task complete.

## Run it

```bash
cd examples/notte
cp .env.example .env          # set STEEL_API_KEY and GEMINI_API_KEY
uv run main.py
```

Get keys from [app.steel.dev](https://app.steel.dev/settings/api-keys) and [aistudio.google.com](https://aistudio.google.com/app/apikey). The session viewer URL prints as the script starts.

Your output varies. Structure looks like this:

```text
Steel + Notte Assistant
============================================================

Starting Steel browser session...
Steel Session created!
View session at https://app.steel.dev/sessions/ab12cd34...

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

A default run takes ~25 seconds. The `finally` block calls `client.sessions.release(session.id)`.

## Make it yours

- **Change the task.** Set `TASK` in `.env` or edit the default in `main.py`.
- **Raise `max_steps`.** Bump the ceiling on `notte.Agent(...)` for multi-page flows.
- **Swap the reasoning model.** Change `reasoning_model` on `notte.Agent`. Flash for speed, GPT-5 or Sonnet for ambiguity.
- **Switch to deep perception.** Pass `perception_type="deep"` to `notte.Session(...)` when the fast heuristics miss elements.
- **Turn on stealth.** Add `use_proxy=True`, `solve_captcha=True`, or `session_timeout=1800000` to `client.sessions.create()` for sites with anti-bot.

## Related

[Notte docs](https://docs.notte.cc) · [Notte on GitHub](https://github.com/nottelabs/notte)
