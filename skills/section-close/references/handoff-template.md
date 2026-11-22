# HANDOFF.md Contract — the snapshot template

HANDOFF.md is **core memory**: the one file a fresh session (or post-compaction context) reads
first, wholesale. It is a snapshot, rewritten wholesale every section close — never appended to.
History lives in git log + DECISIONS.md. Target 4–6KB, hard cap 8KB (doclint-enforced).

Ordering is severity-first (I-PASS handoff protocol + "Lost in the Middle": models recall the top
and bottom of a file far better than the middle — the most load-bearing content goes first).

## Template

```markdown
# HANDOFF — <project>
**Updated:** YYYY-MM-DD · **Commit:** <hash> · **Verdict:** PASS | CONCERN · **Cold-boot:** <N>K tokens

> **On resume:** run /session-open (pull --rebase first; staleness cross-check; read-back).
> Without the skill: read this file + BLOCKERS.md, then state in one short paragraph your
> understanding of current state and your first action BEFORE touching anything.
> Grep DECISIONS.md for any D-NNN you need — do not read it wholesale.

## 1 · Blockers & urgencies
<0–5 bullets, severity-first. "None" is a valid and common entry. Mirror of BLOCKERS.md headlines,
not a copy — one line each + B-NNN pointer.>

## 2 · State — where we are
<≤10 bullets of CURRENT state only: what's live, what's verified, what posture (deployed/dev/noindex).
No history, no "Prior" chains, no commit archaeology. If a bullet starts with a past-tense verb
and a date, it probably belongs in DECISIONS or the git log.>

## 3 · Next actions — re-entry map
<The first 1–3 concrete moves, each with the file path(s) to open and the first step. This is a
map for re-entry, not a roadmap — the full plan lives in ROADMAP.md. 93% of resumptions stall on
"where do I even look" navigation; this section kills that tax.

For the FIRST move only, add two more one-liners:
  **Why now:** <what makes this the next move rather than another one>
  **Rests on:** <the assumption it depends on> — <what observation would show it false>

These exist because navigation is not direction. A next-action with no "why now" gets
reinterpreted by a fresh session, which is how resumed work drifts while every file still reads
as correct. Keep both to one line each — HANDOFF has an 8000-byte hard budget — and phrase them
as state, not commands, or doclint's imperative-next-action check will flag the section.>

## 4 · Watch out — constraints & don't-relitigate
<3–8 one-liners: active constraints, things NOT to promise as live, ratified decisions that look
questionable but are intentional — each as a pointer: "X is intentional (D-NNN)". D-NNN refs
belong here, in section 1, and as section 3 re-entry POINTERS (the id plus one clause — "re-read
D-172, arithmetic in D-196" — never a retelling). Sections 2 and 5 should carry none: doclint caps
them at ≤20 combined on v3 repos (cf-site-harness#103); v2 repos keep the ≤20 file-wide count.

Also carry anything KILLED THIS SECTION THAT HAS NO D-NNN YET — an approach considered and
dropped without ever being ratified. Ratified rejections are safe because they are greppable in
DECISIONS; un-ratified ones exist only in the conversation, and DECISIONS is the on-demand tier a
cold boot never reads. That asymmetry is why a fresh session confidently re-proposes something
killed an hour earlier. One line each: "<approach> — dropped, <one-clause reason>".>

## 5 · Reflection — what changed in understanding
<2–4 sentences, written fresh each close: what this section's work changed about our understanding
of the project, what was tried and did NOT work (and why), anything the next session needs that is
not obvious from the action log. This is the highest-value paragraph in the file — the implicit
mental model that otherwise evaporates at compaction.>

## Do-not-read
<Explicit exclusion list: directories/files known irrelevant to the next section
(e.g. archive/, dist/, legacy spike folders). Saves the next session from burning tokens scanning them.>
```

## Rules

1. **Rewrite wholesale, never append.** The previous snapshot is preserved by git — that IS the
   handoff history. Diffing HANDOFF.md across section-close commits replays project state over time.
2. **Zero "Prior …" chains.** The instant you type "Prior `hash`" you are writing a log entry —
   put it in DECISIONS.md (or nowhere: git log already has it).
3. **Pointers, not content.** Reference D-NNN, B-NNN, file paths, commit hashes. Never inline a
   decision's full rationale or a blocker's full thread.
4. **Past tense + date = wrong file.** State is present-tense. The single allowed exception is
   section 5's reflection.
5. **The "On resume" block is load-bearing.** The read-back (incoming agent states its
   understanding before acting) is the highest-evidence transfer-fidelity mechanism from
   shift-handover research — don't delete it to save 4 lines.
6. **Evidence over assertion.** "Verified on prod (hash)" beats "done". Claims of completion
   carry a hash, a test count, or a path.
