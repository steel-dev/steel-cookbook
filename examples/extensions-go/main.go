// Upload a Chrome extension once, attach it to a Steel session, and confirm it injected its UI.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/extensions-go

package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/chromedp/chromedp"
	"github.com/joho/godotenv"
	steel "github.com/steel-dev/steel-go"
)

const (
	extensionName = "Github_Isometric_Contribu"
	storeURL      = "https://chromewebstore.google.com/detail/github-isometric-contribu/mjoedlfflcchnleknnceiplgaeoegien"
	profileURL    = "https://github.com/junhsss"
	injectedSel   = "div.ic-contributions-wrapper"
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

	extID, err := resolveExtension(ctx, client)
	if err != nil {
		return err
	}

	fmt.Println("Creating Steel session with the extension attached...")
	sess, err := client.Sessions.Create(ctx, steel.SessionCreateParams{
		ExtensionIDs: steel.F([]string{extID}),
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

	fmt.Printf("Navigating to %s...\n", profileURL)
	if err := chromedp.Run(browserCtx, chromedp.Navigate(profileURL)); err != nil {
		return fmt.Errorf("navigate: %w", err)
	}

	waitCtx, cancelWait := context.WithTimeout(browserCtx, 30*time.Second)
	defer cancelWait()

	fmt.Printf("Waiting for the extension to inject %q...\n", injectedSel)
	if err := chromedp.Run(waitCtx, chromedp.WaitVisible(injectedSel, chromedp.ByQuery)); err != nil {
		fmt.Println("Extension UI did not appear. The extension may not have loaded.")
		return nil
	}

	fmt.Println("Extension UI confirmed: the session attached and rewrote the DOM.")
	return nil
}

func resolveExtension(ctx context.Context, client *steel.Client) (string, error) {
	fmt.Println("Looking for an existing extension upload...")
	list, err := client.Extensions.List(ctx)
	if err != nil {
		return "", fmt.Errorf("list extensions: %w", err)
	}

	for _, ext := range list.Extensions {
		if ext.Name == extensionName {
			fmt.Printf("Reusing existing extension %s\n", ext.ID)
			return ext.ID, nil
		}
	}

	fmt.Println("Not found. Uploading from the Chrome Web Store...")
	uploaded, err := client.Extensions.Upload(ctx, steel.ExtensionUploadParams{
		URL: steel.Ptr(storeURL),
	})
	if err != nil {
		return "", fmt.Errorf("upload extension: %w", err)
	}
	fmt.Printf("Uploaded extension %s\n", uploaded.ID)
	return uploaded.ID, nil
}
