import inquirer from "inquirer";
import Steel from "steel-sdk";
import { Page } from "playwright";

export async function selectOrCreateProfile(client: Steel) {
  const { profiles, count } = await client.profiles.list();

  if (count === 0) {
    // No profiles
    return undefined;
  } else {
    // Profiles exist, let user select one or create new
    const choices = [
      {
        name: "Create a new profile",
        value: undefined,
      },
      ...profiles.map((profile) => {
        const lastUsedDate = profile.updatedAt
          ? new Date(profile.updatedAt).toLocaleString()
          : "Never";
        return {
          name: `${profile.id} (Last used: ${lastUsedDate})`,
          value: profile.id,
        };
      }),
    ];

    const { selectedProfileId } = await inquirer.prompt([
      {
        type: "list",
        name: "selectedProfileId",
        message: "Select a profile to use:",
        choices,
      },
    ]);
    return (
      profiles.find((profile) => profile.id === selectedProfileId)?.id ??
      undefined
    );
  }
}

// Helper function to initialize the demo shop (no login required)
export async function login(page: Page) {
  await page.goto("https://demowebshop.tricentis.com/", {
    waitUntil: "networkidle",
  });

  // Wait for the main content to load
  await page.waitForSelector(".header-links");
}

// Helper function to verify the site is accessible
export async function verifyAuth(page: Page): Promise<boolean> {
  try {
    await page.goto("https://demowebshop.tricentis.com/", {
      waitUntil: "networkidle",
    });

    // Check if the main header is present
    const headerExists = (await page.locator(".header-links").count()) > 0;
    return headerExists;
  } catch (error) {
    console.error("❌ Failed to verify site access:", error);
    return false;
  }
}

export async function addItemsToCart(page: Page) {
  try {
    // Define items to add from different categories
    const itemsToAdd = [
      {
        category: "books",
        url: "https://demowebshop.tricentis.com/books",
        name: "Book",
      },
      {
        category: "digital downloads",
        url: "https://demowebshop.tricentis.com/digital-downloads",
        name: "Digital Download",
      },
      {
        category: "notebooks",
        url: "https://demowebshop.tricentis.com/notebooks",
        name: "Notebook",
      },
    ];

    let itemsAdded = 0;

    for (const item of itemsToAdd) {
      try {
        await page.goto(item.url, { waitUntil: "networkidle" });

        // Wait for product grid to load
        await page.waitForSelector(".product-grid, .item-box", {
          timeout: 10000,
        });

        // Look for add to cart buttons - try multiple selector patterns
        const addToCartSelectors = [
          ".product-box-add-to-cart-button",
          "input[value='Add to cart']",
          ".button-2.product-box-add-to-cart-button",
          "div.item-box:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(4) > div:nth-child(2) > input:nth-child(1)",
        ];

        let buttonClicked = false;
        for (const selector of addToCartSelectors) {
          const button = page.locator(selector).first();
          if ((await button.count()) > 0) {
            await button.click();
            buttonClicked = true;
            itemsAdded++;
            console.log(`Added item from ${item.name} category`);
            for (let i = 0; i < 10; i++) {
              const cartQty = await page
                .locator(".cart-qty")
                .first()
                .textContent();
              if (parseInt(cartQty!) !== itemsAdded) {
                await page.waitForTimeout(1000);
              } else break;
            }
            break;
          }
        }

        if (!buttonClicked) {
          console.log(
            `Could not find add to cart button in ${item.name} category`,
          );
        }
      } catch (error) {
        console.log(`❌ Failed to add item from ${item.name}`);
      }
    }

    // Navigate to cart to verify items
    await page.goto("https://demowebshop.tricentis.com/cart", {
      waitUntil: "networkidle",
    });

    // Wait for cart page to load
    await page.waitForSelector(".page-title", { timeout: 10000 });

    // Check cart contents
    const cartContent = await page.locator("body").textContent();

    if (cartContent?.includes("Your Shopping Cart is empty")) {
      console.log("❌ Cart is empty - no items were added successfully");
      return false;
    } else {
      // Try to count cart items
      const cartRows = await page.locator(".cart tbody tr").count();
      if (cartRows > 0) {
        console.log(`\n${cartRows} items in cart`);

        // Get item names if possible
        const itemNames = await page
          .locator(".product-name a")
          .allTextContents();
        if (itemNames.length > 0) {
          console.log("Items added:");
          itemNames.forEach((name, index) => {
            console.log(`  ${index + 1}. ${name.trim()}`);
          });
        }
        return true;
      } else {
        console.log(
          `\nItems may have been added (${itemsAdded} attempted), checking cart status...`,
        );
        return itemsAdded > 0;
      }
    }
  } catch (error) {
    console.error("❌ Error adding items to cart");
    return false;
  }
}

export async function checkItemsInCart(page: Page) {
  try {
    // Navigate to cart page
    await page.goto("https://demowebshop.tricentis.com/cart", {
      waitUntil: "networkidle",
    });

    // Wait for page to load
    await page.waitForSelector(".page-title", { timeout: 10000 });

    // Check if cart is empty
    const pageContent = await page.locator("body").textContent();

    if (pageContent?.includes("Your Shopping Cart is empty")) {
      console.log("❌ Cart is empty");
      return false;
    }

    // Check for cart items
    const cartRows = await page.locator(".cart tbody tr").count();

    if (cartRows > 0) {
      console.log(`Found ${cartRows} items in cart`);

      // Try to get item details
      const itemNames = await page.locator(".product-name a").allTextContents();
      if (itemNames.length > 0) {
        console.log("\nItems in cart:");
        itemNames.forEach((name, index) => {
          console.log(`  ${index + 1}. ${name.trim()}`);
        });
      }

      return true;
    } else {
      // Check shopping cart link in header for item count
      const headerCartText = await page.locator(".cart-label").textContent();
      if (headerCartText && !headerCartText.includes("(0)")) {
        console.log(`Header cart: ${headerCartText}`);
        return true;
      }

      console.log("❌ No items found in cart");
      return false;
    }
  } catch (error) {
    console.error("❌ Error checking cart");
    return false;
  }
}
