import inquirer from "inquirer";
import Steel from "steel-sdk";
import { Page } from "puppeteer-core";
import dotenv from "dotenv";

dotenv.config();

const EMAIL = process.env.EMAIL!;
const PASSWORD = process.env.PASSWORD!;

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

// Helper function to perform login
export async function login(page: Page) {
  await page.goto("https://app.steel.dev/sign-in", {
    waitUntil: "networkidle2",
  });
  const googleXpath = "button.items-center:nth-child(2)";
  const emailXpath = "#identifierId";
  const emailNextXpath = ".VfPpkd-LgbsSe-OWXEXe-k8QpJ";
  const passwordXpath =
    "#password > div:nth-child(1) > div:nth-child(1) > div:nth-child(1) > input:nth-child(1)";
  const passwordNextXpath = ".VfPpkd-LgbsSe-OWXEXe-k8QpJ";
  const steelHeaderXpath = "h3.text-xl";
  const phonePromptSelector =
    'input[type="tel"], div:has-text("Verify it\'s you")';

  await page.waitForSelector(googleXpath, { timeout: 5000 });
  await page.click(googleXpath);

  await page.waitForSelector(emailXpath, { timeout: 10000 });
  await page.type(emailXpath, EMAIL!);
  await page.waitForSelector(emailNextXpath, { timeout: 5000 });
  await page.click(emailNextXpath);

  await new Promise((resolve) => setTimeout(resolve, 3000)); // wait 3 seconds

  await page.waitForSelector(passwordXpath, { timeout: 10000 });
  await page.waitForSelector("#headingText > span:nth-child(1)", {
    timeout: 5000,
  });
  await page.type(passwordXpath, PASSWORD!);
  await page.waitForSelector(passwordNextXpath, { timeout: 5000 });
  await page.click(passwordNextXpath);

  // Check for Google phone verification prompt
  try {
    await page.waitForSelector(phonePromptSelector, { timeout: 5000 });
    // If found, prompt user to take over
    console.log(
      "\nGoogle is asking for phone verification. Please complete the verification in the browser window.",
    );
    await inquirer.prompt([
      {
        type: "input",
        name: "continue",
        message:
          "Press Enter here once you have completed the verification and see the Steel dashboard loading...",
      },
    ]);
  } catch (e) {
    // No phone prompt detected, continue as normal
  }

  // Wait for Steel dashboard header to appear
  await page.waitForSelector(steelHeaderXpath, {
    timeout: 5000,
  });
}

// Helper function to verify authentication
export async function verifyAuth(page: Page): Promise<boolean> {
  await page.goto("https://app.steel.dev", {
    waitUntil: "networkidle2",
  });
  const steelHeaderXpath = "span.text-white";
  await page.waitForSelector(steelHeaderXpath, { timeout: 5000 });
  const welcomeText = await page.$eval(
    steelHeaderXpath,
    (el) => el.textContent,
  );
  return welcomeText?.includes("Steel") ?? false;
}
