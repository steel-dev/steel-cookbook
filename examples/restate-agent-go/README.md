# Restate durable browser agent (Go)

The Go version exposes `ResearchSession` through the Restate SDK's reflection API. `Answer` is an exclusive Virtual Object handler, so calls for the same session key are serialized while it reads and writes state. The durable work happens in `restate.Run`: one step asks OpenAI for the next action, another step calls Steel `Scrape`, and the result is written back to object state.

That shape matters for browser jobs. A successful Steel scrape is a side effect with cost and latency. Once Restate journals the `scrape <url>` step, a process restart resumes from the recorded observation instead of repeating the HTTP call.

## Run it

Install and start Restate:

```bash
npm install --global @restatedev/restate-server@latest @restatedev/restate@latest
restate-server
```

Run the Go service in another terminal:

```bash
cd examples/restate-agent-go
cp .env.example .env          # set STEEL_API_KEY and OPENAI_API_KEY
go mod tidy
go run .
```

Register the deployment and call the exported `Answer` handler:

```bash
restate deployments register http://localhost:9080 --force --yes

curl localhost:8080/restate/call/ResearchSession/demo/Answer \
  --json '{"question":"Summarize the main stories on this page and cite the source URL.","seedUrl":"https://news.ycombinator.com","maxSteps":2}'
```

Your output varies. Structure looks like this:

```json
{
  "answer": "Hacker News is showing a ranked feed of current submissions...",
  "sources": ["https://news.ycombinator.com/"],
  "observations": 1
}
```

Use the Restate UI at `http://localhost:9070` to inspect the journal. The handler names are capitalized because Go reflection exposes exported methods.

## Make it yours

- **Tune retries.** Add `restate.WithMaxRetryDuration` or `restate.WithInitialRetryInterval` to the `restate.Run` calls when an external API should stop retrying.
- **Keep more evidence.** Extend `Observation` with extracted links or screenshot URLs, then persist them in `ResearchState`.
- **Split tools out.** Move Steel scraping into another Restate service if several agents should reuse the same browser primitive.
- **Use session keys intentionally.** `demo`, `customer-123`, and `incident-456` each get isolated state.

## Related

[restate-agent-ts](../restate-agent-ts), [restate-agent-py](../restate-agent-py), and [restate-agent-rs](../restate-agent-rs) implement the same durable agent loop. For the Restate APIs used here, see [Go services](https://docs.restate.dev/develop/go/services), [durable steps](https://docs.restate.dev/develop/go/durable-steps), and [state](https://docs.restate.dev/develop/go/state).
