// A rig agent that drives a Steel cloud browser through custom Tool impls.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/rig-rs

use chromiumoxide::Browser;
use futures::StreamExt;
use rig_core::client::CompletionClient;
use rig_core::completion::{Prompt, ToolDefinition};
use rig_core::providers::anthropic;
use rig_core::tool::Tool;
use serde::{Deserialize, Serialize};
use serde_json::json;
use steel::Steel;

const TASK: &str = "Go to https://news.ycombinator.com and report the titles, \
points, and links of the top 3 stories. Navigate first, then extract the page \
text, then answer. Do not invent data.";

#[derive(Debug, thiserror::Error)]
#[error("{0}")]
struct ToolError(String);

#[derive(Deserialize)]
struct NavigateArgs {
    url: String,
}

#[derive(Serialize)]
struct NavigateOutput {
    url: String,
    title: String,
}

struct Navigate {
    page: chromiumoxide::Page,
}

impl Tool for Navigate {
    const NAME: &'static str = "navigate";
    type Error = ToolError;
    type Args = NavigateArgs;
    type Output = NavigateOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        ToolDefinition {
            name: Self::NAME.to_string(),
            description: "Point the browser at a URL and wait for it to load. \
                Call this before reading a page."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "url": { "type": "string", "description": "Absolute URL to open" }
                },
                "required": ["url"]
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        self.page
            .goto(args.url)
            .await
            .map_err(|e| ToolError(e.to_string()))?;
        self.page
            .wait_for_navigation()
            .await
            .map_err(|e| ToolError(e.to_string()))?;
        let url = self
            .page
            .url()
            .await
            .map_err(|e| ToolError(e.to_string()))?
            .unwrap_or_default();
        let title = self
            .page
            .get_title()
            .await
            .map_err(|e| ToolError(e.to_string()))?
            .unwrap_or_default();
        Ok(NavigateOutput { url, title })
    }
}

#[derive(Deserialize)]
struct ExtractArgs {
    #[serde(default = "default_max_chars")]
    max_chars: usize,
}

fn default_max_chars() -> usize {
    6000
}

#[derive(Serialize, Deserialize)]
struct Link {
    text: String,
    href: String,
}

#[derive(Serialize)]
struct ExtractOutput {
    text: String,
    links: Vec<Link>,
}

struct ExtractText {
    page: chromiumoxide::Page,
}

impl Tool for ExtractText {
    const NAME: &'static str = "extract_text";
    type Error = ToolError;
    type Args = ExtractArgs;
    type Output = ExtractOutput;

    async fn definition(&self, _prompt: String) -> ToolDefinition {
        ToolDefinition {
            name: Self::NAME.to_string(),
            description: "Read the current page: visible text (capped) plus a list \
                of links. Call this after navigate so you never guess selectors."
                .to_string(),
            parameters: json!({
                "type": "object",
                "properties": {
                    "max_chars": {
                        "type": "integer",
                        "description": "Maximum characters of body text to return (default 6000)"
                    }
                }
            }),
        }
    }

    async fn call(&self, args: Self::Args) -> Result<Self::Output, Self::Error> {
        let text: String = self
            .page
            .evaluate("document.body.innerText")
            .await
            .map_err(|e| ToolError(e.to_string()))?
            .into_value()
            .map_err(|e| ToolError(e.to_string()))?;
        let text = text.chars().take(args.max_chars).collect();

        let links: Vec<Link> = self
            .page
            .evaluate(
                "Array.from(document.querySelectorAll('a[href]')).slice(0, 50).map(a => \
                 ({ text: (a.innerText || '').trim().slice(0, 120), href: a.href }))\
                 .filter(l => l.text && l.href)",
            )
            .await
            .map_err(|e| ToolError(e.to_string()))?
            .into_value()
            .map_err(|e| ToolError(e.to_string()))?;

        Ok(ExtractOutput { text, links })
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();

    let steel_api_key = std::env::var("STEEL_API_KEY")
        .map_err(|_| "set STEEL_API_KEY (https://app.steel.dev/settings/api-keys)")?;
    let anthropic_api_key = std::env::var("ANTHROPIC_API_KEY")
        .map_err(|_| "set ANTHROPIC_API_KEY (https://console.anthropic.com/)")?;

    let steel = Steel::new(steel_api_key.clone());
    let session = steel.sessions().create(steel::SessionCreateParams::default()).await?;
    println!("Session: {}", session.session_viewer_url);

    let cdp_url = format!("{}&apiKey={}", session.websocket_url, steel_api_key);
    let (mut browser, mut handler) = Browser::connect(cdp_url).await?;
    let handler_task = tokio::spawn(async move { while handler.next().await.is_some() {} });

    let result = run(&browser, &anthropic_api_key).await;

    println!("\nReleasing Steel session...");
    if let Err(e) = steel.sessions().release(&session.id, Default::default()).await {
        eprintln!("Error releasing session: {e}");
    }
    let _ = browser.close().await;
    handler_task.abort();

    let answer = result?;
    println!("\n{answer}");
    Ok(())
}

async fn run(browser: &Browser, anthropic_api_key: &str) -> Result<String, Box<dyn std::error::Error>> {
    let page = browser.new_page("about:blank").await?;

    let agent = anthropic::Client::new(anthropic_api_key)?
        .agent("claude-sonnet-4-6")
        .preamble(
            "You operate a Steel cloud browser through tools. Workflow: call navigate \
             to open the target URL, then extract_text to read the page, then answer \
             from what you read. Prefer the links list over guessing selectors. Do not \
             invent data.",
        )
        .max_tokens(2048)
        .tool(Navigate { page: page.clone() })
        .tool(ExtractText { page })
        .build();

    let answer = agent.prompt(TASK).max_turns(8).await?;
    Ok(answer)
}
