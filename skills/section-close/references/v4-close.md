# Closing a unit on a doc-system v4 repo (lite mode)

A v4 repo has `CLAUDE.md`, `HANDOFF.md`, `DECISIONS.md` and `CONTRIBUTING.md` at the root and **no `coordination/`**
directory (the old ledger sits frozen in `archive/ledger-v3/`). launch-uk, rocketfuel-rebuild and launchfulfillment
moved to v4 on 2026-10-13 (operator ruling). On such a repo the six-step protocol in `SKILL.md` does **not** run:
no doclint, no glossary lint, no ledger index, no HANDOFF scaffold, no lead consult. Do this instead, in order,
~10 minutes and well under 10K tokens.

1. **CI green on `main` after your merge.** Read `gh pr checks` on the merged PR, then open the changed URLs live.
   A red here ends the close until it is green; never loosen a check to get there.
2. **Rewrite `HANDOFF.md`.** Current state, in flight, next three, what waits on Jake T (link the `needs-jake-t`
   issues). Under 80 lines. Rewrite the whole file; never append a dated block.
3. **`DECISIONS.md`: one paragraph, only if you made a rule.** A rule is something a future session would otherwise
   re-argue. Newest first, continue the id sequence, cite the PR. If nobody would re-argue it, write nothing.
   Move a paragraph to `archive/ledger-v3/` when it stops binding. Under 300 lines.
4. **Issues (single intake, `G5`).** Close what shipped; update what moved; drain any in-flight `## Deferred` items from
   `docs/ratchet-*.md` or review scratchpads into GitHub Issues (`→ Issue #<N>`) so completed run files never hold
   orphan backlogs (on v3 `coordination/` repos the single intake is `coordination/sprints/cleanup-triage.md` alongside
   the mechanical 14-day `D-155` `I-ledger` expiry check `G4`). Open an issue for anything new that only Jake T can do
   and label it `needs-jake-t`. One ask per issue.
5. **Branches.** Delete the merged branch; `git status` clean; nothing unpushed on this machine
   (`git log --branches --not --remotes` prints nothing).
6. **One line in the repo's Slack channel** (named in `CLAUDE.md`): what shipped, what is next, what needs Jake T,
   with issue links. Then stop.

The budget test (`tests/docs-budget.test.ts` or `scripts/test-docs-budget.mjs`) runs in `npm test`; a red there is
fixed by cutting or archiving, never by raising the number. `cut-opener` still applies afterwards if the next
conversation needs a paste.
