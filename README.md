[![Documentation](https://img.shields.io/badge/doc-reference-blue)](https://docs.steel.dev)
[![Discord](https://img.shields.io/badge/Discord-5865F2?logo=discord&logoColor=fff)](https://discord.gg/steel-dev)
[![X](https://img.shields.io/twitter/follow/steel_dev.svg?style=social&label=Follow)](https://x.com/intent/follow?screen_name=steel_dev)

# Steel Cookbook

A collection of production-ready examples demonstrating how to build powerful browser automations with Steel. From basic Playwright scripts to advanced AI agent workflows, these examples show you how to leverage Steel's cloud browser infrastructure for reliable, scalable web automation.

* **Basics:** Essential examples covering browser automation fundamentals with popular frameworks like Playwright, Puppeteer, and Selenium.

* **AI Agents:** AI-powered browser automation using computer use models (Claude, OpenAI, Gemini) and specialized agent frameworks (Browser-use, Stagehand, CrewAI).

* **Advanced Features:** Steel platform capabilities including persistent profiles, credential management, browser extensions, and session reuse.

## Example catalogs

Browse examples by your preferred language:

[![TypeScript](https://skillicons.dev/icons?i=ts)](#typescript)
[![JavaScript](https://skillicons.dev/icons?i=js)](#javascript)
[![Python](https://skillicons.dev/icons?i=python&theme=light)](#python)

Or explore the complete catalog below:

---

### Basics

Foundation examples for browser automation with Steel. Start here if you're new to Steel or want to integrate it with your preferred automation framework.

| Example Name | Languages |
|--------------|-----------|
| <a id="playwright">Playwright Integration</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/steel-playwright-starter) [<img src="https://skillicons.dev/icons?i=js" width="24" height="24">](examples/steel-playwright-starter-js) [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/steel-playwright-python-starter) |
| <a id="puppeteer">Puppeteer Integration</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/steel-puppeteer-starter) [<img src="https://skillicons.dev/icons?i=js" width="24" height="24">](examples/steel-puppeteer-starter-js) |
| <a id="selenium">Selenium Integration</a> | [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/steel-selenium-starter) |

### AI Agents

AI-powered browser automation that can understand, reason about, and interact with web pages autonomously.

#### Computer Use Models

Vision-based AI models that can control browsers by analyzing screenshots and executing actions.

| Example Name | Languages |
|--------------|-----------|
| <a id="claude-computer-use">Claude Computer Use</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/steel-claude-computer-use-node-starter) [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/steel-claude-computer-use-python-starter) |
| <a id="claude-mobile">Claude Computer Use (Mobile)</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/steel-claude-computer-use-mobile) |
| <a id="openai-computer-use">OpenAI Computer Use</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/steel-oai-computer-use-node-starter) [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/steel-oai-computer-use-python-starter) |
| <a id="gemini-computer-use">Gemini Computer Use</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/steel-gemini-computer-use-node-starter) [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/steel-gemini-computer-use-python-starter) |

#### Agent Frameworks

Specialized frameworks that provide high-level abstractions for building AI-powered browser automation workflows.

| Example Name | Languages |
|--------------|-----------|
| <a id="browser-use">Browser-use</a> | [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/steel-browser-use-starter) |
| <a id="stagehand">Stagehand</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/steel-stagehand-node-starter) [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/steel-stagehand-python-starter) |
| <a id="browser-use-captcha">Browser-use + CAPTCHA Solver</a> | [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/steel-browser-use-captcha-solver-starter) |
| <a id="agent-kit">Inngest AgentKit</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/steel-agent-kit-starter) |
| <a id="magnitude">Magnitude AI Testing</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/steel-magnitude-starter) |
| <a id="agno">Agno</a> | [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/steel-agno-starter) |
| <a id="crew-ai">CrewAI</a> | [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/steel-crew-ai-starter) |
| <a id="notte">Notte</a> | [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/steel-notte-starter) |

### Advanced Features

Steel platform features that enhance your browser automation workflows with persistent state, credential management, and more.

| Feature | Example |
|---------|---------|
| <a id="auth-context">Auth Context Reuse</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/steel-auth-context-starter) Reuse authentication state (cookies, local storage) across sessions |
| <a id="profiles">Persistent Profiles</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/steel-profiles-starter) Maintain browser state across sessions with persistent profiles |
| <a id="credentials">Credential Management</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/steel-credentials-starter) Securely store and automatically inject credentials |
| <a id="extensions">Browser Extensions</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/steel-extensions-starter) Load and use browser extensions in cloud browsers |
| <a id="files">File Handling</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/steel-files-api-starter) Upload and download files in cloud browser sessions |

---

## Language-Specific Catalogs

### TypeScript

**Basics**
- [Playwright](examples/steel-playwright-starter) - Playwright with TypeScript and session management
- [Puppeteer](examples/steel-puppeteer-starter) - Puppeteer with CDP connection and cloud browser automation

**AI Computer Use**
- [Claude Computer Use](examples/steel-claude-computer-use-node-starter) - Autonomous web interactions with Claude
- [Claude Computer Use (Mobile)](examples/steel-claude-computer-use-mobile) - Claude for mobile viewports
- [OpenAI Computer Use](examples/steel-oai-computer-use-node-starter) - OpenAI vision-based browser control
- [Gemini Computer Use](examples/steel-gemini-computer-use-node-starter) - Google Gemini computer use model

**Agent Frameworks**
- [Stagehand](examples/steel-stagehand-node-starter) - AI-powered browser automation with natural language
- [Coinbase AgentKit](examples/steel-agent-kit-starter) - Multi-agent networks and web scraping
- [Magnitude](examples/steel-magnitude-starter) - AI-powered testing framework

**Advanced Features**
- [Auth Context](examples/steel-auth-context-starter) - Reuse authentication across sessions
- [Profiles](examples/steel-profiles-starter) - Persistent browser profiles
- [Credentials](examples/steel-credentials-starter) - Credential management and injection
- [Extensions](examples/steel-extensions-starter) - Browser extension support
- [Files API](examples/steel-files-api-starter) - File upload and download handling

### JavaScript

**Basics**
- [Playwright (JS)](examples/steel-playwright-starter-js) - Playwright with vanilla JavaScript
- [Puppeteer (JS)](examples/steel-puppeteer-starter-js) - Puppeteer with vanilla JavaScript

### Python

**Basics**
- [Playwright](examples/steel-playwright-python-starter) - Playwright with Python
- [Selenium](examples/steel-selenium-starter) - Selenium WebDriver integration

**AI Computer Use**
- [Claude Computer Use](examples/steel-claude-computer-use-python-starter) - Autonomous browser control with Claude
- [OpenAI Computer Use](examples/steel-oai-computer-use-python-starter) - OpenAI computer use agent
- [Gemini Computer Use](examples/steel-gemini-computer-use-python-starter) - Google Gemini integration

**Agent Frameworks**
- [Stagehand](examples/steel-stagehand-python-starter) - Stagehand with Python
- [Browser-use](examples/steel-browser-use-starter) - Browser-use agent framework
- [Browser-use + CAPTCHA](examples/steel-browser-use-captcha-solver-starter) - Browser-use with CAPTCHA solving
- [Agno](examples/steel-agno-starter) - Agno toolkit-based automation
- [CrewAI](examples/steel-crew-ai-starter) - Multi-agent collaboration framework
- [Notte](examples/steel-notte-starter) - Notte browser agent framework

---

## Running the Examples

Each example contains a comprehensive README with setup instructions. Here's the general workflow:

### 1. Clone and Navigate

```bash
git clone https://github.com/steel-dev/steel-cookbook.git
cd steel-cookbook/examples/<example-name>
```

### 2. Install Dependencies

**TypeScript/JavaScript:**
```bash
npm install
# or
yarn install
# or
pnpm install
```

**Python:**
```bash
pip install -r requirements.txt
# or with pyproject.toml
pip install -e .
```

### 3. Configure Environment

Copy the `.env.example` to `.env` and add your Steel API key:

```bash
cp .env.example .env
```

Get your API key from the [Steel Dashboard](https://app.steel.dev).

### 4. Run the Example

**TypeScript:**
```bash
npm start
# or
npx tsx index.ts
```

**JavaScript:**
```bash
node index.js
```

**Python:**
```bash
python main.py
```

Refer to each example's README for specific requirements and advanced configuration options.

---

## Getting Steel API Access

All examples require a Steel API key. Steel provides cloud browser infrastructure with:

- **Managed browser sessions** - No infrastructure setup or maintenance
- **Built-in CAPTCHA solving** - Automatic CAPTCHA resolution
- **Proxy support** - Residential and datacenter proxy integration
- **Session persistence** - Maintain state across multiple sessions
- **Extension support** - Load browser extensions in cloud browsers

[Sign up for Steel](https://app.steel.dev) to get your API key and start building.

---

## Joining the Community

Stay connected with the Steel community:

- **[Discord](https://discord.gg/steel-dev)** - Get help, share feedback, and connect with other developers
- **[Documentation](https://docs.steel.dev)** - Comprehensive guides and API reference
- **[X/Twitter](https://x.com/steel_dev)** - Stay updated with the latest news and features

This is the perfect place to ask questions, share your automations, and learn from the community!

---

## Contributing

We welcome contributions! See the [Contributing Guide](CONTRIBUTING.md) for:

- Adding new examples
- Improving existing examples
- Reporting issues
- Suggesting new integrations

---

## Support

- **[Documentation](https://docs.steel.dev)** - Complete guides and tutorials
- **[API Reference](https://docs.steel.dev/api-reference)** - Detailed API documentation
- **[Discord Community](https://discord.gg/steel-dev)** - Live help and discussion
