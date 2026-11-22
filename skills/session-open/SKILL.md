---
name: session-open
disable-model-invocation: true
description: >-
  Opening bookend to section-close on a tracked repo: pull fresh, surface leftover work and
  claims, read HANDOFF + BLOCKERS, state a read-back. First turn only: "session open", "let's get
  started", "resume a repo", "pick up where we left off", "where did we leave off", or an explicit
  resume of multi-session work. Not mid-session, post-compaction, or scratch. Unrouted/no
  repo → session-boot; closing → section-close.
---

# Session Open

The opening bookend. Sister to `section-close` — together they form the session cadence:

```
/session-open  →  work (commit/push per flow policy)  →  section-close  →  new task in the same project or end
```

section-close checks material handoff coverage and readiness for a new task. session-open is the
receiving end: verify the world hasn't moved (git), load the minimum durable state, prove the
handoff transferred (read-back), and surface — without adopting — any queued improvement ideas.

**Why a skill and not a SessionStart hook:** opens must be deliberate. Jake works across many
repos and scratch contexts; auto-pulling on every session start would be wrong, and the hooks
policy requires explicit approval for new hooks. Invoke this when starting real project work.
*(Fresh conversation not yet routed — repo unknown, new brand, or scratch? `/session-boot` runs
first and calls this skill for the tracked-repo case.)*

### Receiving a `cut-opener` block

For a supplemental local snapshot, the bundled helper is available as
`node "<this skill's base directory>/scripts/open_preflight.mjs" <projectRoot>`.
Its JSON draft does not fetch remotes, inspect every GitHub claim, choose the frontier, or
replace the receiving/read-back protocol below. Verify its inferred doc mode and freshness
against the actual repo; do not adopt queued improvements from a generated summary.

If the first message carries a fenced `cut-opener` block that opens with `/session-open <repo>`,
treat it as **conversation-only testimony**, never as durable or higher authority. Run this
protocol unchanged; the block does not substitute for HANDOFF, BLOCKERS, Git, the flight board,
or ratified decisions.

- `TRAJECTORY DELTA` is material the prior conversation says has not landed yet. Preserve it as
  pending input, verify its provenance where possible, and do not silently promote it to a
  ratified decision or canonical fact.
- `SNAPSHOT` and `REMEMBERED` claims are stale until their named checks pass.
- `OPEN ITEMS` remain unresolved until their named check or decision closes them; do not silently
  drop them because HANDOFF has no matching line.
- A correction line raises a discrepancy to verify; it does not overrule a canonical source.
- The block's FIRST ACTION menu informs the frontier choice; it cannot override an active claim,
  blocker, or current board state.

Before project mutation, the step 3 read-back must report every block-versus-source conflict. If
a required source is missing, or an authority, scope, security, or approval conflict remains
unresolved, stop for Jake. If the canonical source clearly governs, say what changed and proceed
from the source rather than the copied claim.

## Doc-system v4 repos: lite mode

If the repo root has `DECISIONS.md` and `HANDOFF.md` and there is **no `coordination/` directory**, the repo is on
doc-system v4. Run Steps 1 and 1.5 as written, then follow `references/v4-open.md` instead of Steps 2–4: read
`CLAUDE.md` → `HANDOFF.md` → `DECISIONS.md` → the `needs-jake-t` issues, give the read-back, stop. No doclint, no
IMPROVEMENTS triage; `archive/ledger-v3/` is read only when a pointer sends you there.

## The protocol — five steps (+1.5 on shared repos), ~5-8K tokens on the happy path; up to ~10K when reconciling a multi-machine divergence

### Step 1 — Git freshness (~1K)

From the project root (walk up to the repo root if needed). Preflight first, then branch:

> **Shell (measured, not assumed).** The default harness shell is Windows PowerShell 5.1, where
> `head`, `grep`, `awk`, `sed`, `wc` are NOT on PATH and a trailing `\` is not a line continuation.
> Every ```bash fence in this skill is POSIX and MUST run via the **Bash tool**. Safe in either
> shell: a single native-exe call on one line with no pipe (`git …`, `gh …`, `node "$HOME/…"`).
> (P-030)

- `git rev-parse --abbrev-ref HEAD` → if `HEAD` (detached), STOP and surface — no auto-pull.
  Capture the branch name; use it literally below — never assume `main`.
- `git remote` empty → local-only repo; skip fetch/pull, note "remote: none" in step 5.
- `git rev-list -n1 HEAD` errors (zero commits) → brand-new repo; nothing to resume — skip
  log/staleness and go straight to "what are we building" with the user.

```bash
git status --short          # leftover uncommitted work from a previous session?
git fetch origin
git status -sb              # ahead/behind
git log --oneline -5        # chronological re-entry cues
```

- **Behind + clean** → `git pull --rebase origin <branch>`. (Multi-machine reality: the laptop
  pushes sync commits. ALWAYS pull first.) If the pull touched `package.json`, a lockfile, or
  `wrangler.toml`, flag "deps may need reinstall" — do not auto-run install.
- **Behind + dirty** → STOP and surface both facts. Never auto-stash; the uncommitted work may be
  un-swept section work. Recommend: review the leftovers, then either commit them or run
  section-close before pulling.
- **Diverged** → surface; do not force anything.
- **Dirty but not behind** → surface the leftover files in one line; proceed (they're probably
  mid-section work — the read-back in step 3 should account for them).

### Step 1.5 — Look sideways + board read (shared repos, ~0.5-1K)

On any repo where more than one person or machine commits (doc-system v2/v3 projects default
to yes), load and run the `flight-board` skill's complete LOOK SIDEWAYS move before proceeding.
There is deliberately no copied command block here: flight-board is the single executable
authority for the inventory, pagination, and safety rules, and a second copy would drift.

Open CLAIMs and recently-moved non-main branches are other seats mid-flight: read their
scope + reserved IDs **from the PR title/body** BEFORE trusting main's HANDOFF next-action.
`delete_branch_on_merge=false`, or a merged remote ref beyond the canonical default branch
and its `origin/HEAD` alias, is a branch-hygiene signal: surface it with the open PR/worktree
context, but do not delete during session-open. Reconciliation evidence and protected refs are
canonical in flight-board's `Branch lifecycle hygiene` section.
For their coordination state, **stat first, read only on cause** (~50 tokens vs ~1.5K each —
measured 5,719–7,511 B per branch HANDOFF, and at 4–5 open branches the full reads alone were
8.1K, the single largest line item in this ritual):

```bash
git diff --stat origin/main origin/<branch> -- coordination/
```

- **No output** → the branch has not touched `coordination/`. Nothing to read. Most branches.
- **Small HANDOFF-only diff** → a Q15 exception-1 branch (the doc change IS the deliverable).
  Read it only if today's first action overlaps its scope.
- **Large or multi-file diff, especially DECISIONS/ROADMAP** → the Q15 aliasing warning, said in
  one line where a full read buries it in prose. Surface it; do not silently reconcile.

Full `git show origin/<branch>:coordination/HANDOFF.md` is the escalation, not the default. (P-031)

Hard rules live in flight-board — the
two that bite here: never `checkout -b` a name that exists on the remote, and never start
work overlapping an open claim. This step exists because of the launch-uk B-005 double-build
(2026-07-27): main's handoff said "next: build Slice 1" while Slice 1 was already in flight
on a branch, and nothing looked sideways.

**Board read** — read the frontier that governs THIS repo's work:

```bash
# this repo's own board, when it carries one (docs/agents/issue-tracker.md exists — the
# wiring cf-site-harness SETUP.md installs for /to-spec + /to-tickets; NOTE those two skills
# are installed in NO profile as of 2026-09-02 — cf-site-harness B-003 — so the board is read
# with gh, and a spec is authored by hand to /to-spec's shape)
gh issue list -l ready-for-agent --state open

# ALWAYS also read the program board — fleet-wide tickets live there and are
# EXECUTED in other repos (BOARD.md §Where a ticket lives)
gh issue list -R trippjak/cf-site-harness -l ready-for-agent --state open
```

The second query is not optional and is the one that usually matters: T10–T12 were
cf-site-harness tickets whose deliverables landed in claude-config and
skill-improvement-harness. A seat that only checked the local repo would report "no board"
while its own frontier sat unread on the program board.

One caveat bites at open: an open draft PR citing an issue (visible in the LOOK SIDEWAYS
output above) supersedes the label. Everything else — label semantics, claim mechanics,
sizing, where fleet-wide tickets live — is canonical in `cf-site-harness/BOARD.md`. The
board read feeds step 5's board line and "Today": WHICH ticket you take comes from the
frontier, not the handoff (whose wording rule for unclaimed work lives in flight-board).

### Step 2 — State read (always-read tier ONLY, ~2-3K)

Read `coordination/HANDOFF.md` + `coordination/BLOCKERS.md`. On repos that carry `blockers/`,
BLOCKERS.md is an **index** (one row per open blocker) — open a body under `blockers/` only when
today's first action touches it. Vocabulary lives in `coordination/GLOSSARY.md` where present:
grep the term, never read it whole. Nothing else wholesale —
DECISIONS and ROADMAP are grep-on-demand per the section-close two-tier model.

Also run (zero LLM tokens):
```bash
# $HOME expands in both PowerShell 5.1 and bash; ~ does NOT expand for native-exe args in PS
node "<this skill's base directory>/../section-close/references/doclint.mjs" <projectRoot>
```
Note the cold-boot number; if doclint FLAGs, queue them for the next section-close — do not fix
docs now (that's close-work, not open-work).

**Directory-mode repos get one more zero-token run** (v3, PDR-001 — `coordination/.doclint.json`
has `"version": 3`; doclint's output already says so):
```bash
node "<this skill's base directory>/../section-close/references/decisions-dir.mjs" check <projectRoot>
```
Unlike doclint, a red here is **blocker-class, never queued**: it means a minted entry was edited
after mint, an id stopped resolving, or the index drifted from the record — the exact loss the v3
ledger exists to catch. Surface it in the read-back as the first action and stop short of new work
until it's explained. Exit 0 costs one line; on v2 repos (no `"version": 3`) skip this entirely.

If there is no `coordination/` dir: degrade gracefully — do step 1, then read only the first
~40 lines of README/CLAUDE.md if present (head, not wholesale — a project CLAUDE.md can be 5K+
alone), state the read-back from git log alone, and skip step 4. Offer to set up doc-system v2
only if the project looks like it will be long-running.

### Step 3 — Read-back + staleness cross-check (~1K)

**Receiving a new Codex desktop task.** A new task does not automatically inherit the old
conversation. Use the supplied opener as testimony, not authority. Read the referenced
repo-owned plan/evidence and verify required artifact access. Mark ignored/temp paths as
machine-local; if a necessary artifact is missing, recover it from its authorized durable
source or identify the required regeneration before dependent work. Do not assume that
archiving a task transfers its context or preserves its worktree files.

Reconcile the goal and success criteria, next action and why, rejected approaches, open
questions, scoped approvals, reviewed/merged/deployed refs, and local-versus-hosted evidence.
A stale pre-merge opener must not cause a completed release to be repeated. Explicitly name
material preservation gaps; don't infer missing approval or silently replace unavailable
evidence with remembered claims. Existing repo rules still govern authority conflicts.

After the read-back covers these items and required artifacts are accessible, acknowledge
handoff acceptance. The user may then archive the old task for organization; don't archive
it automatically. Stay in this task for the coherent unit of work. For the next completed
outcome, recommend a new task in the same project rather than `/clear` in the desktop app.


State in ONE short paragraph: current project state as understood, today's first action, and —
critically — any discrepancy between HANDOFF and observed reality. The cheap, high-value check:

When a `cut-opener` block is present, include a compact `PASS | FAIL | STALE` result for its
load-bearing snapshots and name any unlanded trajectory delta. This is a real gate: do not write
while a required source is missing or an authority/scope/approval conflict is unresolved. Empty
ceremonial confirmations are worse than a short list of the checks that could actually fail.

> Are there commits AFTER the section-close commit that wrote this HANDOFF?
> Run `git log --oneline <HANDOFF's Commit hash>..HEAD`. The close commit itself is expected —
> HANDOFF records its parent by construction, so discount exactly that one. Its subject starts
> `section-close:`, optionally preceded by `D-NNN ` (the mandatory per-close mint was dropped
> 2026-08-26, PDR-001 §3.8 follow-up — match on `section-close:`, or fresh closes read as
> stale). Anything newer than the close commit, or a close commit you don't recognize, = STALE.

On repos whose HANDOFF carries `<!-- GEN:… -->` blocks (v3 scaffold, PDR-001 §3.7): those blocks
are machine-regenerated at each close, so they are exactly as fresh as the close commit — never
count their content toward staleness. The judgment layer outside the blocks is what goes stale.

If STALE: say so explicitly, summarize the unknown commits from their SUBJECT LINES ONLY
(`git log --oneline`, max 5, newest first — never `git show`/`git diff`; reading diffs is work,
not open), and lower trust in HANDOFF's "Next actions" until reconciled. A stale handoff
silently followed is the worst session-open failure mode.

Beyond git: spot-verify the 1–2 HANDOFF claims that gate today's first action when they are
checkable in seconds (file/route exists · tracker/cockpit state · blocker still reproduces).
HANDOFF is testimony, not ground truth — multi-session agents' top failure is trusting prior
state instead of re-validating it (Momento, arXiv:2606.00832). HARD ceiling: two checks,
seconds each — never a build, a reproduction, or an audit; anything bigger is close-work.

This read-back is not ceremony — it is the receiver-synthesis step from shift-handover research
(I-PASS / Lardner): handoffs that aren't read back transfer measurably worse.

**Read back trajectory, not just state.** HANDOFF §3's first action carries a **Why now** and a
**Rests on** (its assumption + what would falsify it); §4 carries approaches **killed without a
D-NNN**. Say the "Why now" back in your own words, and check the "Rests on" assumption against
what you just observed — if the falsifier already fired, the first action is wrong no matter how
current the file is, and that is worth catching before any work starts. Treat §4's un-ratified
kills as binding: they are the only record that exists, since ratified rejections are greppable in
DECISIONS but these never got an ID. Re-proposing one is the specific drift this pair of fields
was added to stop; state is what the files preserve well, direction is what they used to lose.

### Step 4 — Improvements triage (~1-2K, only if the file exists)

Step 2's doclint run already reported whether `coordination/IMPROVEMENTS.md` exists and its
size (8KB cap — canonical in section-close's `doc-thresholds.md`, outside the cold-boot
sum). If absent, skip silently —
offer to create it at the NEXT section-close, not now. If present, **do not read it wholesale** —
it is greppable, and the anti-pattern at the bottom of this file applies here too.

**Two entry formats exist in the wild and the ID sits in a different place in each**, so a
heading-anchored pattern silently returns ZERO on half the corpus:

```
## I-058 — title            **I-058** — **title** *Status: proposed · ...*
*Status: proposed · ...*    ^ ID and status on ONE line (bold-inline form)
^ status on the NEXT line
```

This one-liner handles both — it remembers the last ID seen, then prints it when a `proposed`
status arrives, whether that is on the same line or the next:

```bash
awk '/^## I-[0-9]|\*\*I-[0-9]/ { id=$0 } /Status: *proposed/ && id != "" { print NR": "substr(id,1,110); id="" }' coordination/IMPROVEMENTS.md
```

The `[0-9]` anchor is load-bearing: a bare `I-` also matches the file's own `## I-NNN`
format-template line inside a fenced block and returns it as a phantom entry. The `id=""` after
each print is load-bearing for the same reason — without it, that template's status line
re-prints whichever real entry came before it.

**Validated 2026-08-18 across six real `coordination/IMPROVEMENTS.md` files — 4 heading-form,
2 bold-inline, 53 proposed entries between them: 6/6 exact, template excluded.** The previous
`grep -n -A1 '^## I-[0-9]'` returned **0 of 9** on a bold-inline file while reading as "no
proposed improvements" — a silent-success failure, which is why this step is now format-agnostic.
Cost: **1,033 B on a 38,129 B file (98% cut)**; 2,157 B on a 21,379 B file (90%). Then:

**I-directory repos read the INDEX instead** (PDR-011 — `.doclint.json` declares
`families.I.mode: "directory"`): the flat file is replaced by a generated table at the configured
`index` path (default `coordination/improvements/IMPROVEMENTS.md`), one row per entry
`| I-NNN | date | status | title |`, so the triage read is a plain grep — no awk needed:

```bash
grep -nE '^\| I-[0-9]+ \| [^|]+ \| proposed' coordination/improvements/IMPROVEMENTS.md
```

The anchor to the THIRD cell is load-bearing: a bare `grep '| proposed'` also matches a title
that merely contains the word (`| declined | proposed nav rework |`) and would triage a declined
entry as an open proposal.
Then read only the 2-3 promising entries' files under `improvements/i/`. The awk one-liner above
is for flat v2 files only.

1. Pick the 2-3 most promising by title and read **only those line ranges** for effort/payoff.
2. **Check `coordination/sprints/cleanup-triage.md` alongside `IMPROVEMENTS.md` (`G5`)** when present on v3/`coordination/` repos: it is the single intake where deferred findings from `ratchet-review` and code/UI sweeps land. Scan its open triage rows alongside `proposed` `I-NNN` items.
3. **Enforce the 14-day `D-155` proposal TTL (`G4`):** on I-directory repos, Step 2's `decisions-dir.mjs check` mechanically fails `proposal-expiry` on any `status: proposed` `I-NNN` whose `date` is `> 14` days older than the repo reference date; on flat-file repos, flag any `proposed` entry older than 14 days so it can be adopted, re-affirmed by bumping `date`, or expired as `declined — expired, un-championed (D-155)`.
4. Present at most the top 2-3 `proposed` / open-intake items as one-liners with effort/payoff.
5. Recommend at most ONE to fold into today's work — or none. Folding in means: add it to
   today's stated scope explicitly. This step provides clues, not detours.
6. Never auto-adopt, never auto-decline, never reorder the user's plans. The user decides;
   silence = everything stays `proposed`.

If doclint flagged IMPROVEMENTS over 8KB: note the breach in step 5 and queue a triage-tail
(decline/expire the stale oldest) for the next section-close — do not triage now.

### Step 5 — Commence (~0.5K)

One tight block, then stop — the skill ends and work begins:

```
**Session open:** <project> @ <commit> (pulled: yes/no/n-a · leftovers: none/N files)
**State:** <one line> · **Handoff:** fresh | STALE (N unknown commits)
**Board:** <N> ready-for-agent (local) · <P> on the program board · **Claims:** <M> open
**Today:** <first action> (+ folded improvement: <title> if any — promote to D-NNN/ROADMAP at next close)
**Done-when:** <today's acceptance criterion — from HANDOFF's next-action or proposed now>
**Cold-boot:** <N>K tokens · doclint: CLEAN | N flags queued for next close
```

## IMPROVEMENTS.md contract

`coordination/IMPROVEMENTS.md` is the third idea-bucket, distinct from its siblings:

| File | Holds | Read |
|---|---|---|
| BLOCKERS.md | Must-fix items | Always-read tier |
| ROADMAP.md | Committed, sequenced work | Grep/active-section on demand |
| **IMPROVEMENTS.md** | **Uncommitted ideas — "worth it someday, maybe"** | **session-open step 4 ONLY** |

**Write** (cheap, anytime — never derail current work to polish an entry):
- Mid-work, when you notice something worth improving but out of scope: append a one-liner.
- At section-close: deferred SOFT flags and lead-consult suggestions land here as `proposed`.
- After team-meeting: CONCERNs that didn't become ROADMAP items.

**Entry format** (greppable, same discipline as DECISIONS):
```markdown
## I-NNN — one-line title
*Status: proposed · YYYY-MM-DD · source: section-close | team-meeting | ad-hoc*
1-3 lines: what + why it might matter. Effort: S/M/L. Payoff: one phrase.
```

This is the format to WRITE. A second one is already in the wild — `**I-NNN** — **title**
*Status: …*` all on one line — and step 4's reader parses both deliberately. Do not "fix" existing
files to match: rewriting entry headings churns a doc nobody reads at open for no recall gain, and
the reader is format-agnostic precisely so that churn is unnecessary.

**Numbering:** `I-NNN` is a private sequence to IMPROVEMENTS.md, independent of `D-NNN`. On
adoption the work becomes a NEW `D-NNN` in DECISIONS (next decision number) or a ROADMAP item —
the `I-NNN` is struck, never reused as a decision ID. Never reference a bare `I-NNN` in HANDOFF;
an in-flight improvement has already become a `D-NNN` or ROADMAP item, so reference that.

**Lifecycle:** `proposed` → `adopted YYYY-MM-DD → ROADMAP/D-NNN` (add the target item, strike
the entry here) | `declined YYYY-MM-DD — <one-line why>` (kept — declined-with-reason prevents
re-proposing, the same anti-relitigation mechanic as DECISIONS). Cap **8KB** (canonical:
section-close `references/doc-thresholds.md`), enforced by doclint's optional IMPROVEMENTS
check (not the cold-boot sum); on breach, queue a triage-tail
for the next section-close. By convention, only session-open READS this file wholesale;
section-close may APPEND to it (deferred flags) without reading the whole thing. This is a
discipline, not an enforced lock — the payoff (keeping it out of the always-read cold-boot
path) only holds if both bookends respect it.

## Anti-patterns

- **Team fan-out at open.** No subagents, no lead consults, no audits here. The "team review"
  happens at the CLOSE bookends (section-close lead consult, team-meeting triad) where context
  is already loaded; their output reaches you through IMPROVEMENTS.md and HANDOFF. Open is a
  solo, sub-10K ritual.
- **Reading DECISIONS, ROADMAP or IMPROVEMENTS wholesale.** 25K+ tokens on mature projects. Grep
  on demand. IMPROVEMENTS is the one people miss because step 4 used to say "read it" — it is
  greppable by identical construction, and on a breached file it costs more than every other step
  of this ritual combined (measured: 5.3K of a ~19K open).
- **Reading a branch's HANDOFF before knowing whether it differs.** `git diff --stat` first. Four
  open claims is ~8K tokens of near-duplicate prose, and the stat carries the one fact that
  matters (did this branch touch `coordination/`, and how much).
- **Auto-stash / auto-resolve git surprises.** Surface and wait.
- **Adopting more than one improvement.** One is the cap; zero is the default.
- **Fixing doclint flags at open.** Queue them for close. Open-work is reading, not writing.
- **Re-running the FULL ritual mid-session or post-compaction.** The PreCompact hook re-injects
  HANDOFF + BLOCKERS on compaction, so the Step 2 state-read is already paid for — repeating the
  whole open burns the budget this skill exists to protect. EXCEPTION: the hook does NOT refresh
  git. After a long multi-compaction session you may legitimately need to catch parallel-machine
  pushes — in that case run ONLY the Step 1 git-freshness block (~1K) and stop; do not re-read
  state, re-triage IMPROVEMENTS, or re-emit the commence block.
