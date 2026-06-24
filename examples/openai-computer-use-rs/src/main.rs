// OpenAI computer-use agent driving a Steel browser via the Responses API and Input API.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/openai-computer-use-rs

use std::error::Error;

use chrono::Local;
use serde::Deserialize;
use serde_json::{json, Value};
use steel::types::*;
use steel::Steel;

const OPENAI_URL: &str = "https://api.openai.com/v1/responses";
const MODEL: &str = "computer-use-preview";

const VIEWPORT_WIDTH: i64 = 1440;
const VIEWPORT_HEIGHT: i64 = 900;
const MAX_ITERATIONS: usize = 50;

#[derive(Debug, Deserialize)]
struct ResponsesResponse {
    id: String,
    #[serde(default)]
    output: Vec<OutputItem>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum OutputItem {
    Message {
        #[serde(default)]
        content: Vec<MessageContent>,
    },
    Reasoning {
        #[serde(default)]
        summary: Vec<SummaryPart>,
    },
    ComputerCall {
        call_id: String,
        action: Value,
        #[serde(default)]
        pending_safety_checks: Vec<SafetyCheck>,
    },
    #[serde(other)]
    Other,
}

#[derive(Debug, Deserialize)]
struct MessageContent {
    #[serde(default)]
    text: String,
}

#[derive(Debug, Deserialize)]
struct SummaryPart {
    #[serde(default)]
    text: String,
}

#[derive(Debug, Deserialize)]
struct SafetyCheck {
    id: String,
    #[serde(default)]
    code: String,
    #[serde(default)]
    message: String,
}

#[derive(Debug, Deserialize)]
struct OpenAiError {
    error: OpenAiErrorBody,
}

#[derive(Debug, Deserialize)]
struct OpenAiErrorBody {
    message: String,
}

fn format_today() -> String {
    Local::now().format("%A, %B %d, %Y").to_string()
}

fn browser_system_prompt() -> String {
    format!(
        r#"<BROWSER_ENV>
- You control a headful Chromium browser running in a VM with internet access.
- Interact only through the computer tool (mouse, keyboard, scroll, screenshots). Do not call navigation functions.
- Today's date is {today}.
</BROWSER_ENV>

<BROWSER_CONTROL>
- Before acting, take a screenshot to observe state.
- When typing into any input: clear with Ctrl+A then Delete. After submitting (Enter or clicking a button), wait 1 to 2s once, take a single screenshot, and move the mouse aside.
- Do not press Enter repeatedly. If the page does not change after submit, wait, and screenshot, change strategy (focus the address bar with Ctrl+L, type the full URL, press Enter once).
- Computer calls are slow; batch related actions together.
- Zoom out or scroll so all relevant content is visible before reading.
- If the first screenshot is black, click near center and screenshot again.
</BROWSER_CONTROL>

<TASK_EXECUTION>
- You receive exactly one natural-language task and no further user feedback.
- Do not ask clarifying questions; make reasonable assumptions and proceed.
- Prefer minimal, high-signal actions that move directly toward the goal.
- Every assistant turn must include at least one computer action; avoid text-only turns.
- Avoid repetition: never repeat the same action sequence in consecutive turns. If an action has no visible effect, pivot to a different approach.
- Keep the final response concise and focused on fulfilling the task.
</TASK_EXECUTION>"#,
        today = format_today()
    )
}

fn normalize_key(key: &str) -> String {
    let k = key.trim();
    let upper = k.to_uppercase();
    let mapped = match upper.as_str() {
        "ENTER" | "RETURN" => "Enter",
        "ESC" | "ESCAPE" => "Escape",
        "TAB" => "Tab",
        "BACKSPACE" | "BKSP" => "Backspace",
        "DELETE" | "DEL" => "Delete",
        "SPACE" => "Space",
        "CTRL" | "CONTROL" => "Control",
        "ALT" => "Alt",
        "SHIFT" => "Shift",
        "META" | "SUPER" | "CMD" | "COMMAND" => "Meta",
        "UP" | "ARROWUP" => "ArrowUp",
        "DOWN" | "ARROWDOWN" => "ArrowDown",
        "LEFT" | "ARROWLEFT" => "ArrowLeft",
        "RIGHT" | "ARROWRIGHT" => "ArrowRight",
        "HOME" => "Home",
        "END" => "End",
        "PAGEUP" => "PageUp",
        "PAGEDOWN" => "PageDown",
        "INSERT" => "Insert",
        _ => "",
    };
    if !mapped.is_empty() {
        return mapped.to_string();
    }
    if upper.starts_with('F') && upper.len() > 1 && upper[1..].chars().all(|c| c.is_ascii_digit()) {
        return upper;
    }
    if k.chars().count() == 1 {
        return k.to_lowercase();
    }
    k.to_string()
}

fn keys_from(action: &Value) -> Vec<String> {
    action
        .get("keys")
        .and_then(|v| v.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|k| k.as_str())
                .map(normalize_key)
                .filter(|k| !k.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

fn map_button(btn: &str) -> ComputerActionRequestClickMouseButton {
    match btn.to_lowercase().as_str() {
        "right" => ComputerActionRequestClickMouseButton::Right,
        "middle" | "wheel" => ComputerActionRequestClickMouseButton::Middle,
        "back" => ComputerActionRequestClickMouseButton::Back,
        "forward" => ComputerActionRequestClickMouseButton::Forward,
        _ => ComputerActionRequestClickMouseButton::Left,
    }
}

fn parse_path(action: &Value) -> Option<Vec<Vec<f64>>> {
    let arr = action.get("path")?.as_array()?;
    let path: Vec<Vec<f64>> = arr
        .iter()
        .filter_map(|p| Some(vec![p.get("x")?.as_f64()?, p.get("y")?.as_f64()?]))
        .collect();
    if path.len() >= 2 {
        Some(path)
    } else {
        None
    }
}

struct Agent {
    http: reqwest::Client,
    openai_key: String,
    steel: Steel,
    session_id: Option<String>,
    session_viewer_url: Option<String>,
}

impl Agent {
    fn new(openai_key: String, steel_key: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            openai_key,
            steel: Steel::new(steel_key),
            session_id: None,
            session_viewer_url: None,
        }
    }

    fn center() -> (f64, f64) {
        ((VIEWPORT_WIDTH / 2) as f64, (VIEWPORT_HEIGHT / 2) as f64)
    }

    async fn initialize(&mut self) -> Result<(), Box<dyn Error>> {
        let session = self
            .steel
            .sessions()
            .create(SessionCreateParams {
                dimensions: Some(Box::new(SessionCreateParamsDimensions {
                    width: VIEWPORT_WIDTH,
                    height: VIEWPORT_HEIGHT,
                })),
                block_ads: Some(true),
                timeout: Some(900_000),
                ..Default::default()
            })
            .await?;
        println!("Steel session created successfully!");
        println!("View live session at: {}", session.session_viewer_url);
        self.session_id = Some(session.id);
        self.session_viewer_url = Some(session.session_viewer_url);
        Ok(())
    }

    async fn cleanup(&self) {
        if let Some(id) = &self.session_id {
            println!("Releasing Steel session...");
            match self.steel.sessions().release(id, std::collections::HashMap::new()).await {
                Ok(_) => {
                    if let Some(url) = &self.session_viewer_url {
                        println!("Session completed. View replay at {}", url);
                    }
                }
                Err(e) => println!("Error releasing session: {}", e),
            }
        }
    }

    async fn run_action(&self, params: SessionComputerParams) -> Result<String, Box<dyn Error>> {
        let id = self.session_id.as_ref().ok_or("Session not initialized")?;
        let resp: SessionComputerResponse = self.steel.sessions().computer(id, params).await?;
        if let Some(img) = resp.base64_image {
            return Ok(img);
        }
        self.take_screenshot().await
    }

    async fn take_screenshot(&self) -> Result<String, Box<dyn Error>> {
        let id = self.session_id.as_ref().ok_or("Session not initialized")?;
        let resp: SessionComputerResponse = self
            .steel
            .sessions()
            .computer(
                id,
                SessionComputerParams::TakeScreenshot(ComputerActionRequestTakeScreenshot {
                }),
            )
            .await?;
        resp.base64_image
            .ok_or_else(|| "No screenshot returned from Input API".into())
    }

    async fn execute_action(&self, action: &Value) -> Result<String, Box<dyn Error>> {
        let typ = action.get("type").and_then(|v| v.as_str()).unwrap_or("");
        let (cx, cy) = Self::center();
        let x = action.get("x").and_then(|v| v.as_f64()).unwrap_or(cx);
        let y = action.get("y").and_then(|v| v.as_f64()).unwrap_or(cy);
        let coords = vec![x, y];

        let params = match typ {
            "click" => SessionComputerParams::ClickMouse(ComputerActionRequestClickMouse {
                button: Some(map_button(
                    action.get("button").and_then(|v| v.as_str()).unwrap_or("left"),
                )),
                click_type: None,
                coordinates: Some(coords),
                hold_keys: None,
                num_clicks: None,
                screenshot: Some(true),
            }),

            "double_click" => SessionComputerParams::ClickMouse(ComputerActionRequestClickMouse {
                button: Some(ComputerActionRequestClickMouseButton::Left),
                click_type: None,
                coordinates: Some(coords),
                hold_keys: None,
                num_clicks: Some(2.0),
                screenshot: Some(true),
            }),

            "move" => SessionComputerParams::MoveMouse(ComputerActionRequestMoveMouse {
                coordinates: coords,
                hold_keys: None,
                screenshot: Some(true),
            }),

            "drag" => SessionComputerParams::DragMouse(ComputerActionRequestDragMouse {
                hold_keys: None,
                path: parse_path(action).unwrap_or_else(|| vec![vec![cx, cy], vec![x, y]]),
                screenshot: Some(true),
            }),

            "scroll" => SessionComputerParams::Scroll(ComputerActionRequestScroll {
                coordinates: Some(coords),
                delta_x: Some(action.get("scroll_x").and_then(|v| v.as_f64()).unwrap_or(0.0)),
                delta_y: Some(action.get("scroll_y").and_then(|v| v.as_f64()).unwrap_or(0.0)),
                hold_keys: None,
                screenshot: Some(true),
            }),

            "keypress" => SessionComputerParams::PressKey(ComputerActionRequestPressKey {
                duration: None,
                keys: keys_from(action),
                screenshot: Some(true),
            }),

            "type" => SessionComputerParams::TypeText(ComputerActionRequestTypeText {
                hold_keys: None,
                screenshot: Some(true),
                text: action.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string(),
            }),

            "wait" => SessionComputerParams::Wait(ComputerActionRequestWait {
                duration: 1.0,
                screenshot: Some(true),
            }),

            "screenshot" => return self.take_screenshot().await,

            _ => return self.take_screenshot().await,
        };

        self.run_action(params).await
    }

    async fn call_openai(
        &self,
        input: &Value,
        previous_response_id: &Option<String>,
    ) -> Result<ResponsesResponse, Box<dyn Error>> {
        let mut body = json!({
            "model": MODEL,
            "instructions": browser_system_prompt(),
            "input": input,
            "tools": [{
                "type": "computer_use_preview",
                "display_width": VIEWPORT_WIDTH,
                "display_height": VIEWPORT_HEIGHT,
                "environment": "browser",
            }],
            "reasoning": { "effort": "medium" },
            "truncation": "auto",
        });
        if let Some(id) = previous_response_id {
            body["previous_response_id"] = json!(id);
        }

        let resp = self
            .http
            .post(OPENAI_URL)
            .bearer_auth(&self.openai_key)
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        let raw = resp.text().await?;
        if !status.is_success() {
            let detail = serde_json::from_str::<OpenAiError>(&raw)
                .map(|e| e.error.message)
                .unwrap_or(raw);
            return Err(format!("OpenAI API error ({}): {}", status, detail).into());
        }

        Ok(serde_json::from_str(&raw)?)
    }

    async fn execute_task(&mut self, task: &str) -> Result<String, Box<dyn Error>> {
        let mut input: Value = json!([{ "role": "user", "content": task }]);
        let mut previous_response_id: Option<String> = None;
        let mut final_message = String::new();

        println!("Executing task: {}", task);
        println!("{}", "=".repeat(60));

        for _ in 0..MAX_ITERATIONS {
            let response = self.call_openai(&input, &previous_response_id).await?;
            previous_response_id = Some(response.id);

            let mut next_input: Vec<Value> = Vec::new();

            for item in &response.output {
                match item {
                    OutputItem::Message { content } => {
                        for c in content {
                            if !c.text.is_empty() {
                                println!("{}", c.text);
                                final_message = c.text.clone();
                            }
                        }
                    }
                    OutputItem::Reasoning { summary } => {
                        let parts: Vec<&str> = summary
                            .iter()
                            .map(|s| s.text.as_str())
                            .filter(|t| !t.is_empty())
                            .collect();
                        if !parts.is_empty() {
                            println!("{}", parts.join(" "));
                        }
                    }
                    OutputItem::ComputerCall {
                        call_id,
                        action,
                        pending_safety_checks,
                    } => {
                        let typ = action.get("type").and_then(|v| v.as_str()).unwrap_or("");
                        println!("{}({})", typ, action);
                        if let Err(e) = self.execute_action(action).await {
                            println!("Error executing {}: {}", typ, e);
                        }
                        for check in pending_safety_checks {
                            println!("Auto-acknowledging safety check: {}", check.message);
                        }

                        let shot = self.take_screenshot().await?;
                        let mut output = json!({
                            "type": "computer_call_output",
                            "call_id": call_id,
                            "output": {
                                "type": "computer_screenshot",
                                "image_url": format!("data:image/png;base64,{}", shot),
                            },
                        });
                        if !pending_safety_checks.is_empty() {
                            output["acknowledged_safety_checks"] = json!(pending_safety_checks
                                .iter()
                                .map(|c| json!({ "id": c.id, "code": c.code, "message": c.message }))
                                .collect::<Vec<_>>());
                        }
                        next_input.push(output);
                    }
                    OutputItem::Other => {}
                }
            }

            if next_input.is_empty() {
                println!("Task complete - no further actions requested");
                break;
            }
            input = Value::Array(next_input);
        }

        if final_message.is_empty() {
            Ok("Task execution completed (no final message)".to_string())
        } else {
            Ok(final_message)
        }
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let _ = dotenvy::dotenv();

    println!("Steel + OpenAI Computer Use Assistant");
    println!("{}", "=".repeat(60));

    let steel_key = std::env::var("STEEL_API_KEY").unwrap_or_default();
    let openai_key = std::env::var("OPENAI_API_KEY").unwrap_or_default();
    let task = std::env::var("TASK")
        .unwrap_or_else(|_| "Go to Steel.dev and find the latest news".to_string());

    if steel_key.is_empty() {
        eprintln!("WARNING: Set STEEL_API_KEY in your environment or .env file");
        eprintln!("   Get your API key at: https://app.steel.dev/settings/api-keys");
        std::process::exit(1);
    }
    if openai_key.is_empty() {
        eprintln!("WARNING: Set OPENAI_API_KEY in your environment or .env file");
        eprintln!("   Get your API key at: https://platform.openai.com/api-keys");
        std::process::exit(1);
    }

    println!("\nStarting Steel session...");
    let mut agent = Agent::new(openai_key, steel_key);

    let result = async {
        agent.initialize().await?;
        println!("Steel session started!");

        let start = std::time::Instant::now();
        let result = agent.execute_task(&task).await?;
        let duration = start.elapsed().as_secs_f64();

        println!("\n{}", "=".repeat(60));
        println!("TASK EXECUTION COMPLETED");
        println!("{}", "=".repeat(60));
        println!("Duration: {:.1} seconds", duration);
        println!("Task: {}", task);
        println!("Result:\n{}", result);
        println!("{}", "=".repeat(60));
        Ok::<(), Box<dyn Error>>(())
    }
    .await;

    agent.cleanup().await;
    result
}
