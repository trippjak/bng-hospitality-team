---
name: section-close
disable-model-invocation: true
description: >-
  Per-section cohesion sweep, the closing bookend to session-open: clean bloat, drift, and dead
  code; run one specialist scan; refresh HANDOFF, DECISIONS, ROADMAP, BLOCKERS within size
  thresholds; emit a where-we-are / what's-next snapshot, then cut the opener. Fires on "section
  close", "wrap up this section", "clean up", "drift sweep", "cohesion check", "where are we",
  "before I compact/clear", or after a feature-sized unit ships (a page, a feature, a pipeline unit
  reaching SEO_DONE). Not for typo fixes,
  bounded small changes, single-file edits, mid-section checks, or landmarks (sprint close, cutover, pre-launch audit →
  team-meeting; a HARD invariant violation escalates there too).
---

# Section Close

Apply [bounded QA](../bounded-qa/SKILL.md) first. A small change ends with its scoped receipt and
necessary coordination updates, without this ceremony. At real section completion, reuse
unchanged completed review and checks; the specialist step dispatches only for a named uncovered
risk. Record reused coverage instead of requesting another verdict. The protocol below does not
mandate spending a token budget or rerunning valid evidence. Genuine defects and required checks
still block completion; perform only in-scope cleanup.

The lightweight cohesion-sweep ceremony that runs at the close of every section unit. Sister skill to `team-meeting` — they share the persona vocabulary (Compass / Iris / Atlas) and the PASS / CONCERN / VETO tri-state output format (per team-meeting references/output-template.md), but operate at radically different scopes:

| Dimension | `team-meeting` | `section-close` (this skill) |
|---|---|---|
| Trigger | Landmark (sprint close, pre-cutover, structural pivot) | Section close (every page/feature/audience unit completes) |
| Cadence | ~weekly to ~monthly | Multiple times per week |
| Effort | Scope to named milestone risks; no token target | Reuse valid evidence; no token target |
| Lead invocation | Only leads covering named risks; no automatic fan-out | Existing review or one lead for a named uncovered risk |
| Failure mode | Doesn't run often enough | Runs too eagerly without budget discipline |
| Output | Structured findings + decision (D-NNN heavy format) | Cleanup commit + 4-doc refresh + snapshot |

## Why this skill exists

Section-by-section project work — building a website page-at-a-time, or feature-at-a-time — produces three predictable failure modes between landmarks:
1. **Drift** — copy + schema + nav + sitemap + footer + hub + diagram references go out of sync as a section ships
2. **Bloat** — old code paths, retired decisions, dead imports, stale MD doc entries accumulate
3. **Doc overload** — HANDOFF / ROADMAP / DECISIONS / BLOCKERS swell past readable thresholds, eventually causing chunking errors and lost-context regressions

`team-meeting` catches these at landmarks but is too heavy to run after every section. `section-close` catches them at the section level — small, frequent, disciplined.

## When to invoke

Invoke when the user signals "this section is done" via any of these phrasings:
- "Section close" / "wrap up this section" / "wrap [section]"
- "Clean up" / "drift sweep" / "cohesion check"
- "Where are we?" / "where are we going?" / "what's next?"
- "Move on" (after section-level work) / "let's compact" / "before we compact" / "before I clear"
- After visibly finishing a logical unit: a single page rebuild, a feature pillar, a content-pipeline unit reaching terminal state (e.g. SEO_DONE), a decision-ratification batch, a post-merge reconciliation, a pricing or about page, etc.

**Anti-triggers — do NOT invoke for:**
- Typo fixes / single-line edits
- Mid-section work-in-progress checks (the section isn't closed)
- "Quick check" — that's a single-agent dispatch, not a sweep
- Already-ratified decisions that don't need re-litigating
- Pre-launch comprehensive audits — those are `team-meeting` triggers
- Any landmark in `team-meeting`'s trigger list — let the bigger ceremony run

## Doc-system v4 repos: lite mode

If the repo root has `DECISIONS.md` and `HANDOFF.md` and there is **no `coordination/` directory**, the repo is on
doc-system v4 (launch-uk, rocketfuel-rebuild, launchfulfillment since 2026-10-13). **Skip the six steps below** and run
the ten-minute close in `references/v4-close.md`: CI green, rewrite HANDOFF, one DECISIONS paragraph only for a rule,
issues updated, branches clean, one line in the repo channel. No doclint, no ledger index, no lead consult. The six-step
protocol stays for every repo that still carries `coordination/`.

## The protocol — six steps

### Step 1 — Detect (programmatic, ~3K tokens)

The bundled `node "<this skill's base directory>/scripts/close_sweep.mjs" <projectRoot>`
can supplement detection. Its `READY` status covers only its implemented local checks,
not tests, GitHub, hosted behavior, handoff completeness or approval to close/merge.
It is read-only by default; do not pass `--fix-safe` as an incidental detection step.
The doc-mode rules and six-step protocol remain authoritative, including the separate
v4-lite route above. A helper/contract mismatch leaves that check unverified.

First, run the doc-system lint — deterministic, <1s, zero LLM tokens:

```bash
# $HOME expands in both PowerShell 5.1 and bash; ~ does NOT expand for native-exe args in PS
node "<this skill's base directory>/references/doclint.mjs" <projectRoot>
```

If `coordination/GLOSSARY.md` exists, run its lint in the same breath — `node "<this skill's base directory>/references/glossary-lint.mjs" <projectRoot>` (doc-thresholds.md §Process glossary). A dead pointer there is a doc that moved without its vocabulary; carry a red into step 4 like a doclint flag.

It reports per-file bytes/~tokens/max-line, the four-file **cold-boot read cost**, a dead-reference check on the always-read tier (`refs: N checked · M dead` — path-like tokens in HANDOFF/BLOCKERS that no longer resolve), and FLAG lines with prescribed actions (thresholds in `references/doc-thresholds.md`). Carry the flags into step 4 — do not act on them yet.

Also list satellite docs (Q14) — run the one-liner in `references/doc-thresholds.md`
§Satellite docs (definition + command live there; deliberately NOT a doclint check — it's
a ceremony sweep). Carry anything it prints into step 4 with the doclint flags — do not
act here.

Then run automated detection rules in parallel. Classify every finding into one of three buckets per `references/invariants.md`:

- **HARD violation** — preservation invariant breached. Default-deny. Surface to user, no auto-fix.
- **SOFT flag** — drift candidate that needs sign-off. Surface, propose fix, await ACK.
- **SAFE-to-clean** — auto-fixable with no user prompt.

Detection rules in `references/detection-rules.md`. At minimum, every invocation runs:
1. Typecheck (hard gate — section doesn't close with type errors). Run the project's OWN script —
   `npm run typecheck` if `package.json` defines it — NOT bare `tsc --noEmit`. Multi-config repos
   compile more than one `tsconfig`; bare `tsc --noEmit` reads only the root config and silently
   skips the rest. (business-club-ops: `typecheck` = `tsc -p tsconfig.json && tsc -p
   tsconfig.seed.json`; bare `tsc --noEmit` skips all of `src/seed/**` — a fact its own
   `CLAUDE.md:111` states. Confirmed by repro: a deliberate type error in the excluded tree
   passes bare `tsc` and fails `-p tsconfig.seed.json` with TS2322.) No script defined →
   enumerate `tsconfig*.json` and run `tsc -p` on each; **no tsconfig at all → rule 1 is
   SKIPPED, not failed** (the project is not TypeScript).
2. Banned-jargon grep across `src/` (D-103 list)
3. Backtick-in-CSS-comment guard (D-103 + D-105 recurring bug)
4. Canonical-URL drift detector (any hardcoded host outside config)
5. Schema `@id` integrity check (count + set unchanged across the sweep)
6. Redirect-map vs route-registry reconciliation
7. Voice tripwire residual scan (banned-jargon list site-wide, not just rebuilt pages)
8. Section-width audit (content sites only): grep shipped HTML for `.container-narrow`; each instance must be justified (prose / form / focused CTA / hero-lede). Custom max-width on section content requires an inline `/* D-NNN: reason */` comment. Flags otherwise. (feedback_section_width_default.md)

If the project is non-rocketfuel-rebuild, adapt the detection rules to project-equivalent invariants — read project-specific decision logs first to seed the list.

### Step 2 — Cleanup pass (auto + flagged, ~5K tokens)

Auto-clean every SAFE-to-clean finding without asking:
- Dead imports (verified by tsc / knip / ts-prune)
- `console.log` / `console.debug` introduced this section (keep `console.error`/`console.warn`)
- Trailing whitespace, BOM artifacts, >2 consecutive blank lines — ONLY in files this section touched
- Empty rule blocks (`.foo {}`)
- Orphaned `@keyframes` (defined but no `animation:` reference)
- TODO comments older than the section's start commit that reference completed work

For SOFT flags, propose the change with a one-line diff each, then ACK before applying.

For HARD violations: STOP. Surface to user. Do not auto-fix. If the user says "fix it," they're explicitly authorizing — mint a D-NNN-light entry to anchor the decision (v3: a new file in `coordination/decisions/d/` with the index regenerated; v2: append to DECISIONS.md).

### Step 3 — Reuse covered review or consult one lead

First cite valid review covering this section's unchanged scope. If a named risk remains
uncovered, pick the lead whose domain addresses it. Default heuristic:
- Section was content/copy/voice/component-design heavy → **Iris**
- Section was schema/SEO/IA/sitemap-affecting → **Compass**
- Section was infra/route/types/wrangler-affecting → **Atlas**
- Mixed / can't tell → default to the lead whose veto domain has been most recently exercised

Only for that uncovered risk, dispatch ONE lead with a tight prompt. Prompt template:

```
You are [Compass | Iris | Atlas]. Read your lens spec at
../team-meeting/references/[compass.md | iris.md | atlas.md].

This is a section-close lightweight consult — NOT a full team-meeting.

What shipped this section: [3-5 bullet summary]
Files changed: [list]

In your domain, surface ONLY:
- Any HARD invariant violations the programmatic rules missed
- Top 1-2 SOFT concerns worth flagging to the user
- PASS / CONCERN / VETO verdict overall

Do not dispatch supporting subagents. Do not fan out.
Token budget for your response: ~1.5K. Match the team-meeting
output template format but compressed.
```

If the lead returns VETO, block the affected work and verify the concrete finding. Escalate
to team-meeting only for a cross-domain or milestone decision; a scoped repair follows
bounded-qa's repair limit. Do not turn a VETO into an automatic multi-reviewer loop.

### Step 4 — Doc refresh (HANDOFF/DECISIONS/ROADMAP/BLOCKERS, ~5K tokens)

The four files live in two read tiers (see `references/doc-thresholds.md`): HANDOFF + BLOCKERS are **always-read** (cold-boot); DECISIONS + ROADMAP are **on-demand** (grep by D-NNN / `Status:`, never read wholesale — on mature projects DECISIONS alone can be 25K+ tokens). During this step, read only what the refresh requires: HANDOFF + BLOCKERS in full, the TAIL of DECISIONS, ROADMAP's active section.

Update the four files:

- **`HANDOFF.md`** — **rewrite wholesale** per `references/handoff-template.md` (snapshot, never append): severity-first ordering (blockers → state → re-entry map → constraints → reflection), zero "Prior …" chains, D-NNN refs only in §1/§4 and as §3 pointers (≤20 across §2 + §5 on v3; file-wide on v2), the on-resume read-back block, the do-not-read list, and the fresh 2-4 sentence **reflection** (what changed in understanding, what was tried and failed). History lives in git log + DECISIONS — diffing HANDOFF across closes IS the handoff history. **Verify before you certify:** a factual claim entering HANDOFF that this session did not itself produce (deploy state, phase %, "X is done", blocker status) is checked against the environment (git log · file existence · tracker state) or carried with an explicit ⚠ unverified marker — never silently re-asserted; docs rot *silently* (EMSE 2023) and HANDOFF is testimony the next session will trust. (⚠ is for claims genuinely uncheckable at close — not a substitute for a cheap check.) While rewriting the re-entry map: any open loop this session surfaced (decided · learned · half-built) gets an explicit line or an explicit "abandoned" note — a new task does not automatically receive conversation-only material. Two additions carry **trajectory**, the thing state alone loses: §3's first action gets a one-line **Why now** and a one-line **Rests on** (its assumption + what would falsify it), and §4 carries anything **killed this section that has no D-NNN yet**. Un-ratified rejections live only in the conversation, and DECISIONS is the on-demand tier a cold boot never reads — which is precisely why a fresh session re-proposes an approach killed an hour earlier.
- **`DECISIONS.md`** — append-only record (v3: one new file per decision in `decisions/d/`; the `DECISIONS.md` index is regenerated, never hand-edited). Validate-don't-originate: decisions made mid-session should already be logged at decision time (in-flight branches capture decisions on the claim PR instead — Q15; the close writes their D-NNNs as it lands); the close checks they're there and well-formed.

  **Before minting anything, apply the admission criterion** (PDR-001 §3.8, ratified — full text and routing in `references/doc-thresholds.md`). Ask, out loud, of each candidate:

  > *Would a future session, working a different unit, need this ruling to avoid re-litigating or violating it?*

  If no, it does not earn a global D-NNN: unit-scoped rulings stay with their unit (PDR ruling table, spec, PR), lessons about how we work go to feedback memory, code-level invariants go to a comment at the relevant line. **A close does not mint a D-NNN merely for being a close** — mint only when a qualifying ruling actually occurred. Say which bucket each candidate landed in; a candidate silently dropped and a candidate deliberately routed elsewhere look identical next month.

  **Directory mode** (`.doclint.json` `"version": 3`): the entry is a new file `coordination/decisions/d/D-NNN.md` with the frontmatter in doc-thresholds.md, and there is **no archive workflow** — retiring a decision means minting its successor with `supersedes:` and flipping only the retired entry's `status` + `superseded-by`. Regenerate the index (`decisions-dir.mjs index`) **in the same commit**, then `decisions-dir.mjs check` must exit 0. That check is the one place in this skill with teeth — doclint informs, the ledger fails.

  **File mode** (everything else, unchanged): append `## D-NNN — title` then `*Status: accepted · date · supersedes: …*`, with Context / Decision / Rejected / Evidence.
- **`ROADMAP.md`** — move section's items from active focus to shipped. Surface what's next. Items carry status fields, not narrative paragraphs.
- **`BLOCKERS.md`** — close any blockers the section resolved (strike-through + resolution + hash). Surface any new ones. On repos where BLOCKERS.md is an **index** over `blockers/` (doc-thresholds.md §BLOCKERS triage workflow): a resolved row leaves the table and its body moves **whole** to `blockers/RESOLVED.md`; a new blocker gets a row here and its body in `blockers/B-NNN.md`. Never shorten a body to fit the index. In **B directory mode** (`.doclint.json` `families.B.mode: directory`, claude-config D-012) BLOCKERS.md is GENERATED: resolve by flipping `status` + `date` + `resolved-by` in `blockers/b/B-NNN.md`, raise by minting a new file with `severity`, then `decisions-dir.mjs index .` in the same commit — `check` verifies both pages.
- **`IMPROVEMENTS.md`** (optional fifth file, if the project uses it) — APPEND deferred SOFT flags, lead-consult suggestions, and out-of-scope ideas noticed this section as `proposed` entries (`## I-NNN` + greppable Status line — contract in the session-open skill). Append without reading the file wholesale; it is read only at session-open. If an adopted improvement shipped this section, strike its entry and reference the new D-NNN.

  **I directory mode & 14-day mechanical expiry (`G4`, PDR-011 / D-155)** (`families.I.mode: "directory"` in `.doclint.json`): appending means **minting a new file** `coordination/improvements/i/I-NNN.md` (next id, frontmatter per doc-thresholds.md §Family-generic directory mode), never writing the flat file — the flat file no longer exists as the record. Status changes (adopt · decline · D-155 expiry · re-affirm) flip only `status`/`date` — I's two mutable keys — with the reason as a status note (`declined — expired, un-championed (D-155)`). `decisions-dir.mjs check` enforces the 14-day `D-155` proposal TTL via `proposal-expiry`: any `status: proposed` `I-NNN` whose `date` is `> 14` days older than the repo reference date fails the check until adopted, re-affirmed by bumping `date`, or expired as `declined — expired, un-championed (D-155)`. Regenerate the index (`decisions-dir.mjs index`) **in the same commit**; `check` covers the I family automatically and a red blocks the close exactly as it does for D.
- **Single intake for deferred findings (`G5`)** — deferred findings from `ratchet-review`, blind reviews, or section sweeps must never remain stranded inside completed sprint/run files (`## Deferred (found mid-run, NOT this run)` is strictly an in-flight scratchpad). Route every deferred finding to the repo's single intake before closing: `coordination/sprints/cleanup-triage.md` on v3/`coordination/` repos (or `IMPROVEMENTS.md` when promoted to an `I-NNN` proposal), or a GitHub Issue on v4-lite / issue-tracked repos, with each source bullet annotated with its destination (`→ cleanup-triage.md (<ID>)` or `→ Issue #<N>`).
- **Satellite sweep (Q14)** — for each satellite doc step 1 listed, propose the prescribed action per `references/doc-thresholds.md` §Satellite docs (relocate · status header · archive proposal) — all ACK-gated.

**A threshold breach is closed by RELOCATING content to its owner, never by compressing prose
until it fits** (`references/doc-thresholds.md` §RELOCATE, NEVER SHRINK). Rewriting tighter to pass
a byte count is the same move as deleting a failing assertion to go green — the words get shorter,
the lesson gets weaker, and nothing records that it happened. Durable constraints go to
`PROCESS.md`, ratified rules to a `D-NNN`, one-off specs to `coordination/archive/`; each leaves a
pointer and **the relocation is logged as a D-NNN**, which is the recall path. Content leaves the
cold-boot tier without leaving the repo. If the file is still over after everything with an owner
has moved, take the ACK — an honest breach beats a dishonest pass.

**If HANDOFF carries GEN blocks** (v3 scaffold, PDR-001 §3.7 — `<!-- GEN:state-delta -->` and friends), run the scaffold now, after the rewrite and **before** the doclint gate, so the gate measures what the file will actually contain:

```bash
node "<this skill's base directory>/references/handoff-scaffold.mjs" <projectRoot>
```

It rewrites only the generated blocks and preserves every byte outside them; a file with no markers is a no-op with a notice. It prints `HANDOFF: <before>B -> <after>B`. Everything the rewrite bullet above asks for — the reflection, the re-entry map, Why now / Rests on, §4's un-ratified rejections — lives **outside** the blocks, because that is the judgment layer and the generator does not own it.

**In directory mode, run the ledger before the doclint gate too** — `decisions-dir.mjs check <projectRoot>` must exit 0. Unlike doclint's advisory flags, a red here blocks the close: it means an entry was edited after mint, an id stopped resolving, or the index drifted from the record.

**Where `coordination/GLOSSARY.md` exists, `glossary-lint.mjs <projectRoot>` must exit 0 at the same point** — it is the fifth gate in the CI arm (doc-thresholds.md §Process glossary), and a close that leaves a pointer dead ships a glossary that lies.

Then **re-run doclint** (same command as step 1). This is the gate: for each remaining FLAG, propose the prescribed action (rewrite / archive / triage / restructure) with diff preview and require explicit user ACK. Never auto-archive. Two v3 flag classes ride the same gate (PDR-011): a **RATCHET** flag (a tracked file grew since baseline) is closed by holding/shrinking the file or by an ACKed re-baseline — `doclint <root> --write-ratchet` in this same commit, never silently; a **CEILING** flag (a file over 51,200 B) is closed only by relocation or migration, never by trimming prose. "Compaction safe: YES" in step 5 requires VERDICT: CLEAN or every flag explicitly ACKed-as-deferred.

### Step 5 — Snapshot (where we are / where we're going, ~3K tokens)

Emit a tight user-facing snapshot. Format:

```
**Section closed:** [section name + commit hash]

**Cold-boot cost:** [four-file sum from post-refresh doclint, ~N tokens — trending up or down vs last close]

**Where we are:**
- [3-5 bullets capturing current project state — what's live, what's launch-ready]

**Where we're going:**
- Next section: [name + scope]
- Then: [next + 1, name + scope]
- After that: [horizon — could be vague]

**What's next (immediate):**
- [Single concrete next-step the user takes — start the next section, run team-meeting at next landmark, resolve a blocker, etc.]

**Notes from this sweep:**
- [Any HARD violations the user must address — should be 0 if section closed cleanly]
- [Any SOFT flags accepted as deferred work — link to ROADMAP entry]
- [Any doc threshold breaches awaiting ACK]
- Open loops: [none | N captured → where each now lives | M abandoned by name]

**Ready for a new task?**
- [YES when the material handoff is durable and readable, checks meet the close's requirements, changes are pushed or explicitly identified as local-only, and unresolved approvals/blockers have an owner and next action. This does not certify pending work as released.]
- [NO when necessary evidence or trajectory exists only in this conversation, a required artifact cannot be recovered, or an authority conflict is unresolved. Name the missing item and finish authorized preservation work first.]
```

**Use the host's actual new-chat action.** In Codex desktop, recommend starting a new task
in the same project and pasting the opener. Do not tell the user to type `/clear`, and do
not claim that an ordinary chat message resets context. In another host, use its verified
new-conversation action; never generalize a CLI command to a desktop app. Forking preserves
history and is for branching work, not a clean context start. Stay in the same task while
solving the same coherent problem; automatic compaction can support long-running work.
Starting fresh is useful at a completed outcome or deliberate handoff, not after every turn.

**Preserve the material handoff before switching.** Account for the goal and success criteria,
current plan and next action with its reason, decisions and rejected approaches, unresolved
questions and assumptions, scoped approvals, exact branch/PR/head, checks with their tested
refs, release state, and artifacts needed to continue. Put each in its existing repo-owned
plan, review/evidence record or coordination document; keep HANDOFF as pointers and current
state. Do not dump the transcript, secrets, raw private payloads or duplicate histories into
Git. This is a coverage check, not a promise of lossless model memory.

For required ignored/temp artifacts, identify whether the next task is on this machine.
Preserve originals and record usable paths plus their local-only status. Across machines,
use an authorized durable artifact destination or record what must be regenerated; an ignored
receipt path is not transferable evidence. If only chat history holds necessary material,
externalize it within authorization before declaring the handoff ready. Record the source
chat/task ID or accessible link when available; never invent it or make it the sole state store.

**Then cut the opener from the final state.** After authorized merge, deployment or approval
changes, re-check the affected facts and regenerate the opener. Never leave a pre-merge
IN FLIGHT block as the final instruction after that PR has shipped. Use `cut-opener` if
installed; otherwise emit one bounded block with canonical pointers, first action, unresolved
items and scope guard. A pending PR is a valid handoff when explicitly labeled pending.

**Archive after acceptance.** Recommend archiving the old task after the new task has read
the required artifacts and returned an accurate read-back of state, trajectory and open items.
Archiving organizes history; it does not transfer context or preserve missing files. For a
Codex-managed worktree, archiving can trigger worktree cleanup: verify retention behavior and
preserve required ignored artifacts outside that worktree before recommending archive. Keep the
old task available as evidence, and do not delete it or its worktree to achieve a context reset.
Do not create, archive or delete tasks unless the user requested that action.

### Step 6 — Commit + push (~2K tokens)

ONE commit per section close. Title format: `section-close: [section name] cohesion sweep`.

The leading `D-NNN ` was **dropped on 2026-08-26** (PDR-001 §3.8 ratification follow-up). It forced a mint at every close purely to have something to put in the title — the exact habit the admission criterion retires. Mint a D-NNN at a close only when a qualifying ruling actually occurred, and reference it in the body if so. The `section-close:` prefix is load-bearing and must stay: doclint's near-cap streak detection finds past closes by grepping `section-close:` (never the D prefix), and the regression suite pins that.

Body explains:
- What auto-cleaned (1 line per category)
- What was flagged + accepted (1 line per item)
- Any HARD violations surfaced (or "none")
- Doc refresh + threshold status (or "all under threshold")

The flight-board lane below is the default — the PRs-only ruleset is live fleet-wide (2026-08-03). Direct push to main only on repos without the ruleset; pause for user push approval on production projects.

**Flight-board repos** (a CLAIM PR is open for this branch — see the `flight-board` skill):
the close merges through the PR, which releases the claim and deletes the branch:
`gh pr ready <n>` then `gh pr merge <n> --merge --delete-branch` (never squash — work-branch
commits carry D-NNN anchors). On auto-deploy repos the merge is still the deploy, so the
operator gate above applies to the merge, not the push. Before merging, verify the refreshed
HANDOFF obeys flight-board's wording rule for unclaimed work — doclint's
imperative-next-action check flags breaches; the rule lives in the flight-board skill.

## The receiving end — session-open read-back

Section-close writes the handoff; the NEXT session must receive it properly (shift-handover research: bi-directional confirmation substantially improves transfer accuracy — write-only handoffs lose fidelity). When opening a session on a doc-system v2 project (fresh session or post-compaction):

1. Read HANDOFF.md + BLOCKERS.md (always-read tier only — do NOT read DECISIONS/ROADMAP wholesale).
2. State in one short paragraph: current state as you understand it + your first action. This read-back surfaces stale-handoff errors before they become work.
3. Grep DECISIONS.md for specific D-NNN anchors only as they come up.

The HANDOFF template's "On resume" block carries this instruction so it works even when this skill isn't loaded.

## Token budget — strict

Total invocation target: **~25–35K tokens**. Breakdown:
- Step 1 detect: 3K
- Step 2 cleanup pass: 5K
- Step 3 lead consult: 5K (the consult itself returns ~1.5K + the dispatch wrapper)
- Step 4 doc refresh: 5K
- Step 5 snapshot: 3K
- Step 6 commit + push: 2K
- Buffer + verification: 2-7K

If a section close balloons past 50K, the section was too big — split into sub-sections, run section-close on each, then a final wrap-up. Or the section had a structural concern that should have triggered `team-meeting` instead.

The budget assumes the two-tier read discipline: doclint does the measuring for free, and DECISIONS/ROADMAP are grepped, never read wholesale. Reading a mature project's full DECISIONS.md (25K+ tokens) blows the budget in one tool call — that is the failure mode the tier model exists to prevent.

**Quick-close lane (reconciliation only):** when the close reconciles work that was already
closed elsewhere (post-pull merge, parallel-session join), steps 2-3 (cleanup + lead consult)
may be skipped; steps 1 (doclint), 4 (doc refresh), 5 (snapshot), 6 (commit) remain
mandatory. Say "quick close" explicitly in the invocation args.

## The session cadence — bookends

```
/session-open  →  work (commit/push per flow policy)  →  section-close  →  new task in the same project or end
```

`session-open` (sister skill) is the receiving end of this ceremony: it pulls fresh, looks
sideways + reads the board frontier on board repos, reads only the always-read tier,
cross-checks HANDOFF against git log for staleness, and triages IMPROVEMENTS.md. This skill
writes what that one reads — keep both sides of the contract honest.

## Integration with team-meeting

This skill **escalates to** `team-meeting` automatically when:
- A lead returns VETO in step 3
- The user is at a structural landmark in `team-meeting`'s trigger list
- The user explicitly asks for a deeper audit

Do not run both ceremonies redundantly. If `team-meeting` ran in the last 7 days on overlapping scope, skip step 3 here — programmatic rules + cleanup + doc refresh are enough.

## Reference files

Read each as needed; not every invocation needs all of them:

- `references/doclint.mjs` — deterministic doc-system linter (bytes/tokens/mega-lines/Prior-chains/cold-boot cost). RUN it at step 1 and after step 4; never re-implement its checks with LLM judgment.
- `references/invariants.md` — full HARD / SOFT / SAFE-to-clean buckets across all three lead domains. Read on first invocation per project to ground the cleanup classifier; consult during step 2 for any ambiguous case.
- `references/detection-rules.md` — the automated detection rules with concrete grep patterns and tooling. Read at step 1 to get the exact commands to run.
- `references/doc-thresholds.md` — byte-based thresholds, the two-tier read model, v3 directory mode, the supersession flow, the admission criterion, archive/rewrite/triage workflows, the satellite-docs contract (Q14), DECISIONS entry format. Read at step 4.
- `references/decisions-dir.mjs` — v3 ledger for directory-mode repos: `index` | `check` | `migrate`. RUN `check` at step 4; it EXITS 1 and blocks the close (doclint informs, this fails).
- `references/handoff-scaffold.mjs` — regenerates HANDOFF's `<!-- GEN:… -->` blocks and preserves every byte outside them. Run at step 4, before the doclint gate.
- `references/fixtures/` — v3 + v2 fixture repos and `run-tests.mjs`, the both-directions mutation harness plus the frozen v2-parity oracle. Run it after ANY edit to the three scripts.
- `references/handoff-template.md` — the HANDOFF.md contract (severity-first template + rules). Read whenever rewriting a HANDOFF.
- `references/evidence.md` — the research base behind v2 (local audit + industry + academic). Read only when questioning or revising the design.

## Anti-patterns

- **Running on every commit.** This skill is for SECTION close, not commit close. Multiple commits = one section. Wait for the section to actually finish.
- **Skipping the lead consult to save tokens on a full close.** The reconciliation quick-close lane is the only sanctioned exception. The programmatic rules catch syntactic drift; the lead catches voice/cohesion drift the rules miss. Skip = drift accumulates between landmarks.
- **Auto-fixing HARD violations because "it looks safe."** Default-deny on A-bucket. Surface and wait. The user's six-second sign-off is cheaper than reverting a load-bearing change.
- **Treating archive operations as auto-cleanup.** Archive proposals always require user ACK. Auto-archiving a blocker is the worst-case failure of this protocol.
- **Letting section-close substitute for team-meeting.** Different scopes. If a structural concern surfaces, escalate.
- **Skipping the snapshot.** "Where are we / where are we going / what's next" is what the user asked for. The cleanup commit is the *means*; the snapshot is the *output*.

## Anchor — relationship to the doc system

This skill is the operational complement to the doc system (HANDOFF/DECISIONS/ROADMAP/BLOCKERS as four live files). The doc system defines the contract; section-close enforces it cycle-over-cycle.

**v2 vs v3.** v3 (PDR-001, ratified 2026-08-26) lets the D family become a directory of immutable per-entry files behind a generated index, moving the byte cap off the record and onto the projection — and PDR-011 (ratified 2026-08-27, business-club-ops D-177) generalises that machinery to any family, the I family first, adding the growth ratchet and the 51,200 B per-file ceiling. It is **opt-in per repo** via `coordination/.doclint.json` `"version": 3`; a repo without that key gets exact v2 behaviour, and that parity is a tested contract. Read `references/doc-thresholds.md` §Directory mode before proposing a conversion — converting a repo is its own unit, never something done opportunistically at a close. Without section-close, the four files drift toward staleness; without doc-system v2, section-close has no canonical surface to refresh.

Both are project-portable — when applying to a project that doesn't use doc-system v2/v3 yet, propose adopting the four-file model first, then run section-close against it.
