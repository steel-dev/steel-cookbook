# Steel Cookbook

<!-- ABOUTME: This is the ROOT README template for the steel-cookbook repository. It serves as the main entry point for developers looking for Steel examples and starter projects. -->

> Your tagline here - e.g., *Official collection of Steel examples, starter projects, and recipes for building web automations*

<!-- TLDR: Time-based learning paths for developers of all levels -->

## TL;DR - Choose Your Path

**[5 MIN] Just getting started?**
- [Hello World Starter](#) - Your first Steel session in under 5 minutes
- [Quick Setup Guide](#) - Get your API key and run your first automation

**[10 MIN] Want to build something practical?**
- [Web Scraping Basics](#) - Extract data from any website
- [Form Automation](#) - Auto-fill and submit forms at scale
- [Screenshot API](#) - Capture pages without headless hassles

**[30 MIN] Ready for production?**
- [Agent Loops with Computer Actions](#) - Build AI agents that control browsers
- [Credential Management](#) - Store and reuse login sessions
- [Proxy Integration](#) - Route traffic through residential IPs

---

## About the Cookbook

The Steel Cookbook is your practical guide to browser automation in the cloud. Each example is a **complete, runnable project** designed to teach real-world skills you can use immediately.

<!-- What You'll Learn Section: Educational value proposition -->

### What You'll Learn

- **Fundamentals**: Create sessions, manage lifecycle, handle errors properly
- **Automation Patterns**: Scraping, form filling, navigation, data extraction
- **Advanced Topics**: Agent loops, credential management, proxy networks
- **Production Readiness**: Error handling, cleanup, logging, testing

<!-- Categories: Organize by use case/skill level -->

## Browse by Category

### Getting Started

| Example | Difficulty | Description | Tech |
|---------|------------|-------------|------|
| [Hello World](#) | ![Beginner](https://img.shields.io/badge/Beginner-green) | Your first Steel session | TypeScript |
| [Quick Start - Python](#) | ![Beginner](https://img.shields.io/badge/Beginner-green) | Get started with Python | Python |

### Web Scraping & Data Extraction

| Example | Difficulty | Description | Tech |
|---------|------------|-------------|------|
| [Basic Scraping](#) | ![Beginner](https://img.shields.io/badge/Beginner-green) | Extract text, links, images | TypeScript |
| [Pagination Handling](#) | ![Intermediate](https://img.shields.io/badge/Intermediate-yellow) | Navigate multi-page content | TypeScript |
| [JavaScript-Heavy Sites](#) | ![Intermediate](https://img.shields.io/badge/Intermediate-yellow) | Wait for dynamic content | Python |

### AI & Agents

| Example | Difficulty | Description | Tech |
|---------|------------|-------------|------|
| [Computer Actions Loop](#) | ![Advanced](https://img.shields.io/badge/Advanced-red) | Vision agent with GLM-4.6V | TypeScript |
| [OpenAI Computer Use](#) | ![Advanced](https://img.shields.io/badge/Advanced-red) | GPT-4o browser control | Python |
| [Browser-Use Integration](#) | ![Advanced](https://img.shields.io/badge/Advanced-red) | Agent framework integration | Python |

### Authentication & Sessions

| Example | Difficulty | Description | Tech |
|---------|------------|-------------|------|
| [Credentials API](#) | ![Intermediate](https://img.shields.io/badge/Intermediate-yellow) | Store and auto-fill logins | TypeScript |
| [Session Reuse](#) | ![Intermediate](https://img.shields.io/badge/Intermediate-yellow) | Persist auth between runs | TypeScript |
| [Cookie Management](#) | ![Intermediate](https://img.shields.io/badge/Intermediate-yellow) | Handle cookies properly | Python |

### Production Features

| Example | Difficulty | Description | Tech |
|---------|------------|-------------|------|
| [Proxy Networks](#) | ![Intermediate](https://img.shields.io/badge/Intermediate-yellow) | Route through residential IPs | TypeScript |
| [CAPTCHA Solving](#) | ![Intermediate](https://img.shields.io/badge/Intermediate-yellow) | Auto-solve challenges | Python |
| [Error Handling](#) | ![Intermediate](https://img.shields.io/badge/Intermediate-yellow) | Robust failure recovery | TypeScript |
| [Testing Automations](#) | ![Advanced](https://img.shields.io/badge/Advanced-red) | Test your browser scripts | TypeScript |

---

## Prerequisites

Before diving into any example, make sure you have:

- **Steel API Key**: [Get your free API key here](https://app.steel.dev/settings/api-keys) (100 free hours included!)
- **Node.js 18+** OR **Python 3.11+**: Depending on your chosen language
- **Package Manager**: npm, yarn, pnpm, or bun (Node.js) OR pip/uv (Python)

<!-- Language-specific setup section: Show both TypeScript and Python paths -->

## Quick Setup

### Option A: TypeScript / Node.js

```bash
# Clone and navigate to an example
cd examples/[YOUR_CHOSEN_EXAMPLE]

# Install dependencies
npm install

# Copy env template
cp .env.example .env

# Add your STEEL_API_KEY to .env
# Then run!
npm start
```

### Option B: Python

```bash
# Clone and navigate to an example
cd examples/[YOUR_CHOSEN_EXAMPLE]

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Copy env template
cp .env.example .env

# Add your STEEL_API_KEY to .env
# Then run!
python main.py
```

---

## Key Concepts

Understanding these core concepts will help you get the most out of Steel:

### Session Lifecycle

Every Steel automation follows this pattern:

```typescript
// 1. Create a session
const session = await client.sessions.create({});

try {
  // 2. Connect your automation tool (Playwright, Puppeteer, etc.)
  // 3. Run your automation
} finally {
  // 4. ALWAYS release the session
  await client.sessions.release(session.id);
}
```

### Sessions vs. Browsers

| Concept | Description | When to Use |
|---------|-------------|-------------|
| **Session** | A cloud browser instance managed by Steel | Always - this is your base unit |
| **Browser Context** | Isolated context within a session (cookies, localStorage) | When you need multiple users in one session |
| **CDP Endpoint** | Chrome DevTools Protocol connection URL | When connecting Playwright/Puppeteer |

---

## Why Steel?

<!-- Comparison table: Steel vs traditional headless browsers -->

| Feature | Steel | Traditional Headless |
|---------|-------|---------------------|
| **Setup** | One API call | Install Chrome, drivers, dependencies |
| **Detection** | Anti-bot fingerprinting built-in | Easily detected |
| **Infrastructure** | Cloud-managed | Self-hosted |
| **Proxies** | Built-in residential network | Manual setup required |
| **CAPTCHA** | Auto-solved | Manual integration needed |
| **Scaling** | Instant horizontal scale | Manual orchestration |

---

## FAQ

**Q: Do I need to install Chrome or any browser?**
A: No! Steel provides fully-managed cloud browser sessions. Just install the Steel SDK and go.

**Q: Can I use my existing Playwright/Puppeteer scripts?**
A: Yes! Steel provides CDP endpoints that work seamlessly with Playwright, Puppeteer, and Selenium.

**Q: How much does it cost?**
A: New accounts get 100 free hours. After that, see [pricing](https://steel.dev/pricing).

**Q: Is Steel only for scraping?**
A: No! Use Steel for testing, agent automation, screenshot generation, form filling, and more.

**Q: Can I run multiple sessions in parallel?**
A: Yes! Create as many sessions as you need for concurrent automations.

---

## Contributing

Want to add an example to the cookbook? We'd love that!

1. Copy the [template](./templates/typescript/README.md) that matches your language
2. Build something useful
3. Follow our [contributing guide](./CONTRIBUTING.md)

---

## Support

- **Documentation**: [docs.steel.dev](https://docs.steel.dev)
- **API Reference**: [docs.steel.dev/api-reference](https://docs.steel.dev/api-reference)
- **Discord Community**: [Join the Steel Discord](https://discord.gg/steel-dev)
- **GitHub Issues**: [Report bugs or request features](https://github.com/steel-dev/steel-cookbook/issues)

---

## License

MIT License - see [LICENSE](./LICENSE) for details.
