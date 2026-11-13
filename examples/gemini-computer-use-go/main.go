// Gemini computer-use agent that drives a Steel cloud browser via the Sessions Computer endpoint.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/gemini-computer-use-go
package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/joho/godotenv"
	"github.com/steel-dev/sdk/go"
	"github.com/steel-dev/sdk/go/option"
	"google.golang.org/genai"
)

const (
	model          = "gemini-4-hydrogen"
	maxIterations  = 50
	maxCoordinate  = 1000
	viewportWidth  = 1440
	viewportHeight = 900
)

var unsupportedActions = []string{"triple_click", "mouse_down", "mouse_up", "key_down", "key_up"}

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
  - Chromium is already open; interact only through computer use actions (mouse, keyboard, scroll, screenshots).
  - Today's date is %s.
  </BROWSER_ENV>

  <BROWSER_CONTROL>
  - When viewing pages, zoom out or scroll so all relevant content is visible.
  - When typing into any input:
    * Clear it first with Ctrl+A, then Delete.
    * After submitting (pressing Enter or clicking a button), wait for the page to load.
  - Computer tool calls are slow; batch related actions into a single call whenever possible.
  - You may act on the user's behalf on sites where they are already authenticated.
  - Assume any required authentication/Auth Contexts are already configured before the task starts.
  - If the first screenshot is black:
    * Click near the center of the screen.
    * Take another screenshot.
  </BROWSER_CONTROL>

  <TASK_EXECUTION>
  - You receive exactly one natural-language task and no further user feedback.
  - Do not ask the user clarifying questions; instead, make reasonable assumptions and proceed.
  - For complex tasks, quickly plan a short, ordered sequence of steps before acting.
  - Prefer minimal, high-signal actions that move directly toward the goal.
  - Keep your final response concise and focused on fulfilling the task (e.g., a brief summary of findings or results).
  </TASK_EXECUTION>`, today)
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

func splitKeys(s string) []string {
	if s == "" {
		return nil
	}
	out := make([]string, 0)
	for _, p := range strings.Split(s, "+") {
		if t := strings.TrimSpace(p); t != "" {
			out = append(out, t)
		}
	}
	return out
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
		if _, err := strconv.Atoi(upper[1:]); err == nil {
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

func argInt(args map[string]any, key string, fallback int) int {
	if v, ok := args[key]; ok {
		if f, ok := v.(float64); ok {
			return int(f)
		}
	}
	return fallback
}

func argString(args map[string]any, key, fallback string) string {
	if v, ok := args[key]; ok {
		if s, ok := v.(string); ok {
			return s
		}
	}
	return fallback
}

func argStrings(args map[string]any, key string) []string {
	switch v := args[key].(type) {
	case []any:
		out := make([]string, 0, len(v))
		for _, item := range v {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	case string:
		return splitKeys(v)
	}
	return nil
}

func argBool(args map[string]any, key string, fallback bool) bool {
	if v, ok := args[key]; ok {
		if b, ok := v.(bool); ok {
			return b
		}
	}
	return fallback
}

type Agent struct {
	genai      *genai.Client
	steel      *steel.Client
	config     *genai.GenerateContentConfig
	contents   []*genai.Content
	session    *steel.Session
	currentURL string
}

func NewAgent(ctx context.Context, steelKey, geminiKey string) (*Agent, error) {
	gc, err := genai.NewClient(ctx, &genai.ClientConfig{
		APIKey:  geminiKey,
		Backend: genai.BackendGeminiAPI,
	})
	if err != nil {
		return nil, err
	}
	return &Agent{
		genai: gc,
		steel: steel.NewClient(option.WithSteelAPIKey(steelKey)),
		config: &genai.GenerateContentConfig{
			Tools: []*genai.Tool{{
				ComputerUse: &genai.ComputerUse{
					Environment:                 genai.EnvironmentBrowser,
					ExcludedPredefinedFunctions: unsupportedActions,
				},
			}},
			ThinkingConfig: &genai.ThinkingConfig{ThinkingLevel: genai.ThinkingLevelLow},
		},
		currentURL: "about:blank",
	}, nil
}

func (a *Agent) denormalizeX(x int) float64 {
	return float64(int(float64(x) / maxCoordinate * viewportWidth))
}

func (a *Agent) denormalizeY(y int) float64 {
	return float64(int(float64(y) / maxCoordinate * viewportHeight))
}

func (a *Agent) center() (float64, float64) {
	return float64(viewportWidth / 2), float64(viewportHeight / 2)
}

func (a *Agent) point(args map[string]any) []float64 {
	x, y := a.center()
	if _, ok := args["x"]; ok {
		x = a.denormalizeX(argInt(args, "x", 0))
	}
	if _, ok := args["y"]; ok {
		y = a.denormalizeY(argInt(args, "y", 0))
	}
	return []float64{x, y}
}

func (a *Agent) initialize(ctx context.Context) error {
	sess, err := a.steel.Sessions.New(ctx, steel.SessionNewParams{
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
	if _, err := a.steel.Sessions.Release(ctx, a.session.ID); err != nil {
		fmt.Printf("Error releasing session: %v\n", err)
		return
	}
	fmt.Printf("Session completed. View replay at %s\n", a.session.SessionViewerURL)
}

func (a *Agent) run(ctx context.Context, body steel.SessionComputerParams) (string, error) {
	resp, err := a.steel.Sessions.Computer(ctx, a.session.ID, body)
	if err != nil {
		return "", err
	}
	if resp.Base64Image != "" {
		return resp.Base64Image, nil
	}
	return a.takeScreenshot(ctx)
}

func (a *Agent) takeScreenshot(ctx context.Context) (string, error) {
	resp, err := a.steel.Sessions.Computer(ctx, a.session.ID, steel.SessionComputerParams{
		Body: steel.SessionComputerParamsBodyTakeScreenshot{Action: steel.F(steel.SessionComputerParamsBodyTakeScreenshotActionTakeScreenshot)},
	})
	if err != nil {
		return "", err
	}
	if resp.Base64Image == "" {
		return "", fmt.Errorf("no screenshot returned from Steel")
	}
	return resp.Base64Image, nil
}

func (a *Agent) pressKeys(ctx context.Context, keys ...string) error {
	_, err := a.steel.Sessions.Computer(ctx, a.session.ID, steel.SessionComputerParams{
		Body: steel.SessionComputerParamsBodyPressKey{
			Action: steel.F(steel.SessionComputerParamsBodyPressKeyActionPressKey),
			Keys:   steel.F(keys),
		},
	})
	return err
}

func (a *Agent) typeText(ctx context.Context, text string) error {
	_, err := a.steel.Sessions.Computer(ctx, a.session.ID, steel.SessionComputerParams{
		Body: steel.SessionComputerParamsBodyTypeText{
			Action: steel.F(steel.SessionComputerParamsBodyTypeTextActionTypeText),
			Text:   steel.F(text),
		},
	})
	return err
}

func (a *Agent) waitFor(ctx context.Context, seconds float64) error {
	_, err := a.steel.Sessions.Computer(ctx, a.session.ID, steel.SessionComputerParams{
		Body: steel.SessionComputerParamsBodyWait{
			Action:   steel.F(steel.SessionComputerParamsBodyWaitActionWait),
			Duration: steel.F(seconds),
		},
	})
	return err
}

func (a *Agent) executeComputerAction(ctx context.Context, fc *genai.FunctionCall) (string, string, error) {
	name := fc.Name
	args := fc.Args
	if args == nil {
		args = map[string]any{}
	}

	switch name {
	case "click", "double_click", "right_click", "middle_click":
		button := steel.SessionComputerParamsBodyClickMouseButtonLeft
		switch name {
		case "right_click":
			button = steel.SessionComputerParamsBodyClickMouseButtonRight
		case "middle_click":
			button = steel.SessionComputerParamsBodyClickMouseButtonMiddle
		}
		body := steel.SessionComputerParamsBodyClickMouse{
			Action:      steel.F(steel.SessionComputerParamsBodyClickMouseActionClickMouse),
			Button:      steel.F(button),
			Coordinates: steel.F(a.point(args)),
			Screenshot:  steel.F(true),
		}
		if name == "double_click" {
			body.NumClicks = steel.F(float64(2))
		}
		shot, err := a.run(ctx, steel.SessionComputerParams{Body: body})
		return shot, "", err

	case "move":
		shot, err := a.run(ctx, steel.SessionComputerParams{
			Body: steel.SessionComputerParamsBodyMoveMouse{
				Action:      steel.F(steel.SessionComputerParamsBodyMoveMouseActionMoveMouse),
				Coordinates: steel.F(a.point(args)),
				Screenshot:  steel.F(true),
			},
		})
		return shot, "", err

	case "drag_and_drop":
		startX := a.denormalizeX(argInt(args, "start_x", 0))
		startY := a.denormalizeY(argInt(args, "start_y", 0))
		endX := a.denormalizeX(argInt(args, "end_x", 0))
		endY := a.denormalizeY(argInt(args, "end_y", 0))
		shot, err := a.run(ctx, steel.SessionComputerParams{
			Body: steel.SessionComputerParamsBodyDragMouse{
				Action:     steel.F(steel.SessionComputerParamsBodyDragMouseActionDragMouse),
				Path:       steel.F([][]float64{{startX, startY}, {endX, endY}}),
				Screenshot: steel.F(true),
			},
		})
		return shot, "", err

	case "type":
		if err := a.typeText(ctx, argString(args, "text", "")); err != nil {
			return "", "", err
		}
		if argBool(args, "press_enter", false) {
			if err := a.pressKeys(ctx, "Enter"); err != nil {
				return "", "", err
			}
		}
		if err := a.waitFor(ctx, 1); err != nil {
			return "", "", err
		}
		shot, err := a.takeScreenshot(ctx)
		return shot, "", err

	case "scroll":
		magnitude := float64(argInt(args, "magnitude_in_pixels", 300))
		var dx, dy float64
		switch argString(args, "direction", "down") {
		case "up":
			dy = -magnitude
		case "left":
			dx = -magnitude
		case "right":
			dx = magnitude
		default:
			dy = magnitude
		}
		shot, err := a.run(ctx, steel.SessionComputerParams{
			Body: steel.SessionComputerParamsBodyScroll{
				Action:      steel.F(steel.SessionComputerParamsBodyScrollActionScroll),
				Coordinates: steel.F(a.point(args)),
				DeltaX:      steel.F(dx),
				DeltaY:      steel.F(dy),
				Screenshot:  steel.F(true),
			},
		})
		return shot, "", err

	case "press_key", "hotkey":
		keys := argStrings(args, "keys")
		if name == "press_key" {
			keys = argStrings(args, "key")
		}
		shot, err := a.run(ctx, steel.SessionComputerParams{
			Body: steel.SessionComputerParamsBodyPressKey{
				Action:     steel.F(steel.SessionComputerParamsBodyPressKeyActionPressKey),
				Keys:       steel.F(normalizeKeys(keys)),
				Screenshot: steel.F(true),
			},
		})
		return shot, "", err

	case "wait":
		shot, err := a.run(ctx, steel.SessionComputerParams{
			Body: steel.SessionComputerParamsBodyWait{
				Action:     steel.F(steel.SessionComputerParamsBodyWaitActionWait),
				Duration:   steel.F(float64(argInt(args, "seconds", 1))),
				Screenshot: steel.F(true),
			},
		})
		return shot, "", err

	case "navigate":
		url := argString(args, "url", "")
		if !strings.HasPrefix(url, "http://") && !strings.HasPrefix(url, "https://") {
			url = "https://" + url
		}
		shot, err := a.openURL(ctx, url, 2)
		return shot, "", err

	case "go_back", "go_forward":
		arrow := "ArrowLeft"
		if name == "go_forward" {
			arrow = "ArrowRight"
		}
		shot, err := a.run(ctx, steel.SessionComputerParams{
			Body: steel.SessionComputerParamsBodyPressKey{
				Action:     steel.F(steel.SessionComputerParamsBodyPressKeyActionPressKey),
				Keys:       steel.F([]string{"Alt", arrow}),
				Screenshot: steel.F(true),
			},
		})
		return shot, "", err

	case "take_screenshot":
		shot, err := a.takeScreenshot(ctx)
		return shot, "", err

	default:
		shot, err := a.takeScreenshot(ctx)
		return shot, "Unsupported action: " + name, err
	}
}

func (a *Agent) openURL(ctx context.Context, url string, waitSeconds float64) (string, error) {
	if err := a.pressKeys(ctx, "Control", "l"); err != nil {
		return "", err
	}
	if err := a.typeText(ctx, url); err != nil {
		return "", err
	}
	if err := a.pressKeys(ctx, "Enter"); err != nil {
		return "", err
	}
	if err := a.waitFor(ctx, waitSeconds); err != nil {
		return "", err
	}
	a.currentURL = url
	return a.takeScreenshot(ctx)
}

func isNoise(text string) bool {
	for _, r := range text {
		if r != ' ' && r != '\t' && r != '\n' && r != '\r' && r != '\f' && r != '\v' && (r < '0' || r > '9') {
			return false
		}
	}
	return true
}

func extractText(candidate *genai.Candidate) string {
	if candidate.Content == nil {
		return ""
	}
	var parts []string
	for _, p := range candidate.Content.Parts {
		if p.Text != "" && !isNoise(p.Text) {
			parts = append(parts, p.Text)
		}
	}
	return strings.TrimSpace(strings.Join(parts, " "))
}

func extractFunctionCalls(candidate *genai.Candidate) []*genai.FunctionCall {
	var calls []*genai.FunctionCall
	if candidate.Content == nil {
		return calls
	}
	for _, p := range candidate.Content.Parts {
		if p.FunctionCall != nil {
			calls = append(calls, p.FunctionCall)
		}
	}
	return calls
}

func (a *Agent) buildFunctionResponseParts(calls []*genai.FunctionCall, shots []string, actionErrs []string) ([]*genai.Part, error) {
	var parts []*genai.Part
	for i, fc := range calls {
		response := map[string]any{"url": a.currentURL}
		if actionErrs[i] != "" {
			response["error"] = actionErrs[i]
		}
		parts = append(parts, &genai.Part{
			FunctionResponse: &genai.FunctionResponse{
				Name:     fc.Name,
				Response: response,
			},
		})

		data, err := base64.StdEncoding.DecodeString(shots[i])
		if err != nil {
			return nil, err
		}
		parts = append(parts, &genai.Part{
			InlineData: &genai.Blob{MIMEType: "image/png", Data: data},
		})
	}
	return parts, nil
}

func (a *Agent) executeTask(ctx context.Context, task string) (string, error) {
	a.contents = []*genai.Content{{
		Role: "user",
		Parts: []*genai.Part{
			{Text: browserSystemPrompt()},
			{Text: task},
		},
	}}

	fmt.Printf("Executing task: %s\n", task)
	fmt.Println(strings.Repeat("=", 60))

	consecutiveNoActions := 0

	for iter := 0; iter < maxIterations; iter++ {
		resp, err := a.genai.Models.GenerateContent(ctx, model, a.contents, a.config)
		if err != nil {
			return "", fmt.Errorf("error during task execution: %w", err)
		}
		if len(resp.Candidates) == 0 {
			fmt.Println("No candidates in response")
			break
		}

		candidate := resp.Candidates[0]
		if candidate.Content != nil {
			a.contents = append(a.contents, candidate.Content)
		}

		reasoning := extractText(candidate)
		functionCalls := extractFunctionCalls(candidate)

		if len(functionCalls) == 0 && reasoning == "" &&
			candidate.FinishReason == genai.FinishReasonMalformedFunctionCall {
			fmt.Println("Malformed function call, retrying...")
			continue
		}

		if len(functionCalls) == 0 {
			if reasoning != "" {
				fmt.Printf("\n%s\n", reasoning)
				fmt.Println("Task complete - model provided final response")
				break
			}
			consecutiveNoActions++
			if consecutiveNoActions >= 3 {
				fmt.Println("No actions for 3 consecutive iterations - stopping")
				break
			}
			continue
		}

		consecutiveNoActions = 0

		if reasoning != "" {
			fmt.Printf("\n%s\n", reasoning)
		}

		shots := make([]string, len(functionCalls))
		actionErrs := make([]string, len(functionCalls))
		for i, fc := range functionCalls {
			if raw, err := json.Marshal(fc.Args); err == nil {
				fmt.Printf("%s(%s)\n", fc.Name, raw)
			}

			if sd, ok := fc.Args["safety_decision"].(map[string]any); ok {
				if sd["decision"] == "require_confirmation" {
					fmt.Printf("Safety confirmation required: %v\n", sd["explanation"])
					fmt.Println("Auto-acknowledging safety check")
				}
			}

			shot, actionErr, err := a.executeComputerAction(ctx, fc)
			if err != nil {
				return "", fmt.Errorf("error executing %s: %w", fc.Name, err)
			}
			shots[i] = shot
			actionErrs[i] = actionErr
		}

		parts, err := a.buildFunctionResponseParts(functionCalls, shots, actionErrs)
		if err != nil {
			return "", err
		}
		a.contents = append(a.contents, &genai.Content{Role: "user", Parts: parts})

		if iter == maxIterations-1 {
			fmt.Printf("Task execution stopped after %d iterations\n", maxIterations)
		}
	}

	for i := len(a.contents) - 1; i >= 0; i-- {
		content := a.contents[i]
		if content.Role != "model" {
			continue
		}
		var texts []string
		for _, p := range content.Parts {
			if p.Text != "" && !isNoise(p.Text) {
				texts = append(texts, p.Text)
			}
		}
		if len(texts) > 0 {
			return strings.TrimSpace(strings.Join(texts, " ")), nil
		}
	}

	return "Task execution completed (no final message)", nil
}

func main() {
	_ = godotenv.Overload()

	steelKey := envOr("STEEL_API_KEY", "your-steel-api-key-here")
	geminiKey := envOr("GEMINI_API_KEY", "your-gemini-api-key-here")
	task := envOr("TASK", "Go to Steel.dev and find the latest news")

	fmt.Println("Steel + Gemini Computer Use Assistant")
	fmt.Println(strings.Repeat("=", 60))

	if steelKey == "your-steel-api-key-here" {
		fmt.Println("WARNING: set STEEL_API_KEY in your environment or .env file")
		fmt.Println("   Get your API key at: https://app.steel.dev/settings/api-keys")
		os.Exit(1)
	}
	if geminiKey == "your-gemini-api-key-here" {
		fmt.Println("WARNING: set GEMINI_API_KEY in your environment or .env file")
		fmt.Println("   Get your API key at: https://aistudio.google.com/apikey")
		os.Exit(1)
	}

	ctx := context.Background()
	agent, err := NewAgent(ctx, steelKey, geminiKey)
	if err != nil {
		fmt.Printf("Failed to create Gemini client: %v\n", err)
		os.Exit(1)
	}

	if err := run(ctx, agent, task); err != nil {
		fmt.Println("Error:", err)
		os.Exit(1)
	}
}

func run(ctx context.Context, agent *Agent, task string) error {
	fmt.Println("\nStarting Steel session...")
	if err := agent.initialize(ctx); err != nil {
		return fmt.Errorf("failed to start Steel session (check your STEEL_API_KEY and internet connection): %w", err)
	}
	defer agent.cleanup(ctx)

	start := time.Now()
	result, err := agent.executeTask(ctx, task)
	if err != nil {
		return fmt.Errorf("task execution failed: %w", err)
	}

	fmt.Println("\n" + strings.Repeat("=", 60))
	fmt.Println("TASK EXECUTION COMPLETED")
	fmt.Println(strings.Repeat("=", 60))
	fmt.Printf("Duration: %.1f seconds\n", time.Since(start).Seconds())
	fmt.Printf("Task: %s\n", task)
	fmt.Printf("Result:\n%s\n", result)
	fmt.Println(strings.Repeat("=", 60))
	return nil
}
