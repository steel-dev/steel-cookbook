# Steel Cookbook & Starter Projects

This repository contains official starter projects and recipes for building web automations with Steel. It is also the home of `create-steel-app`, a CLI tool that helps you quickly set up new Steel projects.

## Create Steel App

`create-steel-app` is a command-line tool that helps you bootstrap Steel projects with your preferred automation framework.

Usage:
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

Then follow the prompts!

Compatible with Node.js versions 18.0.0+, 20.0.0+, and 22.0.0+.

You can also directly specify the project name and the template you want to use via additional command line options. For example, to scaffold a Steel + Playwright project with TypeScript, run:

```bash
# npm 7+, extra double-dash is needed:
npm create steel-app@latest my-steel-app -- --template steel-playwright-starter-ts

# yarn
yarn create steel-app my-steel-app --template steel-playwright-starter-ts

# pnpm
pnpm create steel-app my-steel-app --template steel-playwright-starter-ts

# Bun
bun create steel-app my-steel-app --template steel-playwright-starter-ts
```

## Starter Projects

Choose the starter that matches your preferred automation framework:

### JavaScript/TypeScript
- [Steel + Puppeteer Starter](examples/steel-puppeteer-starter) - Use Steel with Puppeteer
- [Steel + Playwright Starter](examples/steel-playwright-starter) - Use Steel with Playwright
- [Reusing auth state between sessions](examples/reuse_auth_context_example) - Example script that uses Steel's context endpoint to reuse browser state between sessions to, in this case, stay logged into a website.


### Python
- [Steel + Playwright Python Starter](examples/steel-playwright-python-starter) - Use Steel with Playwright in Python
- [Steel + Selenium Starter](examples/steel-selenium-starter) - Use Steel with Selenium in Python
- [Steel + Browser Use Starter](examples/steel-browser-use-starter) - Use [Browser-use](https://github.com/browser-use/browser-use) to let an agent interact with a Steel Session

## Contributing

See our [Contributing Guide](CONTRIBUTING.md) for information on adding new recipes and examples.

## Support

- [Documentation](https://docs.steel.dev)
- [API Reference](https://docs.steel.dev/api-reference)
- [Discord Community](https://discord.gg/steel-dev)
