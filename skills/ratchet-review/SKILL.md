---
name: ratchet-review
disable-model-invocation: true
description: >-
  Guarded remediation run for ONE named oversized or shallow-fragmented target (file, module
  cluster, or bundle): measure with real 4D deep-module tools (size, cognitive complexity,
  interface width/params, circular seams), prove behavior preserved before editing, batch ≤400
  changed lines, and deepen modules rather than evicting shallow pass-through helpers. Fires on
  "deep review this file", "shrink this without breaking prod", "run the ratchet", "remediate
  this file", "deepen this module cluster", or a size/shallowness finding graduating into its
  own cleanup. Not for a diff/PR (/code-review or simplify), section hygiene (section-close),
  milestone or repo-wide audits (team-meeting), or a quick read.
---

# Ratchet Review

A dedicated remediation run for one oversized or shallowly-fragmented target, built on three
primary-source foundations:
1. **Batch review curve (SmartBear/Cisco, 2,500 reviews):** defect detection collapses past
   ~400 *changed lines per review sitting* (this governs **batch diff size**, not a naive guillotine
   that chops cohesive modules into shallow fragments).
2. **Deep modules over shallow syntactic splits (Ousterhout 2018; `codebase-design`; *RepoMirage* &
   *CodeCompass* 2026):** splitting a file solely to satisfy a raw line-count cap by evicting
   30–50 lines into a neighbor file with 6–12 positional parameters, circular imports, or exported
   private helpers (**Syntactic Evacuation**) creates shallow modules and degrades agentic
   multi-file reasoning accuracy from 66.8% to 25.3%. Every ratchet split or consolidation must
   increase **module depth** (more capability behind a narrower interface).
3. **Correct-semantics measurement:** a naive regex heuristic reported 269 duplicate selectors in a
   5,308-line file; the correct-semantics tool found 15. **Measure with real 4D tools, prove
   behavior is preserved, move in small batches, and let the multi-dimensional ratchet — not raw
   LOC alone — say whether it worked.**

## Where it sits among the siblings

| Skill | Scope | Cadence |
|---|---|---|
| `/code-review` | one diff | per change |
| `section-close` | one shipped section, hygiene + docs | per section |
| `improve-codebase-architecture` | whole repo / subsystem scan for shallow modules & seam leaks | milestone fitness function (every 2–3 feature PRs) |
| `team-meeting` | whole project, cross-functional | landmarks |
| **`ratchet-review`** | **one named target or shallow module cluster, deep remediation** | **when a target earns it (or preparatory before a crowded feature)** |

If a run surfaces structural questions spanning specialist domains, stop and escalate to
`team-meeting`. If the "target" turns out to be the whole repo, run `improve-codebase-architecture`
first to identify the highest-leverage module cluster, then invoke `ratchet-review` on that
named target.

## The Two-Cadence Deepening Discipline (Preventing Goodhart's Law on LOC)

Raw line caps without interface/seam metrics trigger **Goodhart's Law**: agents and developers
game a 400-LOC/file ceiling by extracting pass-through trampolines with 8–12 positional arguments
and exporting internal helpers for tests. To maintain high code standards without creating
shallow codebases, follow two rules across timescales:

1. **In-Flight Feature Loops (Kent Beck's *Tidy First* / Preparatory Deepening):**
   - Never perform **Syntactic Evacuation** (moving random functions into a neighbor file with
     long parameter lists just to duck under a line cap).
   - If a cohesive module has **0 circular dependencies**, **functions within cognitive/parameter
     bounds**, and a **narrow public interface (`<= 5` exported runtime symbols)**, it earns the
     **Deep-Module Allowance** (up to `500` LOC/file in `references/standards.md`).
   - When a module genuinely outgrows its seam during feature work, wear the refactoring hat first:
     land a 1-commit **Preparatory Deepening** that extracts a true **Value Object**, **Port/Adapter**,
     or **Pure Sub-Compiler** with a small interface (`<= 3` parameters, `0` cycles), then land the
     feature on top.
2. **Milestone Deepening Passes (`improve-codebase-architecture` → `ratchet-review`):**
   - After 2–3 feature PRs, run `improve-codebase-architecture` as an **Architectural Fitness
     Function** (Ford et al.). When it flags a 5-to-7-file ping-pong cluster, duplicated route
     pipelines, or a test suite importing 20+ private helpers, run `ratchet-review` on that cluster
     to **collapse shallow modules into deep ones** and re-anchor tests on the public entry-point
     interface.

## The run contract (durable, resumable)

A run is long-lived — it spans sessions, compactions, and machines. Its state therefore
lives in a file, not in conversation memory: `coordination/sprints/ratchet-<slug>.md`
(fallback for non-doc-system projects: `docs/ratchet-<slug>.md`), created from
`references/run-template.md` — use that exact skeleton; its gate checkboxes are what make
the phase order survive a context loss. On resume: read the run file first (it is the run),
then **re-run Phase 0's rails before anything else** — a run resumed onto a stale tree or
the wrong branch is void. One target (or one tightly-coupled shallow cluster) per run; a second
unrelated target is a second run. Scope creep discovered mid-run is staged in the run file's
`## Deferred (found mid-run, NOT this run)` scratchpad during Phases 1–4, then drained into the
repo's **single intake** (`coordination/sprints/cleanup-triage.md` on v3/`coordination/` repos, or
a GitHub Issue on v4-lite / issue-tracked repos) before Phase 5 closes (`G5`).

## Phase 0 — Scope-lock & rails (~2K tokens)

1. Name the target precisely (file, shallow module cluster, or built artifact) and confirm the
   intent is **behavior-preserving**. Behavior-*changing* work is feature work — different rules,
   different ceremony.
2. **Branch guard.** On any repo where pushing the default branch deploys (check HANDOFF /
   project memory), verify you are on a working branch before anything else. If the user has
   already created one, use it; never create surprise branches on someone else's repo without
   saying so. Pushing the working branch is fine; merging to main is ALWAYS the user's call.
3. Two-machine hygiene: `git fetch` + confirm the branch is current before reading code
   (stale-tree findings are worthless).
4. Check the project for a standards doc (`docs/CODE-REVIEW-STANDARDS.md` or equivalent).
   If present it overrides the portable defaults in `references/standards.md`.

## Phase 1 — Measure in 4 Dimensions (~4K tokens)

The bundled scanner is one available instrument; see [measure-tools](references/measure-tools.md#bundled-scanner-in-067)
for portable commands and coverage limits. It does not replace the run contract or project gates.

Deterministic tools first, LLM judgment second. Pick instruments by target type from
`references/measure-tools.md` (read it now — it carries proven, paste-ready snippets):

- **CSS / CSS-in-TS** → `@projectwallace/css-analyzer` **on the shipped bundle** (Wallace's own
  guidance), plus a context-aware duplicate scan. Same selector under different `@media`
  blocks is correct responsive CSS, not duplication.
- **TypeScript / Logic (The 4D Deep-Module Ratchet)** → bare `tsc --noEmit`, `knip`, `biome`,
  plus the **4D AST Ratchet** (`references/measure-tools.md`):
  1. **Seam & Dependency Hygiene:** circular dependencies (`0` allowed) and layer-direction leaks.
  2. **Interface Surface & Depth Ratio:** exported runtime symbol count, **Depth Ratio**
     ($\text{LOC} \div \max(1, \text{Runtime Exports})$), and **Max Parameter Count** per function
     (flag `> 5` positional parameters as primitive-obsession / trampoline smells).
  3. **Cognitive Complexity & Function Narrative:** Sonar-style cognitive complexity per function
     (nesting + control-flow breaks; target `<= 15`, hard cap `<= 25`) paired with function length
     (`<= 60` LOC soft; up to `80` LOC when flat/linear with cognitive complexity `<= 15`).
  4. **Depth-Adjusted File Size:** `<= 400` LOC standard; up to `500` LOC **Deep-Module Allowance**
     when runtime exports `<= 5`, `0` circular imports, and `0` parameter/complexity violations.
- **Markdown/docs** → the doclint from section-close.

Record the baseline as a table IN the run file, pinned to something immutable (commit hash,
build hash like `x-style-hash`). Every number needs a command someone else can rerun — show
evidence, not verdicts. If a number comes from a heuristic you wrote in 30 seconds, label it
`heuristic` and do not act on it until a correct-semantics tool confirms it.

## Phase 2 — Guard (~3K tokens; more if building a visual harness)

No edit ships before a proof mechanism exists. Choose the strongest one available:

1. **Byte-identical proof** — when the target compiles into a deterministic artifact
   (e.g. sections → concat → minify → hash): a purely mechanical reorganization MUST produce
   an identical output hash. Free, total, use it whenever the build permits.
2. **Visual regression** — for UI-affecting CSS where the output legitimately changes:
   Playwright `toHaveScreenshot` across ~6 representative pages against the local dev server.
   Capture the goldens BEFORE the first edit.
3. **Golden / behavioral tests at the public interface** — for logic: pin current behavior with
   tests across the module's **public entry-point seam** before touching internals ("the interface
   is the test surface"). If existing tests import 20+ private helpers, add an entry-point
   characterization test first so internal helpers can be safely merged or un-exported.

Write the chosen proof + how to run it into the run file, then **dry-run it once against
the untouched target and record the passing result** — that recorded pass is Phase 4's
entry ticket. A batch without a passing proof does not land, no matter how obviously
correct it looks.

## Phase 3 — Plan batches (~3K tokens)

Slice the work into self-contained batches using the size gates (full table + citations in
`references/standards.md`):

- Hand-reviewed logic changes: **≤ 200-400 changed lines per batch** — defect detection
  falls off a cliff beyond that; this is the entire reason batches exist.
- Mechanical transforms: any size, **iff** produced by an idempotent, committed script
  verified to 0-residual — then the review target is the script, plus spot checks.
- **Order batches for architectural depth (`codebase-design`):**
  1. **Break cycles & unify value objects:** eliminate circular imports and replace 6–12 positional
     parameter lists with cohesive domain context / value objects.
  2. **Consolidate duplicated pipelines behind deep ports/stores:** merge duplicated route/storage
     orchestration or scattered vendor `fetch()` calls behind a narrow Port or Store interface.
  3. **Re-anchor tests on the public seam & un-export private helpers:** move assertions to the
     deepened entry point and delete/un-export shallow pass-through helpers (the **deletion test**).

Write the plan into the run file with a checkbox per batch.

## Phase 4 — Execute loop (per batch, ~3-6K tokens each)

**Entry precondition (hard):** the run file records a passing Phase 2 proof dry-run and a
Phase 3 batch plan. Either box unticked means you are not in Phase 4 yet — go do that phase.

For each batch: transform → project commit gate (bare, unpiped typecheck or equivalent) →
build → **proof gate + 4D ratchet check** → commit to the working branch with the batch label →
tick the run file. Rules that keep this safe:

- Before approving a nontrivial handwritten-code batch, run
  [blind-code-review](../blind-code-review/SKILL.md). Preserve its first reading before revealing
  comments or rationale, and bind the final receipt to the batch's source. Missing, contaminated
  or stale evidence is incomplete. Fix unclear code rather than adding narration. Essential
  why/constraint comments may remain; a named helper may earn its place through clarity even
  with one caller. Shrink unnecessary implementation and interface surface area, not names,
  safeguards or readability.
- **Deepening check on every split:** if a batch splits a file, verify that the new seam passes
  Ousterhout's **deletion test** (zero circular imports, fewer total exported symbols or narrower
  parameter lists, and no pass-through trampolines).
- A failed proof halts the batch. Diagnose, then **shrink** the batch — never widen it to
  "get it working". If a batch won't pass small, the plan was wrong; replan.
- Never hand-edit generated files; change the generator.
- **Solo by default.** Dispatch at most one specialist per batch, and only where decision
  density is high (a `code-reviewer` pass on a tricky logic batch, a design-QA eye on
  visual diffs). Reviewers return findings + severity — they diagnose, they do not rewrite;
  the run applies changes. Any dispatch brief must be self-contained: the batch slice, the
  file pointers, and the return shape. Mechanical batches need the generator reviewed, not
  the output line-by-line.
- One batch per commit. History should read as the plan.

## Phase 5 — Ratchet report & handoff (~3K tokens)

Re-run the Phase 1 instruments. Emit the deltas table (baseline → now) in the run file and
to the user, including **Depth Ratio ($\text{LOC}/\text{Export}$)**, **Max Params**, **Circular
Imports**, **Cognitive Complexity**, and **LOC**. **The ratchet is the verdict:** every tracked
metric held or improved = the run succeeded; any regression = it failed, regardless of how clean
the code now looks. Then:

- **Drain the deferred scratchpad to the single intake (`G5`):** `## Deferred (found mid-run, NOT this run)` is strictly an in-flight staging scratchpad during Phases 1–4; completed run files must never become orphan backlogs. Before P5 can be checked off, route every deferred bullet to the repo's single intake (`coordination/sprints/cleanup-triage.md` on v3/`coordination/` repos, or file a GitHub Issue on v4-lite / issue-tracked repos) and annotate each bullet with its destination (`→ cleanup-triage.md (<ID>)` or `→ Issue #<N>`).
- Propose (don't self-ratify) a D-NNN for the decision log; hand docs ceremony to
  `section-close`.
- Merging the working branch into main is the user's decision — present the evidence
  (deltas, proof runs, batch log) and stop.

## Anti-patterns

- **Syntactic Evacuation (Goodharting the line cap).** Moving 40 lines out of a 398-line file into
  a neighbor file with 8 positional arguments, creating a circular import, or exporting internal
  helpers just to keep raw file LOC under 400. If a split widens the interface or adds a cycle,
  it is a regression — deepen the seam or use the Deep-Module Allowance instead.
- **Testing past the interface.** Exporting 25 private helpers so unit tests can call them directly
  freezes shallow splits in concrete. Test through the module's public entry-point interface.
- **Acting on heuristic counts.** The 269-vs-15 incident is the founding story. Correct
  semantics first.
- **Big-bang rewrite** ("it'd be faster to just redo the file"). It is never faster once the
  live site breaks.
- **Widening a failing batch.** Failure means shrink or replan.
- **Blind dedup of cross-file repeats.** Some are intentional cascade overrides; each merge
  needs the proof gate, not a regex.
- **Gating on absolute scores.** Gate on *deltas* — hold or improve.
- **Running it on main**, on a diff (that's `/code-review`), or as recurring hygiene (that's
  `section-close`).
- **Deleting "unused" classes without rendered-HTML evidence.** Dynamically-built class
  names (`thing--${n}`) look unused to grep. Safelist patterns; verify against the live
  crawl.

## Budget & cadence

Setup phases (0-3): ~12-15K tokens once per run. Each batch: ~3-6K. A run is typically
2-6 working sessions; the run file is what makes that cheap to resume. If setup balloons
past ~25K the target was mis-chosen (too broad) — re-scope to the hottest sub-target.

## References

- `references/standards.md` — 4D deep-module gates, per-category batch gates, and the
  primary-source evidence table (SmartBear/Cisco, NASA Power of 10, Ousterhout Deep Modules,
  SonarSource Cognitive Complexity, RepoMirage/CodeCompass 2026). Read at Phase 3.
- `references/measure-tools.md` — instrument table + proven snippets (bundle fetch, Wallace
  analysis, 4D TypeScript AST deep-module analyzer, context-aware dup scan). Read at Phase 1.
- `references/run-template.md` — the locked run-file skeleton with gate checkboxes. Copy it
  at Phase 0; it is the resume contract.
- Reference implementation of the standards: rocketfuel-rebuild `docs/CODE-REVIEW-STANDARDS.md`.
