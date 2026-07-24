---
name: git-branch-workflow
description: Git push/merge workflow for this repo — main is branch-protected, so Claude can never push directly (Bash(git push *) is denied in .claude/settings.json). Use whenever finishing work that needs to reach origin or main — "push this", "up ขึ้น git", "merge to main", "open a PR", or any request to publish a branch.
user-invocable: true
---

# Git branch workflow (main is protected)

`main` on the GitHub remote is a protected branch. Direct pushes to it are
rejected by GitHub, and `Bash(git push *)` is also denied at the tool-permission
level in this repo's `.claude/settings.json` — so Claude cannot push under any
circumstances, even to a feature branch. Do not retry a denied `git push`; it
is a hard block, not a transient failure.

## What Claude does
1. Do the work on a feature branch (never commit directly to `main`). If not
   already on one, create a new branch off `main` for the change
   (`git checkout -b feature/<short-description>`).
2. Commit locally as normal.
3. Stop before pushing. Give the user the exact command to run themselves,
   e.g.:
   ```
   git push -u origin <branch-name>
   ```
   (omit `-u origin <branch-name>` and just say `git push` if the branch
   already tracks a remote — check with `git rev-parse --abbrev-ref
   --symbolic-full-name @{u}`).
4. If the goal is to land the change on `main`, also offer the `gh pr create`
   command (or run it directly if `gh` push-adjacent calls aren't blocked —
   opening a PR itself doesn't require a local push once the user has pushed
   the branch). Merging the PR into `main` is the user's call — don't merge
   PRs unless explicitly asked.

## What NOT to do
- Don't suggest `--no-verify`, force-push, or any other bypass of branch
  protection to get around the block — the protection and the deny rule are
  both intentional.
- Don't fabricate or assume a push succeeded. If `git push` is denied, say so
  plainly and hand back the command.
