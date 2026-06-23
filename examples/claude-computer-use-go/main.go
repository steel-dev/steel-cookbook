// Claude computer-use agent that drives a Steel cloud browser via the Sessions Computer endpoint.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/claude-computer-use-go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/joho/godotenv"
	"github.com/steel-dev/steel-go"
)

const (
	computerUseBeta = "computer-use-2025-11-24"
	maxIterations   = 50
	viewportWidth   = 1280
	viewportHeight  = 768
)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func ptr[T any](v T) *T { return &v }

func browserSystemPrompt() string {
	today := time.Now().Format("Monday, January 02, 2006")
	return fmt.Sprintf(`<BROWSER_ENV>
  - You control a headful Chromium browser running in a VM with internet access.
  - Chromium is already open; interact only through the "computer" tool (mouse, keyboard, scroll, screenshots).
  - Today's date is %s.
  </BROWSER_ENV>

  <BROWSER_CONTROL>
  - When viewing pages, zoom out or scroll so all relevant content is visible.
  - When typing into any input:
    * Clear it first with Ctrl+A, then Delete.
    * After submitting (pressing Enter or clicking a button), take an extra screenshot to confirm the result and move the mouse away.
  - Computer tool calls are slow; batch related actions into a single call whenever possible.
  - You may act on the user's behalf on sites where they are already authenticated.
  - Assume any required authentication/Auth Contexts are already configured before the task starts.
  - If the first screenshot is black:
    * Click near the center of the screen.
    * Take another screenshot.
  - Never click the browser address bar with the mouse. To navigate to a URL:
    * Press Ctrl+L to focus and select the address bar.
    * Type the full URL, then press Enter.
    * If you see any existing text (e.g., 'about:blank'), press Ctrl+L before typing so you replace it (never append).
  - Prefer typing into inputs on the page (e.g., a site's search box) rather than the browser address bar, unless entering a direct URL.
  </BROWSER_CONTROL>

  <TASK_EXECUTION>
  - You receive exactly one natural-language task and no further user feedback.
  - Do not ask the user clarifying questions; instead, make reasonable assumptions and proceed.
  - For complex tasks, quickly plan a short, ordered sequence of steps before acting.
  - Prefer minimal, high-signal actions that move directly toward the goal.
  - Keep your final response concise and focused on fulfilling the task (e.g., a brief summary of findings or results).
  </TASK_EXECUTION>`, today)
}

type computerAction struct {
	Action          string   `json:"action"`
	Text            string   `json:"text"`
	Coordinate      []int    `json:"coordinate"`
	ScrollDirection string   `json:"scroll_direction"`
	ScrollAmount    int      `json:"scroll_amount"`
	Duration        *float64 `json:"duration"`
	Key             string   `json:"key"`
}

type Agent struct {
	steelClient     *steel.Client
	anthropicClient anthropic.Client
	model           anthropic.Model
	messages        []anthropic.BetaMessageParam
	tools           []anthropic.BetaToolUnionParam
	session         *steel.Session
}

func NewAgent(steelKey, anthropicKey string) *Agent {
	return &Agent{
		steelClient:     steel.NewClient(steelKey),
		anthropicClient: anthropic.NewClient(option.WithAPIKey(anthropicKey)),
		model:           anthropic.ModelClaudeOpus4_7,
		tools: []anthropic.BetaToolUnionParam{
			anthropic.BetaToolUnionParamOfComputerUseTool20251124(viewportHeight, viewportWidth),
		},
	}
}

func (a *Agent) center() (int, int) {
	return viewportWidth / 2, viewportHeight / 2
}

func splitKeys(s string) []string {
	if s == "" {
		return nil
	}
	parts := strings.Split(s, "+")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		out = append(out, strings.TrimSpace(p))
	}
	return out
}

var keySynonyms = map[string]string{
	"ENTER": "Enter", "RETURN": "Enter", "ESC": "Escape", "ESCAPE": "Escape",
	"TAB": "Tab", "BACKSPACE": "Backspace", "BKSP": "Backspace", "DELETE": "Delete",
	"DEL": "Delete", "SPACE": "Space", "CTRL": "Control", "CONTROL": "Control",
	"ALT": "Alt", "SHIFT": "Shift", "META": "Meta", "SUPER": "Meta", "CMD": "Meta",
	"COMMAND": "Meta", "UP": "ArrowUp", "DOWN": "ArrowDown", "LEFT": "ArrowLeft",
	"RIGHT": "ArrowRight", "ARROWUP": "ArrowUp", "ARROWDOWN": "ArrowDown",
	"ARROWLEFT": "ArrowLeft", "ARROWRIGHT": "ArrowRight", "HOME": "Home", "END": "End",
	"PAGEUP": "PageUp", "PAGEDOWN": "PageDown", "INSERT": "Insert",
}

func normalizeKey(key string) string {
	k := strings.TrimSpace(key)
	if k == "" {
		return k
	}
	upper := strings.ToUpper(k)
	if v, ok := keySynonyms[upper]; ok {
		return v
	}
	if strings.HasPrefix(upper, "F") && len(upper) > 1 {
		if _, err := fmt.Sscanf(upper[1:], "%d", new(int)); err == nil {
			return upper
		}
	}
	return k
}

func normalizeKeys(keys []string) []string {
	out := make([]string, 0, len(keys))
	for _, k := range keys {
		out = append(out, normalizeKey(k))
	}
	return out
}

func (a *Agent) initialize(ctx context.Context) error {
	sess, err := a.steelClient.Sessions.Create(ctx, steel.SessionCreateParams{
		Dimensions: &steel.SessionCreateParamsDimensions{
			Width:  viewportWidth,
			Height: viewportHeight,
		},
		BlockAds: ptr(true),
		Timeout:  ptr(int64(900000)),
	})
	if err != nil {
		return err
	}
	a.session = sess
	fmt.Println("Steel Session created successfully!")
	fmt.Printf("View live session at: %s\n", sess.SessionViewerURL)
	return nil
}

func (a *Agent) cleanup(ctx context.Context) {
	if a.session == nil {
		return
	}
	fmt.Println("Releasing Steel session...")
	if _, err := a.steelClient.Sessions.Release(ctx, a.session.ID, steel.SessionReleaseParams{}); err != nil {
		fmt.Printf("Error releasing session: %v\n", err)
		return
	}
	fmt.Printf("Session completed. View replay at %s\n", a.session.SessionViewerURL)
}

func (a *Agent) computer(ctx context.Context, body steel.SessionComputerParams) (string, error) {
	resp, err := a.steelClient.Sessions.Computer(ctx, a.session.ID, body)
	if err != nil {
		return "", err
	}
	if resp.Base64Image != nil && *resp.Base64Image != "" {
		return *resp.Base64Image, nil
	}
	return a.takeScreenshot(ctx)
}

func (a *Agent) takeScreenshot(ctx context.Context) (string, error) {
	resp, err := a.steelClient.Sessions.Computer(ctx, a.session.ID, steel.SessionComputerParams{
		Action:                              "take_screenshot",
		ComputerActionRequestTakeScreenshot: &steel.ComputerActionRequestTakeScreenshot{Action: "take_screenshot"},
	})
	if err != nil {
		return "", err
	}
	if resp.Base64Image == nil || *resp.Base64Image == "" {
		return "", fmt.Errorf("no screenshot returned from Input API")
	}
	return *resp.Base64Image, nil
}

func (a *Agent) executeComputerAction(ctx context.Context, act computerAction) (string, error) {
	cx, cy := a.center()
	if len(act.Coordinate) == 2 {
		cx, cy = act.Coordinate[0], act.Coordinate[1]
	}
	coords := []float64{float64(cx), float64(cy)}
	shot := ptr(true)

	switch act.Action {
	case "mouse_move":
		req := &steel.ComputerActionRequestMoveMouse{
			Action:      "move_mouse",
			Coordinates: coords,
			Screenshot:  shot,
		}
		if hk := splitKeys(act.Key); len(hk) > 0 {
			req.HoldKeys = &hk
		}
		return a.computer(ctx, steel.SessionComputerParams{Action: "move_mouse", ComputerActionRequestMoveMouse: req})

	case "left_mouse_down", "left_mouse_up":
		clickType := steel.ComputerActionRequestVariant1ClickTypeDown
		if act.Action == "left_mouse_up" {
			clickType = steel.ComputerActionRequestVariant1ClickTypeUp
		}
		req := &steel.ComputerActionRequestClickMouse{
			Action:      "click_mouse",
			Button:      ptr(steel.ComputerActionRequestVariant1ButtonLeft),
			ClickType:   &clickType,
			Coordinates: &coords,
			Screenshot:  shot,
		}
		if hk := splitKeys(act.Key); len(hk) > 0 {
			req.HoldKeys = &hk
		}
		return a.computer(ctx, steel.SessionComputerParams{Action: "click_mouse", ComputerActionRequestClickMouse: req})

	case "left_click", "right_click", "middle_click", "double_click", "triple_click":
		button := steel.ComputerActionRequestVariant1ButtonLeft
		switch act.Action {
		case "right_click":
			button = steel.ComputerActionRequestVariant1ButtonRight
		case "middle_click":
			button = steel.ComputerActionRequestVariant1ButtonMiddle
		}
		req := &steel.ComputerActionRequestClickMouse{
			Action:      "click_mouse",
			Button:      &button,
			Coordinates: &coords,
			Screenshot:  shot,
		}
		switch act.Action {
		case "double_click":
			req.NumClicks = ptr(float64(2))
		case "triple_click":
			req.NumClicks = ptr(float64(3))
		}
		if hk := splitKeys(act.Key); len(hk) > 0 {
			req.HoldKeys = &hk
		}
		return a.computer(ctx, steel.SessionComputerParams{Action: "click_mouse", ComputerActionRequestClickMouse: req})

	case "left_click_drag":
		sx, sy := a.center()
		path := [][]float64{{float64(sx), float64(sy)}, coords}
		req := &steel.ComputerActionRequestDragMouse{
			Action:     "drag_mouse",
			Path:       path,
			Screenshot: shot,
		}
		if hk := splitKeys(act.Key); len(hk) > 0 {
			req.HoldKeys = &hk
		}
		return a.computer(ctx, steel.SessionComputerParams{Action: "drag_mouse", ComputerActionRequestDragMouse: req})

	case "scroll":
		const step = 100
		amount := act.ScrollAmount
		var dx, dy float64
		switch act.ScrollDirection {
		case "up":
			dy = float64(-step * amount)
		case "right":
			dx = float64(step * amount)
		case "left":
			dx = float64(-step * amount)
		default:
			dy = float64(step * amount)
		}
		req := &steel.ComputerActionRequestScroll{
			Action:      "scroll",
			Coordinates: &coords,
			DeltaX:      ptr(dx),
			DeltaY:      ptr(dy),
			Screenshot:  shot,
		}
		if hk := splitKeys(act.Text); len(hk) > 0 {
			req.HoldKeys = &hk
		}
		return a.computer(ctx, steel.SessionComputerParams{Action: "scroll", ComputerActionRequestScroll: req})

	case "key", "hold_key":
		keys := normalizeKeys(splitKeys(act.Text))
		if keys == nil {
			keys = []string{}
		}
		req := &steel.ComputerActionRequestPressKey{
			Action:     "press_key",
			Keys:       keys,
			Screenshot: shot,
		}
		if act.Action == "hold_key" && act.Duration != nil {
			req.Duration = act.Duration
		}
		return a.computer(ctx, steel.SessionComputerParams{Action: "press_key", ComputerActionRequestPressKey: req})

	case "type":
		req := &steel.ComputerActionRequestTypeText{
			Action:     "type_text",
			Text:       act.Text,
			Screenshot: shot,
		}
		if hk := splitKeys(act.Key); len(hk) > 0 {
			req.HoldKeys = &hk
		}
		return a.computer(ctx, steel.SessionComputerParams{Action: "type_text", ComputerActionRequestTypeText: req})

	case "wait":
		var d float64
		if act.Duration != nil {
			d = *act.Duration
		}
		req := &steel.ComputerActionRequestWait{
			Action:     "wait",
			Duration:   d,
			Screenshot: shot,
		}
		return a.computer(ctx, steel.SessionComputerParams{Action: "wait", ComputerActionRequestWait: req})

	case "screenshot":
		return a.takeScreenshot(ctx)

	case "cursor_position":
		if _, err := a.steelClient.Sessions.Computer(ctx, a.session.ID, steel.SessionComputerParams{
			Action:                                 "get_cursor_position",
			ComputerActionRequestGetCursorPosition: &steel.ComputerActionRequestGetCursorPosition{Action: "get_cursor_position"},
		}); err != nil {
			return "", err
		}
		return a.takeScreenshot(ctx)

	default:
		return "", fmt.Errorf("invalid action: %s", act.Action)
	}
}

func (a *Agent) processResponse(ctx context.Context, msg *anthropic.BetaMessage) (string, bool) {
	var responseText string
	var assistantBlocks []anthropic.BetaContentBlockParamUnion
	var toolResults []anthropic.BetaContentBlockParamUnion

	for _, block := range msg.Content {
		switch v := block.AsAny().(type) {
		case anthropic.BetaTextBlock:
			responseText += v.Text
			fmt.Println(v.Text)
			assistantBlocks = append(assistantBlocks, anthropic.NewBetaTextBlock(v.Text))

		case anthropic.BetaToolUseBlock:
			assistantBlocks = append(assistantBlocks, anthropic.NewBetaToolUseBlock(v.ID, v.Input, v.Name))
			if raw, err := json.Marshal(v.Input); err == nil {
				fmt.Printf("%s(%s)\n", v.Name, raw)
			}
			if v.Name != "computer" {
				continue
			}

			var act computerAction
			if raw, err := json.Marshal(v.Input); err == nil {
				_ = json.Unmarshal(raw, &act)
			}

			screenshot, err := a.executeComputerAction(ctx, act)
			if err != nil {
				fmt.Printf("Error executing %s: %v\n", act.Action, err)
				toolResults = append(toolResults, anthropic.NewBetaToolResultBlock(v.ID, fmt.Sprintf("Error executing %s: %v", act.Action, err), true))
				continue
			}
			toolResults = append(toolResults, screenshotResult(v.ID, screenshot))
		}
	}

	a.messages = append(a.messages, anthropic.BetaMessageParam{
		Role:    anthropic.BetaMessageParamRoleAssistant,
		Content: assistantBlocks,
	})
	if len(toolResults) > 0 {
		a.messages = append(a.messages, anthropic.NewBetaUserMessage(toolResults...))
	}

	return responseText, len(toolResults) > 0
}

func screenshotResult(toolUseID, base64PNG string) anthropic.BetaContentBlockParamUnion {
	return anthropic.BetaContentBlockParamUnion{
		OfToolResult: &anthropic.BetaToolResultBlockParam{
			ToolUseID: toolUseID,
			Content: []anthropic.BetaToolResultBlockParamContentUnion{
				{
					OfImage: &anthropic.BetaImageBlockParam{
						Source: anthropic.BetaImageBlockParamSourceUnion{
							OfBase64: &anthropic.BetaBase64ImageSourceParam{
								Data:      base64PNG,
								MediaType: anthropic.BetaBase64ImageSourceMediaTypeImagePNG,
							},
						},
					},
				},
			},
		},
	}
}

func wordOverlap(a, b string) float64 {
	aw := strings.Fields(strings.ToLower(a))
	bw := strings.Fields(strings.ToLower(b))
	if len(aw) == 0 || len(bw) == 0 {
		return 0
	}
	set := make(map[string]bool, len(bw))
	for _, w := range bw {
		set[w] = true
	}
	hits := 0
	for _, w := range aw {
		if set[w] {
			hits++
		}
	}
	denom := len(aw)
	if len(bw) > denom {
		denom = len(bw)
	}
	return float64(hits) / float64(denom)
}

func (a *Agent) executeTask(ctx context.Context, task string) (string, error) {
	a.messages = []anthropic.BetaMessageParam{
		anthropic.NewBetaUserMessage(anthropic.NewBetaTextBlock(browserSystemPrompt())),
		anthropic.NewBetaUserMessage(anthropic.NewBetaTextBlock(task)),
	}

	fmt.Printf("Executing task: %s\n", task)
	fmt.Println(strings.Repeat("=", 60))

	var recent []string
	detectRepetition := func(msg string) bool {
		if len(recent) < 2 {
			return false
		}
		for _, prev := range recent {
			if wordOverlap(msg, prev) > 0.8 {
				return true
			}
		}
		return false
	}

	var finalText string
	for iter := 0; iter < maxIterations; iter++ {
		resp, err := a.anthropicClient.Beta.Messages.New(ctx, anthropic.BetaMessageNewParams{
			Model:     a.model,
			MaxTokens: 4096,
			Messages:  a.messages,
			Tools:     a.tools,
			Betas:     []string{computerUseBeta},
		})
		if err != nil {
			return "", fmt.Errorf("error during task execution: %w", err)
		}

		text, hasActions := a.processResponse(ctx, resp)

		if !hasActions {
			fmt.Println("Task complete - no further actions requested")
			return text, nil
		}

		if text != "" {
			if detectRepetition(text) {
				fmt.Println("Repetition detected - stopping execution")
				return text, nil
			}
			recent = append(recent, text)
			if len(recent) > 3 {
				recent = recent[1:]
			}
		}
		finalText = text
	}

	fmt.Printf("Task execution stopped after %d iterations\n", maxIterations)
	if finalText == "" {
		finalText = "Task execution completed (no final message)"
	}
	return finalText, nil
}

func main() {
	_ = godotenv.Overload()

	steelKey := envOr("STEEL_API_KEY", "your-steel-api-key-here")
	anthropicKey := envOr("ANTHROPIC_API_KEY", "your-anthropic-api-key-here")
	task := envOr("TASK", "Go to Steel.dev and find the latest news")

	fmt.Println("Steel + Claude Computer Use Assistant")
	fmt.Println(strings.Repeat("=", 60))

	if steelKey == "your-steel-api-key-here" {
		fmt.Println("WARNING: set STEEL_API_KEY in your environment or .env file")
		fmt.Println("   Get your API key at: https://app.steel.dev/settings/api-keys")
		os.Exit(1)
	}
	if anthropicKey == "your-anthropic-api-key-here" {
		fmt.Println("WARNING: set ANTHROPIC_API_KEY in your environment or .env file")
		fmt.Println("   Get your API key at: https://console.anthropic.com/")
		os.Exit(1)
	}

	ctx := context.Background()
	agent := NewAgent(steelKey, anthropicKey)

	fmt.Println("\nStarting Steel session...")
	if err := agent.initialize(ctx); err != nil {
		fmt.Printf("Failed to start Steel session: %v\n", err)
		fmt.Println("Please check your STEEL_API_KEY and internet connection.")
		os.Exit(1)
	}
	defer agent.cleanup(ctx)

	start := time.Now()
	result, err := agent.executeTask(ctx, task)
	if err != nil {
		fmt.Printf("Task execution failed: %v\n", err)
		os.Exit(1)
	}

	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("TASK EXECUTION COMPLETED")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Printf("Duration: %.1f seconds\n", time.Since(start).Seconds())
	fmt.Printf("Task: %s\n", task)
	fmt.Printf("Result:\n%s\n", result)
	fmt.Println(strings.Repeat("=", 60))
}
