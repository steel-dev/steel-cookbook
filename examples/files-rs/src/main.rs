// Upload a CSV to a Steel session, then feed its sandbox path into a remote file input over raw CDP.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/files-rs

use std::error::Error;
use std::time::{Duration, Instant};

use chromiumoxide::cdp::browser_protocol::dom::{
    GetDocumentParams, QuerySelectorParams, SetFileInputFilesParams,
};
use chromiumoxide::cdp::browser_protocol::page::CaptureScreenshotFormat;
use chromiumoxide::Browser;
use futures::StreamExt;
use steel::types::{FileUpload, SessionFileUploadParams};
use steel::Steel;

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    dotenvy::dotenv().ok();

    let api_key = std::env::var("STEEL_API_KEY")
        .map_err(|_| "set STEEL_API_KEY (get one at https://app.steel.dev/settings/api-keys)")?;

    let client = Steel::new(api_key.clone());

    println!("Creating Steel session...");
    let session = client
        .sessions()
        .create(steel::SessionCreateParams::default())
        .await?;

    println!("Session live at {}", session.session_viewer_url);

    let result = run(&client, &session.id, &session.websocket_url, &api_key).await;

    println!("Releasing session...");
    client
        .sessions()
        .release(&session.id, steel::SessionReleaseParams::new())
        .await?;
    println!("Session released");

    result
}

async fn run(
    client: &Steel,
    session_id: &str,
    websocket_url: &str,
    api_key: &str,
) -> Result<(), Box<dyn Error>> {
    let bytes = std::fs::read("./assets/stock.csv")?;
    println!("Uploading stock.csv ({} bytes) to the session...", bytes.len());

    let uploaded = client
        .sessions()
        .files()
        .upload(
            session_id,
            SessionFileUploadParams {
                file: FileUpload::new("stock.csv", bytes).with_content_type("text/csv"),
                path: None,
            },
        )
        .await?;

    println!("Uploaded. Path inside the session VM: {}", uploaded.path);

    let raw = format!("{websocket_url}&apiKey={api_key}");
    let cdp_url = match (raw.find("://"), raw.find('?')) {
        (Some(s), Some(q)) if !raw[s + 3..q].contains('/') => {
            format!("{}/{}", &raw[..q], &raw[q..])
        }
        _ => raw,
    };

    let (browser, mut handler) = Browser::connect(cdp_url).await?;
    let handle = tokio::spawn(async move { while handler.next().await.is_some() {} });

    println!("Connected over CDP, opening csvplot.com...");
    let page = browser.new_page("https://www.csvplot.com/").await?;
    page.wait_for_navigation().await?;

    let document = page.execute(GetDocumentParams::default()).await?;
    let input = page
        .execute(QuerySelectorParams::new(
            document.root.node_id,
            "#load-file",
        ))
        .await?;

    println!("Setting the uploaded file on the page's #load-file input...");
    page.execute(SetFileInputFilesParams {
        files: vec![uploaded.path.clone()],
        node_id: Some(input.node_id),
        backend_node_id: None,
        object_id: None,
    })
    .await?;

    let chart = wait_for(&page, "svg.main-svg", Duration::from_secs(30)).await?;
    chart.scroll_into_view().await?;
    let png = chart.screenshot(CaptureScreenshotFormat::Png).await?;
    std::fs::write("stock.png", &png)?;
    println!("Saved stock.png ({} bytes)", png.len());

    handle.abort();
    Ok(())
}

async fn wait_for(
    page: &chromiumoxide::Page,
    selector: &str,
    timeout: Duration,
) -> Result<chromiumoxide::element::Element, Box<dyn Error>> {
    let deadline = Instant::now() + timeout;
    loop {
        if let Ok(element) = page.find_element(selector).await {
            return Ok(element);
        }
        if Instant::now() >= deadline {
            return Err(format!("timed out waiting for {selector}").into());
        }
        tokio::time::sleep(Duration::from_millis(250)).await;
    }
}
