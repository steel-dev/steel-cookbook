#!/usr/bin/env bash
# https://github.com/steel-dev/steel-cookbook/tree/main/examples/secret-connections-ts
set -euo pipefail

# Read-only examples. Set STEEL_API_KEY for a QA project before running.
: "${STEEL_API_KEY:?Set STEEL_API_KEY for your QA project}"
# Use the CLI's built-in production URL by default. STEEL_API_URL can override it.

case "${1:-help}" in
  credentials)
    : "${EXAMPLE_NAMESPACE:?Set EXAMPLE_NAMESPACE to the namespace to list}"
    steel --json credentials list --namespace "$EXAMPLE_NAMESPACE"
    ;;
  vaults)
    : "${STEEL_PROJECT_ID:?Set STEEL_PROJECT_ID}"
    steel vaults list --help >/dev/null 2>&1 || { echo 'This CLI does not support Vaults; use a CLI build that includes Credentials v2.' >&2; exit 1; }
    steel --json vaults list --project-id "$STEEL_PROJECT_ID"
    ;;
  connections)
    : "${STEEL_PROJECT_ID:?Set STEEL_PROJECT_ID}"
    steel secret-connections list --help >/dev/null 2>&1 || { echo 'This CLI does not support Secret Connections; use a CLI build that includes Credentials v2.' >&2; exit 1; }
    steel --json secret-connections list --project-id "$STEEL_PROJECT_ID"
    ;;
  bindings)
    : "${EXAMPLE_SESSION_ID:?Set EXAMPLE_SESSION_ID to your QA session ID}"
    steel sessions credentials list --help >/dev/null 2>&1 || { echo 'This CLI does not support session bindings; use a CLI build that includes Credentials v2.' >&2; exit 1; }
    steel --json sessions credentials list -- "$EXAMPLE_SESSION_ID"
    ;;
  *) echo 'Usage: bash cli.sh {credentials|vaults|connections|bindings}'; exit 2 ;;
esac
