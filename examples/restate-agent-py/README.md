# Restate durable browser agent (Python)

`ResearchSession` is a Restate Virtual Object whose state is the set of pages already scraped for that session key. The `answer` handler uses Pydantic models for request and response payloads, `ctx.run_typed` for the model planner and Steel scrape tool, and `ctx.set` to persist observations after every successful page fetch.

The browser tool is Steel's direct `scrape` endpoint, not a local browser driver. The agent sees markdown observations, chooses whether another scrape is useful, and returns a cited answer once the stored observations are enough.

## Run it

Install the Restate server and CLI:

```bash
npm install --global @restatedev/restate-server@latest @restatedev/restate@latest
```

Start Restate:

```bash
restate-server
```

In another terminal, run the Python service:

```bash
cd examples/restate-agent-py
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
python -m venv .venv
source .venv/bin/activate
pip install -e .
python main.py
```

Register and call the object:

```bash
restate deployments register http://localhost:9080 --force --yes

curl localhost:8080/restate/call/ResearchSession/demo/answer \
  --json '{"question":"Summarize the main stories on this page and cite the source URL.","seedUrl":"https://news.ycombinator.com","maxSteps":2}'
```

Your output varies. Structure looks like this:

```json
{
  "answer": "The page lists current Hacker News submissions and discussion links...",
  "sources": ["https://news.ycombinator.com/"],
  "observations": 1
}
```

The same session key keeps its `observations` list. Call the shared history handler to inspect it:

```bash
curl localhost:8080/restate/call/ResearchSession/demo/history --json '{}'
```

## Make it yours

- **Swap the target.** Change `SEED_URL` or send a different `seedUrl` in the request.
- **Use a different model.** Set `OPENAI_MODEL` in `.env`; the code uses the OpenAI Responses API directly.
- **Change the state shape.** Extend `Observation` with fields you want to reuse across calls, then keep writing `ResearchState.model_dump()` to Restate.
- **Make failures terminal.** If a bad user URL should not retry forever, catch it and raise a Restate terminal error before calling Steel.

## Related

[restate-agent-ts](../restate-agent-ts), [restate-agent-go](../restate-agent-go), and [restate-agent-rs](../restate-agent-rs) show the same loop in other SDKs. Restate documents the underlying patterns in [Durable Agents](https://docs.restate.dev/ai/patterns/durable-agents) and [Durable Sessions](https://docs.restate.dev/ai/patterns/sessions). The Python service is served as ASGI with [Hypercorn](https://hypercorn.readthedocs.io/).
