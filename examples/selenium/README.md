# Selenium Starter (Python)

Selenium speaks the W3C WebDriver protocol over HTTP, not CDP. Every click, navigation, and `find_element` is an HTTP round-trip to a remote endpoint that implements the spec. Steel runs one at `http://connect.steelbrowser.com/selenium`, which is where `webdriver.Remote` points.

The catch: Steel identifies callers with a `steel-api-key` header and routes each command to the right browser with a `session-id` header. `webdriver.Remote` doesn't expose a direct hook for custom headers, so the starter subclasses `RemoteConnection`:

```python
class CustomRemoteConnection(RemoteConnection):
    _session_id = None

    def __init__(self, remote_server_addr: str, session_id: str):
        super().__init__(remote_server_addr)
        self._session_id = session_id

    def get_remote_connection_headers(self, parsed_url, keep_alive=False):
        headers = super().get_remote_connection_headers(parsed_url, keep_alive)
        headers.update({'steel-api-key': os.environ.get("STEEL_API_KEY")})
        headers.update({'session-id': self._session_id})
        return headers
```

`get_remote_connection_headers` runs on every outbound request. Selenium has no persistent connection to keep alive; the two headers ride along with each command. That's the integration. After the driver is wired, the rest is vanilla Selenium 4.

One requirement: create the session with `is_selenium=True`. Steel provisions a WebDriver-compatible node for those sessions; without the flag you get a CDP browser that Selenium cannot drive.

```python
session = client.sessions.create(is_selenium=True)

driver = webdriver.Remote(
    command_executor=CustomRemoteConnection(
        remote_server_addr='http://connect.steelbrowser.com/selenium',
        session_id=session.id,
    ),
    options=webdriver.ChromeOptions(),
)
```

From here, `driver.get(...)`, `WebDriverWait`, `By.CLASS_NAME`, and `find_elements` behave as they would against a local ChromeDriver. The scraping body inside `main()` uses `WebDriverWait` with `expected_conditions.presence_of_element_located` to block until Hacker News renders its story rows, then walks `athing` elements to pull title, link, and points.

## Run it

```bash
cd examples/selenium
cp .env.example .env          # set STEEL_API_KEY
uv run main.py
```

Grab a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The script prints a session viewer URL as it starts. Open it in another tab to watch the browser run live.

Your output varies. Structure looks like this:

```text
Creating Steel session...
Session created successfully with Session ID: ab12cd34...
You can view the session live at https://app.steel.dev/sessions/ab12cd34...

Connected to browser via Selenium
Navigating to Hacker News...

Top 5 Hacker News Stories:

1. Claude 4.7 Opus released today
   Link: https://news.ycombinator.com/item?id=43218921
   Points: 892

2. Show HN: A browser extension for reading on slow connections
   Link: https://github.com/user/project
   Points: 401

...

Releasing session...
Session released
Done!
```

A run costs a few cents of session time. Steel bills per session-minute, so `main()` wraps everything in a `try / finally` and calls `client.sessions.release(session.id)` on exit. Skip it and the browser idles until the default 5-minute timeout elapses.

## Make it yours

- **Swap the target.** The scraping logic sits between the `Your Automations Go Here!` banner comments in `main.py`. Replace `driver.get(...)` and the `story_elements` loop with your own selectors; session setup and teardown stay put.
- **Extend the session.** Pass `session_timeout=1800000` (30 minutes) alongside `is_selenium=True` in `sessions.create()` for longer runs. Keep `is_selenium=True`; it is the switch that provisions a WebDriver node.
- **Wait on DOM state.** Each command is an HTTP round-trip, so blind `time.sleep` calls compound latency. Prefer `WebDriverWait` with `expected_conditions` (as in the example) to block on the specific element or state you need.
- **Reuse the headers pattern.** `CustomRemoteConnection` is how you inject any extra header into every WebDriver request. The same subclass shape works for custom tracing or routing headers you want to attach per call.

## Related

[Selenium Python docs](https://selenium-python.readthedocs.io) · [WebDriver protocol](https://w3c.github.io/webdriver/)
