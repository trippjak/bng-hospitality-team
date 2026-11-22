---
name: ui-ratchet
description: "Evaluate and remediate UX/UI views, dashboards, components, and stylesheets across the 5D UI Ratchet: Laws of UX cognitive hierarchy, responsive geometry and typography, Fitts/Doherty/WCAG 2.2 AA interaction, decision-density multi-module AST/CSS craft, and multimodal screenshot critique. Trigger when building, reviewing, or gating frontend UI code, replacing raw backend 4D line caps on UI deliverables."
---

# UI Ratchet (5D Frontend Quality Gate)

Enforce primary-source UX/UI engineering and Laws of UX standards across declarative UI code and rendered pixels, emitting one deterministic **Classifier Evidence** packet (`NVC-*` + `LUX-*`) without forcing 400-line backend truncation onto frontend views.

## Workflow

GPT-6.2 Astra (`gpt-6.2-astra`) leads UI Ratchet triage and repairs. Select Astra in Codex or use the subscription dispatcher at `scripts/seat-dispatch.mjs` in the installed `ux-ui-studio` skill. If Astra is unavailable, report the blocked seat. A fresh reviewer owns visual sign-off.

For CLI triage, run `node <dispatcher> --seat codex-cli --model gpt-6.2-astra --cwd <project> --prompt-file <brief>` with the default read-only sandbox. For an authorized repair, add `--sandbox workspace-write` to that command so Astra can edit the target project.

### 1. Measure Static Decision-Density, CSS Health, and Classifier Evidence
1. Run `node scripts/measure-ui-ratchet.mjs <targetDir> [--out evidence.json] [--brand-tokens <json>]` (or `--evidence` when collecting static evidence regardless of hard failures) across all `.js`, `.mjs`, `.ts`, `.tsx`, `.css`, and `.html` files in the UI bundle.
2. Separate cohesive view modules by domain (`index.html`, `style.css`, plus `app.js` and cohesive ES modules such as chart, table, and format helpers) with zero circular imports and zero raw `innerHTML` sinks; starter UX/UI briefs explicitly authorize multi-file ES module splits rather than forcing single-file JS bundles.
3. Keep each function `<= 15` cognitive complexity, `<= 5` parameters, `<= 60` lines (up to `80` when linear `<= 15` complexity), each line `<= 140` characters with `< 3` statements, CSS free of `!important`, `@import`, and same-context duplicates, and `font-size` rules root-relative (`rem`/`em`/fluid).
4. **Completion criterion:** `measure-ui-ratchet.mjs <targetDir>` exits `0` with `violationCount: 0` and writes typed static `classifierEvidence` (`NVC-*`).

### 2. Probe Rendered Geometry and WCAG 2.2 AA in Playwright (Single Owner)
1. Print the deterministic browser evaluator with `node scripts/measure-ui-ratchet.mjs --print-dom-probe` (`dom-probe.mjs` + `dom-probe-controls.mjs`) and execute it **once** in isolated Playwright `browser_evaluate` across `1440x900`, `1024x800`, `768x900`, and `390x844` (plus `320px` reflow on text-heavy layouts).
2. Confirm zero whole-page horizontal overflow, zero mobile container clipping (`scrollWidth > clientWidth * 1.15` on tables at `<= 480px`), zero vertical scroll traps on `<= 12`-row desktop tables, SVG axis labels `>= 9.5px` with zero bbox overlap, `>= 24x24` interactive targets (`>= 44x44` primary touch), valid ARIA (`role="group"` on interactive SVGs, `0` `aria-label`/`aria-labelledby` on unroled `div`/`span`, intact table roles on stacked mobile cards), computed `[hidden]` hiding, `>= 4.5:1` / `>= 3:1` text contrast, `>= 3:1` WCAG `1.4.11` form/bordered-button/SVG control boundaries (`LUX-CNT-01`), and balanced media aspect-ratio height after copy tightening, while capturing rendered `classifierEvidence` (`NVC-*` and `LUX-*`).
3. **Completion criterion:** Rendered DOM probe reports `0` violations across every tested viewport, and one Evidence Packet (`evidence.json`, `dom-probe` metrics, `desktop.png` `1440x900`, `mobile.png` `390x844`) is saved.

### 3. Execute Independent Multimodal / Gate Pass Over the Shared Evidence Packet
1. Pass the shared Evidence Packet (`evidence.json`, DOM probe output, exercised states, `desktop.png`, `mobile.png`, and UI source/spec) to an independent multimodal reviewer or standalone/parallel `ux-ui-studio` Gate Subagents (`no-vibe-code` + `ux-ui-qa`) so evaluators do not re-run Playwright or AST scripts redundantly.
2. Check Laws of UX hierarchy (`3-5` KPI chunks per band, `<= 6` top-level choices before disclosure, Gestalt `intra < inter` spacing, Von Restorff chroma reserved for anomalies/breaches paired with text/sign cues, `tabular-nums`, zero-anchored bars, dashed/muted estimates) per [Laws and standards](references/laws-and-standards.md).
3. Restrict reviewer findings to visual regressions, spec gaps, accessibility defects, copy/layout balance, and runtime crash risks. Keep cohesive scope free of unrequested feature columns.

### 4. Apply One Consolidated Repair Batch and Re-Verify
1. Resolve all `P0`/`P1` and blocking aesthetic/copy findings in **one** repair batch while keeping multi-module lines readable (`<= 140` chars).
2. Re-run `measure-ui-ratchet.mjs`, Playwright `dom-probe`, refresh `desktop.png` + `mobile.png`, and confirm `0` static, DOM, or visual blockers.

## Reference Routing

| Branch condition | Disclosed reference |
|---|---|
| Checking primary Laws of UX equations, WCAG 2.2 AA formulas, Cleveland-McGill / Few chart rules, or Project Wallace CSS budgets | [Laws and standards](references/laws-and-standards.md) |
| Running the static AST/CSS check, `--selftest`, or printing `--print-dom-probe` | [UI ratchet script](scripts/measure-ui-ratchet.mjs) |
| Inspecting deterministic static `NVC-*` Classifier Evidence detectors and `brandTokens` overrides | [Static classifier evidence](scripts/classifier-evidence.mjs) |
| Inspecting rendered DOM geometry, WCAG `1.4.11` control boundaries, and `LUX-*` probes | [Rendered DOM & control probes](scripts/dom-probe.mjs) |
