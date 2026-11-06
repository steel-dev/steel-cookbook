// Connect Rod to a Steel cloud browser over CDP and scrape quotes.
// https://github.com/steel-dev/steel-cookbook/tree/main/examples/rod
package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/cdp"
	"github.com/gorilla/websocket"
	steel "github.com/steel-dev/sdk/go"
	"github.com/steel-dev/sdk/go/option"
)

type cdpSocket struct {
	conn *websocket.Conn
	mu   sync.Mutex
}

func (s *cdpSocket) Send(data []byte) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.conn.WriteMessage(websocket.TextMessage, data)
}

func (s *cdpSocket) Read() ([]byte, error) {
	_, data, err := s.conn.ReadMessage()
	return data, err
}

func connectCDP(ctx context.Context, wsURL string) (*cdp.Client, error) {
	conn, resp, err := websocket.DefaultDialer.DialContext(ctx, wsURL, nil)
	if err != nil {
		if resp != nil {
			return nil, fmt.Errorf("%w: %s", err, resp.Status)
		}
		return nil, err
	}
	return cdp.New().Start(&cdpSocket{conn: conn}), nil
}

func main() {
	apiKey := os.Getenv("STEEL_API_KEY")
	if apiKey == "" {
		fmt.Println("Set STEEL_API_KEY (get one at https://app.steel.dev/settings/api-keys)")
		os.Exit(1)
	}

	ctx := context.Background()
	client := steel.NewClient(option.WithSteelAPIKey(apiKey))

	fmt.Println("Creating Steel session...")
	session, err := client.Sessions.New(ctx, steel.SessionNewParams{
		Dimensions: steel.F(steel.SessionNewParamsDimensions{Width: steel.F(int64(1280)), Height: steel.F(int64(800))}),
	})
	if err != nil {
		fmt.Printf("Failed to create session: %v\n", err)
		os.Exit(1)
	}
	fmt.Printf("Session live at %s\n\n", session.SessionViewerURL)

	defer func() {
		fmt.Println("\nReleasing session...")
		if _, err := client.Sessions.Release(ctx, session.ID); err != nil {
			fmt.Printf("Failed to release session: %v\n", err)
			return
		}
		fmt.Println("Session released")
	}()

	cdpURL := fmt.Sprintf("%s&apiKey=%s", session.WebsocketURL, apiKey)
	cdpClient, err := connectCDP(ctx, cdpURL)
	if err != nil {
		fmt.Printf("Failed to connect to browser: %v\n", err)
		os.Exit(1)
	}
	browser := rod.New().Client(cdpClient).MustConnect()
	defer browser.MustClose()
	fmt.Println("Connected to browser via Rod")

	fmt.Println("Scraping quotes.toscrape.com...")
	page := browser.MustPage("https://quotes.toscrape.com").MustWaitStable()

	cards := page.MustElements(".quote")
	fmt.Printf("\nFound %d quotes on the page:\n\n", len(cards))

	for i, card := range cards {
		if i >= 5 {
			break
		}
		text := strings.Trim(card.MustElement(".text").MustText(), "“”\"")
		author := card.MustElement(".author").MustText()

		tags := card.MustElements(".tag")
		labels := make([]string, 0, len(tags))
		for _, tag := range tags {
			labels = append(labels, tag.MustText())
		}

		fmt.Printf("%d. %s\n   - %s\n", i+1, text, author)
		if len(labels) > 0 {
			fmt.Printf("   tags: %s\n", strings.Join(labels, ", "))
		}
		fmt.Println()
	}

	page.MustScreenshot("quotes.png")
	fmt.Println("Saved screenshot to quotes.png")
	fmt.Println("Done!")
}
