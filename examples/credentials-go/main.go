// Store a credential in Steel's vault and let a session auto-fill the login form, no auth code in the automation.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credentials-go

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

const origin = "https://demo.testfire.net"

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

	fmt.Println("Storing credential...")
	_, err := client.Credentials.Create(ctx, steel.CredentialCreateParams{
		Origin: steel.F(origin),
		Value:  steel.F(map[string]string{"username": "admin", "password": "admin"}),
	})
	switch {
	case err == nil:
		fmt.Println("Credential stored.")
	case strings.Contains(err.Error(), "Credential already exists"):
		fmt.Println("Credential already exists, moving on.")
	default:
		return fmt.Errorf("create credential: %w", err)
	}

	fmt.Println("Creating Steel session with credentials enabled...")
	sess, err := client.Sessions.Create(ctx, steel.SessionCreateParams{
		Credentials: steel.F(steel.SessionCreateParamsCredentials{}),
	})
	if err != nil {
		return fmt.Errorf("create session: %w", err)
	}
	fmt.Printf("Session created. Watch it live at %s\n", sess.SessionViewerURL)

	defer func() {
		fmt.Println("Releasing session...")
		if _, err := client.Sessions.Release(ctx, sess.ID, steel.SessionReleaseParams{}); err != nil {
			fmt.Println("Release failed:", err)
		}
	}()

	cdpURL := fmt.Sprintf("%s&apiKey=%s", sess.WebsocketURL, apiKey)

	allocCtx, cancelAlloc := chromedp.NewRemoteAllocator(ctx, cdpURL, chromedp.NoModifyURL)
	defer cancelAlloc()

	browserCtx, cancelBrowser := chromedp.NewContext(allocCtx)
	defer cancelBrowser()

	runCtx, cancelRun := context.WithTimeout(browserCtx, 60*time.Second)
	defer cancelRun()

	fmt.Println("Navigating to the demo site...")
	var heading string
	err = chromedp.Run(runCtx,
		chromedp.Navigate(origin),
		chromedp.WaitVisible("#AccountLink", chromedp.ByID),
		chromedp.Click("#AccountLink", chromedp.ByID),
		chromedp.Sleep(2*time.Second),
		chromedp.Text("h1", &heading, chromedp.ByQuery),
	)
	if err != nil {
		return fmt.Errorf("run tasks: %w", err)
	}

	if strings.TrimSpace(heading) == "Hello Admin User" {
		fmt.Println("Success, you are logged in")
	} else {
		fmt.Printf("Uh oh, something went wrong. Heading was %q\n", strings.TrimSpace(heading))
	}

	return nil
}
