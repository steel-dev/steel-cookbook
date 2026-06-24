// Store a credential in Steel's vault and let a session auto-fill the login form, no auth code in the automation.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/credentials-go

package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/chromedp/cdproto/security"
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

// evalString runs a JS expression with a short timeout so a navigation that
// destroys the execution context mid-eval bounces back instead of blocking.
func evalString(ctx context.Context, expr string) string {
	ictx, cancel := context.WithTimeout(ctx, 2*time.Second)
	defer cancel()
	var out string
	_ = chromedp.Evaluate(expr, &out).Do(ictx)
	return out
}

// waitForAutofill polls the login form until Steel injects the vaulted username,
// before the credential's auto-submit navigates away.
func waitForAutofill(out *string, selector string) chromedp.Action {
	expr := fmt.Sprintf(`(document.querySelector(%q) ? document.querySelector(%q).value : "").trim()`, selector, selector)
	return chromedp.ActionFunc(func(ctx context.Context) error {
		for i := 0; i < 100; i++ {
			if v := evalString(ctx, expr); v != "" {
				*out = v
				return nil
			}
			if err := chromedp.Sleep(200 * time.Millisecond).Do(ctx); err != nil {
				return err
			}
		}
		return nil
	})
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
	case strings.Contains(err.Error(), "already exists"):
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

	fmt.Println("Opening the login page; Steel auto-fills it from the vault...")
	var filledUser string
	err = chromedp.Run(runCtx,
		security.Enable(),
		security.SetIgnoreCertificateErrors(true),
		chromedp.Navigate(origin+"/login.jsp"),
		waitForAutofill(&filledUser, "#uid"),
	)
	if err != nil {
		return fmt.Errorf("run tasks: %w", err)
	}

	if filledUser != "" {
		fmt.Printf("Success: Steel auto-filled the login form with %q from the vault, no credentials in this code.\n", filledUser)
	} else {
		fmt.Println("Uh oh, the login form was not auto-filled.")
	}

	return nil
}
