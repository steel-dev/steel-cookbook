// A ByteDance Eino ReAct agent that researches the web through Steel's Scrape API.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/eino
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/cloudwego/eino-ext/components/model/claude"
	"github.com/cloudwego/eino/components/tool"
	"github.com/cloudwego/eino/components/tool/utils"
	"github.com/cloudwego/eino/compose"
	"github.com/cloudwego/eino/flow/agent/react"
	"github.com/cloudwego/eino/schema"
	"github.com/joho/godotenv"
	steel "github.com/steel-dev/steel-go"
)

const (
	model = "claude-sonnet-4-6"
	task  = "Research the front page of Hacker News (https://news.ycombinator.com). " +
		"Open the page, pick the three most interesting links, read each one, and " +
		"write a short briefing: for every story give its title, the URL you read, " +
		"and two sentences on why it matters. Do not invent stories that are not on the page."
)

type scrapePageArgs struct {
	URL string `json:"url" jsonschema:"required" jsonschema_description:"Absolute http(s) URL of the page to read."`
}

type extractLinksArgs struct {
	URL   string `json:"url" jsonschema:"required" jsonschema_description:"Absolute http(s) URL of the page to list links from."`
	Limit int    `json:"limit" jsonschema_description:"Maximum number of links to return. Defaults to 40."`
}

func main() {
	_ = godotenv.Load()

	steelKey := envOr("STEEL_API_KEY", "your-steel-api-key-here")
	anthropicKey := envOr("ANTHROPIC_API_KEY", "your-anthropic-api-key-here")
	if steelKey == "your-steel-api-key-here" {
		fmt.Println("Set STEEL_API_KEY in .env (https://app.steel.dev/settings/api-keys)")
		os.Exit(1)
	}
	if anthropicKey == "your-anthropic-api-key-here" {
		fmt.Println("Set ANTHROPIC_API_KEY in .env (https://console.anthropic.com/)")
		os.Exit(1)
	}

	ctx := context.Background()
	client := steel.NewClient(steelKey)

	agent, err := buildAgent(ctx, client, anthropicKey)
	if err != nil {
		fmt.Printf("Failed to build agent: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("Steel + Eino research agent")
	fmt.Println(strings.Repeat("=", 60))

	out, err := agent.Generate(ctx, []*schema.Message{schema.UserMessage(task)})
	if err != nil {
		fmt.Printf("Agent run failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("\nAgent finished.")
	fmt.Println(strings.Repeat("-", 60))
	fmt.Println(out.Content)
}

func buildAgent(ctx context.Context, client *steel.Client, anthropicKey string) (*react.Agent, error) {
	chatModel, err := claude.NewChatModel(ctx, &claude.Config{
		APIKey:    anthropicKey,
		Model:     model,
		MaxTokens: 2048,
	})
	if err != nil {
		return nil, fmt.Errorf("claude model: %w", err)
	}

	scrapeTool, err := utils.InferTool(
		"scrape_page",
		"Fetch a web page through Steel and return it as clean Markdown plus title and "+
			"description. Call this to read a page's contents before summarizing it.",
		scrapePage(client),
	)
	if err != nil {
		return nil, fmt.Errorf("scrape tool: %w", err)
	}

	linksTool, err := utils.InferTool(
		"extract_links",
		"List the outbound links on a web page (text and absolute URL). Call this on an "+
			"index page like a news front page to choose which stories to open next.",
		extractLinks(client),
	)
	if err != nil {
		return nil, fmt.Errorf("links tool: %w", err)
	}

	return react.NewAgent(ctx, &react.AgentConfig{
		ToolCallingModel: chatModel,
		ToolsConfig: compose.ToolsNodeConfig{
			Tools: []tool.BaseTool{scrapeTool, linksTool},
		},
		MaxStep: 24,
	})
}

func scrapePage(client *steel.Client) func(context.Context, scrapePageArgs) (string, error) {
	return func(ctx context.Context, args scrapePageArgs) (string, error) {
		t0 := time.Now()
		res, err := client.Scrape(ctx, steel.ClientScrapeParams{
			URL:    steel.F(args.URL),
			Format: steel.F([]steel.ScrapeRequestFormatItem{steel.ScrapeRequestFormatItemMarkdown}),
		})
		if err != nil {
			return "", fmt.Errorf("scrape %s: %w", args.URL, err)
		}

		markdown := truncate(res.Content.Markdown, 8000)
		fmt.Printf("    scrape_page %s -> %d chars in %dms\n", args.URL, len(markdown), time.Since(t0).Milliseconds())

		payload := map[string]any{
			"url":         args.URL,
			"title":       res.Metadata.Title,
			"description": res.Metadata.Description,
			"markdown":    markdown,
		}
		return encode(payload)
	}
}

func extractLinks(client *steel.Client) func(context.Context, extractLinksArgs) (string, error) {
	return func(ctx context.Context, args extractLinksArgs) (string, error) {
		limit := args.Limit
		if limit <= 0 {
			limit = 40
		}
		t0 := time.Now()
		res, err := client.Scrape(ctx, steel.ClientScrapeParams{
			URL:    steel.F(args.URL),
			Format: steel.F([]steel.ScrapeRequestFormatItem{steel.ScrapeRequestFormatItemMarkdown}),
		})
		if err != nil {
			return "", fmt.Errorf("scrape %s: %w", args.URL, err)
		}

		type link struct {
			Text string `json:"text"`
			URL  string `json:"url"`
		}
		links := make([]link, 0, limit)
		for _, l := range res.Links {
			text := strings.TrimSpace(l.Text)
			if text == "" || l.URL == "" {
				continue
			}
			links = append(links, link{Text: truncate(text, 120), URL: l.URL})
			if len(links) >= limit {
				break
			}
		}
		fmt.Printf("    extract_links %s -> %d links in %dms\n", args.URL, len(links), time.Since(t0).Milliseconds())

		return encode(map[string]any{"url": args.URL, "count": len(links), "links": links})
	}
}

func encode(v any) (string, error) {
	b, err := json.Marshal(v)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

func truncate(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max] + "..."
}

func envOr(key, fallback string) string {
	if v := strings.TrimSpace(os.Getenv(key)); v != "" {
		return v
	}
	return fallback
}
