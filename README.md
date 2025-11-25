# Steel Cookbook & Starter Projects

Official starter projects and recipes for building web automations with Steel. This repository is also home to `create-steel-app`, a CLI tool for quickly scaffolding new Steel projects.

## Quick Start

```bash
npx create-steel-app@latest
```

Follow the prompts to select your preferred framework. Works with Python projects too—just need a Node package manager installed.

## Starter Projects

### Browser Automation

**JavaScript/TypeScript**

- [Steel + Playwright](examples/steel-playwright-starter) - Playwright with TypeScript
- [Steel + Playwright (JS)](examples/steel-playwright-starter-js) - Playwright with JavaScript
- [Steel + Puppeteer](examples/steel-puppeteer-starter) - Puppeteer with TypeScript
- [Steel + Puppeteer (JS)](examples/steel-puppeteer-starter-js) - Puppeteer with JavaScript
- [Steel + Stagehand](examples/steel-stagehand-node-starter) - AI-powered browser automation with Stagehand

**Python**

- [Steel + Playwright](examples/steel-playwright-python-starter) - Playwright with Python
- [Steel + Selenium](examples/steel-selenium-starter) - Selenium with Python
- [Steel + Stagehand](examples/steel-stagehand-python-starter) - Stagehand with Python

### AI Computer Use Agents

**JavaScript/TypeScript**

- [Steel + Claude Computer Use](examples/steel-claude-computer-use-node-starter) - Anthropic Claude computer use
- [Steel + Claude Computer Use (Mobile)](examples/steel-claude-computer-use-mobile) - Claude computer use for mobile viewports
- [Steel + OpenAI Computer Use](examples/steel-oai-computer-use-node-starter) - OpenAI computer use agent
- [Steel + Gemini Computer Use](examples/steel-gemini-computer-use-node-starter) - Google Gemini computer use

**Python**

- [Steel + Claude Computer Use](examples/steel-claude-computer-use-python-starter) - Anthropic Claude computer use
- [Steel + OpenAI Computer Use](examples/steel-oai-computer-use-python-starter) - OpenAI computer use agent
- [Steel + Gemini Computer Use](examples/steel-gemini-computer-use-python-starter) - Google Gemini computer use
- [Steel + Browser Use](examples/steel-browser-use-starter) - [Browser-use](https://github.com/browser-use/browser-use) agent framework
- [Steel + Browser Use + Captcha Solver](examples/steel-browser-use-captcha-solver-starter) - Browser-use with captcha solving

### AI Agent Frameworks

**JavaScript/TypeScript**

- [Steel + Agent Kit](examples/steel-agent-kit-starter) - Coinbase AgentKit integration
- [Steel + Magnitude](examples/steel-magnitude-starter) - Magnitude AI testing framework

**Python**

- [Steel + Agno](examples/steel-agno-starter) - Agno agent framework
- [Steel + CrewAI](examples/steel-crew-ai-starter) - CrewAI multi-agent framework
- [Steel + Notte](examples/steel-notte-starter) - Notte browser agent

### Steel Features

- [Auth Context](examples/steel-auth-context-starter) - Reuse browser state between sessions
- [Credentials](examples/steel-credentials-starter) - Manage and inject credentials
- [Extensions](examples/steel-extensions-starter) - Load browser extensions
- [Files API](examples/steel-files-api-starter) - Upload and download files
- [Profiles](examples/steel-profiles-starter) - Persistent browser profiles

## Create Steel App

Bootstrap projects with your preferred framework using `create-steel-app`.

**Requirements:** Node.js 18+

### Package Managers

```bash
npm create steel-app@latest
yarn create steel-app
pnpm create steel-app
bun create steel-app
```

### Direct Template Usage

Skip the prompts by specifying a template directly:

```bash
# npm 7+ (extra double-dash needed)
npm create steel-app@latest my-project -- --template steel-playwright-starter

# yarn
yarn create steel-app my-project --template steel-playwright-starter

# pnpm
pnpm create steel-app my-project --template steel-playwright-starter

# bun
bun create steel-app my-project --template steel-playwright-starter
```

## Contributing

See the [Contributing Guide](CONTRIBUTING.md) for information on adding new recipes.

## Support

- [Documentation](https://docs.steel.dev)
- [API Reference](https://docs.steel.dev/api-reference)
- [Discord](https://discord.gg/steel-dev)
