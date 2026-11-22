---
name: team-meeting
disable-model-invocation: true
description: >-
  Milestone cross-functional audit: leads Compass (SEO/CWV/IA), Iris (design/voice/a11y), Atlas
  (engineering/security) cover named risks; the conductor synthesizes. Fires at
  landmarks: page launch, sprint close, pre-cutover (domain flip, lifting noindex),
  post-major-refactor, pre-launch audit, or a structural decision spanning domains; propose it
  there even unasked. Also "team meeting", "team review", "cross-functional audit", "milestone
  audit", "pre-launch check", "second opinion from the team". Not for typo fixes, single-domain
  tweaks, "quick checks", ratified decisions, or closing a section (section-close).
---

# Team Meeting

Apply [bounded QA](../bounded-qa/SKILL.md) first. Small changes never trigger this ceremony.
At a milestone, select only leads whose domains have named risks not covered by valid existing
evidence. Do not fan out automatically; specialists need a concrete unanswered question. Existing
source-bound review can be reused, while integration and hosted acceptance remain separate.

A milestone-triggered audit protocol that synthesizes three specialist lenses — Compass (SEO/CWV/IA), Iris (design/voice/cohesion), and Atlas (engineering/maintainability) — into a single decisive finding with named disagreements and a conductor verdict.

## Why this skill exists

Cross-functional decisions go wrong silently. SEO loses to whatever the current implementation is debugging. Design wins on visual taste while accessibility quietly degrades. Engineering ships a refactor that breaks the schema's URL contract. By the time the drift surfaces, three sprints have passed.

A milestone audit catches this *before* the drift compounds. Three specialist lenses, in parallel, with explicit instruction to push back. The conductor synthesizes the disagreements rather than letting them dissolve into consensus.

This is **not** a coordination protocol for daily work. cf-content-stack `playbook/sections/11-team-coordination.md` once defined a heavier five-parallel-thread version, but that model was **retired** (Generation 1) after production validation found parallel conversations lose data at scale. **team-meeting IS the current (Generation 2) pattern** — single-thread subagent dispatch plus structured synthesis at landmarks. It replaced the retired heavy model; there is no live parallel-thread protocol to fall back to.

## The three leads at a glance

| Lead | Domain | Bias | Holds veto on | Conductor agent |
|---|---|---|---|---|
| **Compass** | SEO + Core Web Vitals + IA + schema | Search demand, paint speed, crawler legibility | LCP / INP / CLS regressions, broken schema, IA inconsistency, robots/sitemap drift | `seo-conductor` |
| **Iris** | Design + voice + accessibility + cohesion | Brand rhythm, three-viewport native, motion-with-meaning | WCAG 2.1 AA failures, reduced-motion violations, glass-recipe drift, brand-voice deviation | `dsg-conductor` |
| **Atlas** | Engineering + maintainability + security + pragmatism | Working code, traced commits, no premature abstractions | Security holes, untraced structural changes, contract violations, build-breakers | `fsd-conductor` |

Veto from Compass on a CWV regression is final. Veto from Iris on a WCAG 2.1 AA violation is final. Veto from Atlas on a security hole is final. Outside their veto domains, leads negotiate; conductor decides.

## When to invoke (the gate)

Invoke when a change *or* a state-of-the-project review meets **at least one** of these:

- **Page launch** — a new route or major section ships
- **Sprint close** — phase boundary or end of a working week
- **Pre-cutover** — custom-domain flip, production-mode toggle, lifting noindex, secrets binding, schema migration
- **Post-major-refactor** — a structural change touched 5+ files or moved a contract
- **Pre-launch comprehensive audit** — last call before going live
- **Structural decision pending** — the change would warrant a `[STRUCTURAL]` tag in the project decision log
- **Cross-domain conflict** — when two specialist lenses are already disagreeing in conversation and need formal synthesis

If the change is single-domain and small, *don't invoke*. Use a single specialist subagent (e.g., `code-reviewer` for a code-only review, `accessibility-tester` for a pure a11y check). The team-meeting protocol exists for the cases where the answer requires multiple lenses and the disagreement is the point.

See `references/milestone-triggers.md` for the full trigger list with examples and a decision tree.

## The protocol — five steps

### Step 1: Frame the audit (conductor)

Decide what's being audited. Be specific — a vague brief produces vague findings. Write 3–5 sentences that include:

- **Subject:** what changed, what's about to change, or what state of the project to assess
- **Why this milestone:** which trigger from the gate above applies
- **Specific risks to surface:** what you suspect might be wrong, even if uncertain
- **What "done" looks like:** the synthesis you're trying to reach

### Step 2: Read the project context

Before dispatching, gather the current-state context the leads will need. If the project uses doc-system v2, read these in parallel:

- `coordination/HANDOFF.md` — current state
- `coordination/DECISIONS.md` — last 10–15 entries. **Path resolution:** if
  `coordination/decisions/DECISIONS.md` exists, that is the file; otherwise the flat
  `coordination/DECISIONS.md`. Both layouts are live in the fleet and doclint already resolves
  both (`section-close/references/doclint.mjs`). Flat stays canonical for NEW projects (P-007,
  applied 2026-06-12) — this reads what is there, it does not re-nest anything. (P-030)
  **Directory-mode repos** (v3, `.doclint.json` `"version": 3`): that file is a GENERATED
  one-row-per-decision index — the rows give leads titles, not rationale. Read the last 10–15
  rows, then open the `decisions/d/D-NNN.md` bodies of only the entries whose scope touches this
  meeting's subject (typically 2–4 files). Never feed leads index rows as if they were the
  decisions.
- `coordination/ROADMAP.md` — what's queued
- `coordination/BLOCKERS.md` — open issues

Plus any artifact directly relevant to the audit subject (the routes, the styles file, the schema, etc.). The leads will reread what they need; the conductor's job is to ensure the framing is grounded.

### Step 3: Dispatch the leads selected for named risks

Dispatch only the selected conductor agents, in parallel where their work is independent.
The available lenses are:

1. `subagent_type: seo-conductor` — primed as Compass (read `references/compass.md` for the persona spec)
2. `subagent_type: dsg-conductor` — primed as Iris (read `references/iris.md` for the persona spec)
3. `subagent_type: fsd-conductor` — primed as Atlas (read `references/atlas.md` for the persona spec)

Each prompt must include:
- The audit frame from Step 1
- File paths to the current-state context from Step 2 (paths, not full contents — let the lead read what they need)
- The persona's identity ("You are Compass…") plus a path to their full lens spec
- The output format (point them at `references/output-template.md`)

The leads operate independently. They cannot see each other's findings. That's the point — independence forces real disagreement to surface. If they all agree after independent dispatch, the agreement is meaningful; if they disagree, the synthesis is the work.

**Why use the conductor agents.** They supply the relevant domain lens. Instruct each to answer
its scoped question directly and report any need for a specialist before dispatching one. A
persona does not authorize another layer of reviewers by itself.

### Step 4: Receive structured findings

Each lead returns the format defined in `references/output-template.md`:

- Verdict: PASS / CONCERN / VETO with a 1–3 sentence rationale
- Top 3 concerns ordered by severity, each with a citation
- Push-back (the disagreement seed)
- Compromise the lead would accept
- Supporting subagent work
- References

The conductor verifies file:line citations exist before treating findings as ground truth — subagent reports can hallucinate, especially around exact line numbers and version-specific behavior. Read each cited line if the claim drives the synthesis.

### Step 5: Synthesize and decide (conductor)

The conductor's response must:

1. **Name the tension explicitly.** "Compass wants X because Y. Iris wants Z because W. Atlas is neutral but flagged Q."
2. **Pick a path with a cited reason.** Not "we'll do both" unless that's actually true. Choose; explain why; reference which lead's argument carried.
3. **Honor vetoes.** If Compass said VETO on a CWV regression with a verified citation, the regression doesn't ship. Period. Same for Iris on WCAG, Atlas on security. Vetoes are not negotiable in synthesis.
4. **Log if structural.** If the synthesis crosses the project's structural threshold (e.g., D-NNN `[STRUCTURAL]` in doc-system v2), append a decision to the project's decisions log in the same turn.
5. **Surface to user.** The user reads the synthesis, not the raw findings. Give them: tension named, path picked, why, what's deferred or accepted, what's vetoed.

See `references/conductor-synthesis.md` for the full synthesis pattern with examples.

## Integration with project doc systems

If the project uses doc-system v2/v3 (HANDOFF/DECISIONS/ROADMAP/BLOCKERS at `coordination/`):

- Read all four before dispatching (Step 2)
- If the synthesis warrants a structural decision: **v2** — append to the resolved DECISIONS path
  (see Step 2), never creating the flat file alongside an existing `decisions/` one (doclint
  flags the duplication). **v3 directory-mode** — first apply the admission criterion (PDR-001
  §3.8: would a future session on a *different* unit need this ruling?); a qualifying ruling is
  minted as a new `decisions/d/D-NNN.md` with `structural: true`, index regenerated
  (`decisions-dir.mjs index`) in the same commit, `check` exit 0. A ruling scoped to this
  audit alone stays in the meeting synthesis, not the global log.
- Update `ROADMAP.md` if the audit moves items between buckets
- Add to `BLOCKERS.md` if a lead's veto creates an unresolved blocker

team-meeting runs *within* a single thread (the main/director conversation) to surface tensions before they land in a contract or sprint commit — this single-thread subagent dispatch is the current cf-content-stack coordination pattern (section 11, Generation 2), not a lightweight stand-in for a parallel-thread model.

## Token budget

A full team meeting should land in ~10–15K tokens of conductor context:

- Project context reads: ~3K
- Three lead reports (their synthesized summaries, not the underlying transcripts): ~6K
- Conductor synthesis: ~2K
- File verifications: ~2K

If a meeting balloons past 25K, the audit was too broad. Split into multiple meetings with narrower frames (e.g., "perf audit of /home" + "schema audit of /home" + "a11y audit of /home" each as separate meetings, instead of "audit /home" as one).

## Reference files

Read each as needed; not all are needed every invocation:

- `references/compass.md` — Compass lens spec (full bias, push-back vocabulary, escalation triggers, persona prompt seed)
- `references/iris.md` — Iris lens spec
- `references/atlas.md` — Atlas lens spec
- `references/milestone-triggers.md` — explicit trigger list, decision tree, anti-triggers
- `references/output-template.md` — exact format leads return findings in
- `references/conductor-synthesis.md` — synthesis patterns, verification tactics, escalation criteria

Read each lead's spec before priming the corresponding Agent dispatch. Read `output-template.md` once at skill invocation; reuse mentally for each subsequent dispatch. Read `conductor-synthesis.md` after the leads return findings.

## Anti-patterns

- **Inventing findings to fill the format.** A PASS verdict is fine. If a lead has no concerns, they say so. Two real concerns beats three padded ones.
- **Suppressing disagreement.** "We all agreed" after three independent dispatches is suspicious. The format forces push-backs; surface them.
- **Spawning leads when you already know the answer.** This skill is for genuine ambiguity. If a single specialist agent can resolve it, dispatch that agent directly.
- **Running the protocol on tactical changes.** A button color is not a team meeting. A typo fix is not a team meeting. Save the ceremony for the moments that warrant it.
- **Treating subagent reports as ground truth.** Verify file:line citations. The conductor catches hallucinated claims; that's a load-bearing step, not optional.
- **Skipping synthesis.** If you dispatched three leads and reported their findings without picking a path, the meeting hasn't happened yet.
- **Picking by seniority.** "Iris is the design lead so she wins on visual calls." No — leads negotiate within their veto domains; outside vetoes, the conductor decides on merit, not authority.
- **Burying vetoes.** A veto in paragraph 4 of synthesis is a veto the user will miss. Surface vetoes early in the user-facing summary.

## Anchor — relationship to cf-content-stack

cf-content-stack `playbook/sections/11-team-coordination.md` (v1.2.0) documents two generations: a **retired** five-thread parallel-conversation model (Generation 1 — Loki / Hermes / Compass / Iris / Atlas, files-as-bus) and the **current** Generation 2 pattern — single-thread subagent dispatch via ceremonies — which is what this skill implements.

team-meeting is that Gen-2 synthesis ceremony. It carries the persona archetypes (Compass / Iris / Atlas) forward; Loki becomes the main thread itself, and Hermes (strategy/voice) folds into Iris's voice domain — pull `content-strategist` as a consult when voice is the audit subject.

The five-thread protocol was retired after rocketfuel-rebuild's foundation phase; there is no live heavy model to escalate to. For any landmark synthesis within a working thread, this skill is the pattern.
