---
name: update-readme
description: Update an example's README.md to match cookbook template standards. Use when refreshing an example's documentation.
argument-hint: [example-name]
allowed-tools: Read, Write, Edit
---

# Update README

This skill updates an existing example's README.md to match the steel-cookbook template structure while preserving custom content.

## Usage

```
/update-readme my-example
```

## Implementation Steps

### 1. Identify the Example

Read the example directory to determine:
1. The example name (from directory or argument)
2. The language (Python or TypeScript) by checking for:
   - `package.json` → TypeScript
   - `requirements.txt` or `pyproject.toml` → Python

### 2. Read Current README

Read the existing README.md from `examples/[example-name]/README.md`

### 3. Read Appropriate Template

Load the template README based on detected language:
- Python: `/Users/nikola/dev/steel/steel-cookbook/templates/python/README.md`
- TypeScript: `/Users/nikola/dev/steel/steel-cookbook/templates/typescript/README.md`

### 4. Extract Custom Content

Parse the existing README to preserve:

**Description**: The brief 1-2 sentence description at the top

**Badge values**: Extract from badges if they exist:
- Difficulty: Beginner, Intermediate, or Advanced
- Time: 5 min, 10 min, or 30 min
- Tech: Python or TypeScript (auto-detected)

**What You'll Learn**: The learning points list

**TL;DR section**: Quick summary with time estimate and key outcome

**Quick Start steps**: The automation description list

**Other sections**: Any custom sections beyond the template

### 5. Detect Badge Issues

Check for common badge problems:

1. **Invalid difficulty**: Anything other than Beginner, Intermediate, or Advanced
2. **Invalid time**: Anything other than "5 min", "10 min", or "30 min"
3. **Wrong tech badge**: Python example showing TypeScript badge or vice versa
4. **Missing badges**: No badge section present

Prompt the user to correct any issues if detected.

### 6. Generate New README

Create the updated README using the template structure with extracted content:

**Template Structure** (Python):
```markdown
# Steel + [Feature Name]

[Description - 1-2 sentences]

![Difficulty](https://img.shields.io/badge/Difficulty-[LEVEL]-[COLOR])
![Time](https://img.shields.io/badge/Time-[TIME]-blue)
![Tech](https://img.shields.io/badge/Python-green)

---

## TL;DR

[TIME] minute read. [KEY_OUTCOME]

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd examples/[EXAMPLE_SLUG]
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Add your API keys to .env
python main.py
```

---

## What You'll Learn

- **[Learning Point 1]**: Brief explanation
- **[Learning Point 2]**: Brief explanation
- **[Learning Point 3]**: Brief explanation

---

## Installation

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd examples/[EXAMPLE_SLUG]
```

### Create virtual environment

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
```

### Install dependencies

```bash
pip install -r requirements.txt
```

---

## Quick Start

The script will:

- [What happens 1]
- [What happens 2]
- [What happens 3]

### 1. Configure environment

Create `.env`:

```env
STEEL_API_KEY=your_steel_api_key_here
[OTHER_ENV_VARS]
```

Get your free API key: [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys)

### 2. Run

```bash
python main.py
```

---

## Configuration

Customize by editing `main.py`:

```python
session = client.sessions.create(
    use_proxy=True,           # Use Steel's proxy network
    solve_captcha=True,       # Enable CAPTCHA solving
    session_timeout=1800000,   # 30 minute timeout (default: 5 mins)
    user_agent='custom-ua',    # Custom User-Agent
)
```

---

## Error Handling

The template includes proper cleanup:

```python
try:
    # Your automation code
    pass
finally:
    # Cleanup runs even if there's an error
    if browser:
        browser.close()
    if session:
        client.sessions.release(session.id)
```

---

## Support

- [Steel Documentation](https://docs.steel.dev)
- [API Reference](https://docs.steel.dev/api-reference)
- [Discord Community](https://discord.gg/steel-dev)
```

**Template Structure** (TypeScript):
```markdown
# Steel + [Feature Name]

[Description - 1-2 sentences]

![Difficulty](https://img.shields.io/badge/Difficulty-[LEVEL]-[COLOR])
![Time](https://img.shields.io/badge/Time-[TIME]-blue)
![Tech](https://img.shields.io/badge/TypeScript-blue)

---

## TL;DR

[TIME] minute read. [KEY_OUTCOME]

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd examples/[EXAMPLE_SLUG]
npm install
cp .env.example .env
# Add your API keys to .env
npm start
```

---

## What You'll Learn

- **[Learning Point 1]**: Brief explanation
- **[Learning Point 2]**: Brief explanation
- **[Learning Point 3]**: Brief explanation

---

## Installation

```bash
git clone https://github.com/steel-dev/steel-cookbook
cd examples/[EXAMPLE_SLUG]
npm install
```

---

## Quick Start

The script will:

- [What happens 1]
- [What happens 2]
- [What happens 3]

### 1. Configure environment

Create `.env`:

```env
STEEL_API_KEY=your_steel_api_key_here
[OTHER_ENV_VARS]
```

Get your free API key: [app.steel.dev/settings/api-keys](https://app.steel.dev/settings/api-keys)

### 2. Run

```bash
npm start
```

---

## Configuration

Customize by editing `index.ts`:

```typescript
const session = await client.sessions.create({
  useProxy: true,        // Use Steel's proxy network
  solveCaptcha: true,     // Enable CAPTCHA solving
  sessionTimeout: 1800000, // 30 minute timeout (default: 5 mins)
  userAgent: "custom-ua",  // Custom User-Agent
});
```

---

## Error Handling

The template includes proper cleanup:

```typescript
try {
  // Your automation code
} finally {
  // Cleanup runs even if there's an error
  if (browser) await browser.close();
  if (session) await client.sessions.release(session.id);
}
```

---

## Support

- [Steel Documentation](https://docs.steel.dev)
- [API Reference](https://docs.steel.dev/api-reference)
- [Discord Community](https://discord.gg/steel-dev)
```

### 7. Badge Color Mapping

Map difficulty levels to badge colors:
- `Beginner` → `green`
- `Intermediate` → `yellow`
- `Advanced` → `red`

### 8. Write Updated README

Write the updated README.md to `examples/[example-name]/README.md`

### 9. Report Changes

Display a summary of changes made:
```
✅ README updated for [example-name]

Changes:
- Updated badges to match [difficulty]/[time]/[tech]
- Ensured all template sections present
- Preserved custom content: [list of preserved sections]
- Fixed formatting issues
```

## Missing Content Handling

If the current README is missing expected content, prompt the user:

**Missing description**: "Enter a brief 1-2 sentence description of what this example does:"

**Missing difficulty**: "Select difficulty level (Beginner/Intermediate/Advanced):"

**Missing time**: "Select time estimate (5 min/10 min/30 min):"

**Missing learning points**: "Enter 3 key learning points (one per line):"

## Common README Issues to Fix

1. **Inconsistent heading levels** → Ensure proper `#`, `##`, `###` hierarchy
2. **Missing section separators** → Add `---` between major sections
3. **Incorrect code block language tags** → Use ```bash, ```python, ```typescript appropriately
4. **Broken badge links** → Verify badge URLs are correct
5. **Outdated installation instructions** → Match template commands to language
6. **Missing support section** → Ensure footer with documentation links

## Related Skills

After updating README:
1. Run `/validate-example [name]` to ensure all rules pass
2. Check that badges render correctly in GitHub preview
