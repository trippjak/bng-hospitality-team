# Conductor Synthesis — How the main thread reconciles findings

After the three leads return their structured findings, the conductor's job is to:

1. Verify ground truth on cited concerns
2. Name the explicit disagreement
3. Pick a path with a cited reason
4. Honor any veto
5. Log the decision if structural
6. Surface a tight summary to the user

This file is the synthesis pattern. It is the highest-leverage step in the team-meeting protocol — getting it wrong wastes the entire dispatch.

## Step 1 — Verify cited concerns

Before treating any finding as ground truth, the conductor reads the cited file:line, runs the cited tool, or checks the cited claim. Subagents hallucinate. The format demands citations specifically so the conductor can check them.

Common verification tactics:

- `Read` the cited file:line range
- `Grep` for the cited symbol or pattern
- For perf claims, run a quick `curl -w "@format"` or invoke `lighthouse` if available
- For schema claims, paste the JSON-LD into Schema.org's structured data validator
- For WCAG claims, check the cited criterion against actual contrast values via `preview_inspect` or a contrast checker
- For "this file is X lines" claims, `wc -l` or Read the file

If a cited claim doesn't verify, the concern is downgraded. Not deleted — sometimes the lead's instinct is right but the citation is off — but downgraded until verified. State this explicitly in the synthesis so the lead's contribution is honored even when the citation was wrong.

**Verify vetoes especially carefully.** A wrong veto blocks shipping; a wrong CONCERN just shapes synthesis.

## Step 2 — Name the explicit disagreement

This is the synthesis sentence. Format:

> "[Lead A] wants [position] because [reason]. [Lead B] wants [different position] because [different reason]. [Lead C] is [neutral / aligned with A / aligned with B]."

Example (a video-hero proposal):

> "Iris wants click-to-play with a poster image as LCP because autoplay breaks on mobile and reduced-motion users need a fallback. Compass wants no video at all because the 4MB asset adds 280ms to LCP under throttled 4G. Atlas is aligned with Compass on the perf math but offers a third path: lazy-load the video on scroll past 50vh, keep the poster as the LCP element, click-to-play below the fold."

Do not soften. Do not pretend the leads agree when they don't. The user reads this synthesis sentence and immediately understands the tradeoff.

If the leads actually do agree, say so cleanly:

> "All three leads PASSED. Compass flagged a low-severity title duplication on `/about/founders` (will land as a `roadmap-deferred` item, not a blocker). No tension to resolve."

That's a fast meeting and a real outcome — don't pad it.

## Step 3 — Pick a path with a cited reason

Not "we'll do both" unless that's actually true. Choose; explain why; reference which lead's argument carried.

Format:

> "Decision: [chosen path]. Reason: [why this lead's argument wins]. [What's deferred or accepted as compromise]."

Example continued:

> "Decision: Atlas's third path — poster image is LCP, video lazy-loads on scroll past 50vh, click-to-play below the fold. Reason: honors Compass's CWV math without dropping Iris's polish goal. The compromise is the user has to scroll to see the video; Iris accepts because the poster carries the same brand impression. Compass's bundle math passes (LCP delta < 50ms for the poster vs. 280ms for the autoplay video)."

A path with a reason is the unit of decision. A path without a reason is a guess.

## Step 4 — Honor vetoes

If any lead returned VETO with a verified citation, the synthesis must respect it. The blocked work doesn't ship until the veto is resolved.

Format when veto applies:

> "Compass VETO: [specific veto reason] (file:line). This blocks [the proposed change]. Path to unblock: [specific actions]. Until then, [the alternative we're shipping or the work we're parking]."

Vetoes are not "I disagree." They are "this concrete thing is wrong, and the protocol commits to not shipping it." Treat them as load-bearing.

If a lead claims VETO but their citation doesn't verify, the conductor downgrades to CONCERN and continues synthesis. State this explicitly so the lead's contribution is honored even when the citation was off:

> "Iris claimed VETO on contrast at the eyebrow text. Verified citation: contrast measures 11.2:1 at the cited element, not 3.2:1. Downgrading Iris's concern to CONCERN — there may be a different element with the contrast issue, but the cited one passes AAA. Synthesis continues with Iris's concern weighted as CONCERN."

If two leads veto in conflict (e.g., Compass vetoes a heavy library on perf, Iris vetoes its absence on a11y), the conductor escalates to the user — the protocol doesn't have authority to override vetoes by majority.

## Step 5 — Log if structural

If the synthesis crosses the project's structural threshold (D-NNN `[STRUCTURAL]` tag in doc-system v2), append a decision to the project's decisions log in the same turn as the synthesis. The decision should reference:

- The team-meeting that produced it (date + trigger type)
- The disagreement that was resolved
- The path chosen
- The leads' verdicts (preserved as audit trail)

Format example:

```markdown
## D-NNN [STRUCTURAL] — Hero treatment: poster image + lazy video

- **Date:** 2026-05-04
- **Affects:** home page LCP path, mobile UX, brand-impression delivery
- **Team-meeting:** Pre-launch comprehensive audit (trigger #5)
- **Verdicts:** Compass CONCERN, Iris CONCERN, Atlas PASS
- **Disagreement:** Iris wanted polish (autoplay video). Compass wanted perf (no video). Atlas surfaced a third path.
- **Decision:** Poster image as LCP, video lazy-loads on scroll past 50vh, click-to-play below fold.
- **Reason:** Honors Compass's CWV math (LCP delta < 50ms) without dropping Iris's polish goal.
- **Consequences:** Mobile users see poster only on first paint; video loads on scroll. Reduced-motion users get poster + click-to-play, no autoplay anywhere.
```

Most team meetings don't produce a `[STRUCTURAL]` decision. Light-format decisions (one-liner) are the default; structural is reserved for actual architecture / brand / contract pivots.

## Step 6 — Surface to the user

The user reads the synthesis. Not the raw findings. A useful synthesis-to-user looks like:

```markdown
## Team meeting — [subject]

**Compass:** PASS | CONCERN | VETO — [one-line summary]
**Iris:** PASS | CONCERN | VETO — [one-line summary]
**Atlas:** PASS | CONCERN | VETO — [one-line summary]

**Tension:** [the named disagreement, in one sentence]

**Decision:** [the path picked, with a reason]

**Vetoes honored:** [list of blocked items, if any]

**Logged:** D-NNN (if structural)

[Any specific user input needed before proceeding]
```

Keep it tight. The user does not want to read three full lead reports unless something is genuinely contested. They want: did the audit pass, where's the tension, what got picked, what's blocked.

If the user wants the deeper findings, they'll ask — and the conductor still has the structured reports in context to present on demand.

## Anti-patterns

- **False consensus.** Reporting "all three leads agree" after lazy synthesis. Verify the push-back fields aren't quietly conflicting before you claim consensus.
- **Burying vetoes.** A veto in paragraph 4 of synthesis is a veto the user will miss. Surface vetoes early in the user-facing summary.
- **Picking by seniority.** "Iris is the design lead so she wins on visual calls." No — leads negotiate within their veto domains; outside vetoes, the conductor decides on merit, not authority.
- **Skipping the verification step.** Treating subagent findings as ground truth without checking citations. This is how synthesis drifts from reality.
- **Logging cosmetic decisions.** Not every team-meeting produces a `[STRUCTURAL]` decision. Only log if the synthesis genuinely changed the project's direction. Most meetings produce a small light-format decision (or none) plus an updated `ROADMAP.md` bucket.
- **Re-litigating ratified decisions.** If a `D-NNN` decision is already ratified, the team-meeting protocol doesn't override it. New evidence → propose a superseding decision, don't pretend the original didn't happen.
- **Synthesizing in private.** Synthesis happens in the user-visible response, not silently in the conductor's head. The user reads the named tension and the cited reason, or the meeting didn't happen.

## When to escalate further (to the user)

If the synthesis surfaces a question the conductor cannot answer with the leads' inputs alone — e.g., a business priority call, a brand-vision call, a budget call, a two-veto deadlock — escalate to the user. The format:

> "I cannot synthesize without your input. [Lead A] and [Lead B] are evenly weighted on [tradeoff]. Both positions have verified citations. The decision is yours: [Option A] or [Option B]. Both are defensible. Recommend [your call] but defer to you."

Do not make business calls inside synthesis. The protocol surfaces tradeoffs; the user decides on the ones outside specialist domains.

## Synthesis time budget

A synthesis should take the conductor ~2–5 minutes of focused work after the leads return. If you're spending 15+ minutes on synthesis, either:

- The audit was too broad (split into multiple meetings)
- The leads gave too much detail and you're getting lost in the transcripts (pull the verdict + push-back + compromise fields specifically; ignore the rest unless contested)
- You're trying to dodge a hard call (just pick a path with a reason; the user can override if you got it wrong)

Synthesis is a forcing function, not a research project. The leads did the research; you're naming the answer.
