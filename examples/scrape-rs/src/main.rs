// Turn a URL into clean markdown, a screenshot, and a PDF with Steel's direct API (Rust).
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/scrape-rs

use std::error::Error;

use steel::{ClientPdfParams, ClientScrapeParams, ClientScreenshotParams, ScrapeRequestFormatItem, Steel};

const TARGET_URL: &str = "https://news.ycombinator.com";

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let api_key = std::env::var("STEEL_API_KEY")
        .map_err(|_| "set STEEL_API_KEY (get one at https://app.steel.dev/settings/api-keys)")?;
    let client = Steel::new(api_key);

    println!("Scraping {TARGET_URL} ...");
    let scraped = client
        .scrape(ClientScrapeParams {
            url: TARGET_URL.to_string(),
            format: Some(vec![ScrapeRequestFormatItem::Markdown]),
            delay: None,
            pdf: None,
            project_id: None,
            region: None,
            screenshot: None,
            use_proxy: None,
        })
        .await?;

    let meta = &scraped.metadata;
    println!("  status     {}", meta.status_code);
    println!("  title      {}", meta.title.as_deref().unwrap_or("(none)"));
    println!("  language   {}", meta.language.as_deref().unwrap_or("(none)"));
    println!("  links      {}", scraped.links.len());

    let markdown = scraped
        .content
        .markdown
        .as_deref()
        .ok_or("scrape returned no markdown content")?;
    println!("  markdown   {} chars", markdown.len());
    tokio::fs::write("page.md", markdown).await?;
    println!("  wrote      page.md");

    println!("Capturing screenshot ...");
    let shot = client
        .screenshot(ClientScreenshotParams {
            url: TARGET_URL.to_string(),
            full_page: Some(true),
            delay: None,
            project_id: None,
            region: None,
            use_proxy: None,
        })
        .await?;
    download(&shot.url, "screenshot.png").await?;
    println!("  wrote      screenshot.png");

    println!("Rendering PDF ...");
    let pdf = client
        .pdf(ClientPdfParams {
            url: TARGET_URL.to_string(),
            delay: None,
            project_id: None,
            region: None,
            use_proxy: None,
        })
        .await?;
    download(&pdf.url, "page.pdf").await?;
    println!("  wrote      page.pdf");

    println!("Done.");
    Ok(())
}

async fn download(url: &str, path: &str) -> Result<(), Box<dyn Error>> {
    let bytes = reqwest::get(url).await?.error_for_status()?.bytes().await?;
    tokio::fs::write(path, &bytes).await?;
    Ok(())
}
