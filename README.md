[![Documentation](https://img.shields.io/badge/doc-reference-blue)](https://docs.steel.dev)
[![Discord](https://img.shields.io/badge/Discord-5865F2?logo=discord&logoColor=fff)](https://discord.gg/steel-dev)
[![X](https://img.shields.io/twitter/follow/steel_dev.svg?style=social&label=Follow)](https://x.com/intent/follow?screen_name=steeldotdev)

# Steel Cookbook

A collection of production-ready examples demonstrating how to build powerful browser automations with Steel. From basic Playwright scripts to advanced AI agent workflows, these examples show you how to leverage Steel's cloud browser infrastructure for reliable, scalable web automation.

* **Basics:** Essential examples covering browser automation fundamentals with popular frameworks like Playwright, Puppeteer, and Selenium.

* **AI Agents:** AI-powered browser automation using computer use models (Claude, OpenAI, Gemini) and specialized agent frameworks (Browser-use, Stagehand, CrewAI).

* **Advanced Features:** Steel platform capabilities including persistent profiles, credential management, browser extensions, and session reuse.

## Example catalogs

Browse examples by your preferred language:

[![TypeScript](https://skillicons.dev/icons?i=ts)](#typescript)
[![Python](https://skillicons.dev/icons?i=python&theme=light)](#python)

Or explore the complete catalog below:

---

### Basics

Foundation examples for browser automation with Steel. Start here if you're new to Steel or want to integrate it with your preferred automation framework.

| Example Name | Languages |
|--------------|-----------|
| <a id="playwright">Playwright Integration</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/playwright-ts) [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/playwright-py) |
| <a id="puppeteer">Puppeteer Integration</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/puppeteer-ts) |
| <a id="selenium">Selenium Integration</a> | [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/selenium) |

### AI Agents

AI-powered browser automation that can understand, reason about, and interact with web pages autonomously.

#### Computer Use Models

Vision-based AI models that can control browsers by analyzing screenshots and executing actions.

| Example Name | Languages |
|--------------|-----------|
| <a id="claude-computer-use">Claude Computer Use</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/claude-computer-use-ts) [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/claude-computer-use-py) |
| <a id="claude-mobile">Claude Computer Use (Mobile)</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/claude-computer-use-mobile) |
| <a id="openai-computer-use">OpenAI Computer Use</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/openai-computer-use-ts) [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/openai-computer-use-py) |
| <a id="gemini-computer-use">Gemini Computer Use</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/gemini-computer-use-ts) [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/gemini-computer-use-py) |

#### Agent Frameworks

Specialized frameworks that provide high-level abstractions for building AI-powered browser automation workflows.

| Example Name | Languages |
|--------------|-----------|
| <a id="browser-use">Browser-use</a> | [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/browser-use) |
| <a id="stagehand">Stagehand</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/stagehand-ts) [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/stagehand-py) |
| <a id="browser-use-captcha">Browser-use + CAPTCHA (Auto)</a> | [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/browser-use-captcha-auto) |
| <a id="browser-use-captcha-manual">Browser-use + reCAPTCHA v2 (Manual)</a> | [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/browser-use-captcha-manual) |
| <a id="agentkit">Inngest AgentKit</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/agentkit) |
| <a id="magnitude">Magnitude AI Testing</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/magnitude) |
| <a id="agno">Agno</a> | [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/agno) |
| <a id="crewai">CrewAI</a> | [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/crewai) |
| <a id="notte">Notte</a> | [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/notte) |
| <a id="vercel-ai-sdk">Vercel AI SDK v6</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/vercel-ai-sdk-ts) |
| <a id="vercel-ai-sdk-nextjs">Vercel AI SDK v6 (Next.js)</a> | [<img src="https://skillicons.dev/icons?i=nextjs" width="24" height="24">](examples/vercel-ai-sdk-nextjs) |
| <a id="openai-agents">OpenAI Agents SDK</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/openai-agents-ts) [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/openai-agents-py) |
| <a id="pydantic-ai">Pydantic AI</a> | [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/pydantic-ai) |
| <a id="claude-agent-sdk">Claude Agent SDK</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/claude-agent-sdk-ts) [<img src="https://skillicons.dev/icons?i=python&theme=light" width="24" height="24">](examples/claude-agent-sdk-py) |

### Advanced Features

Steel platform features that enhance your browser automation workflows with persistent state, credential management, and more.

| Feature | Example |
|---------|---------|
| <a id="auth-context">Auth Context Reuse</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/auth-context) Reuse authentication state (cookies, local storage) across sessions |
| <a id="profiles">Persistent Profiles</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/profiles) Maintain browser state across sessions with persistent profiles |
| <a id="credentials">Credential Management</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/credentials) Securely store and automatically inject credentials |
| <a id="extensions">Browser Extensions</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/extensions) Load and use browser extensions in cloud browsers |
| <a id="files">File Handling</a> | [<img src="https://skillicons.dev/icons?i=ts" width="24" height="24">](examples/files-api) Upload and download files in cloud browser sessions |

---

## Language-Specific Catalogs

### TypeScript

**Basics**
- [Playwright](examples/playwright-ts) - Playwright with TypeScript and session management
- [Puppeteer](examples/puppeteer-ts) - Puppeteer with CDP connection and cloud browser automation

**AI Computer Use**
- [Claude Computer Use](examples/claude-computer-use-ts) - Autonomous web interactions with Claude
- [Claude Computer Use (Mobile)](examples/claude-computer-use-mobile) - Claude for mobile viewports
- [OpenAI Computer Use](examples/openai-computer-use-ts) - OpenAI vision-based browser control
- [Gemini Computer Use](examples/gemini-computer-use-ts) - Google Gemini computer use model

**Agent Frameworks**
- [Stagehand](examples/stagehand-ts) - AI-powered browser automation with natural language
- [Inngest AgentKit](examples/agentkit) - Multi-agent networks and web scraping
- [Magnitude](examples/magnitude) - AI-powered testing framework
- [Vercel AI SDK v6](examples/vercel-ai-sdk-ts) - ToolLoopAgent with typed tools and structured output
- [Vercel AI SDK v6 (Next.js)](examples/vercel-ai-sdk-nextjs) - Next.js chat app with streamText, useChat, and an embedded Live View
- [OpenAI Agents SDK](examples/openai-agents-ts) - Agent with tool() + Zod outputType for structured final answers
- [Claude Agent SDK](examples/claude-agent-sdk-ts) - Anthropic's first-party agent loop with Steel exposed as in-process MCP tools

**Advanced Features**
- [Auth Context](examples/auth-context) - Reuse authentication across sessions
- [Profiles](examples/profiles) - Persistent browser profiles
- [Credentials](examples/credentials) - Credential management and injection
- [Extensions](examples/extensions) - Browser extension support
- [Files API](examples/files-api) - File upload and download handling

### Python

**Basics**
- [Playwright](examples/playwright-py) - Playwright with Python
- [Selenium](examples/selenium) - Selenium WebDriver integration

**AI Computer Use**
- [Claude Computer Use](examples/claude-computer-use-py) - Autonomous browser control with Claude
- [OpenAI Computer Use](examples/openai-computer-use-py) - OpenAI computer use agent
- [Gemini Computer Use](examples/gemini-computer-use-py) - Google Gemini integration

**Agent Frameworks**
- [Stagehand](examples/stagehand-py) - Stagehand with Python
- [Browser-use](examples/browser-use) - Browser-use agent framework
- [Browser-use + CAPTCHA (Auto)](examples/browser-use-captcha-auto) - Browser-use with automatic CAPTCHA solving
- [Browser-use + reCAPTCHA v2 (Manual)](examples/browser-use-captcha-manual) - Manual reCAPTCHA v2 workflow
- [Agno](examples/agno) - Agno toolkit-based automation
- [CrewAI](examples/crewai) - Multi-agent collaboration framework
- [Notte](examples/notte) - Notte browser agent framework
- [OpenAI Agents SDK](examples/openai-agents-py) - Agent with @function_tool + Pydantic output_type
- [Pydantic AI](examples/pydantic-ai) - Provider-agnostic typed agent with deps_type and output_type
- [Claude Agent SDK](examples/claude-agent-sdk-py) - Anthropic's first-party agent loop with Steel exposed as in-process MCP tools

---

## Running the Examples

Each example contains a comprehensive README with setup instructions. Here's the general workflow:

### 1. Clone and Navigate

```bash
git clone https://github.com/steel-dev/steel-cookbook.git
cd steel-cookbook/examples/<example-name>
```

### 2. Install Dependencies

**TypeScript:**
```bash
npm install
# or
yarn install
# or
pnpm install
```

**Python:** ([install `uv`](https://docs.astral.sh/uv/getting-started/installation/) first)
```bash
uv sync
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

**Python:**
```bash
uv run main.py
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
- **[X/Twitter](https://x.com/steeldotdev)** - Stay updated with the latest news and features

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
