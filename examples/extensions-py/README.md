# Extensions (Python)

A fresh Steel session boots a clean Chrome with no extensions installed. The Extensions API closes that gap: you upload a Chrome extension once, Steel stores it under your account and hands back an ID, and you pass that ID to `sessions.create(extension_ids=[...])`. Content scripts run before your first `page.goto`, so by the time Playwright attaches the extension has already mutated the DOM.

This port keeps the recipe to its core primitive. It uploads (or reuses) the extension, attaches it, opens a GitHub profile, and waits for the one DOM node the extension injects. It does not scrape and pretty-print the rendered stats. The presence of that node is the whole proof.

```python
existing = next(
    (ext for ext in client.extensions.list().extensions if ext.name == "Github_Isometric_Contribu"),
    None,
)
extension = existing or client.extensions.upload(url=EXTENSION_URL)

session = client.sessions.create(extension_ids=[extension.id])
```

Uploads persist, so `extensions.list()` is the lookup that lets a second run skip the re-upload. Names come back normalized (truncated and underscored), which is why the match is against `Github_Isometric_Contribu` and not the full store title.

## What "confirmed" means here

The demo loads [GitHub Isometric Contributions](https://chromewebstore.google.com/detail/github-isometric-contribu/mjoedlfflcchnleknnceiplgaeoegien), an extension that rebuilds GitHub's flat contribution grid as a 3D isometric chart inside a `div.ic-contributions-wrapper` (the `ic-` prefix is the extension's own namespace). Stock GitHub never renders that node. So the test is simple: navigate to a profile and `page.wait_for_selector("div.ic-contributions-wrapper")`. If the selector resolves, the session attached the extension and it ran. If it times out, the script says so and moves on to release. No scraping, no table, just a yes or no on whether the injected UI showed up.

## Run it

```bash
cd examples/extensions-py
cp .env.example .env          # set STEEL_API_KEY
uv run main.py
```

Grab a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). `uv sync` runs automatically on first `uv run`, so there is no separate install step. The script prints a session viewer URL as it starts. Open it in another tab to watch the extension render on a live GitHub profile.

Your output varies. A run that reused the uploaded extension printed:

```text
Steel + Extensions (Python)
============================================================

Checking for an existing extension...
Reusing extension: eldhmbehfcpfaopdmplblfmhcaalhdjc

Creating Steel session...
Steel Session created!
View session at https://app.steel.dev/sessions/14089e5b-1db4-4fa0-ae87-c66daf8a3e1b

Connected to browser via Playwright
Navigating to https://github.com/junhsss ...
Waiting for injected element: div.ic-contributions-wrapper
Injected element appeared: the extension loaded into the page.
Releasing session...
Session released
Done!
```

On the first run, the script prints `Uploading extension...` and `Uploaded extension:` with the new ID instead of the `Reusing extension` line. Later runs reuse that ID. A run takes about 15 seconds.

## Make it yours

- **Upload your own extension.** `client.extensions.upload(url=...)` accepts any Chrome Web Store listing URL. Swap `EXTENSION_URL`, then update `EXTENSION_NAME` to the truncated, underscored form `extensions.list()` returns.
- **Confirm a different node.** Change `INJECTED_SELECTOR` to whatever your extension adds to the page. The wait is the proof, so pick a selector that only exists when the extension ran.
- **Target a specific profile.** Set `PROFILE_URL` to any public GitHub user, such as `https://github.com/steel-dev`.
- **Stack extensions.** `extension_ids` is a list. Upload several (ad blocker, consent killer, a helper content script) and attach them in one session.

## Related

[extensions-ts](../extensions-ts) (same recipe, plus a styled stats table) · [extensions-go](../extensions-go) · [extensions-rs](../extensions-rs) · [Steel extensions docs](https://steel.dev/docs/features/extensions) · [profiles-py](../profiles-py) (reuse a full browser profile) · [Playwright docs](https://playwright.dev/python)
