// Claude computer-use agent that drives a Steel cloud browser via the Sessions Computer endpoint.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/claude-computer-use-go
package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/anthropics/anthropic-sdk-go"
	"github.com/anthropics/anthropic-sdk-go/option"
	"github.com/joho/godotenv"
	"github.com/steel-dev/sdk/go"
	steeloption "github.com/steel-dev/sdk/go/option"
)

const (
	maxIterations  = 50
	viewportWidth  = 1280
	viewportHeight = 768
	notExecuted    = "Not executed: an earlier computer action in this turn failed."
)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func browserSystemPrompt() string {
	today := time.Now().Format("Monday, January 02, 2006")
	return fmt.Sprintf(`<BROWSER_ENV>
  - You control a headful Chromium browser running in a VM with internet access.
  - Chromium is already open; interact only through the computer tools (mouse, keyboard, scroll, screenshots).
  - Today's date is %s.
  </BROWSER_ENV>

  <BROWSER_CONTROL>
  - When viewing pages, zoom out or scroll so all relevant content is visible.
  - When typing into any input:
    * Clear it first with Ctrl+A, then Delete.
    * After submitting (pressing Enter or clicking a button), take an extra screenshot to confirm the result and move the mouse away.
  - Each turn is slow; send related actions together in one turn whenever possible.
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

type computerInput struct {
	Coordinate      []float64 `json:"coordinate"`
	StartCoordinate []float64 `json:"start_coordinate"`
	Text            string    `json:"text"`
	ScrollDirection string    `json:"scroll_direction"`
	ScrollAmount    int       `json:"scroll_amount"`
	Duration        *float64  `json:"duration"`
	Repeat          int       `json:"repeat"`
}

type Agent struct {
	steelClient     *steel.Client
	anthropicClient anthropic.Client
	model           anthropic.Model
	messages        []anthropic.MessageParam
	tools           []anthropic.ToolUnionParam
	session         *steel.Session
	cursor          []float64
}

func NewAgent(steelKey, anthropicKey string) *Agent {
	off := anthropic.Bool(false)
	return &Agent{
		steelClient:     steel.NewClient(steeloption.WithSteelAPIKey(steelKey)),
		anthropicClient: anthropic.NewClient(option.WithAPIKey(anthropicKey)),
		model:           anthropic.ModelClaudeOpus5_5,
		tools: []anthropic.ToolUnionParam{{
			OfComputerToolset20260801: &anthropic.ComputerToolset20260801Param{
				Configs: anthropic.ComputerToolsetConfigsParam{
					Zoom:          anthropic.ComputerZoomConfigParam{Enabled: off},
					TripleClick:   anthropic.ComputerTripleClickConfigParam{Enabled: off},
					LeftMouseDown: anthropic.ComputerLeftMouseDownConfigParam{Enabled: off},
					LeftMouseUp:   anthropic.ComputerLeftMouseUpConfigParam{Enabled: off},
					HoldKey:       anthropic.ComputerHoldKeyConfigParam{Enabled: off},
				},
			},
		}},
		cursor: []float64{viewportWidth / 2, viewportHeight / 2},
	}
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
	sess, err := a.steelClient.Sessions.New(ctx, steel.SessionNewParams{
		Dimensions: steel.F(steel.SessionNewParamsDimensions{
			Width:  steel.F(int64(viewportWidth)),
			Height: steel.F(int64(viewportHeight)),
		}),
		BlockAds: steel.F(true),
		Timeout:  steel.F(int64(900000)),
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
	if _, err := a.steelClient.Sessions.Release(ctx, a.session.ID); err != nil {
		fmt.Printf("Error releasing session: %v\n", err)
		return
	}
	fmt.Printf("Session completed. View replay at %s\n", a.session.SessionViewerURL)
}

func (a *Agent) act(ctx context.Context, body steel.SessionComputerParamsBodyUnion) (*steel.SessionComputerResponse, error) {
	resp, err := a.steelClient.Sessions.Computer(ctx, a.session.ID, steel.SessionComputerParams{Body: body})
	if err != nil {
		return nil, err
	}
	if resp.Error != "" {
		return nil, errors.New(resp.Error)
	}
	return resp, nil
}

func (a *Agent) screenshot(ctx context.Context) (anthropic.ToolResultBlockParamContentUnion, error) {
	resp, err := a.act(ctx, steel.SessionComputerParamsBodyTakeScreenshot{
		Action: steel.F(steel.SessionComputerParamsBodyTakeScreenshotActionTakeScreenshot),
	})
	if err != nil {
		return anthropic.ToolResultBlockParamContentUnion{}, err
	}
	if resp.Base64Image == "" {
		return anthropic.ToolResultBlockParamContentUnion{}, errors.New("no screenshot in the Input API response")
	}
	return anthropic.ToolResultBlockParamContentUnion{
		OfImage: &anthropic.ImageBlockParam{
			Source: anthropic.ImageBlockParamSourceUnion{
				OfBase64: &anthropic.Base64ImageSourceParam{
					Data:      resp.Base64Image,
					MediaType: anthropic.Base64ImageSourceMediaTypeImagePNG,
				},
			},
		},
	}, nil
}

func (a *Agent) point(coordinate []float64) []float64 {
	if len(coordinate) == 2 {
		a.cursor = []float64{coordinate[0], coordinate[1]}
	}
	return a.cursor
}

func (a *Agent) runMember(ctx context.Context, name string, in computerInput) (string, error) {
	var body steel.SessionComputerParamsBodyUnion
	times := 1

	switch name {
	case "mouse_move":
		body = steel.SessionComputerParamsBodyMoveMouse{
			Action:      steel.F(steel.SessionComputerParamsBodyMoveMouseActionMoveMouse),
			Coordinates: steel.F(a.point(in.Coordinate)),
		}

	case "left_click", "right_click", "middle_click", "double_click":
		if in.Text != "" {
			return "", errors.New("holding modifier keys during a click is not supported")
		}
		button := steel.SessionComputerParamsBodyClickMouseButtonLeft
		switch name {
		case "right_click":
			button = steel.SessionComputerParamsBodyClickMouseButtonRight
		case "middle_click":
			button = steel.SessionComputerParamsBodyClickMouseButtonMiddle
		}
		req := steel.SessionComputerParamsBodyClickMouse{
			Action:      steel.F(steel.SessionComputerParamsBodyClickMouseActionClickMouse),
			Button:      steel.F(button),
			Coordinates: steel.F(a.point(in.Coordinate)),
		}
		if name == "double_click" {
			req.NumClicks = steel.F(float64(2))
		}
		body = req

	case "left_click_drag":
		if len(in.StartCoordinate) != 2 || len(in.Coordinate) != 2 {
			return "", errors.New("left_click_drag needs start_coordinate and coordinate")
		}
		body = steel.SessionComputerParamsBodyDragMouse{
			Action: steel.F(steel.SessionComputerParamsBodyDragMouseActionDragMouse),
			Path:   steel.F([][]float64{in.StartCoordinate, in.Coordinate}),
		}
		a.point(in.Coordinate)

	case "scroll":
		if in.Text != "" {
			return "", errors.New("holding modifier keys during a scroll is not supported")
		}
		var dx, dy float64
		switch in.ScrollDirection {
		case "up":
			dy = -100
		case "left":
			dx = -100
		case "right":
			dx = 100
		default:
			dy = 100
		}
		body = steel.SessionComputerParamsBodyScroll{
			Action:      steel.F(steel.SessionComputerParamsBodyScrollActionScroll),
			Coordinates: steel.F(a.point(in.Coordinate)),
			DeltaX:      steel.F(dx),
			DeltaY:      steel.F(dy),
		}
		times = max(1, in.ScrollAmount)

	case "type":
		body = steel.SessionComputerParamsBodyTypeText{
			Action: steel.F(steel.SessionComputerParamsBodyTypeTextActionTypeText),
			Text:   steel.F(in.Text),
		}

	case "key":
		keys := normalizeKeys(splitKeys(in.Text))
		if keys == nil {
			keys = []string{}
		}
		body = steel.SessionComputerParamsBodyPressKey{
			Action: steel.F(steel.SessionComputerParamsBodyPressKeyActionPressKey),
			Keys:   steel.F(keys),
		}
		times = max(1, in.Repeat)

	case "wait":
		d := 1.0
		if in.Duration != nil {
			d = *in.Duration
		}
		body = steel.SessionComputerParamsBodyWait{
			Action:   steel.F(steel.SessionComputerParamsBodyWaitActionWait),
			Duration: steel.F(d),
		}

	case "cursor_position":
		resp, err := a.act(ctx, steel.SessionComputerParamsBodyGetCursorPosition{
			Action: steel.F(steel.SessionComputerParamsBodyGetCursorPositionActionGetCursorPosition),
		})
		if err != nil {
			return "", err
		}
		if resp.Output != "" {
			return resp.Output, nil
		}
		return fmt.Sprintf("%.0f, %.0f", a.cursor[0], a.cursor[1]), nil

	default:
		return "", fmt.Errorf("unsupported action: %s", name)
	}

	for i := 0; i < times; i++ {
		if _, err := a.act(ctx, body); err != nil {
			return "", err
		}
	}
	return "OK", nil
}

func textContent(text string) []anthropic.ToolResultBlockParamContentUnion {
	return []anthropic.ToolResultBlockParamContentUnion{{OfText: &anthropic.TextBlockParam{Text: text}}}
}

func (a *Agent) runCall(ctx context.Context, call anthropic.ToolUseBlock) ([]anthropic.ToolResultBlockParamContentUnion, error) {
	if call.Name == "screenshot" {
		shot, err := a.screenshot(ctx)
		if err != nil {
			return nil, err
		}
		return []anthropic.ToolResultBlockParamContentUnion{shot}, nil
	}
	var in computerInput
	if err := json.Unmarshal(call.Input, &in); err != nil {
		return nil, err
	}
	out, err := a.runMember(ctx, call.Name, in)
	if err != nil {
		return nil, err
	}
	return textContent(out), nil
}

func (a *Agent) processResponse(ctx context.Context, msg *anthropic.Message) (string, bool, error) {
	a.messages = append(a.messages, msg.ToParam())

	var responseText string
	var calls []anthropic.ToolUseBlock
	for _, block := range msg.Content {
		switch v := block.AsAny().(type) {
		case anthropic.TextBlock:
			responseText += v.Text
			fmt.Println(v.Text)
		case anthropic.ToolUseBlock:
			if v.ToolsetName == "computer" {
				calls = append(calls, v)
			}
		}
	}

	if len(calls) == 0 {
		return responseText, false, nil
	}

	results := make([]anthropic.ContentBlockParamUnion, 0, len(calls))
	failed := false
	for _, call := range calls {
		fmt.Printf("%s(%s)\n", call.Name, call.Input)
		result := anthropic.ToolResultBlockParam{
			ToolUseID:   call.ID,
			ToolsetName: anthropic.String("computer"),
		}
		if failed {
			result.Content = textContent(notExecuted)
			result.IsError = anthropic.Bool(true)
		} else if content, err := a.runCall(ctx, call); err != nil {
			fmt.Printf("Error executing %s: %v\n", call.Name, err)
			result.Content = textContent("Error: " + err.Error())
			result.IsError = anthropic.Bool(true)
			failed = true
		} else {
			result.Content = content
		}
		results = append(results, anthropic.ContentBlockParamUnion{OfToolResult: &result})
	}

	if !failed && calls[len(calls)-1].Name != "screenshot" {
		shot, err := a.screenshot(ctx)
		if err != nil {
			return "", false, err
		}
		last := results[len(results)-1].OfToolResult
		last.Content = append(last.Content, shot)
	}

	a.messages = append(a.messages, anthropic.NewUserMessage(results...))

	return responseText, true, nil
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
	a.messages = []anthropic.MessageParam{
		anthropic.NewUserMessage(anthropic.NewTextBlock(task)),
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
		resp, err := a.anthropicClient.Messages.New(ctx, anthropic.MessageNewParams{
			Model:     a.model,
			MaxTokens: 16000,
			System:    []anthropic.TextBlockParam{{Text: browserSystemPrompt()}},
			Messages:  a.messages,
			Tools:     a.tools,
		})
		if err != nil {
			return "", fmt.Errorf("error during task execution: %w", err)
		}

		if resp.StopReason == anthropic.StopReasonRefusal {
			fmt.Println("Claude declined to continue this task")
			return "Claude declined to continue this task", nil
		}

		text, hasActions, err := a.processResponse(ctx, resp)
		if err != nil {
			return "", fmt.Errorf("error during task execution: %w", err)
		}

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
