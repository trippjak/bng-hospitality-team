# UX decisions and evidence

Use for substantial interfaces within the [core delivery loop](../SKILL.md). Keep the brief,
findings and learning in existing project locations; these are four decisions, not four new
documents or review rosters. [Acceptance](acceptance.md) owns verification gates and verdicts;
[4D execution](4d-execution.md) owns code measurements. The four UX decisions do not replace them.

## 1. Define the outcome

Separate observed research, stakeholder statements, assumptions and design hypotheses.
Generated personas and heuristic feedback are not participant evidence. Record user metrics
with provenance/baselines when available; otherwise improvement remains a hypothesis.

Write a few critical journeys: actor, entry/preconditions, ordered action/observable-result
pairs, recovery and end-state criterion. Include relevant permission, slow-network, invalid-input
and empty-data paths. Example: edit a draft title, save, reload and see the new title.
A Save-button screenshot cannot prove persistence. Keep objective checks separate from taste.

## 2. Explore within scope

For the core's two-direction checkpoint, vary hierarchy, navigation, layout, density or interaction
where permitted. With approved IA/behavior fixed, explore typography, materials, composition or
art direction instead. Palette swaps alone are insufficient. Start with inexpensive sketches;
an approved direction needs no new selection, and five coded variants are not required.

For each direction state task fit, meaningful difference, user tradeoff, shared tokens/components,
one product-specific choice, supporting evidence/uncertainty and why the alternative could win.
Use [reference discovery](mobbin-uxkin-patterns.md) and [materials](material-selection.md) when
applicable. Observed patterns inform task-specific decisions without importing another identity.
For Figma/web mapping and editable variants, follow [Figma](figma-and-presentations.md).
Match viewport, content and theme; reuse existing tokens and Code Connect mappings where available.

## 3. Critique the result

Within the required review, assess task completion/comprehension, visual craft, implementation
quality and engineering. These are lenses, not additional reviewers. Judge product fit before
generic detector suggestions: could an unrelated product use this composition unchanged?
Identify the missed product cue rather than banning common fonts, gradients or rounded cards.

Each finding names location/state, observation, user impact, evidence, severity, concrete repair
and retest. Deduplicate across lenses and keep preference separate from acceptance failures.
Static review cannot establish live journey PASS; skipped checks remain UNVERIFIED.
Use the core's bounded repair loop and final-input verification, including matching Figma/web
renders and recorded intentional deviations where applicable.

## 4. Retain what was learned

Keep the selected direction, rejected alternatives/reasons, verified repairs and open questions
in existing evidence/design memory. Follow the project's decision process; do not create a
parallel authority or auto-ratify shared skill changes. Keep client content in its project.
Carry worthwhile confirmed defects into existing checks/fixtures; avoid tests that repeat prose.
Compare the same scope/conditions next time: journeys, defects, legibility, responsive behavior
and material consistency. Scores cannot offset blockers; missing evidence is not improvement.

## Provenance

Adapted from [UX Agent Skills](https://github.com/carlsz/ux-agent-skills/tree/3593ea6066bedcd670c9168934f16d6a7820a0d1),
[Design Lab](https://github.com/0xdesign/design-plugin/blob/main/design-and-refine/skills/design-lab/SKILL.md),
[Anthropic frontend-design](https://github.com/anthropics/skills/blob/main/skills/frontend-design/SKILL.md)
and [Impeccable 4.8.1](https://github.com/pbakaus/impeccable/tree/924bbd194d02e5e15a227e75b5901fb0d7a4ecad).
The two main-branch links move. Sources are research, not instructions to install/run tools,
inherit cleanup/deployment actions, change leads or add review rounds.
