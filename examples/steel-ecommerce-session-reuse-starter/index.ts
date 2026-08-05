import { chromium, Page } from "playwright";
import Steel from "steel-sdk";
import dotenv from "dotenv";

// Load environment variables from .env file
dotenv.config();

// Get Steel API key from environment variables
const STEEL_API_KEY = process.env.STEEL_API_KEY;

// Initialize Steel client with the API key
const client = new Steel({
  steelAPIKey: STEEL_API_KEY,
});

// Target e-commerce demo site URL
const DEMO_SITE = "https://demoblaze.com";

/**
 * Sets up a session with the demo e-commerce site
 * Uses guest flow approach (no login required)
 * 
 * @param page - Playwright Page object
 * @returns boolean indicating if setup was successful
 */
async function setupSession(page: Page): Promise<boolean> {
  try {
    // Navigate to the demo site homepage
    await page.goto(DEMO_SITE);
    
    // Wait for navigation menu to ensure page is interactive
    await page.waitForSelector('.navbar-nav');
    
    // Proceed as guest user (no login required for this demo)
    console.log("Proceeding as guest user");
    
    // Verify products are visible to confirm site loaded successfully
    await page.waitForSelector('.card-title', { timeout: 10000 });
    
    // Count and log the number of products displayed
    const productCount = await page.$$eval('.card-title', items => items.length);
    console.log(`Found ${productCount} products on page`);
    
    return productCount > 0;
  } catch (error) {
    console.error("Site setup failed:", error);
    return false;
  }
}

// Helper function to add product to cart
async function addProductToCart(page: Page): Promise<boolean> {
  try {
    // Navigate to phones category
    await page.click('a:has-text("Phones")');
    
    // Wait for products to load
    await page.waitForSelector('.card-title');
    
    // Click on the first phone
    await page.click('.card-title a', { timeout: 5000 });
    
    // Wait for product page to load
    await page.waitForSelector('.product-deatil', { timeout: 10000 });
    
    // Add to cart
    await page.click('.btn-success');
    
    // Wait for the add to cart confirmation
    try {
      // Wait for dialog and accept it
      const dialogPromise = page.waitForEvent('dialog', { timeout: 5000 });
      const dialog = await dialogPromise;
      await dialog.dismiss();
      console.log("Product added dialog appeared and was dismissed");
    } catch (error) {
      console.log("No dialog appeared or it was dismissed automatically");
    }
    
    // Important: Wait a moment for cart state to be fully saved in storage
    // Demo Blaze uses localStorage to store cart items
    await page.waitForTimeout(2000);
    
    // Navigate to cart page to ensure cart state is properly stored
    await page.goto(`${DEMO_SITE}/cart.html`);
    await page.waitForTimeout(1000);
    
    // Verify the cart has items
    const hasItems = await verifyCartHasItems(page);
    if (hasItems) {
      console.log("Product confirmed in cart");
    }
    
    return true;
  } catch (error) {
    console.error("Failed to add product to cart:", error);
    return false;
  }
}

// Helper function to verify cart has items
async function verifyCartHasItems(page: Page): Promise<boolean> {
  try {
    // Go to cart page
    await page.goto(`${DEMO_SITE}/cart.html`);
    
    // Check if cart has products
    const cartItems = await page.$$('.success');
    return cartItems.length > 0;
  } catch (error) {
    console.error("Failed to verify cart:", error);
    return false;
  }
}

// Helper function to proceed to checkout
async function proceedToCheckout(page: Page): Promise<boolean> {
  try {
    // Ensure we're on the cart page
    await page.goto(`${DEMO_SITE}/cart.html`);
    
    // Click Place Order button
    await page.click('button:has-text("Place Order")');
    
    // Wait for the form to appear
    await page.waitForSelector('#orderModal');
    
    // Fill checkout form
    await page.fill('#name', 'Test User');
    await page.fill('#country', 'Test Country');
    await page.fill('#city', 'Test City');
    await page.fill('#card', '4111111111111111');
    await page.fill('#month', '12');
    await page.fill('#year', '2025');
    
    // Submit order
    await page.click('button:has-text("Purchase")');
    
    // Wait for confirmation
    await page.waitForSelector('.sweet-alert');
    
    // Check for confirmation message
    const confirmationText = await page.textContent('.sweet-alert');
    return confirmationText?.includes('Thank you for your purchase') ?? false;
  } catch (error) {
    console.error("Failed at checkout:", error);
    return false;
  }
}

/**
 * Main execution function for the e-commerce session context example
 * Demonstrates how to:
 * 1. Create an initial session and add product to cart
 * 2. Capture session context
 * 3. Create a new session with the captured context
 * 4. Complete checkout in the new session
 */
async function main() {
  // Session and browser variables
  let session1;
  let session2;
  let browser;

  try {
    console.log("=== PART 1: Initial Session - Site Access & Add to Cart ===");
    
    // Step 1: Create initial session and authenticate
    console.log("\nCreating first Steel session...");
    session1 = await client.sessions.create();
    console.log(
      `\x1b[1;93mSteel Session #1 created!\x1b[0m\n` +
      `View session at \x1b[1;37m${session1.sessionViewerUrl}\x1b[0m`
    );

    // Connect Playwright to the session
    browser = await chromium.connectOverCDP(
      `wss://connect.steel.dev?apiKey=${STEEL_API_KEY}&sessionId=${session1.id}`
    );
    console.log("Connected to browser");

    const page = await browser.contexts()[0].pages()[0];
    
    // Set up the session with the demo site
    console.log("\nSetting up session with Demo Blaze site...");
    const sessionSetupSuccess = await setupSession(page);
    
    if (sessionSetupSuccess) {
      console.log("✓ Site access successful");
      
      // Add product to cart
      console.log("\nAdding product to cart...");
      await addProductToCart(page);
      
      // Verify cart has items
      const cartHasItems = await verifyCartHasItems(page);
      if (cartHasItems) {
        console.log("✓ Product successfully added to cart");
      }
      
      // Step 2: Capture session context
      // This is the critical step that allows us to transfer state to a new session
      console.log("\nCapturing session context...");
      
      // Navigate to cart page to ensure we capture latest cart state
      // Session context includes cookies, localStorage (where available), and other browser state
      await page.goto(`${DEMO_SITE}/cart.html`);
      await page.waitForSelector('.success');
      await page.waitForTimeout(1000); // Brief pause for any async operations to complete
      
      const sessionContext = await client.sessions.context(session1.id);
      console.log("✓ Session context captured");
      
      // Clean up first session
      await browser.close();
      await client.sessions.release(session1.id);
      console.log("Session #1 released");
      
      // ===== Part 2: Create New Session with Previous Context =====
      // This demonstrates how to transfer browsing state across separate sessions
      console.log("\n=== PART 2: New Session - Complete Checkout ===");
      
      // Create new session with captured context
      // The sessionContext parameter contains the state from the previous session
      console.log("\nCreating second Steel session with previous context...");
      session2 = await client.sessions.create({ sessionContext: sessionContext });
      console.log(
      `\x1b[1;93mSteel Session #2 created!\x1b[0m\n` +
      `View session at \x1b[1;37m${session2.sessionViewerUrl}\x1b[0m`
    );
      
      // Connect to new session
      browser = await chromium.connectOverCDP(
        `wss://connect.steel.dev?apiKey=${STEEL_API_KEY}&sessionId=${session2.id}`
      );
      console.log("Connected to browser");
      
      const newPage = await browser.contexts()[0].pages()[0];
      
      // First navigate to the site to ensure domain access
      console.log("Navigating to Demo Blaze site in new session...");
      await newPage.goto(DEMO_SITE);
      await newPage.waitForTimeout(2000);
      
      // Navigate directly to cart page
      console.log("Navigating to cart page...");
      await newPage.goto(`${DEMO_SITE}/cart.html`);
      await newPage.waitForTimeout(2000);
      
      console.log("\nChecking if cart state transferred...");
      const cartStateTransferred = await verifyCartHasItems(newPage);
      
      if (!cartStateTransferred) {
        console.log("Cart items did not transfer - this is expected with this demo site");
        console.log("Adding new product to cart in second session...");
        
        // Add a product to cart in the new session
        await addProductToCart(newPage);
      } else {
        console.log("\x1b[32m✓ Cart items successfully transferred to new session!\x1b[0m");
      }
      
      // Complete checkout process in either case
      console.log("\nProceeding to checkout...");
      const checkoutSuccess = await proceedToCheckout(newPage);
      
      if (checkoutSuccess) {
        console.log("\n✓ Checkout successful! Order completed in new session");
        console.log("\n\x1b[32m=== Multi-step E-commerce Workflow with Session Context Reuse Completed ===\x1b[0m\n");
        console.log("NOTE: This example demonstrates session context reuse technique.");
        console.log("While cart items may not transfer with this specific demo site (due to localStorage use),");
        console.log("the pattern is valid for sites that store state in cookies or session storage.");
      }
    } else {
      console.error("❌ Site access failed");
    }
  } catch (error) {
    console.error("An error occurred:", error);
  } finally {
    // Clean up resources to avoid leaks
    // Always important to close browsers and release sessions
    if (browser) {
      await browser.close();
    }
    
    // Release any active sessions
    if (session2) {
      await client.sessions.release(session2.id);
      console.log("Session #2 released");
    } else if (session1) {
      await client.sessions.release(session1.id);
      console.log("Session #1 released");
    }
    
    console.log("Done!");
  }
}

// Run the script
main().catch(console.error);
