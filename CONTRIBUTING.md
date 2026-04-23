# Contributing to Steel Cookbook

The Steel Cookbook is a collection of runnable examples showing how to build web automations with Steel. Happy to have you here.

## What goes in this cookbook

Most entries fall into two flavors:

- **Minimal wiring** — the smallest working connection between Steel and a framework (Playwright, Stagehand, Browser Use, Claude Computer Use, ...). Answers _"does Steel work with X?"_
- **Scenario** — projects that solve a concrete task (applying to jobs, monitoring prices, scraping leaderboards, ...). Answers _"how do I build Y?"_

Both live in the same `examples/` folder and are distinguished by tags in `registry.yaml`, not by separate categories.

A good entry is:

- **Useful** — solves a need people actually have
- **Novel** — shows a technique or combination worth remembering
- **Self-contained** — runs cleanly from `.env.example` + one install command

## Folder layout

```
examples/
└── your-slug/
    ├── README.md
    ├── src/ (or a single .py file for Python)
    ├── package.json (or requirements.txt / pyproject.toml)
    └── .env.example
```

The slug is `lowercase-with-hyphens`, no `steel-` prefix.

## Writing the README

Write what serves your recipe — flow matters more than structure. A minimal
wiring might be three sections and 60 lines; a complex scenario might need
seven and 250. See `examples/steel-playwright-starter/README.md` for a
reference on voice.

Every recipe opens with a **one-sentence hook** that states the outcome —
what the reader's code will do, not what framework it uses.

- Good: "Apply to remote software jobs across 5 boards from a single résumé."
- Bad: "Use Stagehand with Steel to automate forms."

From there, write the sections that fit. Common ones that tend to serve well:

- **The idea** — the core insight, often with a key code snippet
- **Run it** — install + run, ideally with expected terminal output
- **Make it yours** — concrete customization points
- **Related** — integration reference and sibling recipes

Mix, rename, add your own (Prerequisites, Gotchas, Steps, Architecture,
Evaluation — whatever the recipe needs). Code references can be short or
long depending on what the explanation demands.

### Rules that don't bend

- Code should advance the narrative. Long snippets are fine when you're
  walking through them; don't dump code blocks without prose.
- Active, second person, present tense. "The agent sends a screenshot" —
  not "will send".
- Use concrete numbers. "~$0.12 per run", "~90 seconds", "8-step loop".
- Skip meta-openings. No "In this tutorial...", no "Welcome to...".
- Don't repeat shared setup. Clone/install lives in the repo root README.

Aim for 120-200 lines. Shorter is fine for simple wirings; longer is fine
when the explanation earns its keep.

## Quality checklist

Before opening a PR:

- [ ] README follows the shape above
- [ ] `npm install && npm start` (or the Python equivalent) works from a clean clone
- [ ] `.env.example` lists every required variable
- [ ] Entry added to `registry.yaml`
- [ ] Author entry present in `authors.yaml` (add yourself if new)

## Submitting

1. Fork and branch from `main` (`example/your-slug` or `recipe/your-slug`)
2. Add your folder under `examples/`
3. Update `registry.yaml` and, if new, `authors.yaml`
4. Open a PR — CI runs a build check and link check

## Help

- [Documentation](https://docs.steel.dev)
- [Discord](https://discord.gg/steel-dev)
- Open an issue if you're stuck
