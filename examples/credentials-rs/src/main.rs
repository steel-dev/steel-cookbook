// Let Steel auto-fill a vaulted login while chromiumoxide drives the page over CDP.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credentials-rs

use std::collections::HashMap;
use std::error::Error;
use std::time::Duration;

use chromiumoxide::Browser;
use futures::StreamExt;
use steel_rs::{
    Client, CredentialCreateParams, SessionCreateParams, SessionCreateParamsCredentials,
};

const ORIGIN: &str = "https://practice.expandtesting.com";

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    dotenvy::dotenv().ok();

    let api_key = std::env::var("STEEL_API_KEY")
        .map_err(|_| "set STEEL_API_KEY (get one at https://app.steel.dev/settings/api-keys)")?;

    let client = Client::builder().api_key(api_key.clone()).build();

    println!("Storing credential for {ORIGIN}...");
    let create = client
        .credentials()
        .create(CredentialCreateParams {
            origin: Some(ORIGIN.into()),
            ..CredentialCreateParams::new(HashMap::from([
                ("username".into(), "practice".into()),
                ("password".into(), "SuperSecretPassword!".into()),
            ]))
        })
        .await;

    match create {
        Ok(_) => println!("Credential stored"),
        Err(err) if err.status() == Some(409) => {
            println!("Credential already exists, moving on");
        }
        Err(err) => return Err(err.into()),
    }

    println!("Creating Steel session with credentials enabled...");
    let session = client
        .sessions()
        .create(SessionCreateParams {
            credentials: Some(SessionCreateParamsCredentials::default()),
            ..Default::default()
        })
        .await?;

    println!("Session live at {}", session.session_viewer_url);

    let result = run(&session.websocket_url).await;

    println!("Releasing session...");
    client.sessions().release(&session.id).await?;
    println!("Session released");

    result
}

async fn run(websocket_url: &str) -> Result<(), Box<dyn Error>> {
    let raw = websocket_url.to_string();
    let cdp_url = match (raw.find("://"), raw.find('?')) {
        (Some(s), Some(q)) if !raw[s + 3..q].contains('/') => {
            format!("{}/{}", &raw[..q], &raw[q..])
        }
        _ => raw,
    };

    let (browser, mut handler) = Browser::connect(cdp_url).await?;
    let handle = tokio::spawn(async move { while handler.next().await.is_some() {} });

    let page = browser.new_page("about:blank").await?;

    println!("Opening the login page; Steel fills and submits it from the vault...");
    page.goto(format!("{ORIGIN}/login")).await?;

    let mut signed_in = false;
    for _ in 0..100 {
        if let Ok(result) = page.evaluate("location.pathname").await {
            if result.into_value::<String>().ok().as_deref() == Some("/secure") {
                signed_in = true;
                break;
            }
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }

    if !signed_in {
        handle.abort();
        return Err("the page never reached /secure".into());
    }

    let message = page
        .find_element("#flash b")
        .await?
        .inner_text()
        .await?
        .unwrap_or_default();
    println!("Steel signed in. The site says: {message}");

    handle.abort();
    Ok(())
}
