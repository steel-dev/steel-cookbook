// Upload a local CSV to a Steel session and wire its server-side path into a remote file input over CDP.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/files-go

package main

import (
	"context"
	"fmt"
	"os"
	"time"

	"github.com/chromedp/cdproto/dom"
	"github.com/chromedp/chromedp"
	"github.com/joho/godotenv"
	steel "github.com/steel-dev/steel-go"
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

	fmt.Println("Creating Steel session...")
	sess, err := client.Sessions.Create(ctx, steel.SessionCreateParams{})
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

	csvBytes, err := os.ReadFile("./assets/stock.csv")
	if err != nil {
		return fmt.Errorf("read local csv: %w", err)
	}

	fmt.Println("Uploading stock.csv to the session...")
	uploaded, err := client.Sessions.Files.Upload(ctx, sess.ID, steel.SessionFileUploadParams{
		File: steel.FileUpload{
			Name:        "stock.csv",
			Content:     csvBytes,
			ContentType: "text/csv",
		},
	})
	if err != nil {
		return fmt.Errorf("upload file: %w", err)
	}
	fmt.Printf("Uploaded. Path inside the session VM: %s\n", uploaded.Path)

	cdpURL := fmt.Sprintf("%s&apiKey=%s", sess.WebsocketURL, apiKey)

	allocCtx, cancelAlloc := chromedp.NewRemoteAllocator(ctx, cdpURL, chromedp.NoModifyURL)
	defer cancelAlloc()

	browserCtx, cancelBrowser := chromedp.NewContext(allocCtx)
	defer cancelBrowser()

	runCtx, cancelRun := context.WithTimeout(browserCtx, 60*time.Second)
	defer cancelRun()

	fmt.Println("Loading csvplot.com and feeding it the uploaded file...")
	var screenshot []byte
	err = chromedp.Run(runCtx,
		chromedp.Navigate("https://www.csvplot.com/"),
		chromedp.WaitReady("#load-file", chromedp.ByQuery),
		setRemoteFileInput("#load-file", uploaded.Path),
		waitForChart("svg.main-svg"),
		chromedp.FullScreenshot(&screenshot, 90),
	)
	if err != nil {
		return fmt.Errorf("run tasks: %w", err)
	}

	const shotPath = "stock.png"
	if err := os.WriteFile(shotPath, screenshot, 0o644); err != nil {
		return fmt.Errorf("write screenshot: %w", err)
	}
	fmt.Printf("Saved chart to %s\n", shotPath)

	return nil
}

func waitForChart(selector string) chromedp.Action {
	return chromedp.ActionFunc(func(ctx context.Context) error {
		expr := fmt.Sprintf(`document.querySelectorAll(%q).length > 0`, selector)
		for i := 0; i < 60; i++ {
			var ready bool
			if err := chromedp.Evaluate(expr, &ready).Do(ctx); err == nil && ready {
				return nil
			}
			if err := chromedp.Sleep(500 * time.Millisecond).Do(ctx); err != nil {
				return err
			}
		}
		return fmt.Errorf("chart %q did not render", selector)
	})
}

func setRemoteFileInput(selector, remotePath string) chromedp.Action {
	return chromedp.ActionFunc(func(ctx context.Context) error {
		root, err := dom.GetDocument().Do(ctx)
		if err != nil {
			return fmt.Errorf("get document: %w", err)
		}
		nodeID, err := dom.QuerySelector(root.NodeID, selector).Do(ctx)
		if err != nil {
			return fmt.Errorf("query %q: %w", selector, err)
		}
		return dom.SetFileInputFiles([]string{remotePath}).WithNodeID(nodeID).Do(ctx)
	})
}
