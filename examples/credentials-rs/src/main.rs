// Let Steel auto-fill a vaulted login while chromiumoxide drives the page over CDP.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credentials-rs

use std::collections::HashMap;
use std::error::Error;
use std::time::Duration;

use chromiumoxide::cdp::browser_protocol::security::SetIgnoreCertificateErrorsParams;
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
        Err(err) if err.to_string().contains("already exists") => {
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

    let page = browser.new_page("about:blank").await?;
    page.execute(SetIgnoreCertificateErrorsParams::new(true)).await?;

    println!("Opening the login page; Steel auto-fills it from the vault...");
    page.goto(format!("{ORIGIN}/login.jsp")).await?;

    let mut filled = String::new();
    for _ in 0..100 {
        if let Ok(result) = page
            .evaluate(r#"(document.querySelector('#uid') ? document.querySelector('#uid').value : "").trim()"#)
            .await
        {
            if let Ok(value) = result.into_value::<String>() {
                if !value.is_empty() {
                    filled = value;
                    break;
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }

    if !filled.is_empty() {
        println!("Success: Steel auto-filled the login form with {filled:?} from the vault, no credentials in this code.");
    } else {
        println!("Uh oh, the login form was not auto-filled.");
    }

    handle.abort();
    Ok(())
}
