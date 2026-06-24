// Gemini computer-use agent driving a Steel browser via raw reqwest calls to the Gemini REST API.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/gemini-computer-use-rs

use std::error::Error;

use chrono::Local;
use serde::Deserialize;
use serde_json::{json, Value};
use steel::types::*;
use steel::Steel;

const GEMINI_URL: &str =
    "https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent";

const VIEWPORT_WIDTH: i64 = 1440;
const VIEWPORT_HEIGHT: i64 = 900;
const MAX_COORDINATE: f64 = 1000.0;
const MAX_ITERATIONS: usize = 50;

#[derive(Debug, Deserialize)]
struct GenerateContentResponse {
    #[serde(default)]
    candidates: Vec<Candidate>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Candidate {
    #[serde(default)]
    content: Option<Value>,
    #[serde(default)]
    finish_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GeminiError {
    error: GeminiErrorBody,
}

#[derive(Debug, Deserialize)]
struct GeminiErrorBody {
    message: String,
}

fn format_today() -> String {
    Local::now().format("%A, %B %d, %Y").to_string()
}

fn browser_system_prompt() -> String {
    format!(
        r#"<BROWSER_ENV>
  - You control a headful Chromium browser running in a VM with internet access.
  - Chromium is already open; interact only through computer use actions (mouse, keyboard, scroll, screenshots).
  - Today's date is {today}.
  </BROWSER_ENV>

  <BROWSER_CONTROL>
  - When viewing pages, zoom out or scroll so all relevant content is visible.
  - When typing into any input:
    * Clear it first with Ctrl+A, then Delete.
    * After submitting (pressing Enter or clicking a button), wait for the page to load.
  - Computer tool calls are slow; batch related actions into a single call whenever possible.
  - You may act on the user's behalf on sites where they are already authenticated.
  - Assume any required authentication/Auth Contexts are already configured before the task starts.
  - If the first screenshot is black:
    * Click near the center of the screen.
    * Take another screenshot.
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

fn split_keys(s: &str) -> Vec<String> {
    s.split('+')
        .map(|p| p.trim().to_string())
        .filter(|p| !p.is_empty())
        .collect()
}

fn normalize_key(key: &str) -> String {
    let k = key.trim();
    if k.is_empty() {
        return k.to_string();
    }
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
        return format!("F{}", &upper[1..]);
    }
    k.to_string()
}

fn normalize_keys(keys: Vec<String>) -> Vec<String> {
    keys.iter().map(|k| normalize_key(k)).collect()
}

fn arg_f64(args: &Value, key: &str, default: f64) -> f64 {
    args.get(key).and_then(|v| v.as_f64()).unwrap_or(default)
}

fn arg_str<'a>(args: &'a Value, key: &str, default: &'a str) -> &'a str {
    args.get(key).and_then(|v| v.as_str()).unwrap_or(default)
}

fn arg_bool(args: &Value, key: &str, default: bool) -> bool {
    args.get(key).and_then(|v| v.as_bool()).unwrap_or(default)
}

struct Agent {
    http: reqwest::Client,
    gemini_key: String,
    steel: Steel,
    contents: Vec<Value>,
    session_id: Option<String>,
    session_viewer_url: Option<String>,
    current_url: String,
}

impl Agent {
    fn new(gemini_key: String, steel_key: String) -> Self {
        Self {
            http: reqwest::Client::new(),
            gemini_key,
            steel: Steel::new(steel_key),
            contents: Vec::new(),
            session_id: None,
            session_viewer_url: None,
            current_url: "about:blank".to_string(),
        }
    }

    fn denormalize_x(x: f64) -> f64 {
        (x / MAX_COORDINATE * VIEWPORT_WIDTH as f64).floor()
    }

    fn denormalize_y(y: f64) -> f64 {
        (y / MAX_COORDINATE * VIEWPORT_HEIGHT as f64).floor()
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
        println!("Steel Session created successfully!");
        println!("View live session at: {}", session.session_viewer_url);
        self.session_id = Some(session.id);
        self.session_viewer_url = Some(session.session_viewer_url);
        Ok(())
    }

    async fn cleanup(&self) {
        if let Some(id) = &self.session_id {
            println!("Releasing Steel session...");
            match self
                .steel
                .sessions()
                .release(id, std::collections::HashMap::new())
                .await
            {
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

    async fn run_action_no_shot(
        &self,
        params: SessionComputerParams,
    ) -> Result<(), Box<dyn Error>> {
        let id = self.session_id.as_ref().ok_or("Session not initialized")?;
        let _: SessionComputerResponse = self.steel.sessions().computer(id, params).await?;
        Ok(())
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
            .ok_or_else(|| "No screenshot returned from Steel".into())
    }

    fn click_params(x: f64, y: f64, screenshot: bool) -> SessionComputerParams {
        SessionComputerParams::ClickMouse(ComputerActionRequestClickMouse {
            button: Some(ComputerActionRequestClickMouseButton::Left),
            click_type: None,
            coordinates: Some(vec![x, y]),
            hold_keys: None,
            num_clicks: None,
            screenshot: Some(screenshot),
        })
    }

    fn press_keys_params(keys: Vec<String>, screenshot: bool) -> SessionComputerParams {
        SessionComputerParams::PressKey(ComputerActionRequestPressKey {
            duration: None,
            keys,
            screenshot: Some(screenshot),
        })
    }

    fn type_text_params(text: String) -> SessionComputerParams {
        SessionComputerParams::TypeText(ComputerActionRequestTypeText {
            hold_keys: None,
            screenshot: None,
            text,
        })
    }

    fn wait_params(duration: f64, screenshot: bool) -> SessionComputerParams {
        SessionComputerParams::Wait(ComputerActionRequestWait {
            duration,
            screenshot: Some(screenshot),
        })
    }

    fn scroll_params(x: f64, y: f64, dx: f64, dy: f64) -> SessionComputerParams {
        SessionComputerParams::Scroll(ComputerActionRequestScroll {
            coordinates: Some(vec![x, y]),
            delta_x: Some(dx),
            delta_y: Some(dy),
            hold_keys: None,
            screenshot: Some(true),
        })
    }

    async fn execute_computer_action(
        &mut self,
        name: &str,
        args: &Value,
    ) -> Result<String, Box<dyn Error>> {
        match name {
            "open_web_browser" => self.take_screenshot().await,

            "click_at" => {
                let x = Self::denormalize_x(arg_f64(args, "x", 0.0));
                let y = Self::denormalize_y(arg_f64(args, "y", 0.0));
                self.run_action(Self::click_params(x, y, true)).await
            }

            "hover_at" => {
                let x = Self::denormalize_x(arg_f64(args, "x", 0.0));
                let y = Self::denormalize_y(arg_f64(args, "y", 0.0));
                self.run_action(SessionComputerParams::MoveMouse(
                    ComputerActionRequestMoveMouse {
                        coordinates: vec![x, y],
                        hold_keys: None,
                        screenshot: Some(true),
                    },
                ))
                .await
            }

            "type_text_at" => {
                let x = Self::denormalize_x(arg_f64(args, "x", 0.0));
                let y = Self::denormalize_y(arg_f64(args, "y", 0.0));
                let text = arg_str(args, "text", "").to_string();
                let press_enter = arg_bool(args, "press_enter", true);
                let clear_before_typing = arg_bool(args, "clear_before_typing", true);

                self.run_action_no_shot(Self::click_params(x, y, false))
                    .await?;

                if clear_before_typing {
                    self.run_action_no_shot(Self::press_keys_params(
                        vec!["Control".to_string(), "a".to_string()],
                        false,
                    ))
                    .await?;
                    self.run_action_no_shot(Self::press_keys_params(
                        vec!["Backspace".to_string()],
                        false,
                    ))
                    .await?;
                }

                self.run_action_no_shot(Self::type_text_params(text)).await?;

                if press_enter {
                    self.run_action_no_shot(Self::press_keys_params(
                        vec!["Enter".to_string()],
                        false,
                    ))
                    .await?;
                }

                self.run_action_no_shot(Self::wait_params(1.0, false))
                    .await?;

                self.take_screenshot().await
            }

            "scroll_document" => {
                let direction = arg_str(args, "direction", "down");
                match direction {
                    "left" | "right" => {
                        let (cx, cy) = Self::center();
                        let delta = if direction == "left" { -400.0 } else { 400.0 };
                        self.run_action(Self::scroll_params(cx, cy, delta, 0.0)).await
                    }
                    "up" => {
                        self.run_action(Self::press_keys_params(
                            vec!["PageUp".to_string()],
                            true,
                        ))
                        .await
                    }
                    _ => {
                        self.run_action(Self::press_keys_params(
                            vec!["PageDown".to_string()],
                            true,
                        ))
                        .await
                    }
                }
            }

            "scroll_at" => {
                let x = Self::denormalize_x(arg_f64(args, "x", 0.0));
                let y = Self::denormalize_y(arg_f64(args, "y", 0.0));
                let direction = arg_str(args, "direction", "down");
                let magnitude = Self::denormalize_y(arg_f64(args, "magnitude", 800.0));

                let (dx, dy) = match direction {
                    "up" => (0.0, -magnitude),
                    "right" => (magnitude, 0.0),
                    "left" => (-magnitude, 0.0),
                    _ => (0.0, magnitude),
                };
                self.run_action(Self::scroll_params(x, y, dx, dy)).await
            }

            "wait_5_seconds" => self.run_action(Self::wait_params(5.0, true)).await,

            "go_back" => {
                self.run_action(Self::press_keys_params(
                    vec!["Alt".to_string(), "ArrowLeft".to_string()],
                    true,
                ))
                .await
            }

            "go_forward" => {
                self.run_action(Self::press_keys_params(
                    vec!["Alt".to_string(), "ArrowRight".to_string()],
                    true,
                ))
                .await
            }

            "search" => {
                self.run_action_no_shot(Self::press_keys_params(
                    vec!["Control".to_string(), "l".to_string()],
                    false,
                ))
                .await?;
                self.run_action_no_shot(Self::type_text_params(
                    "https://www.google.com".to_string(),
                ))
                .await?;
                self.run_action_no_shot(Self::press_keys_params(
                    vec!["Enter".to_string()],
                    false,
                ))
                .await?;
                self.run_action_no_shot(Self::wait_params(2.0, false))
                    .await?;
                self.current_url = "https://www.google.com".to_string();
                self.take_screenshot().await
            }

            "navigate" => {
                let mut url = arg_str(args, "url", "").to_string();
                if !url.starts_with("http://") && !url.starts_with("https://") {
                    url = format!("https://{}", url);
                }
                self.run_action_no_shot(Self::press_keys_params(
                    vec!["Control".to_string(), "l".to_string()],
                    false,
                ))
                .await?;
                self.run_action_no_shot(Self::type_text_params(url.clone()))
                    .await?;
                self.run_action_no_shot(Self::press_keys_params(
                    vec!["Enter".to_string()],
                    false,
                ))
                .await?;
                self.run_action_no_shot(Self::wait_params(2.0, false))
                    .await?;
                self.current_url = url;
                self.take_screenshot().await
            }

            "key_combination" => {
                let keys_str = arg_str(args, "keys", "");
                let keys = normalize_keys(split_keys(keys_str));
                self.run_action(Self::press_keys_params(keys, true)).await
            }

            "drag_and_drop" => {
                let start_x = Self::denormalize_x(arg_f64(args, "x", 0.0));
                let start_y = Self::denormalize_y(arg_f64(args, "y", 0.0));
                let end_x = Self::denormalize_x(arg_f64(args, "destination_x", 0.0));
                let end_y = Self::denormalize_y(arg_f64(args, "destination_y", 0.0));
                self.run_action(SessionComputerParams::DragMouse(
                    ComputerActionRequestDragMouse {
                        hold_keys: None,
                        path: vec![vec![start_x, start_y], vec![end_x, end_y]],
                        screenshot: Some(true),
                    },
                ))
                .await
            }

            other => {
                println!("Unknown action: {}, taking screenshot", other);
                self.take_screenshot().await
            }
        }
    }

    async fn call_gemini(&self) -> Result<GenerateContentResponse, Box<dyn Error>> {
        let body = json!({
            "contents": self.contents,
            "tools": [{ "computerUse": { "environment": "ENVIRONMENT_BROWSER" } }],
        });

        let resp = self
            .http
            .post(GEMINI_URL)
            .header("x-goog-api-key", &self.gemini_key)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await?;

        let status = resp.status();
        let raw = resp.text().await?;
        if !status.is_success() {
            let detail = serde_json::from_str::<GeminiError>(&raw)
                .map(|e| e.error.message)
                .unwrap_or(raw);
            return Err(format!("Gemini API error ({}): {}", status, detail).into());
        }

        Ok(serde_json::from_str(&raw)?)
    }

    async fn execute_task(&mut self, task: &str) -> Result<String, Box<dyn Error>> {
        self.contents = vec![json!({
            "role": "user",
            "parts": [
                { "text": browser_system_prompt() },
                { "text": task },
            ],
        })];

        println!("Executing task: {}", task);
        println!("{}", "=".repeat(60));

        let mut iterations = 0usize;
        let mut consecutive_no_actions = 0usize;

        while iterations < MAX_ITERATIONS {
            iterations += 1;

            let response = self.call_gemini().await?;

            let candidate = match response.candidates.into_iter().next() {
                Some(c) => c,
                None => {
                    println!("No candidates in response");
                    break;
                }
            };

            let parts = candidate
                .content
                .as_ref()
                .and_then(|c| c.get("parts"))
                .and_then(|p| p.as_array())
                .cloned()
                .unwrap_or_default();

            if let Some(content) = &candidate.content {
                self.contents.push(content.clone());
            }

            let reasoning = extract_text(&parts);
            let function_calls = extract_function_calls(&parts);

            let malformed = candidate
                .finish_reason
                .as_deref()
                .map(|r| r == "MALFORMED_FUNCTION_CALL")
                .unwrap_or(false);

            if function_calls.is_empty() && reasoning.is_empty() && malformed {
                println!("Malformed function call, retrying...");
                continue;
            }

            if function_calls.is_empty() {
                if !reasoning.is_empty() {
                    println!("\n{}", reasoning);
                    println!("Task complete - model provided final response");
                    break;
                }
                consecutive_no_actions += 1;
                if consecutive_no_actions >= 3 {
                    println!("No actions for 3 consecutive iterations - stopping");
                    break;
                }
                continue;
            }

            consecutive_no_actions = 0;

            if !reasoning.is_empty() {
                println!("\n{}", reasoning);
            }

            let mut response_parts: Vec<Value> = Vec::new();

            for fc in &function_calls {
                let name = fc.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                let args = fc.get("args").cloned().unwrap_or_else(|| json!({}));
                println!("{}({})", name, args);

                if let Some(safety) = args.get("safety_decision") {
                    if safety.get("decision").and_then(|v| v.as_str())
                        == Some("require_confirmation")
                    {
                        let explanation = safety
                            .get("explanation")
                            .and_then(|v| v.as_str())
                            .unwrap_or("");
                        println!("Safety confirmation required: {}", explanation);
                        println!("Auto-acknowledging safety check");
                    }
                }

                let screenshot = self.execute_computer_action(name, &args).await?;

                response_parts.push(json!({
                    "functionResponse": {
                        "name": name,
                        "response": { "url": self.current_url },
                    }
                }));
                response_parts.push(json!({
                    "inlineData": {
                        "mimeType": "image/png",
                        "data": screenshot,
                    }
                }));
            }

            self.contents
                .push(json!({ "role": "user", "parts": response_parts }));
        }

        if iterations >= MAX_ITERATIONS {
            println!("Task execution stopped after {} iterations", MAX_ITERATIONS);
        }

        for content in self.contents.iter().rev() {
            if content.get("role").and_then(|v| v.as_str()) == Some("model") {
                if let Some(parts) = content.get("parts").and_then(|p| p.as_array()) {
                    let text = extract_text(parts);
                    if !text.is_empty() {
                        return Ok(text);
                    }
                }
            }
        }

        Ok("Task execution completed (no final message)".to_string())
    }
}

fn is_noise(text: &str) -> bool {
    text.chars().all(|c| c.is_whitespace() || c.is_ascii_digit())
}

fn extract_text(parts: &[Value]) -> String {
    parts
        .iter()
        .filter_map(|p| p.get("text").and_then(|v| v.as_str()))
        .filter(|t| !is_noise(t))
        .collect::<Vec<_>>()
        .join(" ")
        .trim()
        .to_string()
}

fn extract_function_calls(parts: &[Value]) -> Vec<Value> {
    parts
        .iter()
        .filter_map(|p| p.get("functionCall").cloned())
        .collect()
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let _ = dotenvy::dotenv();

    println!("Steel + Gemini Computer Use Assistant");
    println!("{}", "=".repeat(60));

    let steel_key = std::env::var("STEEL_API_KEY").unwrap_or_default();
    let gemini_key = std::env::var("GEMINI_API_KEY").unwrap_or_default();
    let task = std::env::var("TASK")
        .unwrap_or_else(|_| "Go to Steel.dev and find the latest news".to_string());

    if steel_key.is_empty() {
        eprintln!("WARNING: Set STEEL_API_KEY in your environment or .env file");
        eprintln!("   Get your API key at: https://app.steel.dev/settings/api-keys");
        std::process::exit(1);
    }
    if gemini_key.is_empty() {
        eprintln!("WARNING: Set GEMINI_API_KEY in your environment or .env file");
        eprintln!("   Get your API key at: https://aistudio.google.com/apikey");
        std::process::exit(1);
    }

    println!("\nStarting Steel session...");
    let mut agent = Agent::new(gemini_key, steel_key);

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
