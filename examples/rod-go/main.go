// Connect go-rod to a Steel cloud browser over CDP and scrape quotes.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/rod-go
package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/go-rod/rod"
	steel "github.com/steel-dev/steel-go"
)

func ptr[T any](v T) *T { return &v }

func main() {
	apiKey := os.Getenv("STEEL_API_KEY")
	if apiKey == "" {
		fmt.Println("Set STEEL_API_KEY (get one at https://app.steel.dev/settings/api-keys)")
		os.Exit(1)
	}

	ctx := context.Background()
	client := steel.NewClient(apiKey)

	fmt.Println("Creating Steel session...")
	session, err := client.Sessions.Create(ctx, steel.SessionCreateParams{
		Dimensions: &steel.SessionCreateParamsDimensions{Width: 1280, Height: 800},
	})
	if err != nil {
		fmt.Printf("Failed to create session: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Session live at %s\n\n", session.SessionViewerURL)

	defer func() {
		fmt.Println("\nReleasing session...")
		if _, err := client.Sessions.Release(ctx, session.ID, steel.SessionReleaseParams{}); err != nil {
			fmt.Printf("Failed to release session: %v\n", err)
			return
		}
		fmt.Println("Session released")
	}()

	cdpURL := fmt.Sprintf("%s&apiKey=%s", session.WebsocketURL, apiKey)
	browser := rod.New().ControlURL(cdpURL).MustConnect()
	defer browser.MustClose()
	fmt.Println("Connected to browser via go-rod")

	fmt.Println("Scraping quotes.toscrape.com...")
	page := browser.MustPage("https://quotes.toscrape.com").MustWaitStable()

	cards := page.MustElements(".quote")
	fmt.Printf("\nFound %d quotes on the page:\n\n", len(cards))

	for i, card := range cards {
		if i >= 5 {
			break
		}
		text := strings.Trim(card.MustElement(".text").MustText(), "“”\"")
		author := card.MustElement(".author").MustText()

		tags := card.MustElements(".tag")
		labels := make([]string, 0, len(tags))
		for _, tag := range tags {
			labels = append(labels, tag.MustText())
		}

		fmt.Printf("%d. %s\n   - %s\n", i+1, text, author)
		if len(labels) > 0 {
			fmt.Printf("   tags: %s\n", strings.Join(labels, ", "))
		}
		fmt.Println()
	}

	page.MustScreenshot("quotes.png")
	fmt.Println("Saved screenshot to quotes.png")
	fmt.Println("Done!")
}
