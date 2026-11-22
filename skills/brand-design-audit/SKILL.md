---
name: brand-design-audit
description: >-
  Pre-build design + trademark gate for a NEW brand or new-client site, between workshop output
  and scaffolding: trademark pre-check, then a parallel design-team review synthesized into a
  Design Direction Brief. Fires when a new brand/site starts, when brand materials (logos,
  mockups, a palette) are uploaded for review, after a brand workshop hands off, or on "verify the
  palette", "color-theory check", "check this name for trademark problems", "run the design
  audit", "pre-build design review". Not for a live site's milestone audit (team-meeting), the
  cutover/indexability gate (cf-launch-audit), or authoring skills (skill-creator).
---

# Brand Design Audit

The repeatable pre-build gate between a brand's discovery/workshop output and scaffolding its website. Classify the situation → trademark pre-check (if/then) → the standard design-team review → a synthesized **Design Direction Brief** that gates the build.

## Why this skill exists

Every new brand build — and every brownfield new-client site — needs the same pre-build pass: *Is the name a legal landmine? Does the palette survive color theory + WCAG? Does the UI/nav hold up? Are the brand claims actually true?* Run ad hoc, it's easy to skip a step. Run as a battery, it catches things early.

This battery is grounded in real findings. On one veteran-apparel brand alone it surfaced **two** ship-blockers: (1) a brand name with an FTC sham-charity injunction under the exact phrase plus congressional-charter conflicts — invisible without a deep scan; and (2) a false **"veteran owned"** claim (the brand is military-*family*-founded, not veteran-owned) plus an **"American Made"** claim incompatible with print-on-demand. The trademark pre-check and the claims-integrity check exist because both of those were real.

This is a **single-thread subagent-dispatch** protocol (like `team-meeting`), not a parallel-conversation model. The **main thread is the conductor**: it *sees* the uploaded images, briefs the text-only specialists precisely (exact hex values + described mockups), and synthesizes their findings.

## When to invoke (the gate)

Invoke at the START of a new brand/site build, before scaffolding, when ANY of:
- A **greenfield brand** is moving from discovery/workshop → build.
- A **brownfield new-client website** is starting (existing brand, new site).
- The user **uploads** logos / mockups / a proposed palette / brand materials for review.
- The user asks to *"verify the palette,"* *"run a color-theory check,"* *"check this name for trademark problems,"* *"run the design audit,"* or *"do a pre-build design review."*
- A **brand-development workshop** has handed off design materials (the natural next step after the PipelineContract).

Do NOT invoke for: a live site's milestone/cross-functional audit (use `team-meeting`); the Cloudflare indexability / custom-domain cutover gate (use `cf-launch-audit`); authoring skills (use `skill-creator`). A single-domain check (just a11y, just a code review) is a single specialist dispatch, not this full battery.

## The protocol — five phases

### Phase 1 — Intake (conductor, manual)
Collect: **brand name**, **mode** (greenfield/brownfield — reuse the workshop contract's `mode` if present), and the **design materials** (logos, mockups, product/concept graphics, a proposed palette, named reference brands). Ask the questions in `references/intake-questionnaire.md` — but only the **judgment** questions the assets can't answer (mood adjectives, reference brands to evoke/avoid, palette literalness, fonts, R2 path). Default to **confirm-from-assets** — don't generate a new identity when a logo already defines the palette.

> The main thread SEES the images; the subagents do NOT. Capture exact hex values and precise mockup descriptions now — you'll hand them to the text-only specialists in Phase 4.

### Phase 2 — Classify (deterministic, free)
Three axes route the rest (see `references/risk-flags.md`):
- **Mode:** greenfield (new name → trademark in scope) vs brownfield (existing brand, already in market → name usually settled → skip/confirm only).
- **Name-type:** coined/abstract or acronym (low TM risk) · real word / common phrase (medium) · contains a protected/high-risk token or near-famous mark (high).
- **Asset completeness:** confirm-from-assets (logo + palette present) vs generate (thin → optional exploratory branch).

### Phase 3 — Trademark pre-check (if/then; greenfield only)
1. **Quick screen** (cheap): apply the name-type heuristic + a light look for an existing same-name brand / org / enforcement record.
2. **IF any signal** — real word/phrase, a protected token, an existing user, a near-famous mark, or the mode demands it — **run the DEEP clearance:** dispatch `legal-advisor` (web/USPTO) for a full scan: USPTO marks (Nice class 25/35), confusingly-similar marks, organization/nonprofit conflicts, state-law restrictions, domain availability → verdict **HIGH / MED / LOW** + clearable alternatives.
3. **ELSE** (coined/abstract, no signal): a one-line "clear on a quick screen" note + proceed.
4. **Brownfield:** skip (assume cleared; optional one-line confirm).

> CRITICAL: the pre-check is **routing + risk-flagging only — non-authoritative.** Err toward escalation. Always recommend a real trademark attorney before any filing or domain purchase. (Cautionary case: a "looks fine" veteran-apparel name hid an FTC sham-charity injunction under the exact phrase + congressional-charter conflicts — only the deep scan surfaced it.)

### Phase 4 — Design-team review (always; parallel dispatch)
In a **single message**, dispatch the specialists with the brand context + the precise materials description + **exact hexes**:
- `color-palette-agent` — palette / color-theory verification: harmony, psychology fit, **computed** WCAG contrast for the real pairs, a semantic token map, gaps (e.g. missing neutral ramp), and any logo-vs-swatch reconciliation.
- `dsg-ui-designer` — UI / navigation / page-rhythm + key template specs + prioritized improvements (point it at a reference site's nav if the client named one).
- `accessibility-tester` — WCAG 2.1 AA review (keyboard, focus, contrast, motion).
- `dsg-creative-director` — mood / positioning / posture / look-and-feel critique against the brand strategy.
- `legal-advisor` (or `compliance-auditor`) — **claims-integrity check:** flag any unverified or false brand claim in the materials/copy against an FTC false-advertising / substantiation lens (see `references/risk-flags.md` §2: ownership, "Made in USA"/POD, performance/SLA, fabricated reviews/ratings, giving numbers). *(NOT `ai-writing-auditor` — its charter is AI-writing-pattern detection, not claims truth. Found in the VOFA validation run.)*

> Alternatively dispatch via `dsg-conductor` (it orchestrates the design team) — but it still needs the image descriptions + hexes from the main thread.

### Phase 5 — Synthesize (conductor) → Design Direction Brief
Reconcile the specialists' outputs + the trademark verdict into one **Design Direction Brief** using `references/design-direction-brief-template.md`: verified palette + token map, type system, nav pattern, homepage page-rhythm, key templates, prioritized improvements, R2 asset plan, integrity rules, the TM verdict, and the open decisions. **Surface and resolve inter-lens disagreements explicitly — do not dissolve them into consensus** (e.g., a UI lens recommending a display font the creative-direction lens calls category-generic, or a "looks premium" call that the claims lens says over-asserts insider status). Name the tension, decide, and record why. Save it to the project's `discovery/` (or `coordination/`). **This brief gates the site scaffold.** Log the structural calls (brand mark, palette, trademark posture) to the project decision log.

## Integrity rules (non-negotiable)
- **Trademark pre-check is non-authoritative** — routing/flagging only; escalate when unsure; recommend counsel before any filing/domain.
- **Flag unverified claims** — never let mockup copy assert ownership ("veteran owned"), origin ("Made in USA" for POD), SLAs ("ships in 24h"), fabricated reviews/ratings, or giving numbers without proof. Offer an accurate alternative.
- **Confirm-from-assets by default** — extract/confirm the identity that exists; only generate when assets are genuinely thin.
- **CWV + WCAG have veto power** — a recommendation that fails Core Web Vitals or WCAG 2.1 AA doesn't ship.
- **Coined-mark discipline** — if a risky name is mitigated by adopting a coined mark/acronym, keep the risky expansion off every surface.

## Outputs
- A **Design Direction Brief** (verified palette/tokens, type, nav, page-rhythm, templates, improvements, R2 plan, integrity rules, open decisions).
- A **Trademark verdict** (HIGH/MED/LOW + alternatives) for greenfield.

Both saved to the project's `discovery/`, gating the scaffold.

## References
- `references/intake-questionnaire.md` — the standard design intake questions.
- `references/design-direction-brief-template.md` — the output brief structure.
- `references/risk-flags.md` — trademark risk-token list + decision tree, and the unverified-claims checklist.
