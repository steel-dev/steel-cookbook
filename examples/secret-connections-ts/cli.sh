#!/usr/bin/env bash
# https://github.com/steel-dev/steel-cookbook/tree/main/examples/secret-connections-ts
set -euo pipefail

# Read-only commands: each one lists what you have and changes nothing.
# The CLI reads STEEL_API_KEY from your shell, not from .env.
: "${STEEL_API_KEY:?Run: export STEEL_API_KEY=your-key}"

# Only an organization-scoped API key needs STEEL_PROJECT_ID.
case "${1:-help}" in
  credentials)
    steel --json credentials list --namespace "${EXAMPLE_NAMESPACE:-default}"
    ;;
  vaults)
    steel --json vaults list ${STEEL_PROJECT_ID:+--project-id "$STEEL_PROJECT_ID"}
    ;;
  connections)
    steel --json secret-connections list ${STEEL_PROJECT_ID:+--project-id "$STEEL_PROJECT_ID"}
    ;;
  bindings)
    : "${EXAMPLE_SESSION_ID:?Set EXAMPLE_SESSION_ID to the ID of a running session}"
    steel --json sessions credentials list -- "$EXAMPLE_SESSION_ID"
    ;;
  *)
    echo 'Usage: bash cli.sh {credentials|vaults|connections|bindings}'
    exit 2
    ;;
esac
