# extensions-rs

A Steel session boots a clean Chromium with no extensions installed. The Extensions API closes that gap: upload a Chrome extension once with `client.extensions().upload(...)`, get back an `ext_...` id, and attach it to any later session by setting `extension_ids` on `SessionCreateParams`. Steel loads the content scripts and background workers before the first navigation, so by the time chromiumoxide opens the page the extension has already run.

This recipe uploads [GitHub Isometric Contributions](https://chromewebstore.google.com/detail/github-isometric-contribu/mjoedlfflcchnleknnceiplgaeoegien), which replaces GitHub's flat contribution grid with a 3D isometric one wrapped in `div.ic-contributions-wrapper`. That wrapper is the proof: it does not exist on a stock GitHub profile, so finding it on the page means the session attached and ran the extension.

## Upload once, reuse forever

Uploads persist on your account, so re-running should not re-upload. `resolve_extension` lists what is already there and matches on the name Steel hands back, which is truncated and underscored (`Github_Isometric_Contribu`, not the full store title). A hit reuses the id; a miss uploads from the store URL and uses the fresh id. Either path produces one id, and that single value is all `SessionCreateParams` needs:

```rust
let session = client
    .sessions()
    .create(SessionCreateParams {
        extension_ids: Some(vec![extension_id]),
        ..Default::default()
    })
    .await?;
```

## Confirming the injection

chromiumoxide has no `wait_for_selector`, so `wait_for_selector` here polls the page itself: it runs `!!document.querySelector('div.ic-contributions-wrapper')` through `page.evaluate(...).into_value()` once a second for up to 15 tries and stops on the first `true`. The program prints whether the wrapper showed up rather than scraping the numbers inside it; the goal is to confirm the DOM was rewritten, not to read it. If the extension never attached, the selector stays absent for all 15 attempts and the run says so.

## Run it

```bash
cd examples/extensions-rs
cp .env.example .env          # set STEEL_API_KEY
cargo run
```

Grab a key at [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys). The first build pulls chromiumoxide and tokio and takes a minute or two. As the program starts it prints a session viewer URL; open it in a second tab to watch the isometric grid render live.

Your output varies. Structure looks like this:

```text
Checking for extension Github_Isometric_Contribu...
Not found, uploading from the Chrome Web Store...
Uploaded Github_Isometric_Contribu (ext_ab12cd34)
Using extension ext_ab12cd34
Creating Steel session...
Session live at https://app.steel.dev/sessions/ab12cd34
Connected over CDP, opening https://github.com/junhsss...
Extension injected div.ic-contributions-wrapper; the contribution grid was rewritten.
Releasing session...
Session released
```

The first run uploads the extension; later runs print `Reusing uploaded extension` and skip straight to the session. `main` captures the run result, releases the session, then returns the error, so a failed check still tears the session down instead of leaving it to idle out.

## Make it yours

- **Upload your own extension.** `upload(...)` takes either a `url` (any Chrome Web Store listing) or a `file` (a `.zip`/`.crx` you supply). Swap `EXTENSION_URL` and update `EXTENSION_NAME` to the truncated, underscored name `extensions().list()` reports back.
- **Target a specific profile.** `PROFILE_URL` is just a constant; point it at any public GitHub profile.
- **Stack extensions.** `extension_ids` is a `Vec`. Upload several (an ad blocker, a consent killer, a helper content script) and pass all their ids together.
- **Assert instead of print.** Turn the `wait_for_selector` boolean into a hard failure if you want the run to exit non-zero when the extension does not load.

## Related

- [extensions-ts](../extensions-ts) is the original this ports, driving Playwright and scraping the injected stats into a table.
- [extensions-py](../extensions-py) and [extensions-go](../extensions-go) are the same upload-and-attach flow in Python and Go.
- [profiles-rs](../profiles-rs) persists a full browser profile across sessions, the heavier sibling to attaching extensions per run.
- [chromiumoxide docs](https://docs.rs/chromiumoxide) cover `Page`, `evaluate`, and `find_element` in full.
