# Restate durable browser agent (TypeScript)

This recipe runs a Restate Virtual Object named `ResearchSession`. Its `answer` handler keeps scraped observations in object state, wraps OpenAI planning calls in durable `ctx.run` steps, and calls Steel's `scrape` API as the browser tool. If the service process crashes after Steel has fetched a page, Restate replays the journal entry instead of scraping the same page again.

The agent loop is deliberately small:

1. Ask the model whether to scrape another URL or finish.
2. Scrape the chosen URL with Steel and store a compact markdown observation.
3. Repeat up to `maxSteps`, then ask the model for a cited answer.

`history` is a shared handler, so you can inspect the object state without blocking the exclusive `answer` handler.

## Run it

Install the Restate server and CLI if you do not already have them:

```bash
npm install --global @restatedev/restate-server@latest @restatedev/restate@latest
```

Start Restate in one terminal:

```bash
restate-server
```

Start the TypeScript service in a second terminal:

```bash
cd examples/restate-agent-ts
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
npm install
npm start
```

Register the service and invoke a session from a third terminal:

```bash
restate deployments register http://localhost:9080 --force --yes

curl localhost:8080/restate/call/ResearchSession/demo/answer \
  --json '{"question":"Summarize the main stories on this page and cite the source URL.","seedUrl":"https://news.ycombinator.com","maxSteps":2}'
```

Get a Steel key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). `OPENAI_MODEL` defaults to `gpt-5.5`; change it in `.env` if your account uses a different model.

Your output varies. Structure looks like this:

```json
{
  "answer": "The page is a ranked list of current Hacker News stories...",
  "sources": ["https://news.ycombinator.com/"],
  "observations": 1
}
```

Open the Restate UI at `http://localhost:9070` and inspect the invocation journal. You should see separate entries for `plan step 1`, `scrape https://news.ycombinator.com/`, and the final model call.

## Make it yours

- **Use another start page.** Set `SEED_URL` in `.env` or pass `seedUrl` in the request body.
- **Cap browser spend.** Keep `maxSteps` low. Each step can call OpenAI once and Steel once.
- **Persist richer state.** Add links, screenshots, or extracted fields to the `Observation` type and save them through `ctx.set("state", ...)`.
- **Add a reset handler.** Add an exclusive handler that calls `ctx.clear("state")` when you want a fresh session key.

## Related

[restate-agent-py](../restate-agent-py), [restate-agent-go](../restate-agent-go), and [restate-agent-rs](../restate-agent-rs) implement the same durable research session in other languages. Restate's [AI overview](https://docs.restate.dev/ai), [Durable Agents](https://docs.restate.dev/ai/patterns/durable-agents), and [Durable Sessions](https://docs.restate.dev/ai/patterns/sessions) pages cover the primitives used here.
