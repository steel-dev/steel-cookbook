// A Google ADK Go agent that drives a Steel cloud browser as tools through the ADK runner loop.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/google-adk-go

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
	"github.com/joho/godotenv"
	"github.com/steel-dev/steel-go"

	"google.golang.org/adk/agent"
	"google.golang.org/adk/agent/llmagent"
	"google.golang.org/adk/model/gemini"
	"google.golang.org/adk/runner"
	"google.golang.org/adk/session"
	"google.golang.org/adk/tool"
	"google.golang.org/adk/tool/functiontool"
	"google.golang.org/genai"
)

const modelName = "gemini-2.5-flash"

const (
	appName = "steel-adk-go"
	userID  = "user"
)

func ptr[T any](v T) *T { return &v }

// browser holds the resources every tool shares. A single Steel session and one
// chromedp tab are reused across tool calls, so the agent navigates and extracts
// against the same live page.
type browser struct {
	client *steel.Client
	tab    context.Context
}

type navigateInput struct {
	URL string `json:"url" jsonschema:"Absolute URL to open, e.g. https://news.ycombinator.com."`
}

type navigateOutput struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

type fieldSpec struct {
	Name     string `json:"name"`
	Selector string `json:"selector" jsonschema:"CSS selector relative to the row. Empty string reads the row element itself."`
	Attr     string `json:"attr,omitempty" jsonschema:"Optional attribute to read instead of text, e.g. href."`
}

type extractInput struct {
	RowSelector string      `json:"rowSelector" jsonschema:"CSS selector matching each item, e.g. 'tr.athing'."`
	Fields      []fieldSpec `json:"fields" jsonschema:"One entry per column to pull out of each row."`
	Limit       int         `json:"limit,omitempty" jsonschema:"Maximum number of rows to return. Defaults to 10."`
}

type extractOutput struct {
	Rows []map[string]string `json:"rows"`
}

type scrapeInput struct {
	URL string `json:"url" jsonschema:"Absolute URL to fetch as clean Markdown."`
}

type scrapeOutput struct {
	Markdown string `json:"markdown"`
}

func main() {
	_ = godotenv.Load()

	steelKey := os.Getenv("STEEL_API_KEY")
	if steelKey == "" {
		fmt.Println("Set STEEL_API_KEY in .env (https://app.steel.dev/settings/api-keys)")
		os.Exit(1)
	}
	if os.Getenv("GOOGLE_API_KEY") == "" {
		fmt.Println("Set GOOGLE_API_KEY in .env (https://aistudio.google.com/apikey)")
		os.Exit(1)
	}

	fmt.Println("Steel + Google ADK Go Starter")
	fmt.Println("============================================================")

	ctx := context.Background()
	client := steel.NewClient(steelKey)

	steelSession, err := client.Sessions.Create(ctx, steel.SessionCreateParams{
		BlockAds:   ptr(true),
		Dimensions: &steel.Dimensions{Width: 1280, Height: 800},
	})
	if err != nil {
		fmt.Printf("Failed to create session: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Session: %s\n", steelSession.SessionViewerURL)

	// Always release the session. Steel bills per session-minute, so a leaked
	// session keeps running until the default 5-minute timeout.
	defer func() {
		fmt.Println("\nReleasing Steel session...")
		if _, err := client.Sessions.Release(ctx, steelSession.ID, steel.SessionReleaseParams{}); err != nil {
			fmt.Printf("Error releasing session: %v\n", err)
			return
		}
		fmt.Printf("Session released. Replay: %s\n", steelSession.SessionViewerURL)
	}()

	// chromedp attaches to the exact websocket URL Steel returns. NoModifyURL
	// stops chromedp rewriting it, which would drop the apiKey query param.
	cdpURL := fmt.Sprintf("%s&apiKey=%s", steelSession.WebsocketURL, steelKey)
	allocCtx, cancelAlloc := chromedp.NewRemoteAllocator(ctx, cdpURL, chromedp.NoModifyURL)
	defer cancelAlloc()
	tab, cancelTab := chromedp.NewContext(allocCtx)
	defer cancelTab()

	b := &browser{client: client, tab: tab}

	model, err := gemini.NewModel(ctx, modelName, &genai.ClientConfig{
		APIKey: os.Getenv("GOOGLE_API_KEY"),
	})
	if err != nil {
		fmt.Printf("Failed to create model: %v\n", err)
		os.Exit(1)
	}

	navigate, err := functiontool.New(functiontool.Config{
		Name:        "navigate",
		Description: "Open a URL in the live browser tab and wait for it to load. Returns the resolved title and URL.",
	}, func(tc agent.ToolContext, in navigateInput) (navigateOutput, error) {
		var title, url string
		start := time.Now()
		if err := chromedp.Run(b.tab,
			chromedp.Navigate(in.URL),
			chromedp.Title(&title),
			chromedp.Location(&url),
		); err != nil {
			return navigateOutput{}, err
		}
		fmt.Printf("    navigate: %dms\n", time.Since(start).Milliseconds())
		return navigateOutput{Title: title, URL: url}, nil
	})
	if err != nil {
		fmt.Printf("Failed to create navigate tool: %v\n", err)
		os.Exit(1)
	}

	extract, err := functiontool.New(functiontool.Config{
		Name:        "extract",
		Description: "Pull structured rows from the current tab with CSS selectors. Give one row selector plus a field per column. Returns a JSON array of rows.",
	}, func(tc agent.ToolContext, in extractInput) (extractOutput, error) {
		if in.Limit <= 0 {
			in.Limit = 10
		}
		// Run the whole extraction in one Evaluate. Serial CDP round-trips to a
		// cloud browser are ~200-300ms each, so N*M trips burn seconds; one call
		// is sub-second.
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

		var rows []map[string]string
		start := time.Now()
		if err := chromedp.Run(b.tab, chromedp.Evaluate(js, &rows)); err != nil {
			return extractOutput{}, err
		}
		fmt.Printf("    extract: %dms (%d rows)\n", time.Since(start).Milliseconds(), len(rows))
		return extractOutput{Rows: rows}, nil
	})
	if err != nil {
		fmt.Printf("Failed to create extract tool: %v\n", err)
		os.Exit(1)
	}

	scrape, err := functiontool.New(functiontool.Config{
		Name:        "scrape",
		Description: "Fetch any URL as clean Markdown via Steel's scrape API. Use this to read an article or comment page without driving the tab.",
	}, func(tc agent.ToolContext, in scrapeInput) (scrapeOutput, error) {
		start := time.Now()
		res, err := b.client.Scrape(tc, steel.ClientScrapeParams{
			URL:    in.URL,
			Format: &[]steel.ScrapeRequestFormatItem{steel.ScrapeRequestFormatItemMarkdown},
		})
		if err != nil {
			return scrapeOutput{}, err
		}
		fmt.Printf("    scrape: %dms\n", time.Since(start).Milliseconds())
		if res.Content.Markdown != nil {
			return scrapeOutput{Markdown: *res.Content.Markdown}, nil
		}
		return scrapeOutput{Markdown: "(no markdown returned)"}, nil
	})
	if err != nil {
		fmt.Printf("Failed to create scrape tool: %v\n", err)
		os.Exit(1)
	}

	a, err := llmagent.New(llmagent.Config{
		Name:        "browser_agent",
		Model:       model,
		Description: "Reads web pages by driving a Steel cloud browser through tools.",
		Instruction: "You operate a Steel cloud browser through tools. " +
			"Navigate to the page, then use extract with CSS selectors to read structured rows. " +
			"Reach for scrape when you need an article's text as Markdown. Do not invent data. " +
			"When you have the answer, reply with ONLY a JSON object of the shape " +
			`{"stories":[{"rank":1,"title":"...","url":"...","points":"..."}]} and no prose or code fences.`,
		Tools: []tool.Tool{navigate, extract, scrape},
	})
	if err != nil {
		fmt.Printf("Failed to create agent: %v\n", err)
		os.Exit(1)
	}

	sessionService := session.InMemoryService()
	adkSession, err := sessionService.Create(ctx, &session.CreateRequest{AppName: appName, UserID: userID})
	if err != nil {
		fmt.Printf("Failed to create ADK session: %v\n", err)
		os.Exit(1)
	}

	r, err := runner.New(runner.Config{AppName: appName, Agent: a, SessionService: sessionService})
	if err != nil {
		fmt.Printf("Failed to create runner: %v\n", err)
		os.Exit(1)
	}

	task := genai.NewContentFromText(
		"Go to https://news.ycombinator.com and return the top 5 stories. "+
			"For each give its rank, title, the destination URL, and the points as shown.",
		genai.RoleUser,
	)

	// The runner yields one event per agent step (tool calls, tool results, model
	// text). Keep the last non-empty text the agent emits; that is its final answer.
	var final string
	for event, err := range r.Run(ctx, userID, adkSession.Session.ID(), task, agent.RunConfig{
		StreamingMode: agent.StreamingModeNone,
	}) {
		if err != nil {
			fmt.Printf("\nAgent error: %v\n", err)
			os.Exit(1)
		}
		if event.Content == nil {
			continue
		}
		for _, part := range event.Content.Parts {
			if part.Text != "" {
				final = part.Text
			}
		}
	}

	fmt.Println("\nAgent finished.")
	fmt.Println(prettyJSON(final))
}

// prettyJSON re-indents the agent's JSON answer. The model occasionally wraps it
// in a ```json fence despite the instruction, so strip that before parsing.
func prettyJSON(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "```json")
	s = strings.TrimPrefix(s, "```")
	s = strings.TrimSuffix(s, "```")
	s = strings.TrimSpace(s)

	var v any
	if err := json.Unmarshal([]byte(s), &v); err != nil {
		return s
	}
	out, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return s
	}
	return string(out)
}
