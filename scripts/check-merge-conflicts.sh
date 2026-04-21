#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

echo "[merge-check] branch: $(git rev-parse --abbrev-ref HEAD)"
echo "[merge-check] head:   $(git rev-parse --short HEAD)"

unmerged="$(git diff --name-only --diff-filter=U || true)"
if [[ -n "$unmerged" ]]; then
  echo "[merge-check] Unmerged files found:"
  echo "$unmerged"
  exit 2
fi

markers="$(rg -n "^<<<<<<< |^>>>>>>> |^=======$" script.js docs scripts 2>/dev/null || true)"
if [[ -n "$markers" ]]; then
  echo "[merge-check] Conflict markers found in tracked text files:"
  echo "$markers"
  exit 3
fi

echo "[merge-check] OK: no unmerged files and no conflict markers found in script.js/docs/scripts."
