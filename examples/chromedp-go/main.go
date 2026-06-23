// Connect to a Steel cloud browser over CDP with chromedp and scrape Hacker News.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/chromedp-go

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/chromedp/chromedp"
	"github.com/joho/godotenv"
	steel "github.com/steel-dev/steel-go"
)

type story struct {
	Title  string `json:"title"`
	Link   string `json:"link"`
	Points string `json:"points"`
}

const extractTopStories = `
(() => {
  const rows = document.querySelectorAll("tr.athing");
  const stories = [];
  for (let i = 0; i < 5 && i < rows.length; i++) {
    const titleEl = rows[i].querySelector(".titleline > a");
    const score = rows[i].nextElementSibling?.querySelector(".score");
    stories.push({
      title: titleEl?.textContent ?? "",
      link: titleEl?.getAttribute("href") ?? "",
      points: score?.textContent?.split(" ")[0] ?? "0",
    });
  }
  return JSON.stringify(stories);
})()
`

func main() {
	_ = godotenv.Load()

	apiKey := os.Getenv("STEEL_API_KEY")
	if apiKey == "" {
		fmt.Println("Set STEEL_API_KEY in your environment or .env file.")
		fmt.Println("Get a key at https://app.steel.dev/settings/api-keys")
		os.Exit(1)
	}

	if err := run(apiKey); err != nil {
		fmt.Println("Error:", err)
		os.Exit(1)
	}
}

func run(apiKey string) error {
	ctx := context.Background()
	client := steel.NewClient(apiKey)

	fmt.Println("Creating Steel session...")
	sess, err := client.Sessions.Create(ctx, steel.SessionCreateParams{})
	if err != nil {
		return fmt.Errorf("create session: %w", err)
	}
	fmt.Printf("Session created. Watch it live at %s\n", sess.SessionViewerURL)

	defer func() {
		fmt.Println("Releasing session...")
		if _, err := client.Sessions.Release(ctx, sess.ID, steel.SessionReleaseParams{}); err != nil {
			fmt.Println("Release failed:", err)
		}
	}()

	cdpURL := fmt.Sprintf("%s&apiKey=%s", sess.WebsocketURL, apiKey)

	allocCtx, cancelAlloc := chromedp.NewRemoteAllocator(ctx, cdpURL, chromedp.NoModifyURL)
	defer cancelAlloc()

	browserCtx, cancelBrowser := chromedp.NewContext(allocCtx)
	defer cancelBrowser()

	runCtx, cancelRun := context.WithTimeout(browserCtx, 60*time.Second)
	defer cancelRun()

	fmt.Println("Navigating to Hacker News...")
	var raw string
	var screenshot []byte
	err = chromedp.Run(runCtx,
		chromedp.Navigate("https://news.ycombinator.com"),
		chromedp.WaitVisible("tr.athing", chromedp.ByQuery),
		chromedp.Evaluate(extractTopStories, &raw),
		chromedp.FullScreenshot(&screenshot, 90),
	)
	if err != nil {
		return fmt.Errorf("run tasks: %w", err)
	}

	var stories []story
	if err := json.Unmarshal([]byte(raw), &stories); err != nil {
		return fmt.Errorf("parse stories: %w", err)
	}

	fmt.Println("\nTop 5 Hacker News Stories:")
	for i, s := range stories {
		fmt.Printf("\n%d. %s\n", i+1, s.Title)
		fmt.Printf("   Link: %s\n", s.Link)
		fmt.Printf("   Points: %s\n", s.Points)
	}

	const shotPath = "hackernews.png"
	if err := os.WriteFile(shotPath, screenshot, 0o644); err != nil {
		return fmt.Errorf("write screenshot: %w", err)
	}
	fmt.Printf("\nSaved screenshot to %s\n", shotPath)

	return nil
}
