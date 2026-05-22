#!/usr/bin/env bash
# Release flow: feature branch -> develop (Preview) -> main (Production)
# Usage: ./scripts/release.sh "PR title for develop"
set -euo pipefail

TITLE="${1:-Release}"
BRANCH="$(git branch --show-current)"

if [[ "$BRANCH" == "develop" || "$BRANCH" == "main" ]]; then
  echo "Create a feature branch first, e.g. git checkout -b fix/my-change"
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Commit or stash changes before releasing."
  exit 1
fi

echo "Pushing $BRANCH..."
git push -u origin "$BRANCH"

echo "Opening PR to develop..."
gh pr create --base develop --head "$BRANCH" --title "$TITLE" --body "$(cat <<EOF
## Summary
$TITLE

## Test plan
- [ ] Verified on Preview after merge
EOF
)"

PR_DEV="$(gh pr list --head "$BRANCH" --base develop --json number -q '.[0].number')"
echo "Merging PR #$PR_DEV into develop..."
gh pr merge "$PR_DEV" --merge --delete-branch

git fetch origin develop
echo "Opening release PR develop -> main..."
gh pr create --base main --head develop \
  --title "Release: $TITLE" \
  --body "Merges tested changes from develop into Production."

PR_MAIN="$(gh pr list --head develop --base main --json number -q '.[0].number')"
echo "Merging PR #$PR_MAIN into main..."
gh pr merge "$PR_MAIN" --merge

git fetch origin main develop
echo "Done. Vercel will deploy Preview (develop) and Production (main)."
echo "  Production: https://aila-beta.vercel.app"
echo "  Re-sync Inngest after Production deploy if needed."
