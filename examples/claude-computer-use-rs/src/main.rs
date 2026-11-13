// Claude computer-use agent driving a Steel browser via the server-side Input API.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/claude-computer-use-rs

use std::error::Error;

use chrono::Local;
use serde::Deserialize;
use serde_json::{json, Value};
use steel_rs::{
    Client, SessionComputerParams, SessionComputerParamsClickMouse,
    SessionComputerParamsClickMouseButton, SessionComputerParamsDragMouse,
    SessionComputerParamsGetCursorPosition, SessionComputerParamsMoveMouse,
    SessionComputerParamsPressKey, SessionComputerParamsScroll,
    SessionComputerParamsTakeScreenshot, SessionComputerParamsTypeText, SessionComputerParamsWait,
    SessionComputerResponse, SessionCreateParams, SessionCreateParamsDimensions,
};

const ANTHROPIC_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";
const MODEL: &str = "claude-opus-5-5";
const NOT_EXECUTED: &str = "Not executed: an earlier computer action in this turn failed.";

const VIEWPORT_WIDTH: i64 = 1280;
const VIEWPORT_HEIGHT: i64 = 768;
const MAX_ITERATIONS: usize = 50;

#[derive(Debug, Deserialize)]
struct MessagesResponse {
    #[serde(default)]
    content: Vec<Value>,
    #[serde(default)]
    stop_reason: Option<String>,
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
        #[serde(default)]
        toolset_name: Option<String>,
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
  - Chromium is already open; interact only through the computer tools (mouse, keyboard, scroll, screenshots).
  - Today's date is {today}.
  </BROWSER_ENV>

  <BROWSER_CONTROL>
  - When viewing pages, zoom out or scroll so all relevant content is visible.
  - When typing into any input:
    * Clear it first with Ctrl+A, then Delete.
    * After submitting (pressing Enter or clicking a button), take an extra screenshot to confirm the result and move the mouse away.
  - Each turn is slow; send related actions together in one turn whenever possible.
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
    steel: Client,
    messages: Vec<Value>,
    session_id: Option<String>,
    session_viewer_url: Option<String>,
    cursor: (f64, f64),
}

impl Agent {
    fn new(anthropic_key: String, steel_key: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            anthropic_key,
            steel: Client::builder().api_key(steel_key).build(),
            messages: Vec::new(),
            session_id: None,
            session_viewer_url: None,
            cursor: ((VIEWPORT_WIDTH / 2) as f64, (VIEWPORT_HEIGHT / 2) as f64),
        }
    }

    fn tools() -> Value {
        json!([{
            "type": "computer_toolset_20260801",
            "configs": {
                "zoom": { "enabled": false },
                "triple_click": { "enabled": false },
                "left_mouse_down": { "enabled": false },
                "left_mouse_up": { "enabled": false },
                "hold_key": { "enabled": false },
            },
        }])
    }

    async fn initialize(&mut self) -> Result<(), Box<dyn Error>> {
        let session = self
            .steel
            .sessions()
            .create(SessionCreateParams {
                dimensions: Some(SessionCreateParamsDimensions {
                    width: VIEWPORT_WIDTH,
                    height: VIEWPORT_HEIGHT,
                }),
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
            match self.steel.sessions().release(id).await {
                Ok(_) => {
                    if let Some(url) = &self.session_viewer_url {
                        println!("Session completed. View replay at {}", url);
                    }
                }
                Err(e) => println!("Error releasing session: {}", e),
            }
        }
    }

    async fn act(
        &self,
        params: SessionComputerParams,
    ) -> Result<SessionComputerResponse, Box<dyn Error>> {
        let id = self.session_id.as_ref().ok_or("Session not initialized")?;
        let resp: SessionComputerResponse = self.steel.sessions().computer(id, params).await?;
        if let Some(error) = &resp.error {
            return Err(error.clone().into());
        }
        Ok(resp)
    }

    async fn screenshot(&self) -> Result<Value, Box<dyn Error>> {
        let resp = self
            .act(SessionComputerParams::TakeScreenshot(
                SessionComputerParamsTakeScreenshot {},
            ))
            .await?;
        let data = resp
            .base64_image
            .ok_or("No screenshot returned from Input API")?;
        Ok(json!({
            "type": "image",
            "source": {
                "type": "base64",
                "media_type": "image/png",
                "data": data,
            }
        }))
    }

    fn point(&mut self, coordinate: Option<&Value>) -> Vec<f64> {
        if let Some(c) = coordinate_of(coordinate) {
            self.cursor = (c[0], c[1]);
        }
        vec![self.cursor.0, self.cursor.1]
    }

    async fn run_member(&mut self, name: &str, input: &Value) -> Result<String, Box<dyn Error>> {
        let text = input.get("text").and_then(|v| v.as_str());
        let has_modifiers = text.is_some_and(|t| !t.is_empty());
        let mut times = 1;

        let params = match name {
            "mouse_move" => SessionComputerParams::MoveMouse(SessionComputerParamsMoveMouse {
                coordinates: self.point(input.get("coordinate")),
                hold_keys: None,
                screenshot: None,
            }),

            "left_click" | "right_click" | "middle_click" | "double_click" => {
                if has_modifiers {
                    return Err("Holding modifier keys during a click is not supported".into());
                }
                let button = match name {
                    "right_click" => SessionComputerParamsClickMouseButton::Right,
                    "middle_click" => SessionComputerParamsClickMouseButton::Middle,
                    _ => SessionComputerParamsClickMouseButton::Left,
                };
                SessionComputerParams::ClickMouse(SessionComputerParamsClickMouse {
                    button: Some(button),
                    click_type: None,
                    coordinates: Some(self.point(input.get("coordinate"))),
                    hold_keys: None,
                    num_clicks: if name == "double_click" {
                        Some(2.0)
                    } else {
                        None
                    },
                    screenshot: None,
                })
            }

            "left_click_drag" => {
                let (Some(start), Some(end)) = (
                    coordinate_of(input.get("start_coordinate")),
                    coordinate_of(input.get("coordinate")),
                ) else {
                    return Err("left_click_drag needs start_coordinate and coordinate".into());
                };
                self.cursor = (end[0], end[1]);
                SessionComputerParams::DragMouse(SessionComputerParamsDragMouse {
                    hold_keys: None,
                    path: vec![start, end],
                    screenshot: None,
                })
            }

            "scroll" => {
                if has_modifiers {
                    return Err("Holding modifier keys during a scroll is not supported".into());
                }
                let (dx, dy) = match input.get("scroll_direction").and_then(|v| v.as_str()) {
                    Some("up") => (0.0, -100.0),
                    Some("left") => (-100.0, 0.0),
                    Some("right") => (100.0, 0.0),
                    _ => (0.0, 100.0),
                };
                times = input
                    .get("scroll_amount")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(1)
                    .max(1);
                SessionComputerParams::Scroll(SessionComputerParamsScroll {
                    coordinates: Some(self.point(input.get("coordinate"))),
                    delta_x: Some(dx),
                    delta_y: Some(dy),
                    hold_keys: None,
                    screenshot: None,
                })
            }

            "type" => SessionComputerParams::TypeText(SessionComputerParamsTypeText {
                hold_keys: None,
                screenshot: None,
                text: text.unwrap_or("").to_string(),
            }),

            "key" => {
                times = input
                    .get("repeat")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(1)
                    .max(1);
                SessionComputerParams::PressKey(SessionComputerParamsPressKey {
                    duration: None,
                    keys: normalize_keys(split_keys(text)),
                    screenshot: None,
                })
            }

            "wait" => SessionComputerParams::Wait(SessionComputerParamsWait {
                duration: input
                    .get("duration")
                    .and_then(|v| v.as_f64())
                    .unwrap_or(1.0),
                screenshot: None,
            }),

            "cursor_position" => {
                let resp = self
                    .act(SessionComputerParams::GetCursorPosition(
                        SessionComputerParamsGetCursorPosition {},
                    ))
                    .await?;
                return Ok(resp
                    .output
                    .unwrap_or_else(|| format!("{}, {}", self.cursor.0, self.cursor.1)));
            }

            other => return Err(format!("Unsupported action: {}", other).into()),
        };

        for _ in 0..times {
            self.act(params.clone()).await?;
        }
        Ok("OK".to_string())
    }

    async fn process_response(
        &mut self,
        message: MessagesResponse,
    ) -> Result<(String, bool), Box<dyn Error>> {
        let mut response_text = String::new();
        let mut calls: Vec<(String, String, Value)> = Vec::new();

        for raw in &message.content {
            match serde_json::from_value::<ContentBlock>(raw.clone())? {
                ContentBlock::Text { text } => {
                    response_text.push_str(&text);
                    println!("{}", text);
                }
                ContentBlock::ToolUse {
                    id,
                    name,
                    input,
                    toolset_name,
                } => {
                    if toolset_name.as_deref() == Some("computer") {
                        calls.push((id, name, input));
                    }
                }
                ContentBlock::Other => {}
            }
        }

        self.messages
            .push(json!({ "role": "assistant", "content": message.content }));

        if calls.is_empty() {
            return Ok((response_text, false));
        }

        let mut results: Vec<Value> = Vec::new();
        let mut failed = false;
        for (id, name, input) in &calls {
            println!("{}({})", name, input);
            let mut result = json!({
                "type": "tool_result",
                "tool_use_id": id,
                "toolset_name": "computer",
            });
            if failed {
                result["content"] = json!(NOT_EXECUTED);
                result["is_error"] = json!(true);
            } else {
                let outcome = if name == "screenshot" {
                    self.screenshot().await
                } else {
                    self.run_member(name, input)
                        .await
                        .map(|text| json!({ "type": "text", "text": text }))
                };
                match outcome {
                    Ok(block) => result["content"] = json!([block]),
                    Err(e) => {
                        println!("Error executing {}: {}", name, e);
                        result["content"] = json!(format!("Error: {}", e));
                        result["is_error"] = json!(true);
                        failed = true;
                    }
                }
            }
            results.push(result);
        }

        let ends_with_screenshot = calls
            .last()
            .is_some_and(|(_, name, _)| name == "screenshot");
        if !failed && !ends_with_screenshot {
            let shot = self.screenshot().await?;
            if let Some(content) = results.last_mut().and_then(|r| r["content"].as_array_mut()) {
                content.push(shot);
            }
        }

        self.messages
            .push(json!({ "role": "user", "content": results }));

        Ok((response_text, true))
    }

    async fn call_anthropic(&self) -> Result<MessagesResponse, Box<dyn Error>> {
        let body = json!({
            "model": MODEL,
            "max_tokens": 16000,
            "system": browser_system_prompt(),
            "messages": self.messages,
            "tools": Self::tools(),
        });

        let resp = self
            .http
            .post(ANTHROPIC_URL)
            .header("x-api-key", &self.anthropic_key)
            .header("anthropic-version", ANTHROPIC_VERSION)
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
        self.messages = vec![json!({ "role": "user", "content": task })];

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
            if response.stop_reason.as_deref() == Some("refusal") {
                println!("Claude declined to continue this task");
                final_text = "Claude declined to continue this task".to_string();
                break;
            }
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

fn coordinate_of(value: Option<&Value>) -> Option<Vec<f64>> {
    let arr = value?.as_array()?;
    if arr.len() != 2 {
        return None;
    }
    Some(vec![arr[0].as_f64()?, arr[1].as_f64()?])
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
    let words1: Vec<String> = new_message
        .to_lowercase()
        .split_whitespace()
        .map(String::from)
        .collect();
    history.iter().any(|prev| {
        let words2: Vec<String> = prev
            .to_lowercase()
            .split_whitespace()
            .map(String::from)
            .collect();
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
    let task = std::env::var("TASK")
        .unwrap_or_else(|_| "Go to Steel.dev and find the latest news".to_string());

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
