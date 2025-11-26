#!/bin/bash

# Get changed files compared to staging branch
BASE_BRANCH="${1:-origin/staging}"
CHANGED_FILES=$(git diff --name-only --diff-filter=ACMRTUXB "$BASE_BRANCH"...HEAD | grep -E '\.(js|html)$' || true)

if [ -z "$CHANGED_FILES" ]; then
  echo "No JS or HTML files changed."
  exit 0
fi

echo "Linting changed files:"
echo "$CHANGED_FILES"
echo ""

# Run eslint on changed files
echo "$CHANGED_FILES" | xargs eslint
