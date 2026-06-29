// Run a Temporal workflow whose activities capture pages with Steel.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/temporal-browser-workflow-go

package main

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
	steel "github.com/steel-dev/steel-go"
	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"
)

const (
	defaultTemporalAddress = "localhost:7233"
	defaultNamespace       = "default"
	defaultTaskQueue       = "steel-browser-workflows-go"
)

var defaultURLs = []string{"https://news.ycombinator.com", "https://example.com"}

type BrowserWorkflowInput struct {
	URLs               []string `json:"urls,omitempty"`
	LinkLimit          int      `json:"linkLimit,omitempty"`
	FullPageScreenshot bool     `json:"fullPageScreenshot"`
}

type CapturePageInput struct {
	URL                string `json:"url"`
	LinkLimit          int    `json:"linkLimit"`
	FullPageScreenshot bool   `json:"fullPageScreenshot"`
}

type PageLink struct {
	Text string `json:"text"`
	URL  string `json:"url"`
}

type PageCapture struct {
	URL             string     `json:"url"`
	FinalURL        string     `json:"finalUrl"`
	Title           string     `json:"title"`
	StatusCode      int64      `json:"statusCode"`
	MarkdownPreview string     `json:"markdownPreview"`
	Links           []PageLink `json:"links"`
	ScreenshotURL   string     `json:"screenshotUrl"`
	ScreenshotPath  string     `json:"screenshotPath"`
	MarkdownPath    string     `json:"markdownPath"`
	DurationMs      int64      `json:"durationMs"`
}

type BrowserWorkflowResult struct {
	Pages     []PageCapture `json:"pages"`
	PageCount int           `json:"pageCount"`
}

func main() {
	_ = godotenv.Load()

	c, err := client.Dial(client.Options{
		HostPort:  envOr("TEMPORAL_ADDRESS", defaultTemporalAddress),
		Namespace: envOr("TEMPORAL_NAMESPACE", defaultNamespace),
	})
	if err != nil {
		fatal("connect temporal", err)
	}
	defer c.Close()

	taskQueue := envOr("TEMPORAL_TASK_QUEUE", defaultTaskQueue)
	w := worker.New(c, taskQueue, worker.Options{})
	w.RegisterWorkflow(BrowserWorkflow)
	w.RegisterActivity(CapturePage)

	workerErr := make(chan error, 1)
	go func() {
		workerErr <- w.Run(worker.InterruptCh())
	}()
	defer w.Stop()

	result, err := startWorkflow(context.Background(), c, taskQueue)
	if err != nil {
		fatal("run workflow", err)
	}

	fmt.Println("Workflow result:")
	fmt.Printf("%+v\n", result)

	select {
	case err := <-workerErr:
		if err != nil {
			fatal("worker stopped", err)
		}
	default:
	}
}

func BrowserWorkflow(ctx workflow.Context, input BrowserWorkflowInput) (BrowserWorkflowResult, error) {
	ctx = workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 2 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    5 * time.Second,
			BackoffCoefficient: 2,
			MaximumInterval:    30 * time.Second,
			MaximumAttempts:    3,
		},
	})

	urls := input.URLs
	if len(urls) == 0 {
		urls = defaultURLs
	}
	if len(urls) > 10 {
		urls = urls[:10]
	}

	linkLimit := clampLinkLimit(input.LinkLimit)
	pages := make([]PageCapture, 0, len(urls))
	for _, targetURL := range urls {
		var page PageCapture
		err := workflow.ExecuteActivity(ctx, CapturePage, CapturePageInput{
			URL:                targetURL,
			LinkLimit:          linkLimit,
			FullPageScreenshot: input.FullPageScreenshot,
		}).Get(ctx, &page)
		if err != nil {
			return BrowserWorkflowResult{}, err
		}
		pages = append(pages, page)
	}

	return BrowserWorkflowResult{Pages: pages, PageCount: len(pages)}, nil
}

func CapturePage(ctx context.Context, input CapturePageInput) (PageCapture, error) {
	started := time.Now()
	apiKey := os.Getenv("STEEL_API_KEY")
	if apiKey == "" {
		return PageCapture{}, fmt.Errorf("set STEEL_API_KEY in .env before running this recipe")
	}

	requestedURL, err := normalizeURL(input.URL)
	if err != nil {
		return PageCapture{}, err
	}

	artifactDir := filepath.Clean(envOr("ARTIFACT_DIR", "artifacts"))
	if err := os.MkdirAll(artifactDir, 0o755); err != nil {
		return PageCapture{}, err
	}

	steelClient := steel.NewClient(apiKey)
	scraped, err := steelClient.Scrape(ctx, steel.ClientScrapeParams{
		URL:    steel.F(requestedURL),
		Format: steel.F([]steel.ScrapeRequestFormatItem{steel.ScrapeRequestFormatItemMarkdown}),
	})
	if err != nil {
		return PageCapture{}, fmt.Errorf("scrape: %w", err)
	}

	shot, err := steelClient.Screenshot(ctx, steel.ClientScreenshotParams{
		URL:      steel.F(requestedURL),
		FullPage: steel.F(input.FullPageScreenshot),
	})
	if err != nil {
		return PageCapture{}, fmt.Errorf("screenshot: %w", err)
	}

	finalURL := firstNonEmpty(scraped.Metadata.URLSource, scraped.Metadata.Canonical, requestedURL)
	baseName := artifactBaseName(finalURL)
	screenshotPath := filepath.Join(artifactDir, baseName+".png")
	markdownPath := filepath.Join(artifactDir, baseName+".md")

	links := make([]PageLink, 0, min(input.LinkLimit, len(scraped.Links)))
	for _, link := range scraped.Links {
		if len(links) >= input.LinkLimit {
			break
		}
		text := firstNonEmpty(link.Text, link.URL)
		links = append(links, PageLink{Text: text, URL: link.URL})
	}

	page := PageCapture{
		URL:             requestedURL,
		FinalURL:        finalURL,
		Title:           firstNonEmpty(scraped.Metadata.Title, "(untitled)"),
		StatusCode:      scraped.Metadata.StatusCode,
		MarkdownPreview: markdownPreview(scraped.Content.Markdown),
		Links:           links,
		ScreenshotURL:   shot.URL,
		ScreenshotPath:  screenshotPath,
		MarkdownPath:    markdownPath,
		DurationMs:      time.Since(started).Milliseconds(),
	}

	if err := os.WriteFile(markdownPath, []byte(renderMarkdown(page, scraped.Content.Markdown)), 0o644); err != nil {
		return PageCapture{}, err
	}
	if err := download(ctx, shot.URL, screenshotPath); err != nil {
		return PageCapture{}, err
	}

	return page, nil
}

func startWorkflow(ctx context.Context, c client.Client, taskQueue string) (BrowserWorkflowResult, error) {
	input, err := buildWorkflowInput()
	if err != nil {
		return BrowserWorkflowResult{}, err
	}

	run, err := c.ExecuteWorkflow(ctx, client.StartWorkflowOptions{
		ID:        fmt.Sprintf("steel-browser-go-%d", time.Now().UnixMilli()),
		TaskQueue: taskQueue,
	}, BrowserWorkflow, input)
	if err != nil {
		return BrowserWorkflowResult{}, err
	}

	fmt.Printf("Started Temporal workflow: %s\n", run.GetID())
	fmt.Printf("Target URLs: %s\n", strings.Join(input.URLs, ", "))

	var result BrowserWorkflowResult
	if err := run.Get(ctx, &result); err != nil {
		return BrowserWorkflowResult{}, err
	}
	return result, nil
}

func buildWorkflowInput() (BrowserWorkflowInput, error) {
	linkLimit, err := readLinkLimit()
	if err != nil {
		return BrowserWorkflowInput{}, err
	}
	return BrowserWorkflowInput{
		URLs:               readURLs(),
		LinkLimit:          linkLimit,
		FullPageScreenshot: os.Getenv("FULL_PAGE_SCREENSHOT") != "false",
	}, nil
}

func readURLs() []string {
	raw := os.Getenv("TARGET_URLS")
	if raw == "" {
		return defaultURLs
	}
	parts := strings.Split(raw, ",")
	urls := make([]string, 0, len(parts))
	for _, part := range parts {
		if trimmed := strings.TrimSpace(part); trimmed != "" {
			urls = append(urls, trimmed)
		}
	}
	if len(urls) == 0 {
		return defaultURLs
	}
	return urls
}

func readLinkLimit() (int, error) {
	raw := envOr("LINK_LIMIT", "8")
	value, err := strconv.Atoi(raw)
	if err != nil || value < 1 || value > 25 {
		return 0, fmt.Errorf("LINK_LIMIT must be an integer between 1 and 25")
	}
	return value, nil
}

func clampLinkLimit(value int) int {
	if value < 1 {
		return 8
	}
	if value > 25 {
		return 25
	}
	return value
}

func normalizeURL(raw string) (string, error) {
	parsed, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if parsed.Scheme == "" || parsed.Host == "" {
		return "", fmt.Errorf("url must be absolute: %s", raw)
	}
	return parsed.String(), nil
}

func artifactBaseName(raw string) string {
	parsed, err := url.Parse(raw)
	host := "page"
	if err == nil && parsed.Host != "" {
		host = parsed.Host
	}
	host = strings.Map(func(r rune) rune {
		if r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z' || r >= '0' && r <= '9' || r == '-' {
			return r
		}
		return '-'
	}, host)
	return fmt.Sprintf("%s-%s", host, time.Now().UTC().Format("2006-01-02T15-04-05"))
}

func markdownPreview(markdown string) string {
	compact := strings.Join(strings.Fields(markdown), " ")
	runes := []rune(compact)
	if len(runes) > 800 {
		return string(runes[:800])
	}
	return compact
}

func renderMarkdown(page PageCapture, markdown string) string {
	var builder strings.Builder
	fmt.Fprintf(&builder, "# %s\n\n", page.Title)
	fmt.Fprintf(&builder, "Requested URL: %s\n", page.URL)
	fmt.Fprintf(&builder, "Final URL: %s\n", page.FinalURL)
	fmt.Fprintf(&builder, "HTTP status: %d\n", page.StatusCode)
	fmt.Fprintf(&builder, "Screenshot URL: %s\n\n", page.ScreenshotURL)
	builder.WriteString("## Markdown\n\n")
	if markdown == "" {
		builder.WriteString("(no markdown returned)\n\n")
	} else {
		builder.WriteString(markdown + "\n\n")
	}
	builder.WriteString("## Links\n\n")
	if len(page.Links) == 0 {
		builder.WriteString("(no links found)\n")
	} else {
		for i, link := range page.Links {
			fmt.Fprintf(&builder, "%d. [%s](%s)\n", i+1, link.Text, link.URL)
		}
	}
	return builder.String()
}

func download(ctx context.Context, src, dest string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, src, nil)
	if err != nil {
		return err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("download %s: HTTP %d", src, resp.StatusCode)
	}
	out, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer out.Close()
	_, err = io.Copy(out, resp.Body)
	return err
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func fatal(step string, err error) {
	fmt.Fprintf(os.Stderr, "%s: %v\n", step, err)
	os.Exit(1)
}
