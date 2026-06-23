// Drive a Steel cloud browser over CDP with chromiumoxide.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/chromiumoxide-rs

use std::error::Error;

use chromiumoxide::cdp::browser_protocol::page::CaptureScreenshotFormat;
use chromiumoxide::page::ScreenshotParams;
use chromiumoxide::Browser;
use futures::StreamExt;
use serde::Deserialize;
use steel::Steel;

#[derive(Debug, Deserialize)]
struct Story {
    rank: u32,
    title: String,
    url: String,
    points: u32,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
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

    let result = run(&session.websocket_url, &api_key).await;

    println!("Releasing session...");
    client
        .sessions()
        .release(&session.id, steel::SessionReleaseParams::new())
        .await?;
    println!("Session released");

    result
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

    println!("Connected over CDP, opening page...");
    let page = browser.new_page("https://news.ycombinator.com").await?;
    page.wait_for_navigation().await?;

    let title = page.get_title().await?.unwrap_or_default();
    let html = page.content().await?;
    println!("Title: {title}");
    println!("HTML length: {} bytes", html.len());

    let stories: Vec<Story> = page
        .evaluate(EXTRACT_STORIES)
        .await?
        .into_value()?;

    println!("\nTop {} Hacker News stories:", stories.len());
    for story in &stories {
        println!("\n{}. {}", story.rank, story.title);
        println!("   {}", story.url);
        println!("   {} points", story.points);
    }

    let png = page
        .screenshot(
            ScreenshotParams::builder()
                .format(CaptureScreenshotFormat::Png)
                .full_page(true)
                .build(),
        )
        .await?;
    std::fs::write("screenshot.png", &png)?;
    println!("\nSaved screenshot.png ({} bytes)", png.len());

    handle.abort();
    Ok(())
}

const EXTRACT_STORIES: &str = r#"
(() => {
  return [...document.querySelectorAll('tr.athing')].slice(0, 5).map((row, i) => {
    const link = row.querySelector('.titleline > a');
    const sub = row.nextElementSibling?.querySelector('.score');
    return {
      rank: i + 1,
      title: link?.textContent ?? '',
      url: link?.href ?? '',
      points: parseInt(sub?.textContent ?? '0', 10) || 0,
    };
  });
})()
"#;
