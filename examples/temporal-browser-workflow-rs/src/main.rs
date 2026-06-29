// Run a Temporal workflow whose activities capture pages with Steel.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/temporal-browser-workflow-rs

mod workflows;

use temporalio_client::{
    envconfig::LoadClientConfigProfileOptions, Client, ClientOptions, Connection,
    WorkflowGetResultOptions, WorkflowStartOptions,
};
use temporalio_common::telemetry::TelemetryOptions;
use temporalio_sdk::{Worker, WorkerOptions};
use temporalio_sdk_core::{CoreRuntime, RuntimeOptions};
use workflows::{BrowserWorkflow, BrowserWorkflowInput, BrowserWorkflowResult, SteelActivities};

const DEFAULT_TASK_QUEUE: &str = "steel-browser-workflows-rs";

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    dotenvy::dotenv().ok();

    match std::env::args().nth(1).as_deref() {
        Some("worker") => run_worker().await,
        Some("start") | None => {
            let result = start_workflow().await?;
            println!("Workflow result:");
            println!("{}", serde_json::to_string_pretty(&result)?);
            Ok(())
        }
        Some(other) => Err(format!("unknown command: {other}. Use worker or start").into()),
    }
}

async fn run_worker() -> Result<(), Box<dyn std::error::Error>> {
    let runtime = CoreRuntime::new_assume_tokio(
        RuntimeOptions::builder()
            .telemetry_options(TelemetryOptions::builder().build())
            .build()?,
    )?;
    let client = temporal_client().await?;
    let task_queue = env_or("TEMPORAL_TASK_QUEUE", DEFAULT_TASK_QUEUE);

    let worker_options = WorkerOptions::new(task_queue.clone())
        .register_workflow::<BrowserWorkflow>()
        .register_activities(SteelActivities)
        .build();
    let mut worker = Worker::new(&runtime, client, worker_options)?;

    println!("Worker started on task queue: {task_queue}");
    worker.run().await?;
    Ok(())
}

async fn start_workflow() -> Result<BrowserWorkflowResult, Box<dyn std::error::Error>> {
    let client = temporal_client().await?;
    let task_queue = env_or("TEMPORAL_TASK_QUEUE", DEFAULT_TASK_QUEUE);
    let workflow_id = format!("steel-browser-rs-{}", unix_millis());
    let input = build_workflow_input()?;

    let handle = client
        .start_workflow(
            BrowserWorkflow::run,
            input,
            WorkflowStartOptions::new(task_queue, workflow_id).build(),
        )
        .await?;

    println!("Started Temporal workflow, run_id: {:?}", handle.run_id());

    let result = handle
        .get_result(WorkflowGetResultOptions::default())
        .await?;
    Ok(result)
}

async fn temporal_client() -> Result<Client, Box<dyn std::error::Error>> {
    let (conn_opts, client_opts) =
        ClientOptions::load_from_config(LoadClientConfigProfileOptions::default())?;
    let connection = Connection::connect(conn_opts).await?;
    Ok(Client::new(connection, client_opts)?)
}

fn build_workflow_input() -> Result<BrowserWorkflowInput, Box<dyn std::error::Error>> {
    Ok(BrowserWorkflowInput {
        urls: read_urls(),
        link_limit: read_link_limit()?,
        full_page_screenshot: std::env::var("FULL_PAGE_SCREENSHOT").as_deref() != Ok("false"),
    })
}

fn read_urls() -> Vec<String> {
    match std::env::var("TARGET_URLS") {
        Ok(raw) => {
            let urls = raw
                .split(',')
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(ToString::to_string)
                .collect::<Vec<_>>();
            if urls.is_empty() {
                default_urls()
            } else {
                urls
            }
        }
        Err(_) => default_urls(),
    }
}

fn default_urls() -> Vec<String> {
    vec![
        "https://news.ycombinator.com".to_string(),
        "https://example.com".to_string(),
    ]
}

fn read_link_limit() -> Result<usize, Box<dyn std::error::Error>> {
    let raw = env_or("LINK_LIMIT", "8");
    let value = raw.parse::<usize>()?;
    if !(1..=25).contains(&value) {
        return Err("LINK_LIMIT must be an integer between 1 and 25".into());
    }
    Ok(value)
}

fn env_or(key: &str, fallback: &str) -> String {
    std::env::var(key).unwrap_or_else(|_| fallback.to_string())
}

fn unix_millis() -> u128 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
}
