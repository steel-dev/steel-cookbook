// Capture a logged-in Steel session's auth context and replay it into a fresh session.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/auth-context-rs

use std::collections::HashMap;
use std::error::Error;

use chromiumoxide::Browser;
use chromiumoxide::Page;
use futures::StreamExt;
use steel::types::*;
use steel::Steel;

const LOGIN_URL: &str = "https://practice.expandtesting.com/login";
const SECURE_URL: &str = "https://practice.expandtesting.com/secure";

fn to_write_context(context: SessionContext) -> SessionCreateParamsSessionContext {
    let cookies = context.cookies.map(|cookies| {
        cookies
            .into_iter()
            .map(|c| SessionCreateParamsSessionContextCookie {
                name: c.name,
                value: c.value,
                domain: c.domain,
                path: c.path,
                expires: c.expires,
                http_only: c.http_only,
                secure: c.secure,
                same_site: c.same_site,
                url: c.url,
                priority: c.priority,
                same_party: c.same_party,
                session: c.session,
                size: c.size,
                source_port: c.source_port,
                source_scheme: c.source_scheme,
                partition_key: None,
            })
            .collect()
    });

    SessionCreateParamsSessionContext {
        cookies,
        local_storage: context.local_storage,
        session_storage: context.session_storage,
        indexed_db: None,
    }
}

async fn login(page: &Page) -> Result<(), Box<dyn Error>> {
    page.goto(LOGIN_URL).await?.wait_for_navigation().await?;
    page.find_element("input[name=username]")
        .await?
        .type_str("practice")
        .await?;
    page.find_element("input[name=password]")
        .await?
        .type_str("SuperSecretPassword!")
        .await?;
    page.find_element("button[type=submit]").await?.click().await?;
    page.wait_for_navigation().await?;
    Ok(())
}

async fn verify_auth(page: &Page) -> Result<bool, Box<dyn Error>> {
    page.goto(SECURE_URL).await?.wait_for_navigation().await?;
    let text = page.find_element("#username").await?.inner_text().await?;
    Ok(text.map_or(false, |t| t.contains("Hi, practice!")))
}

fn normalize_cdp_url(websocket_url: &str, api_key: &str) -> String {
    let raw = format!("{websocket_url}&apiKey={api_key}");
    match (raw.find("://"), raw.find('?')) {
        (Some(s), Some(q)) if !raw[s + 3..q].contains('/') => {
            format!("{}/{}", &raw[..q], &raw[q..])
        }
        _ => raw,
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    dotenvy::dotenv().ok();

    let api_key = std::env::var("STEEL_API_KEY")
        .map_err(|_| "set STEEL_API_KEY (get one at https://app.steel.dev/settings/api-keys)")?;

    let client = Steel::new(api_key.clone());

    println!("Creating Steel session #1...");
    let session = client
        .sessions()
        .create(SessionCreateParams::default())
        .await?;
    println!("Session #1 live at {}", session.session_viewer_url);

    let cdp_url = normalize_cdp_url(&session.websocket_url, &api_key);
    let (browser, mut handler) = Browser::connect(cdp_url).await?;
    let handle = tokio::spawn(async move { while handler.next().await.is_some() {} });

    println!("Logging in...");
    let page = browser.new_page(LOGIN_URL).await?;
    login(&page).await?;
    if verify_auth(&page).await? {
        println!("Initial authentication confirmed");
    }

    let context = client.sessions().context(&session.id).await?;

    handle.abort();
    client.sessions().release(&session.id, HashMap::new()).await?;
    println!("Session #1 released");

    println!("\nCreating Steel session #2 from the captured context...");
    let session = client
        .sessions()
        .create(SessionCreateParams {
            session_context: Some(Box::new(to_write_context(context))),
            ..Default::default()
        })
        .await?;
    println!("Session #2 live at {}", session.session_viewer_url);

    let cdp_url = normalize_cdp_url(&session.websocket_url, &api_key);
    let (browser, mut handler) = Browser::connect(cdp_url).await?;
    let handle = tokio::spawn(async move { while handler.next().await.is_some() {} });

    let page = browser.new_page(SECURE_URL).await?;
    let transferred = verify_auth(&page).await?;

    handle.abort();
    client.sessions().release(&session.id, HashMap::new()).await?;
    println!("Session #2 released");

    if transferred {
        println!("\nAuthentication successfully transferred without logging in");
        Ok(())
    } else {
        Err("auth context did not transfer".into())
    }
}
