#!/bin/bash

# Get changed files compared to staging branch
BASE_BRANCH="${1:-origin/staging}"
CHANGED_FILES=$(git diff --name-only --diff-filter=ACMRTUXB "$BASE_BRANCH"...HEAD | grep -E '\.(js|json|html|css|md)$' || true)

if [ -z "$CHANGED_FILES" ]; then
  echo "No files to format check."
  exit 0
fi

echo "Format checking changed files:"
echo "$CHANGED_FILES"
echo ""

# Run prettier check on changed files
echo "$CHANGED_FILES" | xargs prettier --check
