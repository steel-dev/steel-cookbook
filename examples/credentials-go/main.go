// Store a credential in Steel's vault and let a session auto-fill the login form, no auth code in the automation.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credentials-go

package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/chromedp/chromedp"
	"github.com/joho/godotenv"
	steel "github.com/steel-dev/sdk/go"
	"github.com/steel-dev/sdk/go/option"
)

const origin = "https://practice.expandtesting.com"

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

// evalString runs a JS expression with a short timeout so a navigation that
// destroys the execution context mid-eval bounces back instead of blocking.
func evalString(ctx context.Context, expr string) string {
	ictx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	var out string
	_ = chromedp.Evaluate(expr, &out).Do(ictx)
	return out
}

func waitForPath(path string) chromedp.Action {
	return chromedp.ActionFunc(func(ctx context.Context) error {
		for i := 0; i < 100; i++ {
			if evalString(ctx, "location.pathname") == path {
				return nil
			}
			if err := chromedp.Sleep(200 * time.Millisecond).Do(ctx); err != nil {
				return err
			}
		}
		return fmt.Errorf("the page never reached %s", path)
	})
}

func run(apiKey string) error {
	ctx := context.Background()
	client := steel.NewClient(option.WithSteelAPIKey(apiKey))

	fmt.Println("Storing credential...")
	existing, err := client.Credentials.List(ctx, steel.CredentialListParams{
		Origin: steel.F(origin),
	})
	if err != nil {
		return fmt.Errorf("list credentials: %w", err)
	}
	if len(existing.Credentials) > 0 {
		fmt.Println("Credential already exists, moving on.")
	} else {
		if _, err := client.Credentials.New(ctx, steel.CredentialNewParams{
			Origin: steel.F(origin),
			Value:  steel.F(map[string]string{"username": "practice", "password": "SuperSecretPassword!"}),
		}); err != nil {
			return fmt.Errorf("create credential: %w", err)
		}
		fmt.Println("Credential stored.")
	}

	fmt.Println("Creating Steel session with credentials enabled...")
	sess, err := client.Sessions.New(ctx, steel.SessionNewParams{
		Credentials: steel.F(steel.SessionNewParamsCredentials{}),
	})
	if err != nil {
		return fmt.Errorf("create session: %w", err)
	}
	fmt.Printf("Session created. Watch it live at %s\n", sess.SessionViewerURL)

	defer func() {
		fmt.Println("Releasing session...")
		if _, err := client.Sessions.Release(ctx, sess.ID); err != nil {
			fmt.Println("Release failed:", err)
		}
	}()

	cdpURL := sess.WebsocketURL

	allocCtx, cancelAlloc := chromedp.NewRemoteAllocator(ctx, cdpURL, chromedp.NoModifyURL)
	defer cancelAlloc()

	browserCtx, cancelBrowser := chromedp.NewContext(allocCtx)
	defer cancelBrowser()

	runCtx, cancelRun := context.WithTimeout(browserCtx, 60*time.Second)
	defer cancelRun()

	fmt.Println("Opening the login page; Steel fills and submits it from the vault...")
	var message string
	err = chromedp.Run(runCtx,
		chromedp.Navigate(origin+"/login"),
		waitForPath("/secure"),
		chromedp.Text("#flash b", &message, chromedp.ByQuery),
	)
	if err != nil {
		return fmt.Errorf("run tasks: %w", err)
	}

	fmt.Printf("Steel signed in. The site says: %s\n", message)

	return nil
}
