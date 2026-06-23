// OpenAI computer-use agent driving a Steel cloud browser via the Responses API.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/openai-computer-use-go
package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/openai/openai-go/v3"
	"github.com/openai/openai-go/v3/option"
	"github.com/openai/openai-go/v3/responses"
	"github.com/openai/openai-go/v3/shared"
	steel "github.com/steel-dev/steel-go"
)

const (
	viewportWidth  = 1440
	viewportHeight = 900
	maxIterations  = 50
)

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func systemPrompt() string {
	today := time.Now().Format("Monday, January 02, 2006")
	return fmt.Sprintf(`<BROWSER_ENV>
- You control a headful Chromium browser running in a VM with internet access.
- Interact only through the computer tool (mouse/keyboard/scroll/screenshots). Do not call navigation functions.
- Today's date is %s.
</BROWSER_ENV>

<BROWSER_CONTROL>
- Before acting, take a screenshot to observe state.
- When typing into any input: clear with Ctrl+A then Delete. After submitting (Enter or clicking a button), wait 1-2s once, take a single screenshot, and move the mouse aside.
- Do not press Enter repeatedly. If the page does not change after submit+wait+screenshot, change strategy (focus the address bar with Ctrl+L, type the full URL, press Enter once).
- Computer calls are slow; batch related actions together.
- Zoom out or scroll so all relevant content is visible before reading.
- If the first screenshot is black, click near center and screenshot again.
</BROWSER_CONTROL>

<TASK_EXECUTION>
- You receive exactly one natural-language task and no further user feedback.
- Do not ask clarifying questions; make reasonable assumptions and proceed.
- Prefer minimal, high-signal actions that move directly toward the goal.
- Every assistant turn must include at least one computer action; avoid text-only turns.
- Avoid repetition: never repeat the same action sequence in consecutive turns. If an action has no visible effect, pivot to a different approach.
- Keep the final response concise and focused on fulfilling the task.
</TASK_EXECUTION>`, today)
}

// keySynonyms maps OpenAI / human key names onto the DOM key vocabulary Steel expects.
var keySynonyms = map[string]string{
	"ENTER": "Enter", "RETURN": "Enter",
	"ESC": "Escape", "ESCAPE": "Escape",
	"TAB": "Tab", "BACKSPACE": "Backspace", "BKSP": "Backspace",
	"DELETE": "Delete", "DEL": "Delete", "SPACE": "Space",
	"CTRL": "Control", "CONTROL": "Control",
	"ALT": "Alt", "SHIFT": "Shift",
	"META": "Meta", "SUPER": "Meta", "CMD": "Meta", "COMMAND": "Meta",
	"UP": "ArrowUp", "DOWN": "ArrowDown", "LEFT": "ArrowLeft", "RIGHT": "ArrowRight",
	"ARROWUP": "ArrowUp", "ARROWDOWN": "ArrowDown", "ARROWLEFT": "ArrowLeft", "ARROWRIGHT": "ArrowRight",
	"HOME": "Home", "END": "End", "PAGEUP": "PageUp", "PAGEDOWN": "PageDown", "INSERT": "Insert",
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
	if len(upper) >= 2 && upper[0] == 'F' && isDigits(upper[1:]) {
		return upper
	}
	if len(k) == 1 {
		return strings.ToLower(k)
	}
	return k
}

func isDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return len(s) > 0
}

func normalizeKeys(keys []string) []string {
	out := make([]string, 0, len(keys))
	for _, k := range keys {
		if n := normalizeKey(k); n != "" {
			out = append(out, n)
		}
	}
	return out
}

func mapButton(btn string) steel.ComputerActionRequestVariant1Button {
	switch strings.ToLower(btn) {
	case "right":
		return steel.ComputerActionRequestVariant1ButtonRight
	case "middle", "wheel":
		return steel.ComputerActionRequestVariant1ButtonMiddle
	case "back":
		return steel.ComputerActionRequestVariant1ButtonBack
	case "forward":
		return steel.ComputerActionRequestVariant1ButtonForward
	default:
		return steel.ComputerActionRequestVariant1ButtonLeft
	}
}

// action is the flattened shape shared by both single and batched computer actions
// the model emits. Both openai-go union types expose these same fields.
type action struct {
	Type    string
	Button  string
	X, Y    int64
	Keys    []string
	ScrollX int64
	ScrollY int64
	Text    string
	Path    [][2]int64
}

type agent struct {
	steel   *steel.Client
	openai  openai.Client
	session *steel.Session
}

func newAgent(steelKey, openaiKey string) *agent {
	return &agent{
		steel:  steel.NewClient(steelKey),
		openai: openai.NewClient(option.WithAPIKey(openaiKey)),
	}
}

func (a *agent) initialize(ctx context.Context) error {
	sess, err := a.steel.Sessions.Create(ctx, steel.SessionCreateParams{
		BlockAds: steel.F(true),
		Timeout:  steel.F(int64(900000)),
		Dimensions: steel.F(steel.SessionCreateParamsDimensions{
			Width:  steel.F(int64(viewportWidth)),
			Height: steel.F(int64(viewportHeight)),
		}),
	})
	if err != nil {
		return err
	}
	a.session = sess
	fmt.Println("Steel session created successfully!")
	fmt.Printf("View live session at: %s\n", sess.SessionViewerURL)
	return nil
}

func (a *agent) cleanup(ctx context.Context) {
	if a.session == nil {
		return
	}
	fmt.Println("Releasing Steel session...")
	if _, err := a.steel.Sessions.Release(ctx, a.session.ID, steel.SessionReleaseParams{}); err != nil {
		fmt.Printf("Failed to release session: %v\n", err)
	} else {
		fmt.Printf("Session completed. View replay at %s\n", a.session.SessionViewerURL)
	}
	a.session = nil
}

func (a *agent) takeScreenshot(ctx context.Context) (string, error) {
	resp, err := a.steel.Sessions.Computer(ctx, a.session.ID, steel.SessionComputerParams{
		Action:                              "take_screenshot",
		ComputerActionRequestTakeScreenshot: &steel.ComputerActionRequestTakeScreenshot{Action: steel.F(steel.ComputerActionRequestVariant7ActionTakeScreenshot)},
	})
	if err != nil {
		return "", err
	}
	if resp.Base64Image == "" {
		return "", fmt.Errorf("no screenshot returned from Steel")
	}
	return resp.Base64Image, nil
}

// run sends one Steel computer action and returns the screenshot it captures. Every
// action requests screenshot: true, so the model sees the result of its last move.
func (a *agent) run(ctx context.Context, params steel.SessionComputerParams) (string, error) {
	resp, err := a.steel.Sessions.Computer(ctx, a.session.ID, params)
	if err != nil {
		return "", err
	}
	if resp.Base64Image != "" {
		return resp.Base64Image, nil
	}
	return a.takeScreenshot(ctx)
}

// executeAction maps OpenAI's computer-use vocabulary onto Steel's Input API.
func (a *agent) executeAction(ctx context.Context, act action) (string, error) {
	cx, cy := int64(viewportWidth/2), int64(viewportHeight/2)
	coords := func() []float64 {
		x, y := act.X, act.Y
		if x == 0 && y == 0 {
			x, y = cx, cy
		}
		return []float64{float64(x), float64(y)}
	}

	switch act.Type {
	case "click":
		body := &steel.ComputerActionRequestClickMouse{
			Action:      steel.F(steel.ComputerActionRequestVariant1ActionClickMouse),
			Button:      steel.F(mapButton(act.Button)),
			Coordinates: steel.F(coords()),
			Screenshot:  steel.F(true),
		}
		return a.run(ctx, steel.SessionComputerParams{Action: "click_mouse", ComputerActionRequestClickMouse: body})

	case "double_click":
		body := &steel.ComputerActionRequestClickMouse{
			Action:      steel.F(steel.ComputerActionRequestVariant1ActionClickMouse),
			Button:      steel.F(steel.ComputerActionRequestVariant1ButtonLeft),
			Coordinates: steel.F(coords()),
			NumClicks:   steel.F(float64(2)),
			Screenshot:  steel.F(true),
		}
		return a.run(ctx, steel.SessionComputerParams{Action: "click_mouse", ComputerActionRequestClickMouse: body})

	case "move":
		body := &steel.ComputerActionRequestMoveMouse{
			Action:      steel.F(steel.ComputerActionRequestVariant0ActionMoveMouse),
			Coordinates: steel.F(coords()),
			Screenshot:  steel.F(true),
		}
		return a.run(ctx, steel.SessionComputerParams{Action: "move_mouse", ComputerActionRequestMoveMouse: body})

	case "drag":
		path := make([][]float64, 0, len(act.Path))
		for _, p := range act.Path {
			path = append(path, []float64{float64(p[0]), float64(p[1])})
		}
		if len(path) < 2 {
			path = [][]float64{{float64(cx), float64(cy)}, {float64(act.X), float64(act.Y)}}
		}
		body := &steel.ComputerActionRequestDragMouse{
			Action:     steel.F(steel.ComputerActionRequestVariant2ActionDragMouse),
			Path:       steel.F(path),
			Screenshot: steel.F(true),
		}
		return a.run(ctx, steel.SessionComputerParams{Action: "drag_mouse", ComputerActionRequestDragMouse: body})

	case "scroll":
		body := &steel.ComputerActionRequestScroll{
			Action:      steel.F(steel.ComputerActionRequestVariant3ActionScroll),
			Coordinates: steel.F(coords()),
			Screenshot:  steel.F(true),
		}
		if act.ScrollX != 0 {
			body.DeltaX = steel.F(float64(act.ScrollX))
		}
		if act.ScrollY != 0 {
			body.DeltaY = steel.F(float64(act.ScrollY))
		}
		return a.run(ctx, steel.SessionComputerParams{Action: "scroll", ComputerActionRequestScroll: body})

	case "keypress":
		body := &steel.ComputerActionRequestPressKey{
			Action:     steel.F(steel.ComputerActionRequestVariant4ActionPressKey),
			Keys:       steel.F(normalizeKeys(act.Keys)),
			Screenshot: steel.F(true),
		}
		return a.run(ctx, steel.SessionComputerParams{Action: "press_key", ComputerActionRequestPressKey: body})

	case "type":
		body := &steel.ComputerActionRequestTypeText{
			Action:     steel.F(steel.ComputerActionRequestVariant5ActionTypeText),
			Text:       steel.F(act.Text),
			Screenshot: steel.F(true),
		}
		return a.run(ctx, steel.SessionComputerParams{Action: "type_text", ComputerActionRequestTypeText: body})

	case "wait":
		body := &steel.ComputerActionRequestWait{
			Action:     steel.F(steel.ComputerActionRequestVariant6ActionWait),
			Duration:   steel.F(float64(1)),
			Screenshot: steel.F(true),
		}
		return a.run(ctx, steel.SessionComputerParams{Action: "wait", ComputerActionRequestWait: body})

	case "screenshot":
		return a.takeScreenshot(ctx)

	default:
		return a.takeScreenshot(ctx)
	}
}

func (a *agent) executeTask(ctx context.Context, task string) (string, error) {
	input := responses.ResponseInputParam{
		responses.ResponseInputItemParamOfMessage(task, responses.EasyInputMessageRoleUser),
	}
	var previousResponseID string
	finalMessage := ""

	fmt.Printf("Executing task: %s\n", task)
	fmt.Println(strings.Repeat("=", 60))

	for turn := 0; turn < maxIterations; turn++ {
		params := responses.ResponseNewParams{
			Model:        shared.ResponsesModelComputerUsePreview,
			Instructions: openai.String(systemPrompt()),
			Input:        responses.ResponseNewParamsInputUnion{OfInputItemList: input},
			Tools: []responses.ToolUnionParam{
				responses.ToolParamOfComputerUsePreview(viewportHeight, viewportWidth, responses.ComputerUsePreviewToolEnvironmentBrowser),
			},
			Reasoning:  shared.ReasoningParam{Effort: shared.ReasoningEffortMedium},
			Truncation: responses.ResponseNewParamsTruncationAuto,
		}
		if previousResponseID != "" {
			params.PreviousResponseID = openai.String(previousResponseID)
		}

		resp, err := a.openai.Responses.New(ctx, params)
		if err != nil {
			return "", err
		}
		previousResponseID = resp.ID

		var nextInput responses.ResponseInputParam

		for _, item := range resp.Output {
			switch item.Type {
			case "message":
				for _, c := range item.Content {
					if c.Text != "" {
						fmt.Println(c.Text)
						finalMessage = c.Text
					}
				}

			case "reasoning":
				var parts []string
				for _, s := range item.Summary {
					if s.Text != "" {
						parts = append(parts, s.Text)
					}
				}
				if summary := strings.Join(parts, " "); summary != "" {
					fmt.Println(summary)
				}

			case "computer_call":
				call := item.AsComputerCall()
				for _, act := range actionsFromCall(call) {
					fmt.Printf("%s(%v)\n", act.Type, actionArgs(act))
					if _, err := a.executeAction(ctx, act); err != nil {
						fmt.Printf("Error executing %s: %v\n", act.Type, err)
					}
				}

				acks := make([]responses.ResponseInputItemComputerCallOutputAcknowledgedSafetyCheckParam, 0, len(call.PendingSafetyChecks))
				for _, check := range call.PendingSafetyChecks {
					fmt.Printf("Auto-acknowledging safety check: %s\n", check.Message)
					acks = append(acks, responses.ResponseInputItemComputerCallOutputAcknowledgedSafetyCheckParam{
						ID:      check.ID,
						Code:    openai.String(check.Code),
						Message: openai.String(check.Message),
					})
				}

				shot, err := a.takeScreenshot(ctx)
				if err != nil {
					return "", err
				}
				out := responses.ResponseInputItemParamOfComputerCallOutput(
					call.CallID,
					responses.ResponseComputerToolCallOutputScreenshotParam{
						ImageURL: openai.String("data:image/png;base64," + shot),
					},
				)
				if len(acks) > 0 && out.OfComputerCallOutput != nil {
					out.OfComputerCallOutput.AcknowledgedSafetyChecks = acks
				}
				nextInput = append(nextInput, out)
			}
		}

		if len(nextInput) == 0 {
			break
		}
		input = nextInput
	}

	if finalMessage == "" {
		return "Task execution completed (no final message)", nil
	}
	return finalMessage, nil
}

// actionsFromCall returns the batched actions if present, otherwise the single action,
// normalized into the flattened []action shape executeAction consumes.
func actionsFromCall(call responses.ResponseComputerToolCall) []action {
	if len(call.Actions) > 0 {
		out := make([]action, 0, len(call.Actions))
		for _, a := range call.Actions {
			path := make([][2]int64, 0, len(a.Path))
			for _, p := range a.Path {
				path = append(path, [2]int64{p.X, p.Y})
			}
			out = append(out, action{
				Type: a.Type, Button: a.Button, X: a.X, Y: a.Y, Keys: a.Keys,
				ScrollX: a.ScrollX, ScrollY: a.ScrollY, Text: a.Text, Path: path,
			})
		}
		return out
	}
	a := call.Action
	path := make([][2]int64, 0, len(a.Path))
	for _, p := range a.Path {
		path = append(path, [2]int64{p.X, p.Y})
	}
	return []action{{
		Type: a.Type, Button: a.Button, X: a.X, Y: a.Y, Keys: a.Keys,
		ScrollX: a.ScrollX, ScrollY: a.ScrollY, Text: a.Text, Path: path,
	}}
}

func actionArgs(a action) string {
	switch a.Type {
	case "click":
		return fmt.Sprintf("button=%s x=%d y=%d", a.Button, a.X, a.Y)
	case "double_click", "move":
		return fmt.Sprintf("x=%d y=%d", a.X, a.Y)
	case "scroll":
		return fmt.Sprintf("x=%d y=%d dx=%d dy=%d", a.X, a.Y, a.ScrollX, a.ScrollY)
	case "keypress":
		return fmt.Sprintf("keys=%v", a.Keys)
	case "type":
		return fmt.Sprintf("text=%q", a.Text)
	default:
		return ""
	}
}

func main() {
	fmt.Println("Steel + OpenAI Computer Use Assistant (Steel actions)")
	fmt.Println(strings.Repeat("=", 60))

	steelKey := envOr("STEEL_API_KEY", "")
	openaiKey := envOr("OPENAI_API_KEY", "")
	task := envOr("TASK", "Go to Steel.dev and find the latest news")

	if steelKey == "" {
		fmt.Println("WARNING: set STEEL_API_KEY. Get one at https://app.steel.dev/settings/api-keys")
		os.Exit(1)
	}
	if openaiKey == "" {
		fmt.Println("WARNING: set OPENAI_API_KEY. Get one at https://platform.openai.com/api-keys")
		os.Exit(1)
	}

	ctx := context.Background()
	a := newAgent(steelKey, openaiKey)
	defer a.cleanup(ctx)

	if err := a.initialize(ctx); err != nil {
		fmt.Printf("Failed to start Steel session: %v\n", err)
		os.Exit(1)
	}

	start := time.Now()
	result, err := a.executeTask(ctx, task)
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
