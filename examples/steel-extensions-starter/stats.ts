import { showAvatar, buildTable, Stats } from "./table";
import chalk from "chalk";
import type { Page } from "playwright";

export async function scrapeStats(page: Page, username: string) {
  console.log(`Navigating to ${username}'s GitHub Profile`);

  await page.goto(`https://github.com/${username}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });

  // Scroll to contributions section
  const contributionsSection = page
    .locator("#js-contribution-activity-description")
    .first();

  await contributionsSection.scrollIntoViewIfNeeded();

  // Wait for the graph to load
  await page.waitForSelector(
    'div.ic-contributions-wrapper:has(div:has(h5:text("Contributions")))',
  );

  const wrapper = page.locator(
    'div.ic-contributions-wrapper:has(div:has(h5:text("Contributions")))',
  );
  await wrapper.waitFor({ state: "attached" });

  const contributions = await wrapper
    .locator("div.p-2")
    .nth(0)
    .locator("span.f2")
    .innerText();

  const totalRange = await wrapper
    .locator("div.p-2")
    .nth(0)
    .locator("span.color-fg-muted")
    .innerText();

  const thisWeek = await wrapper
    .locator("div.p-2")
    .nth(1)
    .locator("span.f2")
    .innerText();

  const thisWeekRange = await wrapper
    .locator("div.p-2")
    .nth(1)
    .locator("span.color-fg-muted")
    .innerText();

  const bestDay = await wrapper
    .locator("div.p-2")
    .nth(2)
    .locator("span.f2")
    .innerText();

  const bestDayDate = await wrapper
    .locator("div.p-2")
    .nth(2)
    .locator("span.color-fg-muted")
    .innerText();

  const averagePerDay = await wrapper.locator("p span.text-bold").innerText();

  await page.waitForSelector(
    'div.ic-contributions-wrapper:has(div:has(h5:text("Streaks")))',
  );

  const streakWrapper = page.locator(
    'div.ic-contributions-wrapper:has(div:has(h5:text("Streaks")))',
  );

  const streakLongestText = await streakWrapper
    .locator("div.p-2")
    .nth(0)
    .locator("span.f2")
    .innerText();
  const streakLongest = parseInt(streakLongestText, 10);
  const streakLongestRange = await streakWrapper
    .locator("div.p-2")
    .nth(0)
    .locator("span.color-fg-muted")
    .innerText();

  const streakCurrentText = await streakWrapper
    .locator("div.p-2")
    .nth(1)
    .locator("span.f2")
    .innerText();
  const streakCurrent = parseInt(streakCurrentText, 10);
  const streakCurrentRange = await streakWrapper
    .locator("div.p-2")
    .nth(1)
    .locator("span.color-fg-muted")
    .innerText();

  const stats: Stats = {
    username,
    contributions,
    totalRange,
    thisWeek,
    thisWeekRange,
    bestDay,
    bestDayDate,
    averagePerDay,
    streakLongest,
    streakLongestRange,
    streakCurrent,
    streakCurrentRange,
  };

  console.log(chalk.bold.cyan(`\n📊 GitHub Stats for ${stats.username}\n`));

  const avatar = await showAvatar(stats.username);
  console.log(avatar);

  console.log(buildTable(stats));
}
