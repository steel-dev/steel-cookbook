// Let Steel auto-fill a vaulted login while chromiumoxide drives the page over CDP.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credentials-rs

use std::collections::HashMap;
use std::error::Error;
use std::time::Duration;

use chromiumoxide::Browser;
use futures::StreamExt;
use steel::{CredentialCreateParams, SessionCreateParams, SessionCreateParamsCredentials, Steel};

const ORIGIN: &str = "https://demo.testfire.net";

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    dotenvy::dotenv().ok();

    let api_key = std::env::var("STEEL_API_KEY")
        .map_err(|_| "set STEEL_API_KEY (get one at https://app.steel.dev/settings/api-keys)")?;

    let client = Steel::new(api_key.clone());

    println!("Storing credential for {ORIGIN}...");
    let create = client
        .credentials()
        .create(CredentialCreateParams {
            label: None,
            namespace: None,
            origin: Some(ORIGIN.into()),
            project_id: None,
            value: HashMap::from([
                ("username".into(), "admin".into()),
                ("password".into(), "admin".into()),
            ]),
        })
        .await;

    match create {
        Ok(_) => println!("Credential stored"),
        Err(err) if err.to_string().contains("Credential already exists") => {
            println!("Credential already exists, moving on");
        }
        Err(err) => return Err(err.into()),
    }

    println!("Creating Steel session with credentials enabled...");
    let session = client
        .sessions()
        .create(SessionCreateParams {
            credentials: Some(Box::new(SessionCreateParamsCredentials::default())),
            ..Default::default()
        })
        .await?;

    println!("Session live at {}", session.session_viewer_url);

    let result = run(&session.websocket_url, &api_key).await;

    println!("Releasing session...");
    client
        .sessions()
        .release(&session.id, steel::SessionReleaseParams::new())
        .await?;
    println!("Session released");

    result
}

async fn run(websocket_url: &str, api_key: &str) -> Result<(), Box<dyn Error>> {
    let raw = format!("{websocket_url}&apiKey={api_key}");
    let cdp_url = match (raw.find("://"), raw.find('?')) {
        (Some(s), Some(q)) if !raw[s + 3..q].contains('/') => {
            format!("{}/{}", &raw[..q], &raw[q..])
        }
        _ => raw,
    };

    let (browser, mut handler) = Browser::connect(cdp_url).await?;
    let handle = tokio::spawn(async move { while handler.next().await.is_some() {} });

    println!("Connected over CDP, opening {ORIGIN}...");
    let page = browser.new_page(ORIGIN).await?;
    page.wait_for_navigation().await?;

    page.find_element("#AccountLink").await?.click().await?;

    tokio::time::sleep(Duration::from_secs(2)).await;

    let heading = page
        .find_element("h1")
        .await?
        .inner_text()
        .await?
        .unwrap_or_default();

    if heading.trim() == "Hello Admin User" {
        println!("Success, you are logged in");
    } else {
        println!("Uh oh, something went wrong (heading was {heading:?})");
    }

    handle.abort();
    Ok(())
}
