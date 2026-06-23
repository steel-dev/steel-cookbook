// Capture a logged-in browser's auth context from one Steel session and restore it into a fresh one with chromedp.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/auth-context-go

package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
	"github.com/joho/godotenv"
	steel "github.com/steel-dev/steel-go"
)

const (
	loginURL  = "https://practice.expandtesting.com/login"
	secureURL = "https://practice.expandtesting.com/secure"
)

func main() {
	_ = godotenv.Load()

	apiKey := os.Getenv("STEEL_API_KEY")
	if apiKey == "" {
		fmt.Println("Set STEEL_API_KEY in your environment or .env file.")
		fmt.Println("Get a key at https://app.steel.dev/settings/api-keys")
		os.Exit(1)
	}

	if err := run(apiKey); err != nil {
		fmt.Println("Error:", err)
		os.Exit(1)
	}
}

func run(apiKey string) error {
	ctx := context.Background()
	client := steel.NewClient(apiKey)

	fmt.Println("Creating Steel session #1...")
	first, err := client.Sessions.Create(ctx, steel.SessionCreateParams{})
	if err != nil {
		return fmt.Errorf("create session #1: %w", err)
	}
	fmt.Printf("Session #1 live at %s\n", first.SessionViewerURL)

	if err := withBrowser(ctx, first.WebsocketURL, apiKey, func(runCtx context.Context) error {
		if err := login(runCtx); err != nil {
			return err
		}
		return verifyAuth(runCtx, "session #1")
	}); err != nil {
		_, _ = client.Sessions.Release(ctx, first.ID, steel.SessionReleaseParams{})
		return err
	}

	captured, err := client.Sessions.Context(ctx, first.ID)
	if err != nil {
		_, _ = client.Sessions.Release(ctx, first.ID, steel.SessionReleaseParams{})
		return fmt.Errorf("capture context: %w", err)
	}

	if _, err := client.Sessions.Release(ctx, first.ID, steel.SessionReleaseParams{}); err != nil {
		return fmt.Errorf("release session #1: %w", err)
	}
	fmt.Println("Session #1 released")

	fmt.Println("\nCreating Steel session #2 from the captured context...")
	second, err := client.Sessions.Create(ctx, steel.SessionCreateParams{
		SessionContext: steel.F(restoreContext(captured)),
	})
	if err != nil {
		return fmt.Errorf("create session #2: %w", err)
	}
	defer func() {
		fmt.Println("Releasing session #2...")
		if _, err := client.Sessions.Release(ctx, second.ID, steel.SessionReleaseParams{}); err != nil {
			fmt.Println("Release failed:", err)
		}
	}()
	fmt.Printf("Session #2 live at %s\n", second.SessionViewerURL)

	if err := withBrowser(ctx, second.WebsocketURL, apiKey, func(runCtx context.Context) error {
		return verifyAuth(runCtx, "session #2")
	}); err != nil {
		return err
	}

	fmt.Println("\nAuthentication successfully transferred.")
	return nil
}

func withBrowser(ctx context.Context, websocketURL, apiKey string, fn func(context.Context) error) error {
	cdpURL := fmt.Sprintf("%s&apiKey=%s", websocketURL, apiKey)

	allocCtx, cancelAlloc := chromedp.NewRemoteAllocator(ctx, cdpURL, chromedp.NoModifyURL)
	defer cancelAlloc()

	browserCtx, cancelBrowser := chromedp.NewContext(allocCtx)
	defer cancelBrowser()

	runCtx, cancelRun := context.WithTimeout(browserCtx, 60*time.Second)
	defer cancelRun()

	return fn(runCtx)
}

func login(ctx context.Context) error {
	return chromedp.Run(ctx,
		chromedp.Navigate(loginURL),
		chromedp.WaitVisible(`input[name="username"]`, chromedp.ByQuery),
		chromedp.SendKeys(`input[name="username"]`, "practice", chromedp.ByQuery),
		chromedp.SendKeys(`input[name="password"]`, "SuperSecretPassword!", chromedp.ByQuery),
		chromedp.Click(`button[type="submit"]`, chromedp.ByQuery),
		chromedp.WaitVisible("#username", chromedp.ByQuery),
	)
}

func verifyAuth(ctx context.Context, label string) error {
	var welcome string
	if err := chromedp.Run(ctx,
		chromedp.Navigate(secureURL),
		chromedp.WaitVisible("#username", chromedp.ByQuery),
		chromedp.Text("#username", &welcome, chromedp.ByQuery),
	); err != nil {
		return fmt.Errorf("verify %s: %w", label, err)
	}
	if !strings.Contains(welcome, "Hi, practice!") {
		return fmt.Errorf("verify %s: expected welcome text, got %q", label, strings.TrimSpace(welcome))
	}
	fmt.Printf("Authenticated on %s\n", label)
	return nil
}

func restoreContext(src *steel.SessionContext) steel.SessionCreateParamsSessionContext {
	out := steel.SessionCreateParamsSessionContext{}
	if src == nil {
		return out
	}

	if len(src.LocalStorage) > 0 {
		out.LocalStorage = steel.F(src.LocalStorage)
	}
	if len(src.SessionStorage) > 0 {
		out.SessionStorage = steel.F(src.SessionStorage)
	}

	if len(src.Cookies) > 0 {
		cookies := make([]steel.SessionCreateParamsSessionContextCookie, 0, len(src.Cookies))
		for _, c := range src.Cookies {
			cookie := steel.SessionCreateParamsSessionContextCookie{
				Name:     steel.F(c.Name),
				Value:    steel.F(c.Value),
				Domain:   steel.F(c.Domain),
				Path:     steel.F(c.Path),
				Expires:  steel.F(c.Expires),
				HTTPOnly: steel.F(c.HTTPOnly),
				Secure:   steel.F(c.Secure),
			}
			if c.URL != "" {
				cookie.URL = steel.F(c.URL)
			}
			if c.SameSite != "" {
				cookie.SameSite = steel.F(c.SameSite)
			}
			cookies = append(cookies, cookie)
		}
		out.Cookies = steel.F(cookies)
	}

	return out
}
