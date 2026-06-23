// A Swiftide agent that reads the web through Steel's scrape API, exposed as a tool.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/swiftide

use std::sync::Arc;

use anyhow::Result;
use steel::types::{ClientScrapeParams, ScrapeRequestFormatItem};
use steel::Steel;
use swiftide::agents::Agent;
use swiftide::chat_completion::{errors::ToolError, ToolOutput};
use swiftide::integrations::anthropic::Anthropic;
use swiftide::traits::AgentContext;

const MODEL: &str = "claude-sonnet-4-6";

const SYSTEM_PROMPT: &str = "\
You research the web using the `read_page` tool, which returns a page as clean Markdown \
plus its outbound links. Start from the page the user gives you. If the answer is not on \
that page, follow at most two links to find it. Quote concrete details (names, numbers, \
dates) and cite the URL you took each fact from. When you have the answer, call `stop`.";

const TASK: &str = "\
Read https://news.ycombinator.com and tell me the single highest-scoring story on the \
front page right now: its title, its point count, and who submitted it. Then open that \
story's comments or article and give me a two-sentence summary of what it is about.";

#[derive(Clone, swiftide::Tool)]
#[tool(
    description = "Fetch a web page through a Steel cloud browser and return it as clean \
                   Markdown along with the page's outbound links. Use this to read a URL.",
    param(name = "url", description = "Absolute URL of the page to read, including https://")
)]
struct ReadPage {
    client: Arc<Steel>,
}

impl ReadPage {
    async fn read_page(
        &self,
        _context: &dyn AgentContext,
        url: &str,
    ) -> Result<ToolOutput, ToolError> {
        let response = self
            .client
            .scrape(ClientScrapeParams {
                url: url.to_string(),
                format: Some(vec![ScrapeRequestFormatItem::Markdown]),
                delay: None,
                pdf: None,
                project_id: None,
                region: None,
                screenshot: None,
                use_proxy: None,
            })
            .await
            .map_err(|e| ToolError::Unknown(anyhow::anyhow!(e)))?;

        let markdown = response
            .content
            .markdown
            .unwrap_or_else(|| "(no readable text content)".to_string());

        let links = response
            .links
            .iter()
            .take(40)
            .map(|l| format!("- [{}]({})", l.text.trim(), l.url))
            .collect::<Vec<_>>()
            .join("\n");

        let body = format!("# Page: {url}\n\n{markdown}\n\n## Links\n{links}");
        eprintln!("    read_page: {url} ({} chars)", body.len());
        Ok(ToolOutput::text(body))
    }
}

#[tokio::main]
async fn main() -> Result<()> {
    let steel_api_key = std::env::var("STEEL_API_KEY")
        .map_err(|_| anyhow::anyhow!("set STEEL_API_KEY (see .env.example)"))?;
    std::env::var("ANTHROPIC_API_KEY")
        .map_err(|_| anyhow::anyhow!("set ANTHROPIC_API_KEY (see .env.example)"))?;

    println!("Steel + Swiftide research agent");
    println!("============================================================");

    let client = Arc::new(Steel::new(steel_api_key));

    let anthropic = Anthropic::builder().default_prompt_model(MODEL).build()?;

    let read_page = ReadPage {
        client: Arc::clone(&client),
    };

    let mut agent = Agent::builder()
        .llm(&anthropic)
        .tools(vec![read_page])
        .system_prompt(SYSTEM_PROMPT)
        .on_new_message(move |_context, message| {
            let text = message.to_string();
            Box::pin(async move {
                println!("{text}");
                Ok(())
            })
        })
        .limit(8)
        .build()?;

    agent.query(TASK).await?;

    println!("\nDone. Steel scrape calls bill a little browser time; no session to release.");
    Ok(())
}
