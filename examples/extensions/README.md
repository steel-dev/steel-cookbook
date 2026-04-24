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
cd examples/extensions
cp .env.example .env          # set STEEL_API_KEY
npm install
npm start
```

Get a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The script prints a session viewer URL as it starts. Open it in another tab to watch the extension render on a live GitHub profile.

Your output varies. Structure looks like this:

```text
Steel + Extensions API Starter
============================================================

Checking extension...
Extension exists: undefined

Uploading extension...
Extension uploaded: { id: 'ext_...', name: 'Github_Isometric_Contribu', ... }

Creating Steel session...
Steel Session created!
View session at https://app.steel.dev/sessions/ab12cd34...

Connected to browser via Playwright
Navigating to junhsss's GitHub Profile

GitHub Stats for junhsss

 Stat             Value   Range / Date
 Contributions    1,284   in the last year
 This Week        37      this week
 Best Day         28      on Apr 3
 ...

Releasing session...
Session released
Done!
```

A run takes ~20 seconds and costs a few cents of session time. First run uploads the extension, later runs reuse the ID.

## How scrapeStats proves the extension loaded

`scrapeStats` in `stats.ts` targets markup the extension injects, not GitHub's stock profile. It waits on `div.ic-contributions-wrapper` (the `ic-` prefix is the extension's namespace), then walks nested `div.p-2` blocks to pull `span.f2` values for contributions, this-week totals, best-day counts, and streak ranges. If the extension never loads, none of those selectors resolve and the scrape hangs. That fragility is the demo: it fails loudly when the extension is missing, which is exactly how you confirm the session attached it.

`randomContributor` in `index.ts` fetches the [steel-browser](https://github.com/steel-dev/steel-browser) contributor list from the GitHub API and picks one. The main loop retries three times across different usernames if a profile fails to render, mostly as a hedge against transient rate limits on avatars.

## Make it yours

- **Upload your own extension.** `client.extensions.upload({ url })` accepts any Chrome Web Store listing URL. Swap the URL, and change the name that `extensions.list()` checks for (remember the truncated, underscored form).
- **Target a specific username.** Replace the `randomContributor` call in `index.ts` with a hardcoded string. The scraper works against any public profile.
- **Stack extensions.** `extensionIds` is an array. Upload multiple (ad blocker, cookie consent killer, a helper content script) and attach them together.
- **Combine with stealth.** Uncomment `useProxy` or `solveCaptcha` in the `sessions.create()` call if the sites your extension targets fight bots.

## Related

[Credentials](../credentials) for persisting cookies across runs, [auth-context](../auth-context) for seeding logged-in state, [profiles](../profiles) for reusing a full browser profile. [Playwright docs](https://playwright.dev).
