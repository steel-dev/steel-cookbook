// A Genkit Go agent that exposes a Steel cloud browser as tools and runs a web task.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/genkit-go

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/chromedp/chromedp"
	"github.com/firebase/genkit/go/ai"
	"github.com/firebase/genkit/go/genkit"
	"github.com/firebase/genkit/go/plugins/anthropic"
	"github.com/joho/godotenv"
	"github.com/steel-dev/steel-go"
)

const model = "anthropic/claude-haiku-4-5"

func ptr[T any](v T) *T { return &v }

// browser holds the resources every tool shares. A single Steel session and one
// chromedp tab are reused across tool calls, so the agent navigates and extracts
// against the same live page.
type browser struct {
	client *steel.Client
	tab    context.Context
}

type navigateInput struct {
	URL string `json:"url" jsonschema_description:"Absolute URL to open, e.g. https://news.ycombinator.com."`
}

type fieldSpec struct {
	Name     string `json:"name"`
	Selector string `json:"selector" jsonschema_description:"CSS selector relative to the row. Empty string reads the row element itself."`
	Attr     string `json:"attr,omitempty" jsonschema_description:"Optional attribute to read instead of text, e.g. href."`
}

type extractInput struct {
	RowSelector string      `json:"rowSelector" jsonschema_description:"CSS selector matching each item, e.g. 'tr.athing'."`
	Fields      []fieldSpec `json:"fields" jsonschema_description:"One entry per column to pull out of each row."`
	Limit       int         `json:"limit,omitempty" jsonschema_description:"Maximum number of rows to return. Defaults to 10."`
}

type scrapeInput struct {
	URL string `json:"url" jsonschema_description:"Absolute URL to fetch as clean Markdown."`
}

// Story and Report are the agent's typed final output. WithOutputType ties the
// last turn to this schema, so resp.Output fills a Report or the model is asked
// to correct itself.
type Story struct {
	Rank   int    `json:"rank"`
	Title  string `json:"title"`
	URL    string `json:"url"`
	Points string `json:"points,omitempty"`
}

type Report struct {
	Summary string  `json:"summary" jsonschema_description:"One sentence on what the front page is about right now."`
	Stories []Story `json:"stories"`
}

func main() {
	_ = godotenv.Load()

	steelKey := os.Getenv("STEEL_API_KEY")
	if steelKey == "" {
		fmt.Println("Set STEEL_API_KEY in .env (https://app.steel.dev/settings/api-keys)")
		os.Exit(1)
	}
	if os.Getenv("ANTHROPIC_API_KEY") == "" {
		fmt.Println("Set ANTHROPIC_API_KEY in .env (https://console.anthropic.com/)")
		os.Exit(1)
	}

	fmt.Println("Steel + Genkit Go Starter")
	fmt.Println("============================================================")

	ctx := context.Background()
	client := steel.NewClient(steelKey)

	session, err := client.Sessions.Create(ctx, steel.SessionCreateParams{
		BlockAds:   ptr(true),
		Dimensions: &steel.SessionCreateParamsDimensions{Width: 1280, Height: 800},
	})
	if err != nil {
		fmt.Printf("Failed to create session: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Session: %s\n", session.SessionViewerURL)

	// Always release the session. Steel bills per session-minute, so a leaked
	// session keeps running until the default 5-minute timeout.
	defer func() {
		fmt.Println("\nReleasing Steel session...")
		if _, err := client.Sessions.Release(ctx, session.ID, steel.SessionReleaseParams{}); err != nil {
			fmt.Printf("Error releasing session: %v\n", err)
			return
		}
		fmt.Printf("Session released. Replay: %s\n", session.SessionViewerURL)
	}()

	// chromedp attaches to the exact websocket URL Steel returns. NoModifyURL
	// stops chromedp rewriting it, which would drop the apiKey query param.
	cdpURL := fmt.Sprintf("%s&apiKey=%s", session.WebsocketURL, steelKey)
	allocCtx, cancelAlloc := chromedp.NewRemoteAllocator(ctx, cdpURL, chromedp.NoModifyURL)
	defer cancelAlloc()
	tab, cancelTab := chromedp.NewContext(allocCtx)
	defer cancelTab()

	b := &browser{client: client, tab: tab}

	g := genkit.Init(ctx, genkit.WithPlugins(&anthropic.Anthropic{}))

	navigate := genkit.DefineTool(g, "navigate",
		"Open a URL in the live browser tab and wait for it to load. Returns the resolved title and URL.",
		func(tc *ai.ToolContext, in navigateInput) (string, error) {
			var title, url string
			start := time.Now()
			if err := chromedp.Run(b.tab,
				chromedp.Navigate(in.URL),
				chromedp.Title(&title),
				chromedp.Location(&url),
			); err != nil {
				return "", err
			}
			fmt.Printf("    navigate: %dms\n", time.Since(start).Milliseconds())
			return fmt.Sprintf("title=%q url=%s", title, url), nil
		},
	)

	extract := genkit.DefineTool(g, "extract",
		"Pull structured rows from the current tab with CSS selectors. Give one row selector plus a field per column. Returns a JSON array.",
		func(tc *ai.ToolContext, in extractInput) (string, error) {
			if in.Limit <= 0 {
				in.Limit = 10
			}
			// Run the whole extraction in one Evaluate. Serial CDP round-trips to
			// a cloud browser are ~200-300ms each, so N*M trips burn seconds; one
			// call is sub-second.
			fields, _ := json.Marshal(in.Fields)
			js := fmt.Sprintf(`(() => {
  const fields = %s;
  const rows = Array.from(document.querySelectorAll(%q)).slice(0, %d);
  return rows.map((row) => {
    const item = {};
    for (const f of fields) {
      const el = f.selector ? row.querySelector(f.selector) : row;
      if (!el) { item[f.name] = ""; continue; }
      item[f.name] = (f.attr ? (el.getAttribute(f.attr) || "")
                             : (el.innerText || el.textContent || "")).trim();
    }
    return item;
  });
})()`, string(fields), in.RowSelector, in.Limit)

			var items []map[string]string
			start := time.Now()
			if err := chromedp.Run(b.tab, chromedp.Evaluate(js, &items)); err != nil {
				return "", err
			}
			fmt.Printf("    extract: %dms (%d rows)\n", time.Since(start).Milliseconds(), len(items))
			out, _ := json.Marshal(items)
			return string(out), nil
		},
	)

	scrape := genkit.DefineTool(g, "scrape",
		"Fetch any URL as clean Markdown via Steel's scrape API. Use this to read an article or comment page without driving the tab.",
		func(tc *ai.ToolContext, in scrapeInput) (string, error) {
			start := time.Now()
			// ToolContext embeds context.Context, so it doubles as the request ctx.
			res, err := b.client.Scrape(tc, steel.ClientScrapeParams{
				URL:    in.URL,
				Format: &[]steel.ScrapeRequestFormatItem{steel.ScrapeRequestFormatItemMarkdown},
			})
			if err != nil {
				return "", err
			}
			fmt.Printf("    scrape: %dms\n", time.Since(start).Milliseconds())
			if res.Content.Markdown != nil {
				return *res.Content.Markdown, nil
			}
			return "(no markdown returned)", nil
		},
	)

	resp, err := genkit.Generate(ctx, g,
		ai.WithModelName(model),
		ai.WithSystem(
			"You operate a Steel cloud browser through tools. "+
				"Navigate to the page, then use extract with CSS selectors to read structured rows. "+
				"Reach for scrape when you need an article's text as Markdown. Do not invent data.",
		),
		ai.WithPrompt(
			"Go to https://news.ycombinator.com and return the top 5 stories. "+
				"For each give its rank, title, the destination URL, and the points as shown.",
		),
		ai.WithTools(navigate, extract, scrape),
		ai.WithMaxTurns(12),
		ai.WithOutputType(Report{}),
	)
	if err != nil {
		fmt.Printf("\nAgent error: %v\n", err)
		os.Exit(1)
	}

	var out Report
	if err := resp.Output(&out); err != nil {
		fmt.Printf("\nCould not parse final report: %v\n", err)
		fmt.Println(resp.Text())
		os.Exit(1)
	}

	fmt.Println("\nAgent finished.")
	pretty, _ := json.MarshalIndent(out, "", "  ")
	fmt.Println(string(pretty))
	if resp.Usage != nil {
		fmt.Printf("\ntokens: %d in, %d out\n", resp.Usage.InputTokens, resp.Usage.OutputTokens)
	}
}
