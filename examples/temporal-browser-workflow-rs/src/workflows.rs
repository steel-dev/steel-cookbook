// Deterministic workflow and Steel capture activity for Temporal Rust.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/temporal-browser-workflow-rs

use std::{path::PathBuf, time::Duration};

use prost_wkt_types::Duration as ProtoDuration;
use serde::{Deserialize, Serialize};
use steel::{ClientScrapeParams, ClientScreenshotParams, ScrapeRequestFormatItem, Steel};
use temporalio_common::protos::temporal::api::common::v1::RetryPolicy;
use temporalio_macros::{activities, workflow, workflow_methods};
use temporalio_sdk::{
    activities::{ActivityContext, ActivityError},
    ActivityOptions, WorkflowContext, WorkflowContextView, WorkflowResult,
};
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserWorkflowInput {
    #[serde(default)]
    pub urls: Vec<String>,
    #[serde(default)]
    pub link_limit: usize,
    #[serde(default = "default_full_page")]
    pub full_page_screenshot: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CapturePageInput {
    pub url: String,
    pub link_limit: usize,
    pub full_page_screenshot: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageLink {
    pub text: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageCapture {
    pub url: String,
    pub final_url: String,
    pub title: String,
    pub status_code: i64,
    pub markdown_preview: String,
    pub links: Vec<PageLink>,
    pub screenshot_url: String,
    pub screenshot_path: String,
    pub markdown_path: String,
    pub duration_ms: u128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BrowserWorkflowResult {
    pub pages: Vec<PageCapture>,
    pub page_count: usize,
}

#[workflow]
#[derive(Default)]
pub struct BrowserWorkflow {
    input: BrowserWorkflowInput,
}

impl Default for BrowserWorkflowInput {
    fn default() -> Self {
        Self {
            urls: Vec::new(),
            link_limit: 8,
            full_page_screenshot: true,
        }
    }
}

#[workflow_methods]
impl BrowserWorkflow {
    #[init]
    pub fn new(_ctx: &WorkflowContextView, input: BrowserWorkflowInput) -> Self {
        Self { input }
    }

    #[run]
    pub async fn run(ctx: &mut WorkflowContext<Self>) -> WorkflowResult<BrowserWorkflowResult> {
        let input = ctx.state(|state| state.input.clone());
        let urls = workflow_urls(&input);
        let link_limit = clamp_link_limit(input.link_limit);
        let retry_policy = RetryPolicy {
            initial_interval: Some(ProtoDuration {
                seconds: 5,
                nanos: 0,
            }),
            backoff_coefficient: 2.0,
            maximum_interval: Some(ProtoDuration {
                seconds: 30,
                nanos: 0,
            }),
            maximum_attempts: 3,
            ..Default::default()
        };
        let activity_options =
            ActivityOptions::with_start_to_close_timeout(Duration::from_secs(120))
                .retry_policy(retry_policy)
                .build();
        let mut pages = Vec::with_capacity(urls.len());

        for url in urls {
            let page = ctx
                .start_activity(
                    SteelActivities::capture_page,
                    CapturePageInput {
                        url,
                        link_limit,
                        full_page_screenshot: input.full_page_screenshot,
                    },
                    activity_options.clone(),
                )
                .await
                .map_err(|err| anyhow::anyhow!("{err}"))?;
            pages.push(page);
        }

        Ok(BrowserWorkflowResult {
            page_count: pages.len(),
            pages,
        })
    }
}

pub struct SteelActivities;

#[activities]
impl SteelActivities {
    #[activity]
    pub async fn capture_page(
        _ctx: ActivityContext,
        input: CapturePageInput,
    ) -> Result<PageCapture, ActivityError> {
        capture_page_impl(input).await.map_err(ActivityError::from)
    }
}

fn default_full_page() -> bool {
    true
}

fn workflow_urls(input: &BrowserWorkflowInput) -> Vec<String> {
    let urls = if input.urls.is_empty() {
        vec![
            "https://news.ycombinator.com".to_string(),
            "https://example.com".to_string(),
        ]
    } else {
        input.urls.clone()
    };
    urls.into_iter().take(10).collect()
}

fn clamp_link_limit(value: usize) -> usize {
    if value == 0 {
        8
    } else {
        value.min(25)
    }
}

async fn capture_page_impl(input: CapturePageInput) -> anyhow::Result<PageCapture> {
    let started = std::time::Instant::now();
    let api_key = std::env::var("STEEL_API_KEY")
        .map_err(|_| anyhow::anyhow!("set STEEL_API_KEY in .env before running this recipe"))?;
    let requested_url = normalize_url(&input.url)?;
    let artifact_dir = PathBuf::from(env_or("ARTIFACT_DIR", "artifacts"));
    tokio::fs::create_dir_all(&artifact_dir).await?;

    let client = Steel::new(api_key);
    let scraped = client
        .scrape(
            ClientScrapeParams::new(requested_url.clone())
                .format(vec![ScrapeRequestFormatItem::Markdown]),
        )
        .await?;
    let shot = client
        .screenshot(
            ClientScreenshotParams::new(requested_url.clone())
                .full_page(input.full_page_screenshot),
        )
        .await?;

    let markdown = scraped.content.markdown.clone().unwrap_or_default();
    let final_url = first_non_empty([
        scraped.metadata.url_source.as_deref(),
        scraped.metadata.canonical.as_deref(),
        Some(requested_url.as_str()),
    ]);
    let base_name = artifact_base_name(&final_url);
    let screenshot_path = artifact_dir.join(format!("{base_name}.png"));
    let markdown_path = artifact_dir.join(format!("{base_name}.md"));

    let links = scraped
        .links
        .iter()
        .take(input.link_limit)
        .map(|link| PageLink {
            text: first_non_empty([Some(link.text.as_str()), Some(link.url.as_str())]),
            url: link.url.clone(),
        })
        .collect::<Vec<_>>();

    let page = PageCapture {
        url: requested_url,
        final_url,
        title: scraped
            .metadata
            .title
            .clone()
            .unwrap_or_else(|| "(untitled)".to_string()),
        status_code: scraped.metadata.status_code,
        markdown_preview: markdown_preview(&markdown),
        links,
        screenshot_url: shot.url.clone(),
        screenshot_path: screenshot_path.display().to_string(),
        markdown_path: markdown_path.display().to_string(),
        duration_ms: started.elapsed().as_millis(),
    };

    tokio::fs::write(&markdown_path, render_markdown(&page, &markdown)).await?;
    download(&shot.url, &screenshot_path).await?;

    Ok(page)
}

fn normalize_url(raw: &str) -> anyhow::Result<String> {
    let parsed = Url::parse(raw)?;
    if parsed.scheme().is_empty() || parsed.host_str().is_none() {
        anyhow::bail!("url must be absolute: {raw}");
    }
    Ok(parsed.to_string())
}

fn artifact_base_name(raw: &str) -> String {
    let host = Url::parse(raw)
        .ok()
        .and_then(|url| url.host_str().map(ToString::to_string))
        .unwrap_or_else(|| "page".to_string());
    let safe_host = host
        .chars()
        .map(|ch| {
            if ch.is_ascii_alphanumeric() || ch == '-' {
                ch
            } else {
                '-'
            }
        })
        .collect::<String>();
    format!("{}-{}", safe_host, chrono_like_timestamp())
}

fn chrono_like_timestamp() -> String {
    // Keep the activity dependency-light. The exact timestamp format only needs
    // to be sortable and filename-safe.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{now}")
}

fn markdown_preview(markdown: &str) -> String {
    markdown
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(800)
        .collect()
}

fn render_markdown(page: &PageCapture, markdown: &str) -> String {
    let mut out = format!(
        "# {}\n\nRequested URL: {}\nFinal URL: {}\nHTTP status: {}\nScreenshot URL: {}\n\n## Markdown\n\n{}\n\n## Links\n\n",
        page.title,
        page.url,
        page.final_url,
        page.status_code,
        page.screenshot_url,
        if markdown.is_empty() {
            "(no markdown returned)"
        } else {
            markdown
        }
    );

    if page.links.is_empty() {
        out.push_str("(no links found)\n");
    } else {
        for (index, link) in page.links.iter().enumerate() {
            out.push_str(&format!("{}. [{}]({})\n", index + 1, link.text, link.url));
        }
    }

    out
}

async fn download(url: &str, dest: &PathBuf) -> anyhow::Result<()> {
    let bytes = reqwest::get(url).await?.error_for_status()?.bytes().await?;
    tokio::fs::write(dest, &bytes).await?;
    Ok(())
}

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| fallback.to_string())
}

fn first_non_empty<'a>(values: impl IntoIterator<Item = Option<&'a str>>) -> String {
    values
        .into_iter()
        .flatten()
        .find(|value| !value.is_empty())
        .unwrap_or("")
        .to_string()
}
