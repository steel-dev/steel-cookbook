// Persist a Steel browser profile across two sessions: fill a cart in one, read it back in the next.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/profiles-rs

use std::collections::HashMap;
use std::error::Error;
use std::time::Duration;

use chromiumoxide::Browser;
use chromiumoxide::Page;
use futures::StreamExt;
use steel::types::*;
use steel::Steel;

const BOOKS_URL: &str = "https://demowebshop.tricentis.com/books";
const CART_URL: &str = "https://demowebshop.tricentis.com/cart";

const ADD_TO_CART: &str = ".product-box-add-to-cart-button";
const ADD_TO_CART_FALLBACK: &str = "input[value=\"Add to cart\"]";

const CART_QTY_JS: &str = "(() => document.querySelectorAll('.cart tbody tr').length)()";

fn normalize_cdp_url(websocket_url: &str, api_key: &str) -> String {
    let raw = format!("{websocket_url}&apiKey={api_key}");
    match (raw.find("://"), raw.find('?')) {
        (Some(s), Some(q)) if !raw[s + 3..q].contains('/') => {
            format!("{}/{}", &raw[..q], &raw[q..])
        }
        _ => raw,
    }
}

async fn connect(websocket_url: &str, api_key: &str) -> Result<(Browser, tokio::task::JoinHandle<()>), Box<dyn Error>> {
    let cdp_url = normalize_cdp_url(websocket_url, api_key);
    let (browser, mut handler) = Browser::connect(cdp_url).await?;
    let handle = tokio::spawn(async move { while handler.next().await.is_some() {} });
    Ok((browser, handle))
}

async fn add_first_to_cart(page: &Page) -> Result<(), Box<dyn Error>> {
    let button = match page.find_element(ADD_TO_CART).await {
        Ok(el) => el,
        Err(_) => page.find_element(ADD_TO_CART_FALLBACK).await?,
    };
    button.click().await?;
    page.find_element(".cart-qty").await?;
    Ok(())
}

async fn count_cart_rows(page: &Page) -> Result<u64, Box<dyn Error>> {
    let rows: u64 = page.evaluate(CART_QTY_JS).await?.into_value()?;
    Ok(rows)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    dotenvy::dotenv().ok();

    let api_key = std::env::var("STEEL_API_KEY")
        .map_err(|_| "set STEEL_API_KEY (get one at https://app.steel.dev/settings/api-keys)")?;

    let client = Steel::new(api_key.clone());

    println!("Creating Steel session #1 with a fresh persisted profile...");
    let session = client
        .sessions()
        .create(SessionCreateParams {
            persist_profile: Some(true),
            ..Default::default()
        })
        .await?;

    let profile_id = session.profile_id.clone().ok_or("session #1 returned no profile_id")?;
    println!("Profile ID: {profile_id}");
    println!("Session #1 live at {}", session.session_viewer_url);

    let (browser, handle) = connect(&session.websocket_url, &api_key).await?;
    let page = browser.new_page(BOOKS_URL).await?;
    page.wait_for_navigation().await?;
    add_first_to_cart(&page).await?;
    println!("Added the first book to the cart");

    handle.abort();
    client.sessions().release(&session.id, HashMap::new()).await?;
    println!("Session #1 released");

    tokio::time::sleep(Duration::from_secs(3)).await;

    println!("\nCreating Steel session #2 from profile {profile_id}...");
    let session = client
        .sessions()
        .create(SessionCreateParams {
            persist_profile: Some(true),
            profile_id: Some(profile_id.clone()),
            ..Default::default()
        })
        .await?;
    println!("Session #2 live at {}", session.session_viewer_url);

    let (browser, handle) = connect(&session.websocket_url, &api_key).await?;
    let page = browser.new_page(CART_URL).await?;
    page.wait_for_navigation().await?;
    let rows = count_cart_rows(&page).await?;
    println!("Found {rows} item(s) in the cart");

    handle.abort();
    client.sessions().release(&session.id, HashMap::new()).await?;
    println!("Session #2 released");

    if rows > 0 {
        println!("\nProfile persistence confirmed: the cart survived across sessions");
        Ok(())
    } else {
        Err("profile did not persist the cart across sessions".into())
    }
}
