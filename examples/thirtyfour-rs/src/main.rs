// Drive a Steel cloud browser over WebDriver with thirtyfour.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/thirtyfour-rs

use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderName, HeaderValue};
use steel::{SessionCreateParams, SessionReleaseParams, Steel};
use thirtyfour::extensions::query::ElementQueryable;
use thirtyfour::prelude::*;

const STEEL_WEBDRIVER_URL: &str = "http://connect.steelbrowser.com/selenium";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let api_key = std::env::var("STEEL_API_KEY")
        .unwrap_or_else(|_| "your-steel-api-key-here".to_string());

    println!("Steel + thirtyfour Rust Starter");
    println!("{}", "=".repeat(60));

    if api_key == "your-steel-api-key-here" {
        eprintln!("Set STEEL_API_KEY. Get one at https://app.steel.dev/settings/api-keys");
        std::process::exit(1);
    }

    let client = Steel::new(api_key.clone());

    println!("Creating Steel session...");
    let session = client
        .sessions()
        .create(SessionCreateParams {
            is_selenium: Some(true),
            ..Default::default()
        })
        .await?;

    println!("Session created: {}", session.id);
    println!("View it live at {}", session.session_viewer_url);

    let result = run(&api_key, &session.id).await;

    println!("Releasing session...");
    client
        .sessions()
        .release(&session.id, SessionReleaseParams::new())
        .await?;
    println!("Session released");

    result
}

async fn run(api_key: &str, session_id: &str) -> Result<(), Box<dyn std::error::Error>> {
    let mut headers = HeaderMap::new();
    headers.insert(
        HeaderName::from_static("steel-api-key"),
        HeaderValue::from_str(api_key)?,
    );
    headers.insert(
        HeaderName::from_static("session-id"),
        HeaderValue::from_str(session_id)?,
    );

    let http = reqwest::Client::builder()
        .default_headers(headers)
        .build()?;

    let driver = WebDriver::builder(STEEL_WEBDRIVER_URL, DesiredCapabilities::chrome())
        .client(http)
        .request_timeout(Duration::from_secs(120))
        .connect()
        .await?;

    println!("Connected to browser via thirtyfour");

    let scrape = scrape_top_stories(&driver).await;

    driver.quit().await?;
    scrape
}

async fn scrape_top_stories(driver: &WebDriver) -> Result<(), Box<dyn std::error::Error>> {
    println!("Navigating to Hacker News...");
    driver.goto("https://news.ycombinator.com").await?;

    driver
        .query(By::ClassName("titleline"))
        .wait(Duration::from_secs(10), Duration::from_millis(250))
        .exists()
        .await?;

    let rows = driver.find_all(By::ClassName("athing")).await?;

    println!("\nTop 5 Hacker News Stories:");
    for (i, row) in rows.iter().take(5).enumerate() {
        let link = row.find(By::ClassName("titleline")).await?.find(By::Tag("a")).await?;
        let title = link.text().await?;
        let href = link.attr("href").await?.unwrap_or_default();

        let subtext = row.find(By::XPath("following-sibling::tr[1]")).await?;
        let points = match subtext.find(By::ClassName("score")).await {
            Ok(score) => score
                .text()
                .await?
                .split_whitespace()
                .next()
                .unwrap_or("0")
                .to_string(),
            Err(_) => "0".to_string(),
        };

        println!("\n{}. {}", i + 1, title);
        println!("   Link: {}", href);
        println!("   Points: {}", points);
    }

    Ok(())
}
