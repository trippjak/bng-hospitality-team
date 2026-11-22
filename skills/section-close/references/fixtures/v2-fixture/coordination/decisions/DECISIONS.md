# Decisions Log

> **Owned by:** Project lead. **Append-only by ID. Newest first.**

## Format

**Light format (default).** Two lines. Use for 95% of decisions:

```
## D-NNN — One-line title
YYYY-MM-DD • file:line • One-sentence what changed and why
```

A worked example, which is documentation and MUST NOT be migrated as an entry:

```
## D-042 — Example entry that lives inside a fence
2026-01-01 • example.ts:1 • If this is extracted, fence tracking is broken.
```

---

## D-006 — The index is a projection, never a hand-maintained file
2026-08-20 • scripts/ • Status: accepted · Regenerating in the same commit as
the mint is what keeps the projection honest.

## D-005 — Every relocation is logged
2026-08-18 • coordination/PROCESS.md • Moving a durable rule out of the snapshot without logging
where it went is indistinguishable from deleting it six weeks later.

## D-004 — Blockers are never auto-archived
*archived 2026-08-10; see [archive/2026-07-decisions-snapshot.md](archive/2026-07-decisions-snapshot.md#d-004)*

## ~~D-003 — Hand-maintain the decision index alongside the log~~
2026-08-04 • coordination/decisions/DECISIONS.md • Status: superseded · superseded-by: D-006 ·
The hand-maintained index drifted from the log within two closes.

## D-001 — [STRUCTURAL] Coordination lives in one directory per repo
2026-08-01 • coordination/ • Status: accepted · One tracked directory per repo holds the durable
tier, so a fresh session has exactly one place to look and tooling has one path to check.
