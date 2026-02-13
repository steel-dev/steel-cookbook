---
name: validate-example
description: Validate steel-cookbook examples against project standards. Use before committing or when troubleshooting validation failures.
argument-hint: [example-name|all]
allowed-tools: Bash
---

# Validate Example

This skill runs validation on steel-cookbook examples and provides actionable feedback for any failures.

## Usage

```
/validate-example              # Validate all examples
/validate-example all          # Same as above
/validate-example my-example   # Validate specific example
```

## Implementation Steps

### 1. Determine Scope

Check if an example name or "all" was provided:
- If `example-name` provided: Validate only that example
- If "all" or no argument: Validate all examples in `examples/`

### 2. Run Validation

From the repository root, run:
```bash
npm run validate [example-name]
```

Or for all examples:
```bash
npm run validate
```

### 3. Parse and Display Results

Parse the validation output and provide human-readable feedback.

#### Success Output Example
```
✔ my-example
```
Response: "✅ my-example passed all validation rules!"

#### Failure Output Example
```
✖ my-example (2 errors, 1 warning)
  E common.invalid_id invalid id: My-Example
  E common.missing_license LICENSE missing
  W node.missing_scripts missing start/build script
```

For each error/warning, provide:
1. What the rule means
2. How to fix it
3. Example of the correct format

### 4. Common Validation Issues and Fixes

#### `common.invalid_id`
**Meaning**: Example directory name contains invalid characters (uppercase, underscores, dots, etc.)

**Fix**: Rename directory to use only lowercase letters, numbers, and hyphens
```bash
# Bad: My_Example, my.example, steel_scraper
# Good: my-example, steel-scraper
mv My_Example my-example
```

#### `common.missing_license`
**Meaning**: LICENSE file is missing from the example directory

**Fix**: Copy LICENSE from repository root
```bash
cp /path/to/steel-cookbook/LICENSE examples/your-example/
```

#### `common.license_mismatch`
**Meaning**: LICENSE content differs from root LICENSE

**Fix**: Recopy the LICENSE file to ensure exact match
```bash
cp /path/to/steel-cookbook/LICENSE examples/your-example/
```

#### `common.text.crlf`
**Meaning**: File contains CRLF (Windows) line endings instead of LF (Unix)

**Fix**: Convert line endings using your editor or:
```bash
# Using dos2unix
dos2unix path/to/file

# Or with sed
sed -i '' 's/\r$//' path/to/file
```

#### `common.text.missing_final_newline`
**Meaning**: Text file doesn't end with a newline character

**Fix**: Add a newline at the end of the file
```bash
echo "" >> path/to/file
```

#### `node.pkg_name_mismatch`
**Meaning**: package.json name field doesn't match directory name

**Fix**: Update package.json name to match directory
```json
{
  "name": "your-example"  // Must match directory name
}
```

#### `node.missing_scripts`
**Meaning**: package.json is missing start or build script

**Fix**: Add appropriate scripts to package.json
```json
{
  "scripts": {
    "start": "ts-node index.ts"
  }
}
```

#### `node.steel_sdk_bad_spec`
**Meaning**: steel-sdk version spec is disallowed (latest, *, git+, URL, etc.)

**Fix**: Use proper semver range
```json
{
  "dependencies": {
    "steel-sdk": "^0.15.0"  // Good
  }
}
```

#### `node.steel_sdk_below_min`
**Meaning**: steel-sdk version is below minimum required

**Fix**: Update to minimum version
```json
{
  "dependencies": {
    "steel-sdk": "^[MINIMUM_VERSION]"  // Check error message for version
  }
}
```

#### `py.steel_sdk_missing`
**Meaning**: steel-sdk not in requirements.txt

**Fix**: Add steel-sdk to requirements.txt
```
steel-sdk>=0.9.0
```

#### `py.steel_sdk_below_min`
**Meaning**: steel-sdk version spec is below minimum required

**Fix**: Update to minimum version
```
steel-sdk>=0.15.0  # Check error message for version
```

#### `common.ignored_artifact_tracked`
**Meaning**: Git-tracked files that should be ignored (node_modules, venv, etc.)

**Fix**: Remove from git tracking and ensure .gitignore is correct
```bash
git rm -r --cached path/to/node_modules
# Ensure .gitignore contains node_modules/
```

#### `common.artifact_forbidden`
**Meaning**: Forbidden file/directory found (.python-version, .ruff_cache, etc.)

**Fix**: Remove the forbidden artifact
```bash
rm -rf .ruff_cache
rm .python-version
```

#### `common.total_size_exceeded`
**Meaning**: Example total size exceeds 5MB

**Fix**: Remove large files, use gitignore for artifacts, or compress assets

#### `common.file_size_exceeded`
**Meaning**: Individual file exceeds 3MB

**Fix**: Split large files, move assets outside repo, or remove unnecessary content

## Validation Reference

The validation script is at: `/Users/nikola/dev/steel/steel-cookbook/scripts/validate.ts`

### Severity Levels
- **Error**: Must be fixed before merging (causes validation exit code 1)
- **Warning**: Should be fixed but doesn't block merge

### Validation Categories
1. **Common rules** (apply to all examples)
   - Valid ID format
   - LICENSE presence and content match
   - Text file formatting (LF endings, final newline)
   - Forbidden artifacts
   - Size limits

2. **Node rules** (TypeScript examples)
   - package.json presence and validity
   - No postinstall scripts
   - start/build scripts present
   - steel-sdk dependency with valid version
   - package.json name matches directory

3. **Python rules** (Python examples)
   - main.py or pyproject.toml present
   - requirements.txt validity
   - steel-sdk with valid version spec

## Workflow Integration

Typical validation workflow:
1. Create example with `/create-example`
2. Modify files and add your code
3. Run `/validate-example [name]` to check
4. Fix any reported errors
5. Re-run validation until all pass
6. Commit your changes
