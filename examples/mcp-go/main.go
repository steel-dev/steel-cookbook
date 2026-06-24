// An MCP server that exposes a Steel cloud browser as explicit session-handle tools.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/mcp-go

package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"sync"

	"github.com/chromedp/chromedp"
	"github.com/joho/godotenv"
	"github.com/modelcontextprotocol/go-sdk/mcp"
	"github.com/steel-dev/steel-go"
)

// session is one live Steel browser behind one chromedp tab. The Steel session id
// doubles as the handle the model threads back on every later call, so the server
// never keeps hidden per-connection state: every tool says which browser it means.
type session struct {
	id          string
	viewerURL   string
	tab         context.Context
	cancelTab   context.CancelFunc
	cancelAlloc context.CancelFunc
	mu          sync.Mutex
}

type server struct {
	steel    *steel.Client
	steelKey string
	mu       sync.Mutex
	sessions map[string]*session
}

func (s *server) get(id string) (*session, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[id]
	if !ok {
		return nil, fmt.Errorf("unknown session_id %q; call create_session first", id)
	}
	return sess, nil
}

// releaseAll tears down every live session when the client disconnects and Run
// returns. Steel bills per session-minute, so a leaked session keeps running until
// its idle timeout, so the server releases what it opened.
func (s *server) releaseAll() {
	s.mu.Lock()
	live := make([]*session, 0, len(s.sessions))
	for _, sess := range s.sessions {
		live = append(live, sess)
	}
	s.sessions = map[string]*session{}
	s.mu.Unlock()

	for _, sess := range live {
		sess.cancelTab()
		sess.cancelAlloc()
		if _, err := s.steel.Sessions.Release(context.Background(), sess.id, steel.SessionReleaseParams{}); err != nil {
			log.Printf("release %s: %v", sess.id, err)
		}
	}
}

type createInput struct{}

type createOutput struct {
	SessionID   string `json:"session_id" jsonschema:"Handle to pass to navigate, extract, screenshot, and release_session."`
	LiveViewURL string `json:"live_view_url" jsonschema:"Steel Session Viewer URL to watch this browser live."`
}

func (s *server) createSession(ctx context.Context, _ *mcp.CallToolRequest, _ createInput) (*mcp.CallToolResult, createOutput, error) {
	steelSession, err := s.steel.Sessions.Create(ctx, steel.SessionCreateParams{
		BlockAds:   steel.F(true),
		Dimensions: steel.F(steel.SessionCreateParamsDimensions{Width: steel.F(int64(1280)), Height: steel.F(int64(800))}),
	})
	if err != nil {
		return nil, createOutput{}, err
	}

	// chromedp attaches to the exact websocket URL Steel returns. NoModifyURL stops
	// chromedp rewriting it, which would drop the apiKey query param. The allocator
	// uses context.Background(), not the request ctx: the request is cancelled when
	// this tool call returns, but the session must outlive it for later calls.
	cdpURL := fmt.Sprintf("%s&apiKey=%s", steelSession.WebsocketURL, s.steelKey)
	allocCtx, cancelAlloc := chromedp.NewRemoteAllocator(context.Background(), cdpURL, chromedp.NoModifyURL)
	tab, cancelTab := chromedp.NewContext(allocCtx)
	if err := chromedp.Run(tab); err != nil {
		cancelTab()
		cancelAlloc()
		_, _ = s.steel.Sessions.Release(context.Background(), steelSession.ID, steel.SessionReleaseParams{})
		return nil, createOutput{}, err
	}

	sess := &session{
		id:          steelSession.ID,
		viewerURL:   steelSession.SessionViewerURL,
		tab:         tab,
		cancelTab:   cancelTab,
		cancelAlloc: cancelAlloc,
	}
	s.mu.Lock()
	s.sessions[sess.id] = sess
	s.mu.Unlock()

	log.Printf("created session %s", sess.id)
	return nil, createOutput{SessionID: sess.id, LiveViewURL: sess.viewerURL}, nil
}

type navigateInput struct {
	SessionID string `json:"session_id" jsonschema:"Handle returned by create_session."`
	URL       string `json:"url" jsonschema:"Absolute URL to open, e.g. https://news.ycombinator.com."`
}

type navigateOutput struct {
	Title string `json:"title"`
	URL   string `json:"url"`
}

func (s *server) navigate(_ context.Context, _ *mcp.CallToolRequest, in navigateInput) (*mcp.CallToolResult, navigateOutput, error) {
	sess, err := s.get(in.SessionID)
	if err != nil {
		return nil, navigateOutput{}, err
	}
	sess.mu.Lock()
	defer sess.mu.Unlock()

	var title, url string
	if err := chromedp.Run(sess.tab,
		chromedp.Navigate(in.URL),
		chromedp.Title(&title),
		chromedp.Location(&url),
	); err != nil {
		return nil, navigateOutput{}, err
	}
	return nil, navigateOutput{Title: title, URL: url}, nil
}

type extractInput struct {
	SessionID string `json:"session_id" jsonschema:"Handle returned by create_session."`
	Selector  string `json:"selector,omitempty" jsonschema:"CSS selector to read. Empty reads the whole page body."`
	MaxChars  int    `json:"max_chars,omitempty" jsonschema:"Cap on characters returned. Defaults to 8000."`
}

type extractOutput struct {
	Text string `json:"text"`
}

func (s *server) extract(_ context.Context, _ *mcp.CallToolRequest, in extractInput) (*mcp.CallToolResult, extractOutput, error) {
	sess, err := s.get(in.SessionID)
	if err != nil {
		return nil, extractOutput{}, err
	}
	selector := in.Selector
	if selector == "" {
		selector = "body"
	}
	maxChars := in.MaxChars
	if maxChars <= 0 {
		maxChars = 8000
	}

	sess.mu.Lock()
	defer sess.mu.Unlock()

	js := fmt.Sprintf(`(() => {
  const els = Array.from(document.querySelectorAll(%q));
  const text = els.map((e) => e.innerText || e.textContent || "").join("\n\n").trim();
  return text.slice(0, %d);
})()`, selector, maxChars)

	var text string
	if err := chromedp.Run(sess.tab, chromedp.Evaluate(js, &text)); err != nil {
		return nil, extractOutput{}, err
	}
	return nil, extractOutput{Text: text}, nil
}

type screenshotInput struct {
	SessionID string `json:"session_id" jsonschema:"Handle returned by create_session."`
}

type screenshotOutput struct {
	Bytes int `json:"bytes"`
}

func (s *server) screenshot(_ context.Context, _ *mcp.CallToolRequest, in screenshotInput) (*mcp.CallToolResult, screenshotOutput, error) {
	sess, err := s.get(in.SessionID)
	if err != nil {
		return nil, screenshotOutput{}, err
	}
	sess.mu.Lock()
	defer sess.mu.Unlock()

	var buf []byte
	if err := chromedp.Run(sess.tab, chromedp.CaptureScreenshot(&buf)); err != nil {
		return nil, screenshotOutput{}, err
	}

	// MCP carries images as their own content block, so the client renders the PNG
	// instead of a wall of base64. The typed output keeps a byte count for logs.
	result := &mcp.CallToolResult{
		Content: []mcp.Content{
			&mcp.ImageContent{Data: buf, MIMEType: "image/png"},
		},
	}
	return result, screenshotOutput{Bytes: len(buf)}, nil
}

type releaseInput struct {
	SessionID string `json:"session_id" jsonschema:"Handle returned by create_session."`
}

type releaseOutput struct {
	Released string `json:"released"`
}

func (s *server) releaseSession(_ context.Context, _ *mcp.CallToolRequest, in releaseInput) (*mcp.CallToolResult, releaseOutput, error) {
	sess, err := s.get(in.SessionID)
	if err != nil {
		return nil, releaseOutput{}, err
	}
	s.mu.Lock()
	delete(s.sessions, in.SessionID)
	s.mu.Unlock()

	sess.cancelTab()
	sess.cancelAlloc()
	if _, err := s.steel.Sessions.Release(context.Background(), sess.id, steel.SessionReleaseParams{}); err != nil {
		return nil, releaseOutput{}, err
	}
	log.Printf("released session %s", sess.id)
	return nil, releaseOutput{Released: sess.id}, nil
}

func main() {
	_ = godotenv.Load()

	steelKey := os.Getenv("STEEL_API_KEY")
	if steelKey == "" {
		log.Fatal("Set STEEL_API_KEY (https://app.steel.dev/settings/api-keys)")
	}

	s := &server{
		steel:    steel.NewClient(steelKey),
		steelKey: steelKey,
		sessions: map[string]*session{},
	}

	srv := mcp.NewServer(&mcp.Implementation{Name: "steel", Version: "0.1.0"}, nil)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "create_session",
		Description: "Start a Steel cloud browser and return a session_id handle plus a live-view URL. Pass the handle to every other tool.",
	}, s.createSession)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "navigate",
		Description: "Open a URL in the session's browser tab and wait for it to load. Returns the resolved title and URL.",
	}, s.navigate)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "extract",
		Description: "Read text from the current page. Give a CSS selector to target part of it, or omit it to read the whole body.",
	}, s.extract)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "screenshot",
		Description: "Capture a PNG screenshot of the current page in the session.",
	}, s.screenshot)
	mcp.AddTool(srv, &mcp.Tool{
		Name:        "release_session",
		Description: "Close the browser and release the Steel session. Call this when the task is done so the session stops billing.",
	}, s.releaseSession)

	// Stdio puts the JSON-RPC stream on stdout, so every diagnostic has to go to
	// stderr (log writes there by default). One stray fmt.Println corrupts the
	// protocol and the client drops the connection.
	defer s.releaseAll()
	if err := srv.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
		log.Fatal(err)
	}
}
