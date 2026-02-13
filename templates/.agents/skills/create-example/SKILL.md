---
name: create-example
description: Create a new steel-cookbook example from templates. Use when adding new examples to the cookbook.
argument-hint: [example-name] [python|typescript]
disable-model-invocation: true
context: fork
agent: general-purpose
allowed-tools: Bash, Read, Write, Edit, Glob
---

# Create Example

This skill scaffolds a new steel-cookbook example from the Python or TypeScript template, with proper naming, customization, and all required files.

## Usage

```
/create-example my-cool-example python
/create-example web-scraper typescript
/create-example agent-loop
```

If the language is omitted, you'll be prompted to choose between Python and TypeScript.

## Implementation Steps

### 1. Gather Information

If not provided via arguments, prompt the user for:

- **Example name**: Must follow naming conventions (lowercase, alphanumeric, hyphens only)
  - Valid: `my-example`, `steel-scraper`, `agent-v2`
  - Invalid: `MyExample`, `steel_scraper`, `agent.v2`

- **Language**: `python` or `typescript`

- **Description**: Brief 1-2 sentence description of what the example does

- **Difficulty level**: `Beginner`, `Intermediate`, or `Advanced`
  - Beginner: Basic concepts, minimal dependencies
  - Intermediate: Multiple concepts, some external APIs
  - Advanced: Complex workflows, multiple integrations

- **Time estimate**: `5 min`, `10 min`, or `30 min`

- **Additional API keys**: (optional) Any keys beyond STEEL_API_KEY
  - Examples: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `SERP_API_KEY`

### 2. Validate Example Name

Check that the example name follows the regex pattern `/^[a-z0-9-]+$/`:

```typescript
function isValidId(id: string): boolean {
  return /^[a-z0-9-]+$/.test(id);
}
```

If invalid, prompt the user to correct it.

### 3. Copy Template Files

Copy all files from the appropriate template directory to `examples/[example-name]/`:

**Python template source**: `/Users/nikola/dev/steel/steel-cookbook/templates/python/`
**TypeScript template source**: `/Users/nikola/dev/steel/steel-cookbook/templates/typescript/`

Required files to copy:
- Main file (`main.py` or `index.ts`)
- `README.md`
- `AGENTS.md`
- `.env.example`
- `.gitignore`
- `requirements.txt` (Python) or `package.json` + `tsconfig.json` (TypeScript)
- `.agents/skills/README.md`
- **Test files**:
  - Python: `tests/`, `pytest.ini`, `.env.test`
  - TypeScript: `tests/`, `vitest.config.ts`, `.env.test`, `test-setup.ts`

### 4. Create Custom Skills Directory

Create `.agents/skills/` directory in the new example with a `README.md`:

```markdown
<!-- ABOUTME: Custom skills for [example-name] -->
<!-- ABOUTME: Add example-specific skills here -->

# Custom Skills for [example-name]

Place custom skills and agent instructions in this directory.

This example demonstrates:
- [Key feature 1]
- [Key feature 2]
```

### 5. Customize README.md

Update the README with user-provided information:

**For Python:**
```markdown
# Steel + [Feature Name]

[User-provided description]

![Difficulty](https://img.shields.io/badge/Difficulty-[LEVEL]-[COLOR])
![Time](https://img.shields.io/badge/Time-[TIME]-blue)
![Tech](https://img.shields.io/badge/Python-green)
```

**For TypeScript:**
```markdown
# Steel + [Feature Name]

[User-provided description]

![Difficulty](https://img.shields.io/badge/Difficulty-[LEVEL]-[COLOR])
![Time](https://img.shields.io/badge/Time-[TIME]-blue)
![Tech](https://img.shields.io/badge/TypeScript-blue)
```

Badge color mappings:
- Beginner → `green`
- Intermediate → `yellow`
- Advanced → `red`

### 6. Copy Test Files

Copy test directory and configuration to the example:

**For Python:**
```bash
# Copy test directory
cp -r templates/python/tests/ examples/[example-name]/tests/
# Copy test config
cp templates/python/pytest.ini examples/[example-name]/
cp templates/python/.env.test examples/[example-name]/
```

**For TypeScript:**
```bash
# Copy test directory
cp -r templates/typescript/tests/ examples/[example-name]/tests/
# Copy test config
cp templates/typescript/vitest.config.ts examples/[example-name]/
cp templates/typescript/.env.test examples/[example-name]/
cp templates/typescript/test-setup.ts examples/[example-name]/
```

### 7. Update .env.example

Replace the template .env.example with:
```env
STEEL_API_KEY=
[ADDITIONAL_KEYS] (if provided)
```

Each additional key should be on its own line with an empty value.

### 8. Update package.json (TypeScript only)

Update the `name` field to match the example name:
```json
{
  "name": "[example-name]",
  ...
}
```

The template package.json already includes test scripts (`test`, `test:ui`, `test:run`, `test:coverage`) which will be copied automatically.

### 9. Copy LICENSE

Copy the LICENSE file from the repository root to the example directory:
- Source: `/Users/nikola/dev/steel/steel-cookbook/LICENSE`
- Destination: `examples/[example-name]/LICENSE`

Use bash commands to ensure exact byte-for-byte copy.

### 10. Report Success

Display a summary message:

```text
✅ Example "[example-name]" created successfully!

Location: examples/[example-name]/

Next steps:
1. cd examples/[example-name]/
2. Edit main.py/index.ts to add your automation logic
3. Update README.md with specific learning outcomes
4. Run /validate-example [example-name] to check compliance
5. Test your example: python main.py or npm start
6. Run tests: pytest (Python) or npm test (TypeScript)
```

## File Structure After Creation

```
examples/
└── [example-name]/
    ├── main.py (or index.ts)
    ├── README.md
    ├── AGENTS.md
    ├── LICENSE
    ├── .env.example
    ├── .env.test (test environment template)
    ├── .gitignore
    ├── requirements.txt (or package.json + tsconfig.json)
    ├── pytest.ini (Python) or vitest.config.ts (TypeScript)
    ├── test-setup.ts (TypeScript)
    ├── tests/
    │   ├── __init__.py (Python) or *.test.ts (TypeScript)
    │   ├── conftest.py (Python)
    │   ├── test_main.py (Python) or main.test.ts (TypeScript)
    │   └── test_integration.py (Python) or integration.test.ts (TypeScript)
    └── .agents/
        └── skills/
            └── README.md
```

## Error Handling

If any step fails:
1. Report the specific error clearly
2. Clean up any partially created files if appropriate
3. Suggest how to fix the issue

Common errors:
- Example directory already exists → Prompt to overwrite or use different name
- Invalid example name → Explain naming rules and prompt for new name
- Template files missing → Report which files are missing from template

## Validation Rules Reference

The created example must pass validation. Key rules from `scripts/validate.ts`:

1. **Directory name**: Must match `/^[a-z0-9-]+$/`
2. **LICENSE**: Must exist and match root LICENSE exactly
3. **package.json name**: Must match directory name (TypeScript)
4. **steel-sdk**: Must be in dependencies with proper version spec
5. **Text files**: Must have LF line endings, no CRLF
6. **No forbidden artifacts**: No node_modules, venv, __pycache__ in git
