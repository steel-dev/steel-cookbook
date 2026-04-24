# Agent Contributor Guide

This guide is for AI agents writing or updating recipes in the Steel
Cookbook. Humans should read `CONTRIBUTING.md` for the same material at
higher level; this file covers the specifics agents tend to miss.

## Structure

Every recipe is a folder under `examples/<slug>/`. The slug is
lowercase-with-hyphens, no `steel-` prefix. A recipe is self-contained:
its own `package.json` or `requirements.txt`, a `.env.example`, one or
two source files, a `LICENSE` (must match the root `LICENSE` exactly),
and a `README.md`.

Two metadata files at the repo root describe the collection:

- `registry.yaml` — one entry per recipe: title, slug, path,
  description, date, authors (handles), tags.
- `authors.yaml` — map from handle to `{ name, website, avatar }`.

## Voice

Read `CONTRIBUTING.md`'s "Rules that don't bend" section before
drafting. The rules agents break most often:

- Skip marketing-style openers. No "Drive...", "Hand...", "Write
  automations in plain English...". Open with technical substance; the
  first paragraph has no header.
- Avoid em-dashes (—). Use periods, commas, colons, or parens.
- Never link to `docs.steel.dev`. READMEs sync there; self-links loop.
  Use framework docs or sibling recipes instead.
- No emojis, in prose or quoted terminal output.
- Reference code by function or block name, not line numbers.

For voice, read these pilots as a reference. Don't copy their
structure; pick the shape that fits the recipe you're writing.

- `examples/playwright-ts/README.md`
- `examples/stagehand-ts/README.md`

## Updating a recipe

1. Read every file in the recipe folder before drafting.
2. Reference source code by function or block name.
3. If the recipe has a language sibling (e.g. `stagehand-ts` vs
   `stagehand-py`), read the sibling's README and give yours a
   distinct voice. Parallel recipes should not paraphrase each other.
4. Update `package.json` `"name"` (Node) or `pyproject.toml`
   `[project] name` (Python) to match the folder slug.
5. Update the GitHub URL comment at the top of each source file to
   `https://github.com/steel-dev/steel-cookbook/tree/main/examples/<slug>`.

## Adding a new recipe

1. Create `examples/<slug>/` with source file(s), dependency manifest,
   `.env.example`, `LICENSE` (copy root `LICENSE` verbatim), and
   `README.md`.
2. Add an entry to `registry.yaml` with slug, path, description, date,
   authors, and tags.
3. If you are a new author, add yourself to `authors.yaml` before
   referencing the handle.

## Review checklist

Before opening a PR:

- Grep the README for em-dashes (—), emoji characters, and
  `docs.steel.dev` links. Remove all three.
- Confirm `package.json.name` or `pyproject.toml [project].name`
  matches the folder slug exactly.
- Confirm the source file URL comment points at the current slug.
- Confirm every author in your registry entry exists in
  `authors.yaml`.

## Recent learnings

- Language siblings drift into sounding identical when written in
  parallel. Force distinct angles: lean into language-idiomatic APIs,
  the actual SDKs used, or what each ecosystem exposes.
- Terminal output quoted in a README must match the actual source. If
  the source prints emojis or banners, either remove from both sides
  or keep both in sync. Never invent output shape.
- "No pitch opener" is the rule agents break most. If your first
  paragraph reads like marketing copy ("Drive X...", "Hand Y..."),
  cut it and start from the technical substance.
- Utility recipes (`credentials`, `auth-context`, `profiles`,
  `extensions`, `files-api`) are cross-referenced from other recipes.
  Describe their primitive unambiguously so the cross-links make sense.
