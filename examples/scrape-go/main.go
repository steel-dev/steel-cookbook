// Turn a URL into clean markdown, a screenshot, and a PDF with Steel's direct API. No browser library.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/scrape-go

package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
	steel "github.com/steel-dev/steel-go"
)

func ptr[T any](v T) *T { return &v }

func deref(s *string, fallback string) string {
	if s == nil || *s == "" {
		return fallback
	}
	return *s
}

func main() {
	_ = godotenv.Load()

	apiKey := os.Getenv("STEEL_API_KEY")
	if apiKey == "" {
		apiKey = "your-steel-api-key-here"
	}

	targetURL := os.Getenv("TARGET_URL")
	if targetURL == "" {
		targetURL = "https://news.ycombinator.com"
	}

	fmt.Println("Steel Scrape API (Go)")
	fmt.Println(strings.Repeat("=", 60))

	if apiKey == "your-steel-api-key-here" {
		fmt.Println("WARNING: Set STEEL_API_KEY in your environment or .env file.")
		fmt.Println("   Get your API key at: https://app.steel.dev/settings/api-keys")
		os.Exit(1)
	}

	if err := run(apiKey, targetURL); err != nil {
		fmt.Println("Error:", err)
		os.Exit(1)
	}
}

func run(apiKey, targetURL string) error {
	ctx := context.Background()
	client := steel.NewClient(apiKey)

	fmt.Printf("\nScraping %s to markdown...\n", targetURL)

	scraped, err := client.Scrape(ctx, steel.ClientScrapeParams{
		URL:    targetURL,
		Format: &[]steel.ScrapeRequestFormatItem{steel.ScrapeRequestFormatItemMarkdown},
	})
	if err != nil {
		return fmt.Errorf("scrape: %w", err)
	}

	markdown := deref(scraped.Content.Markdown, "")
	title := deref(scraped.Metadata.Title, "(no title)")

	fmt.Printf("HTTP %d | %s\n", scraped.Metadata.StatusCode, title)
	if desc := deref(scraped.Metadata.Description, ""); desc != "" {
		fmt.Printf("Description: %s\n", desc)
	}
	fmt.Printf("Links found: %d\n", len(scraped.Links))
	fmt.Printf("Markdown length: %d characters\n", len(markdown))

	fmt.Println("\n--- Markdown preview (first 500 chars) ---")
	preview := markdown
	if runes := []rune(preview); len(runes) > 500 {
		preview = string(runes[:500])
	}
	fmt.Println(preview)
	fmt.Println("--- end preview ---")

	fmt.Println("\nCapturing a full-page screenshot...")
	shot, err := client.Screenshot(ctx, steel.ClientScreenshotParams{
		URL:      targetURL,
		FullPage: ptr(true),
	})
	if err != nil {
		return fmt.Errorf("screenshot: %w", err)
	}
	fmt.Printf("Screenshot hosted at: %s\n", shot.URL)

	fmt.Println("\nRendering the page to PDF...")
	pdf, err := client.Pdf(ctx, steel.ClientPdfParams{
		URL: targetURL,
	})
	if err != nil {
		return fmt.Errorf("pdf: %w", err)
	}
	fmt.Printf("PDF hosted at: %s\n", pdf.URL)

	fmt.Println("\nDone. Feed the markdown straight into an LLM prompt.")
	return nil
}
