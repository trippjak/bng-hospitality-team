# Output Template — what each lead returns

This is the canonical structure all three leads (Compass, Iris, Atlas) return. The conductor synthesizes against this format. Each lead's prompt should point at this file so they return the same shape, making synthesis fast.

## Template

```markdown
# [LEAD NAME] — Audit Finding

**Subject:** [what was audited, restated in one sentence]
**Date:** YYYY-MM-DD
**Verdict:** PASS | CONCERN | VETO

## Verdict rationale

[1–3 sentences. Why this verdict, in this lead's voice.]

## Top 3 concerns (severity-ordered)

### 1. [Concern title] — severity: high | medium | low
- **What:** [the specific issue]
- **Where:** [file:line, route, component, schema field, viewport]
- **Why it matters:** [the consequence — quantified where possible]
- **Evidence:** [Lighthouse score under specific conditions, contrast ratio, file diff, schema validator output, etc.]

### 2. [Concern title] — severity: high | medium | low
[same structure]

### 3. [Concern title] — severity: high | medium | low
[same structure]

(If fewer than 3 real concerns, return what you have. Don't invent to fill the format.)

## Push-back (the disagreement seed)

[1–3 bullets on what this lead would push back on if another lead's recommendation conflicted. Be specific. This is the substrate the conductor uses to surface tension.]

- [Push-back item 1]
- [Push-back item 2]

## Compromise the lead would accept

[1–2 bullets on what this lead would accept under pressure. Be honest about which lines won't move (vetoes).]

- [Acceptable compromise]
- [Where the line is fixed]

## Supporting work

[List of subagents the lead dispatched internally, if any, with a one-line summary of each finding. Empty list is fine if the lead audited solo.]

- `seo-technical` consulted: [1-line summary]
- `performance-engineer` consulted: [1-line summary]

## References

[file:line citations, D-NNN references, WCAG criteria, Schema.org URLs, web-motion-protocol skill section, Lighthouse run URLs, etc.]
```

## Field rules

### Verdict — three states only

- **PASS** — no blockers, no significant concerns. The lead green-lights from their perspective.
- **CONCERN** — concerns exist but are negotiable. The conductor weighs them against other leads' inputs.
- **VETO** — the lead's veto domain is at risk (Compass: CWV / schema / IA / robots-and-sitemap; Iris: WCAG 2.1 AA / reduced-motion / three-viewport / glass-recipe / voice; Atlas: security / contract / build-breaker / structural-drift). Vetoes are not negotiable in synthesis.

A lead that returns VETO must name the specific veto domain in the verdict rationale. "VETO" without a named domain gets downgraded to CONCERN by the conductor.

### Severity — three levels only

- **high** — would block launch or measurably degrade the site
- **medium** — would land as tech debt or visible drift if not addressed
- **low** — minor; "would like to fix when convenient"

If everything is "medium," the lead reconsidered — the format is meant to surface the worst. A real audit usually has a mix.

### Citations — required

Every concern has a citation. File:line, route, schema validator output, Lighthouse score with conditions ("LCP under throttled 4G"), WCAG criterion ("1.4.3 contrast 3.2:1, fails AA"). Subagents hallucinate; the conductor verifies citations before synthesis.

If a citation cannot be produced, the concern is downgraded to "directional observation" and the conductor decides whether to investigate further before treating it as a real finding.

**Especially for vetoes** — the citation must be verifiable. A VETO without a citation that the conductor can confirm gets downgraded.

### Push-back vs. concern — different fields

These two fields look similar but serve different roles:

- **Concern** — what this lead sees in the work itself, independent of other leads
- **Push-back** — what this lead would argue against another lead's stance, even if they hadn't raised the concern themselves

Concerns drive direct verdict math. Push-backs drive cross-lead synthesis. Don't conflate them.

If a lead's push-back is empty AND the verdict is PASS, the synthesis is straightforward. If push-backs conflict across leads, that's the synthesis work.

### Compromise — the floor and the ceiling

This field tells the conductor where the lead can move and where they can't. Format:

- **Acceptable compromise:** "I'd accept [thing X] if [condition Y]"
- **Where the line is fixed:** "I will not accept [thing Z] under any condition" (this should map to a veto domain)

When all three leads' compromise floors and ceilings are visible, the conductor can find the intersection set quickly.

## Example — filled-out finding (Iris on a video hero)

```markdown
# Iris — Audit Finding

**Subject:** Proposed autoplay video hero on `/` (4MB AVIF source, 1080×1920)
**Date:** 2026-05-04
**Verdict:** CONCERN

## Verdict rationale

The video sells the product story faster than the current 6-phrase rotator, and the brand-warm aesthetic carries through. But autoplay on mobile is a broken UX pattern in 2026 — most browsers block it, the fallback I'm seeing is no fallback, and the file size hits Compass's veto domain not mine. From the design lens alone, I'd ship it with click-to-play. I'm raising CONCERN, not VETO.

## Top 3 concerns (severity-ordered)

### 1. Autoplay disabled on mobile = no hero — severity: high
- **What:** Autoplay video on mobile shows a frozen first-frame on iOS Safari (default, autoplay restricted) and the Android equivalent. The fallback in the spec is just "the video element" — no poster image declared.
- **Where:** Proposed `home.ts:53-72`, `<video>` block lines 60-65
- **Why it matters:** ~50% of traffic gets a frozen frame instead of a hero. That's a visual identity break, not just a UX hiccup.
- **Evidence:** iOS Safari mobile content-blocker doc; tested locally on iPhone 13 Pro simulator.

### 2. No reduced-motion fallback — severity: high
- **What:** Spec doesn't define what plays for `prefers-reduced-motion: reduce` users. A muted-and-paused video is not a meaningful fallback; it's a broken experience.
- **Where:** Same block. Plus `styles.ts §6.6` proposed motion section is missing the `@media` gate.
- **Why it matters:** WCAG 2.3.3 / 2.2.2 conformance + the project's accessibility-tester baseline; this is a regression from the current rotator which honors reduced-motion correctly.
- **Evidence:** WCAG 2.1 success criterion 2.2.2 (Pause, Stop, Hide).

### 3. Brand-warm color drift — severity: low
- **What:** The video grade leans warm-amber where the system's warm token is `--color-accent-warm: #D2CFC0` (cool cream). This is small but noticeable as the video transitions into the rest of the home.
- **Where:** Video frame 0:00–0:03 (the held shot before the first cut)
- **Why it matters:** Rhythm break — the eye reads "warm amber → cool cream" as two different brands.
- **Evidence:** Color picker against frame 0:01 vs. `styles.ts:847` token value.

## Push-back

- **Compass on perf:** I'll yield perf math to Compass (4MB is their domain) but I'd push back hard if the answer is "drop the video entirely" — the brand-impression value is real.
- **Atlas on click-to-play implementation:** If Atlas proposes a heavyweight player library, I'd push back. A native `<video controls>` with poster is sufficient.

## Compromise

- **Would accept:** Poster image as LCP (cool-cream graded to match `--color-accent-warm`), click-to-play `<video>` lazy-loaded on user interaction, reduced-motion gate honored, mobile gets the poster only with a "tap to play" affordance.
- **Won't move:** No reduced-motion gate, no fallback for autoplay-blocked browsers — those are vetoes regardless of perf math.

## Supporting work

- `accessibility-tester` consulted: confirmed autoplay-without-pause-control fails WCAG 2.2.2 if duration > 5s; this video is 22s
- `dsg-design-qa` consulted: cross-browser autoplay matrix confirms iOS Safari + Firefox mobile + Brave default-block

## References

- WCAG 2.2.2 Pause, Stop, Hide: https://www.w3.org/WAI/WCAG21/Understanding/pause-stop-hide.html
- web-motion-protocol skill, references/accessibility-gates.md (reduced-motion patterns)
- D-085 — `--color-accent-warm` token defined as cool cream `#D2CFC0`
```

That's a CONCERN-level finding with verifiable citations and explicit push-back / compromise. The conductor synthesizes against findings shaped like this.

## Anti-patterns

- **Inventing concerns to fill three slots.** A two-concern report with strong evidence beats a three-concern report with one fabricated.
- **VETO without a citation the conductor can verify.** Vetoes are absolute; they need ground truth.
- **Subjective severity.** "Important" is not a severity. Use the high / medium / low scale and quantify.
- **Push-back that's actually a concern.** Push-back is "what I'd argue against another lead's stance." Concern is "what I see in the work itself." Don't conflate.
- **No compromise field.** A finding without a compromise floor leaves the conductor with no synthesis material. Even VETO findings should specify what would resolve the veto.
- **Repeating another lead's likely concerns.** If Iris is auditing voice and notices a CWV regression, she flags it as push-back ("Compass should look at the bundle weight here") — she doesn't write the perf concern. That's Compass's lens.
