#!/usr/bin/env python3
"""Validate registry.yaml and authors.yaml consistency with examples/.

Each registry entry has a slug (the concept / docs URL) and a path (the
physical example folder). Multiple entries may share a slug (one per
language variant); uniqueness is enforced on path.
"""

import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]

registry = yaml.safe_load((ROOT / "registry.yaml").read_text())
authors = yaml.safe_load((ROOT / "authors.yaml").read_text())

errors: list[str] = []
registered_paths: set[str] = set()
registered_slugs: set[str] = set()
referenced_authors: set[str] = set()

for entry in registry:
    slug = entry.get("slug")
    path = entry.get("path")
    if not slug:
        errors.append(f"entry missing slug: {entry}")
        continue
    if not path:
        errors.append(f"{slug}: entry missing path")
        continue

    if path in registered_paths:
        errors.append(f"{slug}: duplicate path '{path}'")
    registered_paths.add(path)
    registered_slugs.add(slug)

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

example_folders = {
    f"examples/{d.name}" for d in (ROOT / "examples").iterdir() if d.is_dir()
}
orphan_folders = example_folders - registered_paths
if orphan_folders:
    errors.append(
        f"folders in examples/ without a registry entry: {sorted(orphan_folders)}"
    )

orphan_paths = registered_paths - example_folders
if orphan_paths:
    errors.append(f"registry paths without a matching folder: {sorted(orphan_paths)}")

if errors:
    for e in errors:
        print(f"- {e}")
    sys.exit(1)

print(
    f"OK: {len(registry)} registry entries, "
    f"{len(registered_slugs)} concept slugs, "
    f"{len(authors)} authors, {len(example_folders)} folders, all consistent"
)
