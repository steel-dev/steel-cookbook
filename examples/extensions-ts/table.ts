import chalk from "chalk";
import Table from "cli-table3";
import terminalImage from "terminal-image";
import fetch from "node-fetch";

export type Stats = {
  username: string;
  contributions: string;
  totalRange: string;
  thisWeek: string;
  thisWeekRange: string;
  bestDay: string;
  bestDayDate: string;
  averagePerDay: string;
  streakLongest: number;
  streakLongestRange: string;
  streakCurrent: number;
  streakCurrentRange: string;
};

// Build a table for stats
export function buildTable(data: Stats): string {
  const table = new Table({
    head: [
      chalk.green("Stat"),
      chalk.blue("Value"),
      chalk.magenta("Range / Date"),
    ],
    style: { head: [], border: [] },
  });

  table.push(
    [
      chalk.bold("Contributions"),
      chalk.yellow(data.contributions),
      data.totalRange,
    ],
    [chalk.bold("This Week"), data.thisWeek, data.thisWeekRange],
    [chalk.bold("Best Day"), data.bestDay, data.bestDayDate],
    [chalk.bold("Average/Day"), data.averagePerDay, data.totalRange],
    [chalk.bold("Streak Longest"), data.streakLongest, data.streakLongestRange],
    [chalk.bold("Streak Current"), data.streakCurrent, data.streakCurrentRange],
  );

  return table.toString();
}

// Show GitHub avatar as an image
export async function showAvatar(username: string) {
  const res = await fetch(`https://github.com/${username}.png`);
  const buffer = Buffer.from(await res.arrayBuffer());
  return terminalImage.buffer(buffer, {
    width: "25%",
    height: "25%",
    preserveAspectRatio: true,
  });
}
