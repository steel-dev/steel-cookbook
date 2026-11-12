// Persist a browser identity across two Steel sessions with chromedp, proving a cart survives via a profile.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/profiles-go

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

const (
	booksURL = "https://demowebshop.tricentis.com/books"
	cartURL  = "https://demowebshop.tricentis.com/cart"
)

const clickAddToCart = `
(() => {
  const btn = document.querySelector(".product-box-add-to-cart-button")
    || document.querySelector("input[value='Add to cart']");
  if (!btn) return false;
  btn.click();
  return true;
})()
`

const cartQty = `
(() => {
  const el = document.querySelector(".cart-qty");
  return el ? el.textContent.trim() : "";
})()
`

const countCartRows = `document.querySelectorAll(".cart tbody tr").length`

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
	client := steel.NewClient(option.WithSteelAPIKey(apiKey))

	fmt.Println("Steel Profiles Demo")
	fmt.Println("============================================================")

	profileID, viewer1, err := seedCart(ctx, client)
	if err != nil {
		return err
	}

	fmt.Println("\nWaiting for the profile to be saved...")
	if err := waitForProfile(ctx, client, profileID); err != nil {
		return err
	}
	fmt.Println("Profile is READY")

	rows, viewer2, err := verifyCart(ctx, client, profileID)
	if err != nil {
		return err
	}

	fmt.Println("\n------------------------------------------------------------")
	fmt.Printf("Profile ID: %s\n", profileID)
	fmt.Printf("Session #1 viewer: %s\n", viewer1)
	fmt.Printf("Session #2 viewer: %s\n", viewer2)

	if rows > 0 {
		fmt.Printf("Found %d item(s) in the cart. Profile persistence works.\n", rows)
	} else {
		fmt.Println("Cart was empty. Profile persistence did not carry the state forward.")
	}

	return nil
}

func seedCart(ctx context.Context, client *steel.Client) (string, string, error) {
	sess, err := client.Sessions.New(ctx, steel.SessionNewParams{
		PersistProfile: steel.F(true),
	})
	if err != nil {
		return "", "", fmt.Errorf("create session #1: %w", err)
	}
	defer release(ctx, client, sess.ID, "#1")

	profileID := sess.ProfileID
	fmt.Printf("\nSession #1 created with a fresh profile.\n")
	fmt.Printf("View live at %s\n", sess.SessionViewerURL)
	fmt.Printf("Profile ID: %s\n", profileID)

	browserCtx, cancel := connect(ctx, sess.WebsocketURL)
	defer cancel()

	runCtx, cancelRun := context.WithTimeout(browserCtx, 60*time.Second)
	defer cancelRun()

	fmt.Println("Adding the first book to the cart...")
	var clicked bool
	var qty string
	err = chromedp.Run(runCtx,
		chromedp.Navigate(booksURL),
		chromedp.WaitVisible(".product-grid, .item-box", chromedp.ByQuery),
		chromedp.Evaluate(clickAddToCart, &clicked),
	)
	if err != nil {
		return "", "", fmt.Errorf("seed cart: %w", err)
	}
	if !clicked {
		return "", "", fmt.Errorf("no add-to-cart button found on %s", booksURL)
	}
	if err := chromedp.Run(runCtx, waitForCartQty(&qty)); err != nil {
		return "", "", fmt.Errorf("seed cart: %w", err)
	}
	fmt.Printf("Added item. Header cart count now reads %q.\n", qty)

	return profileID, sess.SessionViewerURL, nil
}

func verifyCart(ctx context.Context, client *steel.Client, profileID string) (int, string, error) {
	sess, err := client.Sessions.New(ctx, steel.SessionNewParams{
		PersistProfile: steel.F(true),
		ProfileID:      steel.F(profileID),
	})
	if err != nil {
		return 0, "", fmt.Errorf("create session #2: %w", err)
	}
	defer release(ctx, client, sess.ID, "#2")

	fmt.Printf("\nSession #2 created from profile %s.\n", profileID)
	fmt.Printf("View live at %s\n", sess.SessionViewerURL)

	browserCtx, cancel := connect(ctx, sess.WebsocketURL)
	defer cancel()

	runCtx, cancelRun := context.WithTimeout(browserCtx, 60*time.Second)
	defer cancelRun()

	fmt.Println("Opening the cart in the new browser...")
	var rows int
	err = chromedp.Run(runCtx,
		chromedp.Navigate(cartURL),
		chromedp.WaitVisible(".page-title", chromedp.ByQuery),
		chromedp.Evaluate(countCartRows, &rows),
	)
	if err != nil {
		return 0, "", fmt.Errorf("verify cart: %w", err)
	}

	return rows, sess.SessionViewerURL, nil
}

func connect(ctx context.Context, websocketURL string) (context.Context, context.CancelFunc) {
	allocCtx, cancelAlloc := chromedp.NewRemoteAllocator(ctx, websocketURL, chromedp.NoModifyURL)
	browserCtx, cancelBrowser := chromedp.NewContext(allocCtx)
	return browserCtx, func() {
		cancelBrowser()
		cancelAlloc()
	}
}

func release(ctx context.Context, client *steel.Client, id, label string) {
	fmt.Printf("Releasing session %s...\n", label)
	if _, err := client.Sessions.Release(ctx, id); err != nil {
		fmt.Printf("Release of %s failed: %v\n", label, err)
	}
}

func waitForCartQty(qty *string) chromedp.Action {
	return chromedp.ActionFunc(func(ctx context.Context) error {
		for i := 0; i < 20; i++ {
			if err := chromedp.Evaluate(cartQty, qty).Do(ctx); err != nil {
				return err
			}
			if *qty != "" && *qty != "(0)" {
				return nil
			}
			if err := chromedp.Sleep(500 * time.Millisecond).Do(ctx); err != nil {
				return err
			}
		}
		return fmt.Errorf("the cart count still reads %q after the click", *qty)
	})
}

func waitForProfile(ctx context.Context, client *steel.Client, id string) error {
	for i := 0; i < 60; i++ {
		profile, err := client.Profiles.Get(ctx, id, steel.ProfileGetParams{})
		if err != nil {
			return fmt.Errorf("get profile: %w", err)
		}
		switch profile.Status {
		case steel.ProfileGetResponseStatusReady:
			return nil
		case steel.ProfileGetResponseStatusUploading:
			time.Sleep(time.Second)
		default:
			return fmt.Errorf("profile %s is %s", id, profile.Status)
		}
	}
	return fmt.Errorf("profile %s is still uploading", id)
}
