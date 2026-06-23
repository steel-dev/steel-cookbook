// Upload a Chrome extension to Steel and confirm it rewrites the DOM in a CDP session.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/extensions-rs

use std::error::Error;
use std::time::Duration;

use chromiumoxide::Browser;
use futures::StreamExt;
use steel::types::*;
use steel::Steel;

const EXTENSION_NAME: &str = "Github_Isometric_Contribu";
const EXTENSION_URL: &str = "https://chromewebstore.google.com/detail/github-isometric-contribu/mjoedlfflcchnleknnceiplgaeoegien";
const PROFILE_URL: &str = "https://github.com/junhsss";
const INJECTED_SELECTOR: &str = "div.ic-contributions-wrapper";

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    dotenvy::dotenv().ok();

    let api_key = std::env::var("STEEL_API_KEY")
        .map_err(|_| "set STEEL_API_KEY (get one at https://app.steel.dev/settings/api-keys)")?;

    let client = Steel::new(api_key.clone());

    let extension_id = resolve_extension(&client).await?;
    println!("Using extension {extension_id}");

    println!("Creating Steel session...");
    let session = client
        .sessions()
        .create(SessionCreateParams {
            extension_ids: Some(vec![extension_id]),
            ..Default::default()
        })
        .await?;

    println!("Session live at {}", session.session_viewer_url);

    let result = run(&session.websocket_url, &api_key).await;

    println!("Releasing session...");
    client
        .sessions()
        .release(&session.id, SessionReleaseParams::new())
        .await?;
    println!("Session released");

    result
}

async fn resolve_extension(client: &Steel) -> Result<String, Box<dyn Error>> {
    println!("Checking for extension {EXTENSION_NAME}...");
    let existing = client
        .extensions()
        .list()
        .await?
        .extensions
        .into_iter()
        .find(|ext| ext.name == EXTENSION_NAME);

    if let Some(ext) = existing {
        println!("Reusing uploaded extension");
        return Ok(ext.id);
    }

    println!("Not found, uploading from the Chrome Web Store...");
    let uploaded = client
        .extensions()
        .upload(ExtensionUploadParams {
            url: Some(EXTENSION_URL.to_string()),
            ..Default::default()
        })
        .await?;
    println!("Uploaded {} ({})", uploaded.name, uploaded.id);
    Ok(uploaded.id)
}

async fn run(websocket_url: &str, api_key: &str) -> Result<(), Box<dyn Error>> {
    let raw = format!("{websocket_url}&apiKey={api_key}");
    let cdp_url = match (raw.find("://"), raw.find('?')) {
        (Some(s), Some(q)) if !raw[s + 3..q].contains('/') => {
            format!("{}/{}", &raw[..q], &raw[q..])
        }
        _ => raw,
    };

    let (browser, mut handler) = Browser::connect(cdp_url).await?;
    let handle = tokio::spawn(async move { while let Some(_) = handler.next().await {} });

    println!("Connected over CDP, opening {PROFILE_URL}...");
    let page = browser.new_page(PROFILE_URL).await?;
    page.wait_for_navigation().await?;

    let injected = wait_for_selector(&page, INJECTED_SELECTOR, 15).await?;
    if injected {
        println!("Extension injected {INJECTED_SELECTOR}; the contribution grid was rewritten.");
    } else {
        println!("Selector {INJECTED_SELECTOR} never appeared; the extension did not inject its UI.");
    }

    handle.abort();
    Ok(())
}

async fn wait_for_selector(
    page: &chromiumoxide::Page,
    selector: &str,
    attempts: u32,
) -> Result<bool, Box<dyn Error>> {
    let expr = format!("!!document.querySelector('{selector}')");
    for _ in 0..attempts {
        let found: bool = page.evaluate(expr.clone()).await?.into_value()?;
        if found {
            return Ok(true);
        }
        tokio::time::sleep(Duration::from_secs(1)).await;
    }
    Ok(false)
}
