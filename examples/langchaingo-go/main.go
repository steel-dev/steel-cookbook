// A LangChainGo MRKL agent that reads the web through a Steel scrape tool.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/langchaingo-go

package main

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/joho/godotenv"
	steel "github.com/steel-dev/steel-go"
	"github.com/tmc/langchaingo/agents"
	"github.com/tmc/langchaingo/chains"
	"github.com/tmc/langchaingo/llms/anthropic"
	"github.com/tmc/langchaingo/tools"
)

const task = "Read https://news.ycombinator.com with the scrape tool, then list the " +
	"titles and points of the top 3 stories. Do not invent data."

type scrapeTool struct {
	client *steel.Client
}

func (t scrapeTool) Name() string { return "scrape" }

func (t scrapeTool) Description() string {
	return "Fetch a web page as clean Markdown. The input is one absolute URL, for example " +
		"https://example.com. Returns the page text. Call this before answering any question about a page."
}

func (t scrapeTool) Call(ctx context.Context, input string) (string, error) {
	url := strings.Trim(strings.TrimSpace(input), "\"'")

	resp, err := t.client.Scrape(ctx, steel.ClientScrapeParams{
		URL:    steel.F(url),
		Format: steel.F([]steel.ScrapeRequestFormatItem{steel.ScrapeRequestFormatItemMarkdown}),
	})
	if err != nil {
		return "", err
	}

	markdown := resp.Content.Markdown
	if runes := []rune(markdown); len(runes) > 6000 {
		markdown = string(runes[:6000])
	}
	if markdown == "" {
		return "(the page returned no readable text)", nil
	}
	return markdown, nil
}

func main() {
	_ = godotenv.Load()

	steelKey := os.Getenv("STEEL_API_KEY")
	anthropicKey := os.Getenv("ANTHROPIC_API_KEY")
	if steelKey == "" || anthropicKey == "" {
		fmt.Println("Set STEEL_API_KEY and ANTHROPIC_API_KEY in your environment or .env file.")
		fmt.Println("Steel: https://app.steel.dev/settings/api-keys")
		fmt.Println("Anthropic: https://console.anthropic.com/settings/keys")
		os.Exit(1)
	}

	if err := run(steelKey, anthropicKey); err != nil {
		fmt.Println("Error:", err)
		os.Exit(1)
	}
}

func run(steelKey, anthropicKey string) error {
	llm, err := anthropic.New(
		anthropic.WithModel("claude-sonnet-4-6"),
		anthropic.WithToken(anthropicKey),
	)
	if err != nil {
		return fmt.Errorf("anthropic: %w", err)
	}

	client := steel.NewClient(steelKey)

	executor, err := agents.Initialize(
		llm,
		[]tools.Tool{scrapeTool{client: client}},
		agents.ZeroShotReactDescription,
		agents.WithMaxIterations(5),
	)
	if err != nil {
		return fmt.Errorf("init agent: %w", err)
	}

	fmt.Println("Running LangChainGo agent...")
	answer, err := chains.Run(context.Background(), executor, task)
	if err != nil {
		return fmt.Errorf("run agent: %w", err)
	}

	fmt.Printf("\n%s\n", answer)
	return nil
}
