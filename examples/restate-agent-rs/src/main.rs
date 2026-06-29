// Durable browser research session with Restate and Steel.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/restate-agent-rs

use std::error::Error;

use restate_sdk::prelude::*;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use steel::{ClientScrapeParams, ScrapeRequestFormatItem, Steel};
use url::Url;

const DEFAULT_MODEL: &str = "gpt-5.5";
const DEFAULT_QUESTION: &str = "Summarize the main stories on this page and cite the source URL.";
const DEFAULT_SEED_URL: &str = "https://news.ycombinator.com";

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ResearchRequest {
    #[serde(default)]
    question: String,
    #[serde(default)]
    seed_url: String,
    #[serde(default)]
    max_steps: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct Observation {
    url: String,
    title: String,
    status_code: i64,
    markdown: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
struct ResearchState {
    observations: Vec<Observation>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct ResearchResult {
    answer: String,
    sources: Vec<String>,
    observations: usize,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
struct PlanStep {
    action: String,
    url: String,
    reason: String,
    answer: String,
}

#[derive(Debug, Deserialize)]
struct OpenAiResponse {
    #[serde(default)]
    output_text: String,
    #[serde(default)]
    output: Vec<OpenAiOutput>,
    error: Option<OpenAiError>,
}

#[derive(Debug, Deserialize)]
struct OpenAiOutput {
    #[serde(default)]
    content: Vec<OpenAiContent>,
}

#[derive(Debug, Deserialize)]
struct OpenAiContent {
    #[serde(default)]
    text: String,
}

#[derive(Debug, Deserialize)]
struct OpenAiError {
    message: String,
}

#[restate_sdk::object]
trait ResearchSession {
    async fn answer(req: Json<ResearchRequest>) -> Result<Json<ResearchResult>, HandlerError>;

    #[shared]
    async fn history() -> Result<Json<ResearchState>, HandlerError>;
}

struct ResearchSessionImpl;

impl ResearchSession for ResearchSessionImpl {
    async fn answer(
        &self,
        ctx: ObjectContext<'_>,
        Json(req): Json<ResearchRequest>,
    ) -> Result<Json<ResearchResult>, HandlerError> {
        require_env()?;

        let question = if req.question.is_empty() {
            env_or("RESEARCH_QUESTION", DEFAULT_QUESTION)
        } else {
            req.question
        };
        let seed_url = normalize_url(&if req.seed_url.is_empty() {
            env_or("SEED_URL", DEFAULT_SEED_URL)
        } else {
            req.seed_url
        });
        let max_steps = clamp_steps(if req.max_steps == 0 {
            env_or("MAX_STEPS", "2").parse().unwrap_or(2)
        } else {
            req.max_steps
        });

        let mut state = ctx
            .get::<Json<ResearchState>>("state")
            .await?
            .map(|Json(state)| state)
            .unwrap_or_default();
        let mut visited: Vec<String> = state
            .observations
            .iter()
            .map(|obs| obs.url.clone())
            .collect();

        for step in 0..max_steps {
            let plan_question = question.clone();
            let plan_seed = seed_url.clone();
            let plan_observations = state.observations.clone();
            let Json(plan) = ctx
                .run(move || async move {
                    plan_next(&plan_question, &plan_seed, &plan_observations).await
                })
                .name(format!("plan step {}", step + 1))
                .await?;

            if plan.action == "finish" && !state.observations.is_empty() {
                return durable_final_answer(&ctx, &question, &state.observations).await;
            }

            let next_url = if plan.url.is_empty() {
                seed_url.clone()
            } else {
                normalize_url(&plan.url)
            };

            if visited.iter().any(|url| url == &next_url) {
                return durable_final_answer(&ctx, &question, &state.observations).await;
            }

            let scrape_target = next_url.clone();
            let scrape_name = scrape_target.clone();
            let Json(observation) = ctx
                .run(move || async move { scrape_url(&scrape_target).await })
                .name(format!("scrape {}", scrape_name))
                .await?;
            visited.push(observation.url.clone());
            state.observations.push(observation);
            ctx.set("state", Json(state.clone()));
        }

        durable_final_answer(&ctx, &question, &state.observations).await
    }

    async fn history(
        &self,
        ctx: SharedObjectContext<'_>,
    ) -> Result<Json<ResearchState>, HandlerError> {
        let state = ctx
            .get::<Json<ResearchState>>("state")
            .await?
            .map(|Json(state)| state)
            .unwrap_or_default();
        Ok(Json(state))
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    dotenvy::dotenv().ok();
    HttpServer::new(
        Endpoint::builder()
            .bind(ResearchSessionImpl.serve())
            .build(),
    )
    .listen_and_serve("0.0.0.0:9080".parse()?)
    .await;
    Ok(())
}

fn require_env() -> Result<(), HandlerError> {
    let mut missing = Vec::new();
    if env_or("STEEL_API_KEY", "your-steel-api-key-here") == "your-steel-api-key-here" {
        missing.push("STEEL_API_KEY");
    }
    if env_or("OPENAI_API_KEY", "your-openai-api-key-here") == "your-openai-api-key-here" {
        missing.push("OPENAI_API_KEY");
    }
    if missing.is_empty() {
        Ok(())
    } else {
        Err(HandlerError::from(anyhow::anyhow!(
            "set {} in .env before invoking the service",
            missing.join(" and ")
        )))
    }
}

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| fallback.to_string())
}

fn clamp_steps(steps: usize) -> usize {
    steps.clamp(1, 4)
}

fn normalize_url(raw: &str) -> String {
    match Url::parse(raw) {
        Ok(mut url) => {
            url.set_fragment(None);
            url.to_string()
        }
        Err(_) => raw.to_string(),
    }
}

fn trim_markdown(markdown: &str) -> String {
    markdown
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .chars()
        .take(5000)
        .collect()
}

fn observation_digest(observations: &[Observation]) -> String {
    if observations.is_empty() {
        return "No pages have been scraped yet.".to_string();
    }

    observations
        .iter()
        .enumerate()
        .map(|(index, obs)| {
            format!(
                "Observation {}\nURL: {}\nTitle: {}\nHTTP: {}\nMarkdown excerpt:\n{}",
                index + 1,
                obs.url,
                obs.title,
                obs.status_code,
                obs.markdown
            )
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

async fn scrape_url(url: &str) -> Result<Json<Observation>, HandlerError> {
    let client = Steel::new(env_or("STEEL_API_KEY", ""));
    let scraped = client
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
        .map_err(|err| HandlerError::from(anyhow::anyhow!(err.to_string())))?;

    Ok(Json(Observation {
        url: url.to_string(),
        title: scraped
            .metadata
            .title
            .unwrap_or_else(|| "(untitled)".to_string()),
        status_code: scraped.metadata.status_code,
        markdown: trim_markdown(scraped.content.markdown.as_deref().unwrap_or("")),
    }))
}

async fn plan_next(
    question: &str,
    seed_url: &str,
    observations: &[Observation],
) -> Result<Json<PlanStep>, HandlerError> {
    let prompt = format!(
        "Plan the next browser research action.\n\n\
You are controlling a durable browser research agent.\n\n\
Question: {question}\n\
Seed URL: {seed_url}\n\n\
Already scraped pages:\n{observations}\n\n\
Choose exactly one next action:\n\
- scrape_url: use this when another page scrape is needed. Prefer the seed URL first.\n\
- finish: use this once the observations are enough to answer.\n\n\
Return JSON only. If you choose scrape_url, put the absolute URL in url and leave answer empty.\n\
If you choose finish, leave url empty and put the final answer in answer.",
        observations = observation_digest(observations)
    );

    let step = call_openai_json(
        &prompt,
        "research_plan",
        json!({
            "type": "object",
            "additionalProperties": false,
            "properties": {
                "action": { "type": "string", "enum": ["scrape_url", "finish"] },
                "url": { "type": "string" },
                "reason": { "type": "string" },
                "answer": { "type": "string" }
            },
            "required": ["action", "url", "reason", "answer"]
        }),
    )
    .await?;
    Ok(Json(step))
}

async fn final_answer(
    question: &str,
    observations: &[Observation],
) -> Result<ResearchResult, HandlerError> {
    let prompt = format!(
        "Answer the research question using only the scraped observations.\n\n\
Question: {question}\n\n\
Observations:\n{observations}\n\n\
Return a concise answer. Include source URLs from the observations.",
        observations = observation_digest(observations)
    );

    #[derive(Deserialize)]
    struct AnswerBody {
        answer: String,
        sources: Vec<String>,
    }

    let body: AnswerBody = call_openai_json(
        &prompt,
        "research_answer",
        json!({
            "type": "object",
            "additionalProperties": false,
            "properties": {
                "answer": { "type": "string" },
                "sources": { "type": "array", "items": { "type": "string" } }
            },
            "required": ["answer", "sources"]
        }),
    )
    .await?;

    Ok(ResearchResult {
        answer: body.answer,
        sources: body.sources,
        observations: observations.len(),
    })
}

async fn durable_final_answer(
    ctx: &ObjectContext<'_>,
    question: &str,
    observations: &[Observation],
) -> Result<Json<ResearchResult>, HandlerError> {
    let final_question = question.to_string();
    let final_observations = observations.to_vec();
    let result = ctx
        .run(move || async move {
            let answer = final_answer(&final_question, &final_observations).await?;
            Ok(Json(answer))
        })
        .name("final answer")
        .await?;
    Ok(result)
}

async fn call_openai_json<T: for<'de> Deserialize<'de>>(
    prompt: &str,
    schema_name: &str,
    schema: Value,
) -> Result<T, HandlerError> {
    let body = json!({
        "model": env_or("OPENAI_MODEL", DEFAULT_MODEL),
        "input": prompt,
        "text": {
            "format": {
                "type": "json_schema",
                "name": schema_name,
                "strict": true,
                "schema": schema
            }
        }
    });

    let response = reqwest::Client::new()
        .post("https://api.openai.com/v1/responses")
        .bearer_auth(env_or("OPENAI_API_KEY", ""))
        .json(&body)
        .send()
        .await
        .map_err(|err| HandlerError::from(anyhow::anyhow!(err.to_string())))?;

    let status = response.status();
    let payload: OpenAiResponse = response
        .json()
        .await
        .map_err(|err| HandlerError::from(anyhow::anyhow!(err.to_string())))?;

    if !status.is_success() {
        let message = payload
            .error
            .map(|err| err.message)
            .unwrap_or_else(|| format!("HTTP {}", status));
        return Err(HandlerError::from(anyhow::anyhow!(
            "OpenAI request failed: {}",
            message
        )));
    }

    let text = if !payload.output_text.is_empty() {
        payload.output_text
    } else {
        payload
            .output
            .into_iter()
            .flat_map(|item| item.content)
            .map(|part| part.text)
            .find(|text| !text.is_empty())
            .ok_or_else(|| {
                HandlerError::from(anyhow::anyhow!(
                    "OpenAI response did not contain text output"
                ))
            })?
    };

    serde_json::from_str(&text).map_err(|err| HandlerError::from(anyhow::anyhow!(err.to_string())))
}
