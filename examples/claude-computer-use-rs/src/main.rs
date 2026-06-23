// Claude computer-use agent driving a Steel browser via the server-side Input API.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/claude-computer-use-rs

use std::collections::HashMap;
use std::error::Error;

use chrono::Local;
use serde::Deserialize;
use serde_json::{json, Value};
use steel::types::*;
use steel::Steel;

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const COMPUTER_USE_BETA: &str = "computer-use-2025-11-24";
const MODEL: &str = "claude-opus-4-7";

const VIEWPORT_WIDTH: i64 = 1280;
const VIEWPORT_HEIGHT: i64 = 768;
const MAX_ITERATIONS: usize = 50;

#[derive(Debug, Deserialize)]
struct MessagesResponse {
    #[serde(default)]
    content: Vec<ContentBlock>,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
enum ContentBlock {
    Text {
        text: String,
    },
    ToolUse {
        id: String,
        name: String,
        input: Value,
    },
    #[serde(other)]
    Other,
}

#[derive(Debug, Deserialize)]
struct AnthropicError {
    error: AnthropicErrorBody,
}

#[derive(Debug, Deserialize)]
struct AnthropicErrorBody {
    message: String,
}

fn format_today() -> String {
    Local::now().format("%A, %B %d, %Y").to_string()
}

fn browser_system_prompt() -> String {
    format!(
        r#"<BROWSER_ENV>
  - You control a headful Chromium browser running in a VM with internet access.
  - Chromium is already open; interact only through the "computer" tool (mouse, keyboard, scroll, screenshots).
  - Today's date is {today}.
  </BROWSER_ENV>

  <BROWSER_CONTROL>
  - When viewing pages, zoom out or scroll so all relevant content is visible.
  - When typing into any input:
    * Clear it first with Ctrl+A, then Delete.
    * After submitting (pressing Enter or clicking a button), take an extra screenshot to confirm the result and move the mouse away.
  - Computer tool calls are slow; batch related actions into a single call whenever possible.
  - You may act on the user's behalf on sites where they are already authenticated.
  - Assume any required authentication/Auth Contexts are already configured before the task starts.
  - If the first screenshot is black:
    * Click near the center of the screen.
    * Take another screenshot.
  - Never click the browser address bar with the mouse. To navigate to a URL:
    * Press Ctrl+L to focus and select the address bar.
    * Type the full URL, then press Enter.
    * If you see any existing text (e.g., 'about:blank'), press Ctrl+L before typing so you replace it (never append).
  - Prefer typing into inputs on the page (e.g., a site's search box) rather than the browser address bar, unless entering a direct URL.
  </BROWSER_CONTROL>

  <TASK_EXECUTION>
  - You receive exactly one natural-language task and no further user feedback.
  - Do not ask the user clarifying questions; instead, make reasonable assumptions and proceed.
  - For complex tasks, quickly plan a short, ordered sequence of steps before acting.
  - Prefer minimal, high-signal actions that move directly toward the goal.
  - Keep your final response concise and focused on fulfilling the task (e.g., a brief summary of findings or results).
  </TASK_EXECUTION>"#,
        today = format_today()
    )
}

fn split_keys(s: Option<&str>) -> Vec<String> {
    match s {
        Some(k) => k.split('+').map(|p| p.trim().to_string()).collect(),
        None => Vec::new(),
    }
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
    if upper.starts_with('F') && upper[1..].chars().all(|c| c.is_ascii_digit()) && upper.len() > 1 {
        return format!("F{}", &upper[1..]);
    }
    k.to_string()
}

fn normalize_keys(keys: Vec<String>) -> Vec<String> {
    keys.iter().map(|k| normalize_key(k)).collect()
}

struct Agent {
    http: reqwest::Client,
    anthropic_key: String,
    steel: Steel,
    messages: Vec<Value>,
    session_id: Option<String>,
    session_viewer_url: Option<String>,
}

impl Agent {
    fn new(anthropic_key: String, steel_key: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            anthropic_key,
            steel: Steel::new(steel_key),
            messages: Vec::new(),
            session_id: None,
            session_viewer_url: None,
        }
    }

    fn center() -> (f64, f64) {
        ((VIEWPORT_WIDTH / 2) as f64, (VIEWPORT_HEIGHT / 2) as f64)
    }

    fn tools() -> Value {
        json!([{
            "type": "computer_20251124",
            "name": "computer",
            "display_width_px": VIEWPORT_WIDTH,
            "display_height_px": VIEWPORT_HEIGHT,
            "display_number": 1,
        }])
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
        println!("Steel Session created successfully!");
        println!("View live session at: {}", session.session_viewer_url);
        self.session_id = Some(session.id);
        self.session_viewer_url = Some(session.session_viewer_url);
        Ok(())
    }

    async fn cleanup(&self) {
        if let Some(id) = &self.session_id {
            println!("Releasing Steel session...");
            match self.steel.sessions().release(id, HashMap::new()).await {
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
        let id = self
            .session_id
            .as_ref()
            .ok_or("Session not initialized")?;
        let resp: SessionComputerResponse =
            self.steel.sessions().computer(id, params).await?;
        if let Some(img) = resp.base64_image {
            return Ok(img);
        }
        self.take_screenshot().await
    }

    async fn take_screenshot(&self) -> Result<String, Box<dyn Error>> {
        let id = self
            .session_id
            .as_ref()
            .ok_or("Session not initialized")?;
        let resp: SessionComputerResponse = self
            .steel
            .sessions()
            .computer(
                id,
                SessionComputerParams::TakeScreenshot(ComputerActionRequestTakeScreenshot {
                    action: ComputerActionRequestVariant7Action::TakeScreenshot,
                }),
            )
            .await?;
        resp.base64_image
            .ok_or_else(|| "No screenshot returned from Input API".into())
    }

    async fn execute_computer_action(
        &self,
        action: &str,
        input: &Value,
    ) -> Result<String, Box<dyn Error>> {
        let text = input.get("text").and_then(|v| v.as_str());
        let key = input.get("key").and_then(|v| v.as_str());
        let coords = match input.get("coordinate").and_then(|v| v.as_array()) {
            Some(arr) if arr.len() == 2 => (
                arr[0].as_f64().unwrap_or(0.0),
                arr[1].as_f64().unwrap_or(0.0),
            ),
            _ => Self::center(),
        };

        let params = match action {
            "mouse_move" => SessionComputerParams::MoveMouse(ComputerActionRequestMoveMouse {
                action: ComputerActionRequestVariant0Action::MoveMouse,
                coordinates: vec![coords.0, coords.1],
                hold_keys: opt_keys(split_keys(key)),
                screenshot: Some(true),
            }),

            "left_mouse_down" | "left_mouse_up" => {
                SessionComputerParams::ClickMouse(ComputerActionRequestClickMouse {
                    action: ComputerActionRequestVariant1Action::ClickMouse,
                    button: Some(ComputerActionRequestVariant1Button::Left),
                    click_type: Some(if action == "left_mouse_down" {
                        ComputerActionRequestVariant1ClickType::Down
                    } else {
                        ComputerActionRequestVariant1ClickType::Up
                    }),
                    coordinates: Some(vec![coords.0, coords.1]),
                    hold_keys: opt_keys(split_keys(key)),
                    num_clicks: None,
                    screenshot: Some(true),
                })
            }

            "left_click" | "right_click" | "middle_click" | "double_click" | "triple_click" => {
                let button = match action {
                    "right_click" => ComputerActionRequestVariant1Button::Right,
                    "middle_click" => ComputerActionRequestVariant1Button::Middle,
                    _ => ComputerActionRequestVariant1Button::Left,
                };
                let num_clicks = match action {
                    "double_click" => Some(2.0),
                    "triple_click" => Some(3.0),
                    _ => None,
                };
                SessionComputerParams::ClickMouse(ComputerActionRequestClickMouse {
                    action: ComputerActionRequestVariant1Action::ClickMouse,
                    button: Some(button),
                    click_type: None,
                    coordinates: Some(vec![coords.0, coords.1]),
                    hold_keys: opt_keys(split_keys(key)),
                    num_clicks,
                    screenshot: Some(true),
                })
            }

            "left_click_drag" => {
                let (start_x, start_y) = Self::center();
                SessionComputerParams::DragMouse(ComputerActionRequestDragMouse {
                    action: ComputerActionRequestVariant2Action::DragMouse,
                    hold_keys: opt_keys(split_keys(key)),
                    path: vec![vec![start_x, start_y], vec![coords.0, coords.1]],
                    screenshot: Some(true),
                })
            }

            "scroll" => {
                let step = 100.0;
                let amount = input
                    .get("scroll_amount")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(0.0);
                let direction = input
                    .get("scroll_direction")
                    .and_then(|v| v.as_str())
                    .unwrap_or("down");
                let (dx, dy) = match direction {
                    "up" => (0.0, -step * amount),
                    "right" => (step * amount, 0.0),
                    "left" => (-(step * amount), 0.0),
                    _ => (0.0, step * amount),
                };
                SessionComputerParams::Scroll(ComputerActionRequestScroll {
                    action: ComputerActionRequestVariant3Action::Scroll,
                    coordinates: Some(vec![coords.0, coords.1]),
                    delta_x: Some(dx),
                    delta_y: Some(dy),
                    hold_keys: opt_keys(split_keys(text)),
                    screenshot: Some(true),
                })
            }

            "key" | "hold_key" => {
                let duration = if action == "hold_key" {
                    input.get("duration").and_then(|v| v.as_f64())
                } else {
                    None
                };
                SessionComputerParams::PressKey(ComputerActionRequestPressKey {
                    action: ComputerActionRequestVariant4Action::PressKey,
                    duration,
                    keys: normalize_keys(split_keys(text)),
                    screenshot: Some(true),
                })
            }

            "type" => SessionComputerParams::TypeText(ComputerActionRequestTypeText {
                action: ComputerActionRequestVariant5Action::TypeText,
                hold_keys: opt_keys(split_keys(key)),
                screenshot: Some(true),
                text: text.unwrap_or("").to_string(),
            }),

            "wait" => SessionComputerParams::Wait(ComputerActionRequestWait {
                action: ComputerActionRequestVariant6Action::Wait,
                duration: input.get("duration").and_then(|v| v.as_f64()).unwrap_or(1.0),
                screenshot: Some(true),
            }),

            "screenshot" => return self.take_screenshot().await,

            "cursor_position" => {
                let id = self.session_id.as_ref().ok_or("Session not initialized")?;
                self.steel
                    .sessions()
                    .computer(
                        id,
                        SessionComputerParams::GetCursorPosition(
                            ComputerActionRequestGetCursorPosition {
                                action: ComputerActionRequestVariant8Action::GetCursorPosition,
                            },
                        ),
                    )
                    .await?;
                return self.take_screenshot().await;
            }

            other => return Err(format!("Invalid action: {}", other).into()),
        };

        self.run_action(params).await
    }

    async fn process_response(&mut self, message: MessagesResponse) -> Result<(String, bool), Box<dyn Error>> {
        let mut response_text = String::new();
        let mut has_actions = false;
        let mut assistant_content: Vec<Value> = Vec::new();
        let mut tool_results: Vec<Value> = Vec::new();

        for block in &message.content {
            match block {
                ContentBlock::Text { text } => {
                    response_text.push_str(text);
                    println!("{}", text);
                    assistant_content.push(json!({ "type": "text", "text": text }));
                }
                ContentBlock::ToolUse { id, name, input } => {
                    has_actions = true;
                    assistant_content.push(json!({
                        "type": "tool_use",
                        "id": id,
                        "name": name,
                        "input": input,
                    }));
                    println!("{}({})", name, input);
                    if name == "computer" {
                        let action = input.get("action").and_then(|v| v.as_str()).unwrap_or("");
                        match self.execute_computer_action(action, input).await {
                            Ok(screenshot_base64) => {
                                tool_results.push(json!({
                                    "type": "tool_result",
                                    "tool_use_id": id,
                                    "content": [{
                                        "type": "image",
                                        "source": {
                                            "type": "base64",
                                            "media_type": "image/png",
                                            "data": screenshot_base64,
                                        }
                                    }]
                                }));
                            }
                            Err(e) => {
                                println!("Error executing {}: {}", action, e);
                                tool_results.push(json!({
                                    "type": "tool_result",
                                    "tool_use_id": id,
                                    "content": format!("Error executing {}: {}", action, e),
                                    "is_error": true,
                                }));
                            }
                        }
                    }
                }
                ContentBlock::Other => {}
            }
        }

        self.messages
            .push(json!({ "role": "assistant", "content": assistant_content }));
        if !tool_results.is_empty() {
            self.messages
                .push(json!({ "role": "user", "content": tool_results }));
        }

        Ok((response_text, has_actions))
    }

    async fn call_anthropic(&self) -> Result<MessagesResponse, Box<dyn Error>> {
        let body = json!({
            "model": MODEL,
            "max_tokens": 4096,
            "messages": self.messages,
            "tools": Self::tools(),
        });

        let resp = self
            .http
            .post(ANTHROPIC_URL)
            .header("x-api-key", &self.anthropic_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
            .header("anthropic-beta", COMPUTER_USE_BETA)
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        let raw = resp.text().await?;
        if !status.is_success() {
            let detail = serde_json::from_str::<AnthropicError>(&raw)
                .map(|e| e.error.message)
                .unwrap_or(raw);
            return Err(format!("Anthropic API error ({}): {}", status, detail).into());
        }

        Ok(serde_json::from_str(&raw)?)
    }

    async fn execute_task(&mut self, task: &str) -> Result<String, Box<dyn Error>> {
        self.messages = vec![
            json!({ "role": "user", "content": browser_system_prompt() }),
            json!({ "role": "user", "content": task }),
        ];

        println!("Executing task: {}", task);
        println!("{}", "=".repeat(60));

        let mut iterations = 0;
        let mut last_assistant_messages: Vec<String> = Vec::new();
        let mut final_text = String::new();

        while iterations < MAX_ITERATIONS {
            iterations += 1;

            if let Some(last) = self.messages.last() {
                if last.get("role").and_then(|v| v.as_str()) == Some("assistant") {
                    let content = extract_text(last.get("content"));
                    if !content.is_empty() {
                        if detect_repetition(&content, &last_assistant_messages) {
                            println!("Repetition detected - stopping execution");
                            final_text = content;
                            break;
                        }
                        last_assistant_messages.push(content);
                        if last_assistant_messages.len() > 3 {
                            last_assistant_messages.remove(0);
                        }
                    }
                }
            }

            let response = self.call_anthropic().await?;
            let (text, has_actions) = self.process_response(response).await?;

            if !has_actions {
                println!("Task complete - no further actions requested");
                final_text = text;
                break;
            }
        }

        if iterations >= MAX_ITERATIONS {
            println!("Task execution stopped after {} iterations", MAX_ITERATIONS);
        }

        if final_text.is_empty() {
            Ok("Task execution completed (no final message)".to_string())
        } else {
            Ok(final_text)
        }
    }
}

fn opt_keys(keys: Vec<String>) -> Option<Vec<String>> {
    if keys.is_empty() {
        None
    } else {
        Some(keys)
    }
}

fn extract_text(content: Option<&Value>) -> String {
    match content {
        Some(Value::String(s)) => s.clone(),
        Some(Value::Array(blocks)) => blocks
            .iter()
            .filter(|b| b.get("type").and_then(|v| v.as_str()) == Some("text"))
            .filter_map(|b| b.get("text").and_then(|v| v.as_str()))
            .collect::<Vec<_>>()
            .join(""),
        _ => String::new(),
    }
}

fn detect_repetition(new_message: &str, history: &[String]) -> bool {
    if history.len() < 2 {
        return false;
    }
    let words1: Vec<String> = new_message.to_lowercase().split_whitespace().map(String::from).collect();
    history.iter().any(|prev| {
        let words2: Vec<String> = prev.to_lowercase().split_whitespace().map(String::from).collect();
        let overlap = words1.iter().filter(|w| words2.contains(w)).count();
        let denom = words1.len().max(words2.len()).max(1);
        overlap as f64 / denom as f64 > 0.8
    })
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let _ = dotenvy::dotenv();

    println!("Steel + Claude Computer Use Assistant");
    println!("{}", "=".repeat(60));

    let steel_key = std::env::var("STEEL_API_KEY").unwrap_or_default();
    let anthropic_key = std::env::var("ANTHROPIC_API_KEY").unwrap_or_default();
    let task = std::env::var("TASK").unwrap_or_else(|_| "Go to Steel.dev and find the latest news".to_string());

    if steel_key.is_empty() {
        eprintln!("WARNING: Set STEEL_API_KEY in your environment or .env file");
        eprintln!("   Get your API key at: https://app.steel.dev/settings/api-keys");
        std::process::exit(1);
    }
    if anthropic_key.is_empty() {
        eprintln!("WARNING: Set ANTHROPIC_API_KEY in your environment or .env file");
        eprintln!("   Get your API key at: https://console.anthropic.com/");
        std::process::exit(1);
    }

    println!("\nStarting Steel session...");
    let mut agent = Agent::new(anthropic_key, steel_key);

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
