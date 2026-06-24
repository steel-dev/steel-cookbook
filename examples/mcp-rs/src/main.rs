// An MCP server that exposes a Steel cloud browser as explicit session-handle tools.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/mcp-rs

use std::collections::HashMap;
use std::sync::Arc;

use base64::Engine as _;
use chromiumoxide::page::ScreenshotParams;
use chromiumoxide::Browser;
use futures::StreamExt;
use rmcp::handler::server::wrapper::Parameters;
use rmcp::model::{CallToolResult, Content, Implementation, ServerCapabilities, ServerInfo};
use rmcp::transport::stdio;
use rmcp::{
    schemars, tool, tool_handler, tool_router, ErrorData as McpError, ServerHandler, ServiceExt,
};
use serde::Deserialize;
use serde_json::json;
use steel::Steel;
use tokio::sync::Mutex;

// A live Steel browser behind one chromiumoxide page. The handler task pumps the
// CDP websocket; without it every goto and evaluate would hang. Page and the Arcs
// are cheap to clone, so get() hands a whole entry out and drops the map lock.
#[derive(Clone)]
struct SessionEntry {
    page: chromiumoxide::Page,
    _browser: Arc<Browser>,
    handler: Arc<tokio::task::JoinHandle<()>>,
    steel_id: String,
}

#[derive(Clone)]
struct SteelMcp {
    steel: Arc<Steel>,
    steel_key: String,
    sessions: Arc<Mutex<HashMap<String, SessionEntry>>>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct NavigateArgs {
    #[schemars(description = "Handle returned by create_session.")]
    session_id: String,
    #[schemars(description = "Absolute URL to open, e.g. https://news.ycombinator.com.")]
    url: String,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct ExtractArgs {
    #[schemars(description = "Handle returned by create_session.")]
    session_id: String,
    #[serde(default)]
    #[schemars(description = "CSS selector to read. Omit to read the whole page body.")]
    selector: Option<String>,
    #[serde(default)]
    #[schemars(description = "Cap on characters returned. Defaults to 8000.")]
    max_chars: Option<usize>,
}

#[derive(Debug, Deserialize, schemars::JsonSchema)]
struct SessionArg {
    #[schemars(description = "Handle returned by create_session.")]
    session_id: String,
}

#[tool_router]
impl SteelMcp {
    fn new(steel_key: String) -> Self {
        Self {
            steel: Arc::new(Steel::new(steel_key.clone())),
            steel_key,
            sessions: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    async fn get(&self, id: &str) -> Result<SessionEntry, McpError> {
        self.sessions.lock().await.get(id).cloned().ok_or_else(|| {
            McpError::invalid_params(
                format!("unknown session_id {id:?}; call create_session first"),
                None,
            )
        })
    }

    #[tool(
        description = "Start a Steel cloud browser and return a session_id handle plus a live-view URL. Pass the handle to every other tool."
    )]
    async fn create_session(&self) -> Result<CallToolResult, McpError> {
        let session = self
            .steel
            .sessions()
            .create(steel::SessionCreateParams::default())
            .await
            .map_err(internal)?;

        // Steel returns a CDP websocket URL with no path before the query string.
        // chromiumoxide needs a "/" there, so splice one in before "?apiKey=...".
        let raw = format!("{}&apiKey={}", session.websocket_url, self.steel_key);
        let cdp_url = match (raw.find("://"), raw.find('?')) {
            (Some(s), Some(q)) if !raw[s + 3..q].contains('/') => {
                format!("{}/{}", &raw[..q], &raw[q..])
            }
            _ => raw,
        };

        let (browser, mut handler) = Browser::connect(cdp_url).await.map_err(internal)?;
        let handler_task = tokio::spawn(async move { while handler.next().await.is_some() {} });
        let page = browser.new_page("about:blank").await.map_err(internal)?;

        let entry = SessionEntry {
            page,
            _browser: Arc::new(browser),
            handler: Arc::new(handler_task),
            steel_id: session.id.clone(),
        };
        self.sessions.lock().await.insert(session.id.clone(), entry);

        Ok(CallToolResult::success(vec![Content::text(
            json!({ "session_id": session.id, "live_view_url": session.session_viewer_url })
                .to_string(),
        )]))
    }

    #[tool(
        description = "Open a URL in the session's browser tab and wait for it to load. Returns the resolved title and URL."
    )]
    async fn navigate(
        &self,
        Parameters(NavigateArgs { session_id, url }): Parameters<NavigateArgs>,
    ) -> Result<CallToolResult, McpError> {
        let entry = self.get(&session_id).await?;
        entry.page.goto(&url).await.map_err(internal)?;
        entry.page.wait_for_navigation().await.map_err(internal)?;
        let resolved = entry
            .page
            .url()
            .await
            .map_err(internal)?
            .unwrap_or_default();
        let title = entry
            .page
            .get_title()
            .await
            .map_err(internal)?
            .unwrap_or_default();
        Ok(CallToolResult::success(vec![Content::text(
            json!({ "url": resolved, "title": title }).to_string(),
        )]))
    }

    #[tool(
        description = "Read text from the current page. Give a CSS selector to target part of it, or omit it to read the whole body."
    )]
    async fn extract(
        &self,
        Parameters(ExtractArgs {
            session_id,
            selector,
            max_chars,
        }): Parameters<ExtractArgs>,
    ) -> Result<CallToolResult, McpError> {
        let entry = self.get(&session_id).await?;
        let selector = selector.unwrap_or_else(|| "body".to_string());
        let max_chars = max_chars.unwrap_or(8000);
        let sel = serde_json::to_string(&selector).map_err(internal)?;
        let js = format!(
            "(() => {{ const els = Array.from(document.querySelectorAll({sel})); \
             const t = els.map((e) => e.innerText || e.textContent || '').join('\\n\\n').trim(); \
             return t.slice(0, {max_chars}); }})()"
        );
        let text: String = entry
            .page
            .evaluate(js)
            .await
            .map_err(internal)?
            .into_value()
            .map_err(internal)?;
        Ok(CallToolResult::success(vec![Content::text(text)]))
    }

    #[tool(description = "Capture a PNG screenshot of the current page in the session.")]
    async fn screenshot(
        &self,
        Parameters(SessionArg { session_id }): Parameters<SessionArg>,
    ) -> Result<CallToolResult, McpError> {
        let entry = self.get(&session_id).await?;
        let bytes = entry
            .page
            .screenshot(ScreenshotParams::builder().build())
            .await
            .map_err(internal)?;
        let data = base64::engine::general_purpose::STANDARD.encode(&bytes);
        Ok(CallToolResult::success(vec![Content::image(
            data,
            "image/png".to_string(),
        )]))
    }

    #[tool(
        description = "Close the browser and release the Steel session. Call this when the task is done so the session stops billing."
    )]
    async fn release_session(
        &self,
        Parameters(SessionArg { session_id }): Parameters<SessionArg>,
    ) -> Result<CallToolResult, McpError> {
        let Some(entry) = self.sessions.lock().await.remove(&session_id) else {
            return Err(McpError::invalid_params(
                format!("unknown session_id {session_id:?}"),
                None,
            ));
        };
        entry.handler.abort();
        let _ = self
            .steel
            .sessions()
            .release(&entry.steel_id, Default::default())
            .await;
        Ok(CallToolResult::success(vec![Content::text(
            json!({ "released": session_id }).to_string(),
        )]))
    }
}

#[tool_handler]
impl ServerHandler for SteelMcp {
    fn get_info(&self) -> ServerInfo {
        let mut info = ServerInfo::default();
        let mut server_info = Implementation::default();
        server_info.name = "steel".to_string();
        server_info.version = "0.1.0".to_string();
        info.server_info = server_info;
        info.capabilities = ServerCapabilities::builder().enable_tools().build();
        info.instructions = Some(
            "Drive a Steel cloud browser. Call create_session to get a session_id handle, pass \
             it to navigate, extract, and screenshot, then release_session when the task is done."
                .to_string(),
        );
        info
    }
}

fn internal<E: std::fmt::Display>(e: E) -> McpError {
    McpError::internal_error(e.to_string(), None)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    let steel_key = std::env::var("STEEL_API_KEY").map_err(|_| {
        anyhow::anyhow!("set STEEL_API_KEY (https://app.steel.dev/settings/api-keys)")
    })?;

    // Stdio carries the JSON-RPC stream on stdout, so anything you print for humans
    // has to go to stderr. serve() owns stdout from here on.
    let service = SteelMcp::new(steel_key).serve(stdio()).await?;
    service.waiting().await?;
    Ok(())
}
