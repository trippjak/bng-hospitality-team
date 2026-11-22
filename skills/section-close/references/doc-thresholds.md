# Doc-System File Thresholds — v3 (byte-based; caps bind projections, not the record)

> **v3 change (2026-08-26, PDR-001):** a byte cap on an append-only log is a category error. The D
> family may become a **directory of immutable per-entry files** behind a **generated index**; the
> cap moves onto the index and the always-read tier, and the record itself becomes uncapped.
> Opt-in per repo via `coordination/.doclint.json` `"version": 3` — **a repo without that key sees
> exact v2 behaviour**, and that parity is a tested contract, not an intention.
>
> **v2 change (2026-06-10):** thresholds moved from LINES to BYTES (tokens ~ bytes/4), enforced by
> `references/doclint.mjs` (deterministic, zero LLM tokens). The 2026-06 audit found the line
> thresholds structurally defeated by mega-lines: a 41-line HANDOFF weighing 30KB (one 11.6KB line),
> and a project passing every line threshold while costing ~44K tokens to cold-boot. Evidence and
> sources: `references/evidence.md`.

## Why v3 exists — the cap was pointing at the wrong file

`DECISIONS.md` and `IMPROVEMENTS.md` grow with project age by design. A cap on them is therefore
breached *structurally*, not behaviourally, and cap pressure produces exactly three responses, all
bad: **raise the cap** (business-club-ops 48→80K; brand-workshop-harness D-206 8→24K — both
already executed once), **trim the file** (observed trimmed to within 70 B of caps), or
**archive by age** (which severs supersession chains, because a decision and the decision that
replaced it land in different cuts).

Two silent-loss vectors were confirmed, and both are structural rather than careless:

- **The rewrite-then-archive hole** (business-club-ops I-039). The v2 ledger verified that an
  archived entry's ID *string* appeared in the archive, never its body. Rewriting an entry in
  place before the archive cut passed every check while the original prose became unfindable in
  practice. v3 closes the class: `decisions-dir.mjs check` compares each entry against its own
  content at its adding commit, so rewrite-in-place cannot go green and archive-after-rewrite has
  nothing to hide behind.
- **The relocation sink.** "RELOCATE, NEVER SHRINK" (below, and still correct) closes HANDOFF
  breaches by moving durable rules into *uncapped* always-loaded files — the repo's `CLAUDE.md`
  reached 30,871 B on business-club-ops against ~150-line template guidance. The rule always
  passes while global always-loaded state grows unmeasured. v3 does not cap that file; it
  **measures** it, so the growth stops being invisible.

The remedy is the shape every long-lived decision system converged on independently (adr-tools,
MADR, GOV.UK's ten-year RFC repo): **one immutable file per decision behind a generated index,
with the only byte cap on the index.** Summarising old entries is ruled out as a store — measured
loss, 16–22 points verbatim-vs-distilled, 95%→32% on a memory task after summarising. Summaries
may sit on top as projections; they never replace bodies.

## The tier model — what gets read when

The four files are NOT all "read at session start." They live in two tiers (Letta/MemGPT
core-vs-archival model; A-MEM showed ~87% token reduction from structured-notes-with-pointers
over raw dumps):

| Tier | Files | Read behavior |
|---|---|---|
| **Always-read** (cold-boot) | HANDOFF.md, BLOCKERS.md | Read wholesale at session start / post-compaction. Must stay small. |
| **On-demand** | DECISIONS.md, ROADMAP.md | Never read wholesale. Grep DECISIONS by D-NNN / `Status:` when a decision is referenced; read only ROADMAP's active section. In directory mode, DECISIONS.md is the generated index (one row per decision) and the body you want is `decisions/d/D-NNN.md` — so the grep gets cheaper, not more expensive. |

## Single-writer rule (Q15)

Only the ceremonies write the four files, and only as work lands on main; in-flight
ticket/worktree branches never write `coordination/`. Rule, rationale, write-path, and the
exceptions: flight-board skill §The single-writer rule.

## Thresholds (enforced by doclint)

| File | Threshold | ~Tokens | Failure mode at threshold | Action |
|---|---|---|---|---|
| `HANDOFF.md` | **8,000 B** | ~2K | Snapshot accreting history | **Rewrite-in-place** per `handoff-template.md`. No archive of its own — but see §RELOCATE, NEVER SHRINK: move durable rules to `PROCESS.md`/`D-NNN` and log the move. Never compress prose to fit. |
| `DECISIONS.md` *(file mode)* | **48,000 B** | ~12K | Append-only log overflowing | **Archive oldest ~100** to `decisions/archive/YYYY-MM-decisions-snapshot.md`. Leave one-line stubs (D-NNN anchors must still grep). **Directory-mode repos do not have this cap** — see §Directory mode. |
| `decisions/DECISIONS.md` *(directory mode)* | **48,000 B** (`DECISIONS_INDEX`) | ~12K | The *index* outgrowing one file | **Shard the generator**: rows for past years move to `DECISIONS-YYYY.md`, current year stays. **Never delete rows** — a deleted row is a decision that stops resolving. |
| `decisions/d/**` *(the record)* | **uncapped** | — | — | Nothing. Entry files are immutable history, exempt from the mega-line rule, and reported informationally only. Capping them is the category error v3 exists to undo. |
| `ROADMAP.md` | **24,000 B** | ~6K | Completed work accreting | **Archive shipped sections** to `archive/roadmap-YYYY-QN.md`. Don't trim active items. |
| `BLOCKERS.md` | **8,000 B** | ~2K | Blockers not being resolved | **Triage prompt.** Never auto-archive an unresolved blocker — the file growing IS the alert. |
| **Any line, any file** | **600 B** | — | Mega-line: run-on entry defeating structure, unreadable diffs, threshold evasion | Break into a structured multi-line entry (heading + bullets). |
| **Always-read sum** (HANDOFF + BLOCKERS) | **20,000 B** | ~5K | Cold-boot read cost — what a fresh session actually loads from `coordination/` | Rewrite HANDOFF · triage BLOCKERS. |
| **Four-file total** | **88,000 B** | ~22K | Docs outgrowing the grep-on-demand model. NOT session cost — DECISIONS + ROADMAP are never read wholesale | Archive per the per-file actions above. |

Neither number includes the always-loaded global layer (`~/.claude/CLAUDE.md`, `~/.claude/rules/`,
the memory index, the repo's `CLAUDE.md` / `INDEX.md`) — ~42 KB on the reference project. The
always-read sum is the **marginal** doc cost a project adds, which is the number a close can act on.
Before 2026-08-16 a single "cold-boot read cost" summed all four files, of which DECISIONS + ROADMAP
were 80% — a headline that moved *against* the direction of real improvement (P-027).

Fifth file, session-open tier (excluded from the four-file cold-boot sum):

| File | Threshold | ~Tokens | Failure mode at threshold | Action |
|---|---|---|---|---|
| `IMPROVEMENTS.md` | **8,000 B** | ~2K | Suggestion queue accreting stale ideas | **Triage-tail** at next section-close (decline/expire oldest entries). Read wholesale at session-open only; section-close may append without reading. |

**A raised HANDOFF cap covers GENERATED bytes only, and doclint now enforces that** (I-053). A
project raises the cap in `.doclint.json` because the `<!-- GEN: -->` blocks are mechanical state
the close regenerates — not prose anyone wrote to fit. **The layer a human writes stays bound by the
8,000 B base**, which every `_why_handoff` note in the fleet already said in words and nothing
measured. The check subtracts the bytes between each `GEN` pair and compares the remainder to the
base, and it can only fire where an override is in effect — with cap equal to base the total check
already owns the case. It is not a second cap; it is **the override's accountability check**, and
the remedy is the same one: RELOCATE, NEVER SHRINK.

Measured on launch-uk at its 2026-10-08 close, before the check existed: the total passed a raised
15,000 B cap at 13,859 B while the human layer sat at ~13,725 B against the 8,000 B bound — a 72%
overrun of the governing rule, found only by reading the config by hand.

Additional HANDOFF content rules (also doclint-checked):
- **Zero "Prior …" chains.** `Prior `hash` — D-NNN…` chains are history accreting in the snapshot. History lives in git log + DECISIONS, full stop.
- **D-NNN references go where they belong.** §1 blockers, §4 constraints, and §3 re-entry pointers (id + one clause, no retelling) carry them freely; §2 State and §5 Reflection should not. On **v3** repos doclint counts only §State + §Reflection, by heading name, against **≤20** (cf-site-harness#103, operator ruling 2026-09-24); a HANDOFF with neither heading falls back to the whole-file count. **v2** repos keep the original ≤20 file-wide count (parity). Over the cap = the snapshot has collapsed into a breadcrumb trail through the decision log.
- **No imperative next-actions.** Phrase unclaimed work as "X is claimable" or "X claimed — see PR #n", never "next: build X" — an imperative in the snapshot is a standing instruction to every future session (flight-board wording rule, B-005 2026-07-27).

## Near-cap streaks (threshold-gaming guard, Q13)

A file above **90%** of its (effective, post-override) threshold reports status `NEAR`. `NEAR`
at **2+ consecutive section-closes** raises a flag prescribing the file's archive/rewrite action
*now* — "a near-cap streak forces an archive decision, not a trim" (Q13). Trimming a file back
under its cap instead of archiving is the exact pathology this check catches (files have been
observed trimmed to within 70 B of their caps).

Past closes are detected from git history via the ceremony's `section-close:` commit-message
convention, so the streak is shared across machines with no state file. Outside a git repo, or
with no prior `section-close:` commit, the streak check silently skips; `NEAR` status still
shows. A near-cap run whose last close was under 90% is status-only, not a flag. The streak
check covers the four cold-boot files; `IMPROVEMENTS.md` shows `NEAR` status only (its
triage-tail action is already prescribed at breach).

Mega-lines are counted, not just max-reported: the flag names how many lines exceed 600 B.

## Satellite docs (Q14)

A **satellite** is any `.md` in `coordination/` outside the contract set. The contract set is
the four live files, plus the scaffold and conductor files that other tooling owns and
regenerates: `PROCESS.md` + `README.md` (shipped into every `coordination/` by
`cf-site-harness/templates/coordination/`) and `WORKFLOW.md` + `MASTER-ROADMAP.md` +
`SYSTEMS.md` (written by the brand-build conductor),
`IMPROVEMENTS.md`, `GLOSSARY.md` (the process glossary, §Process glossary below), `CONTEXT.md` (Q7
domain glossary, domain-heavy repos only), and the `archive/` /
`decisions/` trees. The wild population is PLAN-*/AUDIT-*/SUMMARY-* one-offs: they were always
specs and tickets in improvised costumes, and they rot into a second source of truth that no
ceremony refreshes — the contract files are swept every close; satellites never are.

Listing them (run at section-close step 1; `.md` only — the ban covers docs, not stray files):

Bash tool (POSIX — `find` and `grep -E` both exist there; `ls`/`grep` do NOT exist in PowerShell,
where `ls` is a `Get-ChildItem` alias emitting objects, not lines — P-030):

```bash
find coordination -maxdepth 1 -name '*.md' -printf '%f\n' \
  | grep -Evi '^(HANDOFF|DECISIONS|ROADMAP|BLOCKERS|IMPROVEMENTS|GLOSSARY|CONTEXT|PROCESS|README|WORKFLOW|MASTER-ROADMAP|SYSTEMS)\.md$'
```

PowerShell equivalent, if the Bash tool is unavailable:

```powershell
Get-ChildItem coordination -Filter *.md -File | Where-Object {
  $_.Name -notmatch '^(HANDOFF|DECISIONS|ROADMAP|BLOCKERS|IMPROVEMENTS|GLOSSARY|CONTEXT|PROCESS|README|WORKFLOW|MASTER-ROADMAP|SYSTEMS)\.md$'
} | Select-Object -ExpandProperty Name
```

**Banned going forward (ratified 2026-08-12):** new satellite docs do not enter
`coordination/`. Route the content where it actually belongs:

| The satellite was really… | It goes… |
|---|---|
| A forward spec / plan | `specs/<feature-slug>.md` by PR (Q7 — `cf-site-harness/BOARD.md` §Specs) |
| In-flight work state | The ticket + claim PR (Q15 — the board is the state) |
| A decision or its evidence | `DECISIONS.md` D-NNN entry |
| Sequenced future work | `ROADMAP.md` item |

**The sweep (existing pile):** section-close step 1 lists satellites; step 4 proposes, per
file — ACK-gated, the never-auto-archive rule applies to satellites too:

1. **Created after the ban** → relocate content per the table above, then remove the file.
2. **No status header** → add one, naming what it is and where its content belongs:
   ```markdown
   > **Satellite (Q14)** — frozen YYYY-MM-DD; not part of the four-file contract and not
   > refreshed by any ceremony. Content belongs in <specs/… | D-NNN | ROADMAP>. Archive
   > proposed after 30 days untouched.
   ```
3. **Untouched >30 days** (last commit touching the file) → propose moving it wholesale to
   `coordination/archive/` (header intact). It stays greppable; it stops posing as live.

Satellites are excluded from the cold-boot sum (nothing reads them at open) — the harm is
aliasing, not tokens, which is why the guard is a sweep, not a threshold.

## Process glossary (`GLOSSARY.md`) — vocabulary points, it never explains

Ratified in two repos before it reached this spec (business-club-ops D-143, 2026-08-25, on Jake's
direction "we should always have an index and a glossary"; brand-workshop-harness D-204, the port)
and canonicalised 2026-09-02 (claude-config D-011) because the two vendored lints had already
drifted — and because the Q14 one-liner above was listing both repos' glossaries as satellites at
every close. It is part of the contract set now, and it is **not** the Q7 `CONTEXT.md`: that file
holds the *domain* vocabulary a client or product sees; `GLOSSARY.md` holds the words the
*process* runs on (cut, ratchet, seat, lane, claim, ACK-gated, care tier …).

**Contract.** `- **term** — definition → owner`, one line per term, where `owner` is a `D-NNN` /
`B-NNN` / `I-NNN`, a `PDR-NNN`, or a backticked path. The pointer is the substance: a term whose
definition exists nowhere ownable is not glossary material yet — write the `D-NNN` first. Not in
the always-read tier (grep the term you need), 8,000 B cap, and the cap is the sibling one-screen
figure on purpose: a glossary near it is explaining, not pointing.

**Enforced, not advised** — `references/glossary-lint.mjs <projectRoot>`, exit 1 on any FAIL:
every pointer resolves (ids against the repo's own `.doclint.json` families — directory mode is
`<dir>/<id>.md` exists, file mode is an entry heading; `B-NNN` against `BLOCKERS.md` **or**
`blockers/<id>.md`; any id against `archive/INDEX.md` when present), every entry stays one line,
no duplicate terms, under the cap, and never empty or missing — a wired gate with no file is a
misconfiguration, not a pass. Mutation-proven in `fixtures/run-tests.mjs`. Run it at section-close
step 1 beside doclint and as the fifth line of a repo's CI gate beside `doclint --gate` and
`decisions-dir check`. An unenforced glossary rots faster than the docs it describes, and a stale
one is worse than none because it reads as authoritative.

## Running the lint

```bash
node "<this skill's base directory>/references/doclint.mjs" <projectRoot>
```

Runs in <1s, costs zero LLM tokens, exits 0 always. Output: per-file bytes/tokens/maxline table,
cold-boot cost, and FLAG lines naming the prescribed action. Run it at step 1 (detect) AND after
step 4 (doc refresh) — the post-refresh run is the gate; section-close's "compaction safe: YES"
requires VERDICT: CLEAN or explicitly user-ACKed flags.

DECISIONS path resolution: doclint accepts either `coordination/DECISIONS.md` or
`coordination/decisions/DECISIONS.md` (both exist in the wild). If BOTH exist it flags the
duplication. The subdirectory location is fine — it is not a threshold exemption. In directory
mode the config names the index explicitly, so there is no ambiguity and no duplication flag.

v3 adds three informational lines (directory-mode repos only, except the last):
the directory's entry count and total bytes marked **UNCAPPED**; `D minted, trailing 14 days: N`;
and `always-loaded (repo): CLAUDE.md + INDEX.md = NB`. None of them flag or cap anything — they
exist because the relocation sink and the mint rate were both growing where nothing looked.

## Directory mode (v3) — the D family as a directory

Opt in with `coordination/.doclint.json`:

```json
{
  "version": 3,
  "families": {
    "D": { "mode": "directory", "dir": "decisions/d", "index": "decisions/DECISIONS.md" },
    "B": { "mode": "file" },
    "I": { "mode": "file" }
  },
  "thresholds": {}
}
```

`version` absent or `< 3` → exact v2 behaviour. **B and I stay in file mode**: directory mode is
*specified* for them (a B family may declare `"mode": "directory"` with `"index"` naming its
always-read surface, and doclint then sizes the cold-boot tier from that file and reports the
directory sum informationally) but **no repo has converted them**, and converting them is a
separate unit, not something to do opportunistically at a close.

**One file per decision**, `decisions/d/D-NNN.md`, zero-padded to 3 digits (4 from D-1000):

```markdown
---
id: D-NNN
date: YYYY-MM-DD
status: accepted            # accepted | superseded | reverted | never-minted
title: One-line title
supersedes: D-KKK           # optional; set at mint; IMMUTABLE. Comma-separated if several.
superseded-by: D-MMM        # required iff status: superseded; mutable
reverted-by: D-MMM          # required iff status: reverted; mutable
structural: true            # optional; set at mint; IMMUTABLE
---
## D-NNN — One-line title
<entry text VERBATIM — light or heavy format exactly as minted. IMMUTABLE.>
```

The body repeats the heading on purpose: the file stands alone when read directly, and the
frontmatter exists for machines. **The filesystem is the ledger** — ID resolution is file
existence, so a never-used number gets a `status: never-minted` stub giving the reason. A gap with
no stub is a violation, because "never used" and "deleted" look identical from outside.

**A flight-board reservation writes NO file.** This line used to say a reservation was a
`never-minted` stub whose body said `reserved`, struck at mint. That vehicle is removed (D-192 §3,
amending PDR-001 §3 invariant 7): a committed stub can never be minted, because immutability pins
its body to the adding commit — so the mechanism foreclosed the mint it existed to hold. The claim
PR title carries the reservation, and LOOK SIDEWAYS already reads it.

**A reserved id is not a gap while its PR is open.** Contiguity could not see that third state, so
a reservation looked exactly like a deletion and blocked every later mint until the reserving PR
merged — launch-uk hit this twice in four days (I-097), both times mid-close with the work already
done. `check` now reads the open PR titles and reports a claimed gap as `reserved on an open PR:
D-235 on #370` instead of a violation. Two title shapes count, and only these two:

- `D-235: platform partner directories closed as a link class` — the id LEADS the title
- `CLAIM: off-page link targets verified — reserves D-234` — the word `reserves`, then the ids

A mid-title mention is not a claim: `section-close: a capture became one complete run (D-230, #354;
#357)` cites an id that had already merged, and reading every mention as a claim would excuse the
real holes this check exists to find. `reserves nothing` stays the way to say a claim PR takes no
id. The exemption expires with the PR — once it merges or closes, an id that never landed is a
hole again, and the next run says so. With no `gh`, no auth or no GitHub remote the gap is reported
exactly as before and the message says the *lookup* did not run: the arm softens a false positive,
it never weakens the check.

**Mutable after mint: `status`, `superseded-by`, `reverted-by`. Nothing else, ever** — not the
body, not the date, not the title. Editing an existing entry's `supersedes` is not a legal move
either; a supersession is recorded by *minting the successor*, which carries `supersedes` from
birth.

### Running the ledger

```bash
node "<skill>/references/decisions-dir.mjs" index <projectRoot>    # regenerate the index
node "<skill>/references/decisions-dir.mjs" check <projectRoot>    # exit 1 on violation
node "<skill>/references/decisions-dir.mjs" migrate <projectRoot>  # dry-run; --write to emit
```

`check` runs five checks in order — **contiguity · frontmatter-valid · immutability ·
supersession-refs · index-fresh** — and this is where the **teeth** are: doclint informs and
always exits 0; the ledger fails. Everything compared across time is read from **git blobs, not
worktree bytes**, LF-normalized, so a CRLF checkout is not itself a finding. A UTF-8 BOM is
stripped before parsing — Windows editors add it silently and it is invisible in every diff view.

Three things about reading its output:

- **`SKIP` is not `OK`.** A check that could not run (no git repo; entries that do not parse)
  prints `SKIP`, and the verdict line says which checks did not run. A green bill with a skipped
  check is not a clean bill.
- **Immutability compares against the FIRST add**, not the latest. Deleting an entry in one commit
  and re-adding the same path in the next would otherwise make the file its own baseline — a
  rewrite laundered through a delete/re-add cycle passed as `VERDICT: clean` until this was fixed.
- **A red names its recovery command.** The ratified bar is *human-recoverable*, so an
  immutability violation prints the `git show <sha>:<path>` that returns the original text.

`migrate` is dry-run by default and **all-or-nothing** on `--write`: if any entry fails to verify,
nothing is written. It reads the live log *and* every frozen archive snapshot (archives are read,
never edited), prefers the longest body when an id appears in both, reports every source region
that belongs to no entry as **NOT MIGRATED**, derives missing supersession back-pointers from the
one-way v2 record, and re-reads each written file off disk to confirm it round-tripped. It emits
entry files only — replacing the source with the generated index is the operator's commit.

### Regression harness

```bash
node "<skill>/references/fixtures/run-tests.mjs"
```

Every invariant is proven in **both directions** — seeded violation goes red, fixed fixture goes
green — against copies of the fixtures in throwaway git repos. A guard with no reachable green
state is a wall; a guard with no reachable red is decoration. The suite also pins **v2 parity**
against a frozen copy of the pre-v3 doclint, so a future edit that quietly changes v2 behaviour
fails here rather than on somebody's unrelated repo.

### Per-project overrides

`coordination/.doclint.json` (opt-in) adjusts thresholds for a specific project — decision-heavy
repos starve under a global cap; quiet ones rot under a generous one:

```json
{ "thresholds": { "DECISIONS": 56000 }, "coldBootBudget": 96000 }
```

Valid `thresholds` keys: `HANDOFF`, `DECISIONS`, `ROADMAP`, `BLOCKERS`, plus `DECISIONS_INDEX`
and `IMPROVEMENTS_INDEX` **in v3 repos only** (in a v2 repo both are still reported as unknown
keys). Unknown keys are
ignored with a flag. The IMPROVEMENTS cap is overridable; the 600B mega-line rule is hardcoded.
Absent or unreadable file = defaults unchanged. Overrides are always echoed in doclint output — a
silently-raised cap is worse than no cap.

## Family-generic directory mode (PDR-011) — the I family, and any future one

Ratified 2026-08-27 (business-club-ops PDR-011, D-177): the D-family machinery above serves ANY
family declared `"mode": "directory"` — the I family first. Same tool, same five checks, same
generated-index projection; `decisions-dir.mjs` keeps its name and its `check` exit contract.

```json
"I": { "mode": "directory", "dir": "improvements/i", "index": "improvements/IMPROVEMENTS.md" }
```

**One file per improvement**, `improvements/i/I-NNN.md`, frontmatter keys exactly
`id`, `date`, `status`, `title` (PDR-011 §3.1 — no supersession keys, no `structural`). The
per-family asymmetries are RULED, not stylistic:

- **Statuses:** `proposed | adopted | declined | never-minted` — no `superseded`/`reverted`;
  an improvement retires by its own status flip, and there is still no archive workflow.
- **Mutable after mint: `status` and `date`. Nothing else** (D-177 ruling 1). Date mutability
  exists for D-155's re-affirmation ("bump the date, one line why"); title and body freeze at
  mint exactly like D. The D family's key set is unchanged — the checks are per-family and
  proven not to bleed either way.
- **New mints write NO body `*Status:*` line — any family, D and I alike** (2026-08-27,
  bcops external-review triage; the I-112 lesson made general). Frontmatter is the status
  AUTHORITY and the body freezes at mint, so a body status line is a guaranteed-stale grep
  hazard the moment the frontmatter flips — the entry looks `proposed` to any body-text search
  forever. MIGRATED entries keep theirs (frozen text, historical); the fix is prospective only.
  Never edit an existing body to remove one — that is the immutability violation the check
  exists to catch.
- **`status` may carry a trailing note** after the token, separated by ` — `:
  `status: declined — expired, un-championed (D-155)`. The leading token is validated against
  the closed set; the note is the bookkeeping that used to live in the v2 status line and can
  no longer enter the immutable body. D stays strict-token.
- **Expiry (D-155 / `G4`) is mechanically enforced by `decisions-dir.mjs check` (`proposal-expiry`):**
  any `I-NNN` entry with `status: proposed` whose frontmatter `date` is `> 14` days older than the
  repo reference date (highest `YYYY-MM-DD` across `D`/`B`/`I` entries and `coordination/HANDOFF.md`,
  or `DOCLINT_TODAY` when set) fails `proposal-expiry`. Resolve by adopting, re-affirming (bumping
  `date` with a one-line note), or expiring via a status+date flip (`status: declined — expired,
  un-championed (D-155)`) plus an index regeneration in the same commit — the same one-commit shape
  as D's supersession flow. The mass-decline prohibition and the no-cap-raise rule are unchanged.
- **Single intake for deferred findings (`G5`):** in-flight `## Deferred` sections inside
  `coordination/sprints/ratchet-*.md` or review notes are temporary scratchpads during execution only.
  Before closing a run or section, route every deferred finding to the repo's single intake
  (`coordination/sprints/cleanup-triage.md` on v3/`coordination/` repos, or a GitHub Issue on v4-lite /
  issue-tracked repos) and annotate the scratchpad item with its destination (`→ cleanup-triage.md (<ID>)`
  or `→ Issue #<N>`).

**Migration** (`decisions-dir.mjs migrate <root> --family I`) reads the flat IMPROVEMENTS.md plus
every archive snapshot and handles BOTH wild entry formats — the heading form (`## I-NNN — title`
with the status line beneath) and the bold-inline one-liner (`**I-NNN** — **title** *Status: …*`,
struck pointers included). An unmappable status token (a partial adoption, say) HALTS the run by
id — a lifecycle state is a judgment call, never a migration guess. The inline tolerance exists
only for families that declare it: for D, `**D-NNN** — …` in prose stays prose.

### The B family in directory mode (claude-config D-012, 2026-09-02)

The blockers family gets the same machinery, with its own ruled asymmetries. Opt in per repo:

```json
"B": { "mode": "directory", "dir": "blockers/b", "index": "BLOCKERS.md", "archiveIndex": "blockers/RESOLVED.md" }
```

- **The index IS `coordination/BLOCKERS.md`** — the always-read file. So the projection is small by
  construction (one row per live blocker), and `archiveIndex` takes the settled rows. Live rows:
  `| id | date | status | severity | title |`; settled `archiveIndex` rows add `resolved-by`:
  `| id | date | status | severity | resolved-by | title |`. The "needs" triage sentence lives in the **body**.
- **Statuses:** `open | resolved | deferred | never-minted`. Only `resolved` is terminal.
  `deferred` (moved to ROADMAP) is unresolved and stays on the live page — triage-never-archive,
  now enforced by the projection rather than by discipline.
- **`severity` is required** on every minted entry (write `unstated` rather than omit it).
  **Mutable after mint: `status`, `date`, `resolved-by`** — resolution is a status flip plus the
  reference the struck line used to carry, then regenerate both pages in the same commit.
- **Headings are `###`** in the B corpus; `migrate . --family B` reads the flat `BLOCKERS.md` and every
  `blockers/*.md` (the hand-rolled split — SFF D-012, BWH D-163), derives status from the strike
  (`### ~~B-NNN — …~~` → `resolved`, else `open`) and severity from the body's `**Severity:**` line.
  `deferred` is set by hand afterwards; it is a judgment call. Mutation-proven in `run-tests.mjs`
  (`v3-b-fixture`, `v2-b-fixture`).
- **`archiveDirs` carries the shared `archive` fallback** (D-013): `["blockers", "archive"]`, the
  shape D and I already had. It feeds TWO consumers — the migrate SOURCE sweep (every `*.md` under
  each dir) and `readArchiveIndex`'s reason oracle — so a repo keeping ONE archive index for all
  three families was invisible to B alone under D-012, and every archived id planned a bare stub
  reading *"The reason was never written down"* over reasons that WERE written down. With the
  fallback a `never-minted` row's reason and date are carried verbatim, and a row naming a real
  location whose entry no scanned source holds **refuses** (*"a recorded entry is MISSING, not a
  gap"*) rather than stubbing over the loss. Mutation-proven: reverting the profile reds five.

The hand-rolled `blockers/B-NNN.md` + table-index shape remains valid as the rung before this one;
directory mode is what makes the ledger *defend* it. The bootstrap template keeps `B` in file mode —
promotion is a deliberate upgrade, like I.

### Caps become a ratchet (PDR-011 §2.2)

Absolute caps have no reachable green from 9× over, so the flag gets carried forever and stops
carrying information. Opt in per repo with a committed `coordination/.doclint-ratchet.json` —
`{ "<coord-relative path>": <LF bytes> }`. doclint (v3 repos) then FLAGS any tracked file that
GREW since baseline; holding or shrinking passes. `doclint <root> --write-ratchet` re-baselines
(creating the file on first use, seeded from what doclint already measures) — run it in the same
commit as the doc change it blesses; the raise is echoed, never silent. Absolute caps stay as the
second, advisory line: a ratchet alone would freeze a breach in place. In I-directory mode the
projection is measured as `IMPROVEMENTS_IDX` against its own cap (default 8,000 B, v3-only
override key `IMPROVEMENTS_INDEX` — the vehicle for D-177 ruling 3's re-baseline-at-migration).

### Sharding a projection that outgrew its cap — `archiveIndex` (B-030)

When a generated index breaches its cap, the remedy is to split what the index **projects** —
never to move what the record **contains**. D-219 measured the tempting alternative: relocating an
entry file to `improvements/archive/` does drop the index under cap, and turns `contiguity` RED,
because a v3 minted id must have a file in its family's live directory. The record has no archive.

Declare `"archiveIndex": "<coord-relative path>"` on a directory-mode family and
`decisions-dir.mjs index` emits **two pages** from one render: live rows on `index`, terminal rows
on `archiveIndex` (`adopted`/`declined` for I, `superseded`/`reverted` for D). `check`'s
`index-fresh` verifies **both** — a second page nothing compares against would rot silently, which
is the failure class the ledger exists to close. Every entry file stays where it is, so contiguity
is untouched and nothing is deleted; only the `index` page is measured against the cap.

The key is **opt-in with no default**: a family that has not declared it renders byte-identically
to before, because this tool is shared and a cap breach in one repo must not restructure another.
Cap-raising and entry-trimming remain what they were — D-149's named anti-pattern, and
shrinking-to-pass (§RELOCATE, NEVER SHRINK).

### The hard per-file ceiling (PDR-011 §2.3)

**No single file in `coordination/` may exceed 51,200 bytes** — the measured point at which an
external reviewer's `read_file` physically cannot read the file. A capability number, not a taste
number. doclint (v3 repos) scans every file, measured on the **committed blob** (stored LF) with
a worktree fallback for untracked files, and flags each offender. The remedy is relocation or
migration — never trimming prose to pass.

## Supersession flow (directory mode) — replaces the DECISIONS archive

**In directory mode there is no DECISIONS archive, because there is no cap to relieve.** Entries
never move and never get trimmed. A decision leaves force by being *superseded* or *reverted* by a
named later decision, and both ends resolve.

Archive-by-age is retired for the D family, and the reason is mechanical rather than aesthetic:
cutting by age puts a decision and the decision that replaced it into different files, so the
chain a future session follows dead-ends in a snapshot. Existing archive snapshots stay exactly
where they are — **frozen artifacts, read but never edited**; `archive/INDEX.md`'s D rows become
obsolete (the filesystem replaced them) and stop growing, while B and I keep using it.

To retire a decision, in **one commit**:

1. **Mint the successor** `d/D-MMM.md` carrying `supersedes: D-NNN` (comma-separated if it retires
   several). This is the only moment `supersedes` may be written.
2. **Flip the retired entry's mutable keys only** — `status: superseded` plus
   `superseded-by: D-MMM`. Touch nothing else in that file; the body is immutable and `check`
   will say so.
3. **Regenerate the index** (`decisions-dir.mjs index`) and commit it *in the same commit*. A
   generated artifact belongs in the commit that changes its source; a stale index is a red.
4. **Run `decisions-dir.mjs check`** — exit 0 or the close does not proceed.

Reverting is the same shape with `status: reverted` + `reverted-by:`. `reverted` means
tried-and-rejected, kept as honest history — it is not a synonym for superseded, and there is
deliberately no `proposed` status: decisions are minted when made.

### DECISIONS archive (file mode only)

Repos that have not opted into v3 keep the v2 workflow. When threshold is hit, propose this
archive operation to the user. Do NOT auto-execute.

1. Identify the oldest ~100 decisions (not the newest — append-only means newest live, oldest archive).
2. Create `coordination/decisions/archive/YYYY-MM-decisions-snapshot.md` with header:
   ```
   # Decisions snapshot YYYY-MM
   > Decisions D-NNN through D-MMM archived from live DECISIONS.md on YYYY-MM-DD.
   ```
3. In the live file, replace each archived entry with a stub:
   ```
   ## D-NNN — Title
   *archived YYYY-MM-DD; see [decisions/archive/YYYY-MM-decisions-snapshot.md](archive/YYYY-MM-decisions-snapshot.md#d-NNN)*
   ```
4. Verify the live file is under threshold and D-NNN anchors still grep cleanly.

This workflow carries the loss vector v3 exists to close (rewrite-in-place before the cut passes
an ID-string-only check). Treat a repo needing its third archive cut as a repo that should convert
instead.

### ROADMAP archive

1. Move "Shipped"/"Completed" sections wholesale to `coordination/archive/roadmap-YYYY-QN.md`.
2. Leave a one-line marker in the live file pointing at the archive.
3. Active + queued + deferred sections stay live.

## HANDOFF scaffold (v3, PDR-001 §3.7)

HANDOFF may carry **generated mechanical sections around hand-written judgment blocks**:

```markdown
<!-- GEN:decisions -->    entries minted since the last close         <!-- /GEN -->
<!-- GEN:state-delta -->  commits since the last section-close        <!-- /GEN -->
<!-- GEN:claims -->       open draft PRs (the flight board)           <!-- /GEN -->
<!-- GEN:doclint -->      the current doclint verdict                 <!-- /GEN -->
```

**Take `decisions`; take the other three only deliberately** (`I-085`, launch-uk `D-226`).

| block | projects | |
|---|---|---|
| `decisions` | ledger entries minted since the last close | **immutable** — a minted entry cannot change |
| `state-delta` | `git log` since the last close | snapshot; `session-open` step 1 re-runs it |
| `claims` | open draft PRs | snapshot; step 1.5's LOOK SIDEWAYS re-runs it |
| `doclint` | a doclint verdict | snapshot; anyone can re-run doclint |

Only `decisions` projects something that cannot go stale. The other three copy state that
`session-open` regenerates **before it reads the file**, which puts a stale copy of a command's
output in the tier read first. Two can mislead rather than merely cost bytes: a `doclint` block
routinely reports flags the same commit resolved, and a stale `claims` reading *"the flight board is
clear"* is precisely what a double-build (`B-005`) needs — on 2026-09-25/26 a merged PR twice
presented as open long enough to change what a session did.

Markers are **opt-in per block**, so a repo takes what it wants and the generators stay for repos
that already carry them. `handoff-scaffold.mjs` prints a note naming any mutable block it
regenerated; that note is information, not a failure.

```bash
node "<skill>/references/handoff-scaffold.mjs" <projectRoot>
```

**Everything outside the blocks is the judgment layer and survives regeneration byte-for-byte.**
Inside a block is owned by the generator: a hand edit there is overwritten on the next run, and
the markers themselves are immutable. A file with no markers is a **no-op with a notice** — the
tool never inserts structure into a file that did not ask for it. The 8,000 B cap applies to the
whole file, generated blocks included; the generated part is mechanical state, so a breach still
means the judgment layer is carrying durable rules (see RELOCATE, NEVER SHRINK below).

Run it at the doc-refresh step, **before** the doclint gate, so the gate measures what the file
will actually contain. Second consecutive run reports `0B changed` — the tool renders to a fixed
point rather than once, because the doclint block reports a verdict computed from file sizes and
this file is one of those files. If it cannot reach a fixed point it restores the original and
fails loudly rather than emitting a file that the next run would change.

## HANDOFF rewrite workflow

When HANDOFF.md breaches 8,000 B or carries Prior-chains / the D-NNN ref flag: **rewrite-in-place**
following `references/handoff-template.md` (severity-first I-PASS ordering, reflection paragraph,
re-entry map, do-not-read list). Target 4–6KB. The pre-rewrite version is preserved by git —
commit before rewriting if there are uncommitted HANDOFF changes.

### RELOCATE, NEVER SHRINK (the rule that makes the threshold honest)

**A breach is closed by moving content to its owner, never by compressing it until it fits.**
Rewriting prose tighter to pass a byte count is threshold-gaming — the same move as deleting a
failing assertion to go green. It reads as discipline and acts as deletion: the words get shorter,
the lesson gets weaker, and nothing records that it happened.

HANDOFF has no archive of its own — there is only one current state, and git holds the previous
ones. But an over-budget HANDOFF is almost never carrying too much *state*; it is carrying
**durable rules that have outgrown a snapshot**. Those have an owner already:

| Overflowing content | Files to | Left behind in HANDOFF |
|---|---|---|
| A constraint that will be true next month | `PROCESS.md` (§ per topic) | one-line pointer to the § |
| A ratified rule with reasoning | `decisions/` as `D-NNN` | `[D-NNN]` reference |
| Superseded state | nothing — git log is the record | nothing |
| A one-off spec or audit | `coordination/archive/` | pointer, if still cited |
| A blocker body (open or resolved) | `blockers/B-NNN.md` · `blockers/RESOLVED.md` | one index row (open) or one struck line (resolved) in BLOCKERS.md |

**Every relocation is logged**, as a `D-NNN` naming what moved and where. That log line is the
recall path: content leaves the cold-boot tier without leaving the repo, and a future session that
needs it can grep for it. Unlogged relocation is indistinguishable from deletion six weeks later.

So the order at a breach is: **relocate → point → log → measure.** If the file is still over after
relocating everything with an owner, say so and take the ACK — an honest breach beats a dishonest
pass, and a file genuinely holding 9KB of current state is telling you something the byte count
cannot.

Two smells that mean you are shrinking rather than relocating: the same fact stated three times
(dedupe is fine — that is not shrinking), and prose being reworded without any content changing
files. If a compression pass moves no content to an owner, it did not close the breach; it hid it.

## BLOCKERS triage workflow

When BLOCKERS.md exceeds 8,000 B:

1. Sort active blockers by severity then age.
2. For each, ask the user: still blocking? resolvable this section? or defer to ROADMAP?
3. Only after user direction: resolved → strike-through + resolution note + commit hash under
   "Resolved"; deferred → ROADMAP "Deferred" bucket with B-NNN reference; still-active → stays.
4. NEVER silently archive an unresolved blocker.

**The standing remedy is the index shape, not a cap raise.** Proven in brand-workshop-harness (D-163)
and software-factory-framework (D-012, 7,990 → 2,998 B with every body byte-identical): `BLOCKERS.md`
becomes one row per OPEN blocker — id · severity · what · needs · link — and every body moves
**whole** to `blockers/B-NNN.md`, resolved bodies to `blockers/RESOLVED.md`. Extract bodies from
the git blob and diff-verify before writing the index; log the move as a `D-NNN`. Since claude-config D-012 the `B`
family has a directory-mode profile (§The B family in directory mode): promote it and the ledger
defends the split — contiguity, immutability, index-fresh — instead of a convention doing so.
`glossary-lint` resolves `B-NNN` against every surface.

## DECISIONS entry format (greppable status — MADR-aligned)

Every new D-NNN entry written at section close (or mid-session when the decision is actually
made — log at decision time, validate at close; on an in-flight branch, decision-time capture
is the claim PR and the D-NNN lands with the close — Q15) uses this shape:

```markdown
## D-NNN — Short title
*Status: accepted · YYYY-MM-DD · supersedes: D-MMM | —*

- **Context:** 1–3 sentences.
- **Decision:** what was chosen, in one or two sentences.
- **Rejected:** alternatives ruled out + why (one line each — this is what prevents re-litigating).
- **Consequences / evidence:** commit hash, test output, or file path proving it shipped.
```

**Directory mode drops the body `*Status:*` line** (2026-08-27, the I-112 lesson): status/date
live in frontmatter — the authority — and the body freezes at mint, so a body status line goes
stale the moment the frontmatter flips and poisons body-text greps forever. In a v3 repo the
body is the `## D-NNN — title` heading straight into Context/Decision/Rejected/Evidence
(supersession is frontmatter too). The template above with its status line is the **v2
file-mode** shape only, where the body line IS the record.

## The admission criterion — what earns a global D-NNN (PDR-001 §3.8, ratified)

Ask this at mint time, before writing anything. Quoted verbatim from the ratified contract:

> A candidate decision earns a **global D-NNN** iff: *a future session, working a different unit,
> would need this ruling to avoid re-litigating or violating it* (structural or cross-cutting).
> Otherwise: unit-scoped rulings live with their unit (PDR ruling table, spec, PR) under the
> unit's namespace and never enter the global log; lessons about how we work go to feedback
> memory / `CLAUDE.md` (whose size doclint v3 now reports).

This is **policy, enforced at minting time by the ceremonies' prompts, not by a linter.** Nothing
fails a check for minting too much — the expected effect is that the global mint rate falls by
roughly an order of magnitude without anything becoming unfindable.

Two mint-discipline consequences ride with it:

- **A close no longer mints a D-NNN just for happening.** The close-commit title is
  `section-close: <section name> cohesion sweep` — the leading `D-NNN ` is gone. Mint at a close
  only when a ruling that actually qualifies above occurred at that close. (doclint's near-cap
  streak detection greps `section-close:`, never the D prefix, so the anchor is unaffected — and
  the regression suite pins that.)
- **doclint reports `D minted, trailing 14 days: <N>`** in directory mode — visibility only, no
  cap, no flag, contiguity stubs excluded. A number that does not fall after adopting the
  criterion means the criterion is not being applied at mint.

Where a ruling goes when it does *not* earn a D-NNN: [PDR ruling table / spec / PR] for
unit-scoped calls · feedback memory for "how we work" lessons · a comment at the relevant line for
code-level invariants.

## DECISIONS entry rules

Rules: append-only; never edit an accepted entry — supersede it. `Status:` always on the line
immediately after the heading so `grep -A1 "^## D-" DECISIONS.md` returns the live decision set
without reading the file. Completion claims need evidence (a hash, a test run, a path) — a bare
checkbox is not evidence.

## Threshold enforcement during section-close

Step 4 (doc refresh) ends with a doclint run. For each FLAG:
surface `"[FILE] — [flag]. Proposed action: [archive | rewrite | triage | restructure]"`,
wait for ACK, execute on ACK only. Auto-archive is forbidden. The snapshot (step 5) reports
the post-refresh cold-boot cost so the user watches the number trend.
