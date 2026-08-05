# Steel E-commerce Session Context Reuse

This example demonstrates how to use Steel's Session Context feature to maintain state across multiple browser sessions in an e-commerce workflow. It shows a practical application of session context reuse by:

1. Setting up a guest session with a demo e-commerce site
2. Adding products to a shopping cart
3. Capturing the session context
4. Creating a new session with the saved context
5. Completing the checkout process in the new session

This approach is useful for:

- Long-running or multi-step workflows that might exceed session timeouts
- Splitting complex operations across multiple sessions
- Improving resilience by saving state between workflow stages
- Resource optimization by releasing browser sessions when not needed
- Testing different scenarios with the same starting point

## Getting Started

### Prerequisites

- Node.js (v14+ recommended)
- npm or yarn
- A Steel API key - [Get one here](https://steel.dev/)

### Setup

1. Clone the repository
2. Navigate to this example directory:
   ```bash
   cd examples/steel-ecommerce-session-reuse-starter
   ```
3. Install dependencies:
   ```bash
   npm install
   # or with yarn
   yarn install
   ```
4. Copy the `.env.example` file to `.env` and add your Steel API key:
   ```bash
   cp .env.example .env
   # Then edit the .env file with your editor of choice
   ```

### Running the Example

Run the example with:

```bash
npm start
# or with yarn
yarn start
```

The script will:

1. Create an initial Steel browser session
2. Access the Demo Blaze e-commerce site as a guest user
3. Browse available products and add one to the cart
4. Capture the session context (cookies, local storage where available, etc.)
5. Release the first session
6. Create a new session with the captured context
7. Navigate to the cart and proceed with checkout
8. Complete the purchase process

## Implementation Notes

### Guest Flow
This example uses a guest flow approach (no login required) to make it easier to run without requiring account creation on the demo site.

### Cart Persistence
Demo Blaze uses localStorage for cart data, which may not fully transfer between sessions. The example handles this gracefully by:

1. Checking if cart items transferred to the new session
2. Adding products again in the new session if needed

This limitation is specific to the demo site. Sites using cookies or session storage for cart data would have better state persistence across sessions.

## Benefits of Multi-Session Approach

- **Workflow Resilience**: If a long process fails halfway, it can be resumed from a saved state
- **Resource Optimization**: Browser sessions can be terminated after completing specific steps
- **Flexibility**: Complex processes can be broken into separate execution steps
- **Testing**: Different checkout scenarios can be tested without repeating the entire shopping flow

## Understanding the Code

### Key Concepts

- **Session Context Capture**: Using `client.sessions.context()` to capture the browser state
- **Context Reuse**: Creating a new session with `sessionContext` parameter
- **Workflow Continuity**: Maintaining authenticated state and cart contents across sessions
- **E-commerce Automation**: Automating common shopping tasks (login, product selection, checkout)

### Code Walkthrough

The example demonstrates:

1. **Authentication**:
   - Login to a demo e-commerce site
   - Verification of successful login

2. **Shopping Cart Management**:
   - Navigation to product categories
   - Adding products to cart
   - Verifying cart contents

3. **Session Context Transfer**:
   - Capturing authenticated session state
   - Releasing the first session
   - Creating a new session with the saved context

4. **Checkout Process**:
   - Verifying the cart contents persisted to the new session
   - Filling out checkout information
   - Placing an order
   - Verifying successful purchase

## Customization

You can modify this example for your own use cases:

- Change the target website to any other e-commerce site
- Customize the user credentials and checkout information
- Add more steps to the workflow (like product filtering, comparison, etc.)
- Implement error handling for specific site behaviors

## Free Tier Compatibility

This example works with Steel's free tier as it:
- Uses minimal resources
- Doesn't rely on paid-tier-only features
- Keeps sessions short and focused
- Doesn't require proxy or specialized configurations

## Learn More

- [Steel Documentation](https://docs.steel.dev/)
- [Steel Sessions API](https://docs.steel.dev/sessions)
- [Playwright Documentation](https://playwright.dev/docs/api/class-playwright)

## License

This example is licensed under the MIT License - see the LICENSE file for details.
