# Opening a session on a doc-system v4 repo (lite mode)

A v4 repo has `CLAUDE.md`, `HANDOFF.md`, `DECISIONS.md` and `CONTRIBUTING.md` at the root and **no `coordination/`**
directory. On such a repo Steps 2 and 4 of `SKILL.md` (doclint, IMPROVEMENTS triage) do not apply. The whole open is
four reads and a read-back, ~3K tokens.

1. **Git freshness** (Step 1 unchanged): fetch, fast-forward or report divergence, never auto-stash.
2. **Look sideways** (Step 1.5 unchanged): `gh pr list --state open` for claims; on a shared repo also
   `git branch -r` for branches with no PR.
3. **Read, in this order and nothing else wholesale:** `CLAUDE.md` → `HANDOFF.md` → `DECISIONS.md` →
   `gh issue list --label needs-jake-t` (the operator queue) → `gh issue list --state open --limit 30` (the single intake
   for deferred findings on v4-lite repos per `G5`, replacing v3's `coordination/sprints/cleanup-triage.md` and
   `IMPROVEMENTS.md` 14-day `D-155` proposal TTL `G4`).
   `archive/ledger-v3/` is read only when a `D-NNN` pointer in code or in `DECISIONS.md` sends you there.
4. **Read-back:** one paragraph stating current state and your first action, then stop and wait for the go-ahead.
   If `HANDOFF.md` disagrees with `git log` or an open PR, say so in the read-back; the repo wins over the file.
