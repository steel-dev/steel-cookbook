// Drive a Steel cloud browser over CDP with headless_chrome.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/headless-chrome

use std::error::Error;

use headless_chrome::protocol::cdp::Page::CaptureScreenshotFormatOption;
use headless_chrome::Browser;
use steel::Steel;

type BoxError = Box<dyn Error + Send + Sync>;

#[tokio::main]
async fn main() -> Result<(), BoxError> {
    dotenvy::dotenv().ok();

    let api_key = std::env::var("STEEL_API_KEY")
        .map_err(|_| "set STEEL_API_KEY (get one at https://app.steel.dev/settings/api-keys)")?;

    let client = Steel::new(api_key.clone());

    println!("Creating Steel session...");
    let session = client
        .sessions()
        .create(steel::SessionCreateParams::default())
        .await?;
    println!("Session live at {}", session.session_viewer_url);

    let websocket_url = session.websocket_url.clone();
    let key = api_key.clone();
    let result = tokio::task::spawn_blocking(move || scrape(&websocket_url, &key)).await?;

    println!("Releasing session...");
    client
        .sessions()
        .release(&session.id, steel::SessionReleaseParams::new())
        .await?;
    println!("Session released");

    result
}

fn scrape(websocket_url: &str, api_key: &str) -> Result<(), BoxError> {
    let raw = format!("{websocket_url}&apiKey={api_key}");
    let cdp_url = match (raw.find("://"), raw.find('?')) {
        (Some(s), Some(q)) if !raw[s + 3..q].contains('/') => {
            format!("{}/{}", &raw[..q], &raw[q..])
        }
        _ => raw,
    };

    let browser = Browser::connect(cdp_url)?;
    println!("Connected over CDP, opening page...");

    let tab = browser.new_tab()?;
    tab.navigate_to("https://quotes.toscrape.com")?;
    tab.wait_until_navigated()?;

    let quotes = tab.find_elements(".quote")?;
    println!("\nFound {} quotes on the page:\n", quotes.len());

    for (i, quote) in quotes.iter().take(5).enumerate() {
        let text = quote.find_element(".text")?.get_inner_text()?;
        let author = quote.find_element(".author")?.get_inner_text()?;
        let tags: Vec<String> = quote
            .find_elements(".tag")?
            .iter()
            .filter_map(|t| t.get_inner_text().ok())
            .collect();

        let text = text.trim_matches(|c| c == '\u{201c}' || c == '\u{201d}' || c == '"');
        println!("{}. {text}", i + 1);
        println!("   - {author}");
        if !tags.is_empty() {
            println!("   tags: {}", tags.join(", "));
        }
        println!();
    }

    let png = tab.capture_screenshot(CaptureScreenshotFormatOption::Png, None, None, true)?;
    std::fs::write("quotes.png", &png)?;
    println!("Saved screenshot to quotes.png ({} bytes)", png.len());

    Ok(())
}
