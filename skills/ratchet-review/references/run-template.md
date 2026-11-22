# Run-file template (locked)

Copy this skeleton verbatim into `coordination/sprints/ratchet-<slug>.md` at Phase 0 and
fill it as the run progresses. The gate checkboxes are load-bearing: a fresh session (or the
other machine) reconstructs the run's exact position from them — never advance past an
unticked gate.

```markdown
# Ratchet run — <target>

*Started: <date> · branch: `<working-branch>` · behavior-preserving: yes*
*Standards: <docs/CODE-REVIEW-STANDARDS.md | skill defaults (4D Deep-Module Ratchet)>*

## Gates
- [ ] P0 scope locked (ONE target or shallow cluster: `<path-or-artifact>`) + working branch verified
- [ ] P1 4D baseline recorded (pinned to: `<commit / build hash>`)
- [ ] P2 proof harness defined + dry-run PASSING on untouched target
- [ ] P3 batch plan written (deepening seams first; no syntactic evacuation)
- [ ] P5 ratchet report emitted (all 4D metrics held-or-improved) + all deferred items routed to single intake (`cleanup-triage.md` or GitHub Issue)

## Baseline (P1 — 4D Deep-Module & Target Metrics)
| Metric | Value | Command to reproduce |
|---|---|---|
| Circular imports (`cycles`) | | |
| Runtime exports & Depth Ratio (`LOC / export`) | | |
| Max function params (`maxParams`) & Cognitive Complexity (`maxCog`) | | |
| File LOC / Function LOC inventory | | |
<!-- every number needs a rerunnable command; heuristic numbers labeled `heuristic` -->

## Proof harness (P2)
Type: <byte-identical hash | visual regression | golden tests at public entry-point interface>
How to run: `<command>`
Dry-run result: <PASS <date> | pending>
Declared tolerances (BEFORE the batch needing them): <none | list>

## Batch plan (P3)
- [ ] B1 — <self-contained slice: break cycles / extract value object or port seam> (<est. lines>, <mechanical|reviewed>)
- [ ] B2 — <consolidate duplicate pipelines / re-anchor tests on public seam & un-export helpers>
<!-- order: break cycles & unify value objects → consolidate behind deep ports/stores → re-anchor tests & un-export helpers -->

## Batch log (P4)
| Batch | Commit | Typecheck | Build | Proof + 4D Ratchet | Notes |
|---|---|---|---|---|---|

## Deferred (found mid-run, NOT this run)
<!-- In-flight staging scratchpad during P1–P4 ONLY (G5). Before checking off P5, route every item to the repo's single intake (`coordination/sprints/cleanup-triage.md` on v3/coordination repos, or a GitHub Issue on v4-lite / issue-tracked repos) and annotate each bullet with its destination (`→ cleanup-triage.md (<ID>)` or `→ Issue #<N>`). -->
- <finding> → <cleanup-triage.md (<ID>) | Issue #<N>>

## Ratchet report (P5)
| Metric | Baseline | Final | Δ | Verdict |
|---|---|---|---|---|
<!-- any regression in cycles, interface width, cognitive complexity, or proof = run failed -->
Proposed D-NNN: <one-liner> · Merge decision: USER'S — evidence above.
```
