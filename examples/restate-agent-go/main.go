// Durable browser research session with Restate and Steel.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/restate-agent-go

package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"

	"github.com/joho/godotenv"
	restate "github.com/restatedev/sdk-go"
	"github.com/restatedev/sdk-go/server"
	steel "github.com/steel-dev/steel-go"
)

const (
	defaultQuestion = "Summarize the main stories on this page and cite the source URL."
	defaultSeedURL  = "https://news.ycombinator.com"
	defaultModel    = "gpt-5.5"
)

type ResearchSession struct{}

type ResearchRequest struct {
	Question string `json:"question,omitempty"`
	SeedURL  string `json:"seedUrl,omitempty"`
	MaxSteps int    `json:"maxSteps,omitempty"`
}

type Observation struct {
	URL        string `json:"url"`
	Title      string `json:"title"`
	StatusCode int64  `json:"statusCode"`
	Markdown   string `json:"markdown"`
}

type ResearchState struct {
	Observations []Observation `json:"observations"`
}

type ResearchResult struct {
	Answer       string   `json:"answer"`
	Sources      []string `json:"sources"`
	Observations int      `json:"observations"`
}

type PlanStep struct {
	Action string `json:"action"`
	URL    string `json:"url"`
	Reason string `json:"reason"`
	Answer string `json:"answer"`
}

type OpenAIResponse struct {
	OutputText string `json:"output_text"`
	Output     []struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
	} `json:"output"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error,omitempty"`
}

func main() {
	_ = godotenv.Load()

	if err := server.NewRestate().
		Bind(restate.Reflect(ResearchSession{})).
		Start(context.Background(), "0.0.0.0:9080"); err != nil {
		log.Fatal(err)
	}
}

func (ResearchSession) Answer(ctx restate.ObjectContext, req ResearchRequest) (ResearchResult, error) {
	if err := requireEnv(); err != nil {
		return ResearchResult{}, err
	}

	question := envOr("RESEARCH_QUESTION", defaultQuestion)
	if req.Question != "" {
		question = req.Question
	}

	seedURL := envOr("SEED_URL", defaultSeedURL)
	if req.SeedURL != "" {
		seedURL = req.SeedURL
	}
	seedURL = normalizeURL(seedURL)

	maxSteps := envInt("MAX_STEPS", 2)
	if req.MaxSteps > 0 {
		maxSteps = req.MaxSteps
	}
	if maxSteps < 1 {
		maxSteps = 1
	}
	if maxSteps > 4 {
		maxSteps = 4
	}

	state := ResearchState{}
	if stored, err := restate.Get[*ResearchState](ctx, "state"); err != nil {
		return ResearchResult{}, err
	} else if stored != nil {
		state = *stored
	}

	observations := append([]Observation(nil), state.Observations...)
	visited := map[string]bool{}
	for _, obs := range observations {
		visited[obs.URL] = true
	}

	for step := 0; step < maxSteps; step++ {
		stepNumber := step + 1
		plan, err := restate.Run(ctx, func(ctx restate.RunContext) (PlanStep, error) {
			return planNext(ctx, question, seedURL, observations)
		}, restate.WithName(fmt.Sprintf("plan step %d", stepNumber)))
		if err != nil {
			return ResearchResult{}, err
		}

		if plan.Action == "finish" && len(observations) > 0 {
			return durableFinalAnswer(ctx, question, observations)
		}

		nextURL := seedURL
		if plan.URL != "" {
			nextURL = normalizeURL(plan.URL)
		}

		if visited[nextURL] {
			return durableFinalAnswer(ctx, question, observations)
		}

		observation, err := restate.Run(ctx, func(ctx restate.RunContext) (Observation, error) {
			return scrapeURL(ctx, nextURL)
		}, restate.WithName("scrape "+nextURL))
		if err != nil {
			return ResearchResult{}, err
		}

		observations = append(observations, observation)
		visited[nextURL] = true
		restate.Set(ctx, "state", ResearchState{Observations: observations})
	}

	return durableFinalAnswer(ctx, question, observations)
}

func (ResearchSession) History(ctx restate.ObjectSharedContext) (ResearchState, error) {
	stored, err := restate.Get[*ResearchState](ctx, "state")
	if err != nil {
		return ResearchState{}, err
	}
	if stored == nil {
		return ResearchState{}, nil
	}
	return *stored, nil
}

func requireEnv() error {
	missing := []string{}
	if envOr("STEEL_API_KEY", "your-steel-api-key-here") == "your-steel-api-key-here" {
		missing = append(missing, "STEEL_API_KEY")
	}
	if envOr("OPENAI_API_KEY", "your-openai-api-key-here") == "your-openai-api-key-here" {
		missing = append(missing, "OPENAI_API_KEY")
	}
	if len(missing) > 0 {
		return fmt.Errorf("set %s in .env before invoking the service", strings.Join(missing, " and "))
	}
	return nil
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func envInt(key string, fallback int) int {
	if value := os.Getenv(key); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil {
			return parsed
		}
	}
	return fallback
}

func normalizeURL(raw string) string {
	parsed, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	parsed.Fragment = ""
	return parsed.String()
}

func trimMarkdown(markdown string) string {
	compact := strings.Join(strings.Fields(markdown), " ")
	runes := []rune(compact)
	if len(runes) > 5000 {
		return string(runes[:5000])
	}
	return compact
}

func observationDigest(observations []Observation) string {
	if len(observations) == 0 {
		return "No pages have been scraped yet."
	}

	var builder strings.Builder
	for i, obs := range observations {
		if i > 0 {
			builder.WriteString("\n\n")
		}
		fmt.Fprintf(&builder, "Observation %d\nURL: %s\nTitle: %s\nHTTP: %d\nMarkdown excerpt:\n%s",
			i+1, obs.URL, obs.Title, obs.StatusCode, obs.Markdown)
	}
	return builder.String()
}

func scrapeURL(ctx context.Context, targetURL string) (Observation, error) {
	client := steel.NewClient(envOr("STEEL_API_KEY", ""))
	scraped, err := client.Scrape(ctx, steel.ClientScrapeParams{
		URL:    steel.F(targetURL),
		Format: steel.F([]steel.ScrapeRequestFormatItem{steel.ScrapeRequestFormatItemMarkdown}),
	})
	if err != nil {
		return Observation{}, err
	}

	title := scraped.Metadata.Title
	if title == "" {
		title = "(untitled)"
	}

	return Observation{
		URL:        targetURL,
		Title:      title,
		StatusCode: scraped.Metadata.StatusCode,
		Markdown:   trimMarkdown(scraped.Content.Markdown),
	}, nil
}

func planNext(ctx context.Context, question, seedURL string, observations []Observation) (PlanStep, error) {
	prompt := fmt.Sprintf(`Plan the next browser research action.

You are controlling a durable browser research agent.

Question: %s
Seed URL: %s

Already scraped pages:
%s

Choose exactly one next action:
- scrape_url: use this when another page scrape is needed. Prefer the seed URL first.
- finish: use this once the observations are enough to answer.

Return JSON only. If you choose scrape_url, put the absolute URL in url and leave answer empty.
If you choose finish, leave url empty and put the final answer in answer.`, question, seedURL, observationDigest(observations))

	var step PlanStep
	err := callOpenAIJSON(ctx, prompt, "research_plan", map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"properties": map[string]any{
			"action": map[string]any{"type": "string", "enum": []string{"scrape_url", "finish"}},
			"url":    map[string]any{"type": "string"},
			"reason": map[string]any{"type": "string"},
			"answer": map[string]any{"type": "string"},
		},
		"required": []string{"action", "url", "reason", "answer"},
	}, &step)
	return step, err
}

func finalAnswer(ctx context.Context, question string, observations []Observation) (ResearchResult, error) {
	prompt := fmt.Sprintf(`Answer the research question using only the scraped observations.

Question: %s

Observations:
%s

Return a concise answer. Include source URLs from the observations.`, question, observationDigest(observations))

	var body struct {
		Answer  string   `json:"answer"`
		Sources []string `json:"sources"`
	}
	if err := callOpenAIJSON(ctx, prompt, "research_answer", map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"properties": map[string]any{
			"answer":  map[string]any{"type": "string"},
			"sources": map[string]any{"type": "array", "items": map[string]any{"type": "string"}},
		},
		"required": []string{"answer", "sources"},
	}, &body); err != nil {
		return ResearchResult{}, err
	}

	return ResearchResult{
		Answer:       body.Answer,
		Sources:      body.Sources,
		Observations: len(observations),
	}, nil
}

func durableFinalAnswer(ctx restate.ObjectContext, question string, observations []Observation) (ResearchResult, error) {
	return restate.Run(ctx, func(ctx restate.RunContext) (ResearchResult, error) {
		return finalAnswer(ctx, question, observations)
	}, restate.WithName("final answer"))
}

func callOpenAIJSON(ctx context.Context, prompt, schemaName string, schema map[string]any, out any) error {
	body := map[string]any{
		"model": envOr("OPENAI_MODEL", defaultModel),
		"input": prompt,
		"text": map[string]any{
			"format": map[string]any{
				"type":   "json_schema",
				"name":   schemaName,
				"strict": true,
				"schema": schema,
			},
		},
	}

	encoded, err := json.Marshal(body)
	if err != nil {
		return err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://api.openai.com/v1/responses", bytes.NewReader(encoded))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+envOr("OPENAI_API_KEY", ""))
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	var payload OpenAIResponse
	if err := json.Unmarshal(data, &payload); err != nil {
		return err
	}
	if resp.StatusCode >= 400 {
		if payload.Error != nil && payload.Error.Message != "" {
			return fmt.Errorf("OpenAI request failed: %s", payload.Error.Message)
		}
		return fmt.Errorf("OpenAI request failed: HTTP %d", resp.StatusCode)
	}

	text := payload.OutputText
	if text == "" {
		for _, item := range payload.Output {
			for _, part := range item.Content {
				if part.Text != "" {
					text = part.Text
					break
				}
			}
		}
	}
	if text == "" {
		return fmt.Errorf("OpenAI response did not contain text output")
	}
	return json.Unmarshal([]byte(text), out)
}
