#!/usr/bin/env python3
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SKIP = {"node_modules", ".venv", "venv", "target", "dist", "build", "__pycache__", ".next"}
SUFFIXES = {".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".go", ".rs", ".md", ".json", ".toml", ".yaml", ".yml"}
PATTERN = re.compile(r"""apiKey=|["']apiKey["']""")

problems = []
for path in sorted((ROOT / "examples").rglob("*")):
    parts = path.relative_to(ROOT).parts
    if not path.is_file() or path.suffix not in SUFFIXES or SKIP.intersection(parts) or path.name == "package-lock.json":
        continue
    for number, line in enumerate(path.read_text(errors="ignore").splitlines(), 1):
        if PATTERN.search(line):
            problems.append(f"{path.relative_to(ROOT)}:{number}: {line.strip()[:120]}")

if problems:
    print("These lines add the API key to a connect URL. Connect with the session's websocketUrl as it is, because it already holds a token for the session.")
    print("\n".join(problems))
    sys.exit(1)
print("No example adds the API key to a connect URL.")
