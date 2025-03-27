# Steel Cookbook & Starter Projects

This repository contains official starter projects and recipes for building web automations with Steel. It is also the home of `create-steel-app`, a CLI tool that helps you quickly set up new Steel projects.

## Quick Start

The fastest way to get started with Steel & any of these recipes is using `create-steel-app`. Simply run:

```bash
npx create-steel-app@latest
```

Then follow the prompts! 

Works with pure Python projects too as long as you have a node package manager (like `npm`) installed.

Using a different package manager? [See detailed installation instructions](#create-steel-app-detailed-instructions)

## Starter Projects

Choose the starter that matches your preferred automation framework:

### JavaScript/TypeScript

- [Steel + Puppeteer Starter](examples/steel-puppeteer-starter) - Use Steel with Puppeteer
- [Steel + Playwright Starter](examples/steel-playwright-starter) - Use Steel with Playwright
- [Reusing auth state between sessions](examples/reuse_auth_context_example) - Example script that uses Steel's context endpoint to reuse browser state between sessions to, in this case, stay logged into a website.
- [Steel + OpenAI CUA Starter (Node)](examples/steel-oai-computer-use-node-starter/) - Simple command line app that allows OpenAI's computer-use agent to accept a user task then execute it in a Steel browser session.

### Python

- [Steel + Playwright Python Starter](examples/steel-playwright-python-starter) - Use Steel with Playwright in Python
- [Steel + Selenium Starter](examples/steel-selenium-starter) - Use Steel with Selenium in Python
- [Steel + Browser Use Starter](examples/steel-browser-use-starter) - Use [Browser-use](https://github.com/browser-use/browser-use) to let an agent interact with a Steel Session
- [Steel + OpenAI CUA Starter (Python)](examples/steel-oai-computer-use-python-starter/) - Simple command line app that allows OpenAI's computer-use agent to accept a user task then execute it in a Steel browser session.

## Create Steel App - Detailed Instructions

`create-steel-app` is a command-line tool that helps you bootstrap Steel projects with your preferred automation framework.

Compatible with Node.js versions 18.0.0+, 20.0.0+, and 22.0.0+.

### Installation with Various Package Managers

```bash
# Using npm
npm create steel-app@latest

# Using yarn
yarn create steel-app

# Using pnpm
pnpm create steel-app

# Using bun
bun create steel-app
```

### Direct Template Usage

You can also directly specify the project name and the template you want to use via additional command line options. For example, to scaffold a Steel + Playwright project with TypeScript, run:

```bash
# npm 7+, extra double-dash is needed:
npm create steel-app@latest my-steel-app -- --template steel-playwright-starter

# yarn
yarn create steel-app my-steel-app --template steel-playwright-starter

# pnpm
pnpm create steel-app my-steel-app --template steel-playwright-starter

# Bun
bun create steel-app my-steel-app --template steel-playwright-starter
```

## Contributing

See our [Contributing Guide](CONTRIBUTING.md) for information on adding new recipes and examples.

## Support

- [Documentation](https://docs.steel.dev)
- [API Reference](https://docs.steel.dev/api-reference)
- [Discord Community](https://discord.gg/steel-dev)
