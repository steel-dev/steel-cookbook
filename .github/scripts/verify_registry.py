#!/usr/bin/env python3
"""Validate registry.yaml and authors.yaml consistency with examples/."""
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]

registry = yaml.safe_load((ROOT / "registry.yaml").read_text())
authors = yaml.safe_load((ROOT / "authors.yaml").read_text())

errors: list[str] = []
registered_slugs: set[str] = set()
referenced_authors: set[str] = set()

for entry in registry:
    slug = entry.get("slug")
    if not slug:
        errors.append(f"entry missing slug: {entry}")
        continue
    registered_slugs.add(slug)

    path = entry.get("path") or f"examples/{slug}"
    folder = ROOT / path
    if not folder.is_dir():
        errors.append(f"{slug}: path '{path}' is not a directory")
    elif not (folder / "README.md").is_file():
        errors.append(f"{slug}: missing README.md")

    referenced_authors.update(entry.get("authors", []))

missing_authors = referenced_authors - set(authors.keys())
if missing_authors:
    errors.append(
        "authors referenced in registry but missing from authors.yaml: "
        f"{sorted(missing_authors)}"
    )

example_folders = {d.name for d in (ROOT / "examples").iterdir() if d.is_dir()}
orphan_folders = example_folders - registered_slugs
if orphan_folders:
    errors.append(
        f"folders in examples/ without a registry entry: {sorted(orphan_folders)}"
    )

orphan_slugs = registered_slugs - example_folders
if orphan_slugs:
    errors.append(
        f"registry slugs without a matching folder: {sorted(orphan_slugs)}"
    )

if errors:
    for e in errors:
        print(f"- {e}")
    sys.exit(1)

print(
    f"OK: {len(registry)} registry entries, "
    f"{len(authors)} authors, {len(example_folders)} folders, all consistent"
)
