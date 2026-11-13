# Extensions

Steel sessions launch a clean Chrome with nothing installed. The Extensions API lets you upload a Chrome extension once, get back an ID, and attach it to any future session via `extensionIds` on `sessions.create()`. Content scripts and background workers load before your first `page.goto`, so the extension has already rewritten the DOM by the time Playwright observes it.

```typescript
const extensionExists = (await client.extensions.list()).extensions.find(
  (ext) => ext.name === "Github_Isometric_Contribu",
);

const extension = extensionExists ?? await client.extensions.upload({
  url: "https://chromewebstore.google.com/detail/github-isometric-contribu/mjoedlfflcchnleknnceiplgaeoegien",
});

session = await client.sessions.create({
  extensionIds: extension?.id ? [extension.id] : [],
});
```

Uploads persist on your account, so `extensions.list()` is the lookup that lets repeat runs skip the re-upload. Names come back normalized (truncated, underscored), which is why this one matches `Github_Isometric_Contribu` rather than the full store title.

The demo loads [GitHub Isometric Contributions](https://chromewebstore.google.com/detail/github-isometric-contribu/mjoedlfflcchnleknnceiplgaeoegien), a Chrome extension that replaces GitHub's flat contribution square grid with a 3D isometric version and injects extra panels for streaks, best-day counts, and weekly totals. `scrapeStats` reads those extension-rendered numbers straight off the profile page.

## Run it

```bash
cd examples/extensions-ts
cp .env.example .env          # set STEEL_API_KEY
npm install
npm start
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The script prints a session viewer URL as it starts. Open it in another tab to watch the extension render on a live GitHub profile.

Your output varies. A run that reused the uploaded extension printed the following, minus the avatar that `terminal-image` draws above the table:

```text
Steel + Extensions API Starter
============================================================

Checking extension...
Found existing extension: eldhmbehfcpfaopdmplblfmhcaalhdjc

Creating Steel session...
Steel Session created!
View session at https://app.steel.dev/sessions/89cd629a-68e2-4d88-bd55-11ac871497be
Connected to browser via Playwright
Navigating to danew's GitHub Profile

GitHub Stats for danew

┌────────────────┬───────┬─────────────────┐
│ Stat           │ Value │ Range / Date    │
├────────────────┼───────┼─────────────────┤
│ Contributions  │ 2,472 │ Nov 9 → Nov 12  │
├────────────────┼───────┼─────────────────┤
│ This Week      │ 159   │ Nov 8 → Nov 12  │
├────────────────┼───────┼─────────────────┤
│ Best Day       │ 53    │ Nov 8           │
├────────────────┼───────┼─────────────────┤
│ Average/Day    │ 6.72  │ Nov 9 → Nov 12  │
├────────────────┼───────┼─────────────────┤
│ Streak Longest │ 19    │ Mar 9 → Mar 27  │
├────────────────┼───────┼─────────────────┤
│ Streak Current │ 18    │ Oct 26 → Nov 12 │
└────────────────┴───────┴─────────────────┘
Releasing session...
Session released
Done!
```

On the first run, the script prints `No existing extension found`, uploads the extension, and prints the upload response with the extension's ID. Later runs reuse that ID. A run takes about 20 seconds.

## How scrapeStats proves the extension loaded

`scrapeStats` in `stats.ts` targets markup the extension injects, not GitHub's stock profile. It waits on `div.ic-contributions-wrapper` (the `ic-` prefix is the extension's namespace), then walks nested `div.p-2` blocks to pull `span.f2` values for contributions, this-week totals, best-day counts, and streak ranges. The extension puts its Contributions and Streaks panels in the same wrapper, so the streak cells are read from the child `div` whose `h5` says `Streaks`. If the extension never loads, none of those selectors resolve and the scrape times out. That fragility is the demo: it fails loudly when the extension is missing, which is exactly how you confirm the session attached it.

`randomContributor` in `index.ts` fetches the [steel-browser](https://github.com/steel-dev/steel-browser) contributor list from the GitHub API and picks one. The main loop retries three times across different usernames if a profile fails to render, mostly as a hedge against transient rate limits on avatars.

## Make it yours

- **Upload your own extension.** `client.extensions.upload({ url })` accepts any Chrome Web Store listing URL. Swap the URL, and change the name that `extensions.list()` checks for (remember the truncated, underscored form).
- **Target a specific username.** Replace the `randomContributor` call in `index.ts` with a hardcoded string. The scraper works against any public profile.
- **Stack extensions.** `extensionIds` is an array. Upload multiple (ad blocker, cookie consent killer, a helper content script) and attach them together.
- **Combine with stealth.** Uncomment `useProxy` or `solveCaptcha` in the `sessions.create()` call if the sites your extension targets fight bots.

## Related

[Credentials](../credentials-ts) (store a login that Steel fills) · [auth-context](../auth-context-ts) (seed logged-in state) · [profiles](../profiles-ts) (reuse a full browser profile) · [Steel extensions docs](https://steel.dev/docs/features/extensions) · [Playwright docs](https://playwright.dev)
