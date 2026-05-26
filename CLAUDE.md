# Project conventions for AI agents

These rules apply to every Claude Code / Claude Agent session working in this repository.

## Pull request discipline

**One logical change = one branch = one PR. Always.**

- When you finish a piece of work and the user asks you to ship it, create a **new branch** and open a **new PR**. Do not extend an already-open PR with a follow-up commit unless the user explicitly told you to push to that branch.
- This applies in particular to:
  - Bug fixes that come up while working on a feature → new branch, new PR.
  - Diagnostic / logging / observability additions → new branch, new PR.
  - Tuning / threshold adjustments after a feature lands → new branch, new PR.
  - Reverts → new branch, new PR.
- **Exception**: when an open PR receives review feedback and the user (or a reviewer) asks for the fix on that PR, push to its branch — that is the normal review cycle.
- If you are unsure whether a change is "the same PR" or "a new PR", default to **new PR**. The user prefers small focused PRs over large merged-purpose ones.

## Branch naming

- Use `claude/<short-kebab-description>` for new branches you create.
- One topic per branch name; do not bundle unrelated work even under the same branch.

## When in doubt

Ask via `AskUserQuestion` before pushing a follow-up to an existing PR's branch.
