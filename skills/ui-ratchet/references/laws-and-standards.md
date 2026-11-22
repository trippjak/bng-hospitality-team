# Laws of UX, WCAG 2.2, and Data-Viz Ratchet Reference

Distilled from verified primary sources recorded in `docs/research/2026-11-15-ux-ui-ratchet-and-laws-of-ux.md`.

## 1. Laws of UX Quantitative Bounds

- **Miller / Cowan Working Memory (`3-5` chunks):** Group headline KPIs, navigation links, and readout cells into `3-5` meaningful chunks per row/band (hard ceiling `<= 7`).
- **Hick-Hyman Choice Load (`<= 6` actions):** Expose `<= 6` top-level filter pills or toolbar controls before progressive disclosure (`RT = a + b * H`).
- **Gestalt Proximity & Common Region:** Keep intra-group spacing strictly tighter than inter-group spacing (`intra <= 0.5 * inter`, e.g., `4-8 px` within a card vs `16-24+ px` between sections), using at most one outer region border per module rather than nested box-in-box clutter.
- **Von Restorff Chroma Isolation (`WCAG 1.4.1` paired):** Keep neutral telemetry chrome low-saturation; reserve high-chroma red/amber/brand accents strictly for SLA breaches, negative values, anomalies, or at most `1` primary CTA per viewport region, always paired with a non-color cue (`-`, `+`, badge label, or hatch pattern).
- **Fitts's Law & WCAG `2.5.8` / `2.5.5`:** Co-locate row actions and filter controls near their context; keep every interactive control `>= 24 x 24 CSS px` (`>= 44 x 44 CSS px` for primary touch actions).
- **Doherty Threshold & Nielsen Limits (`<= 400 ms`):** Provide immediate `<= 100 ms` local visual feedback (`INP <= 200 ms`, `LCP <= 2.5 s`, `CLS <= 0.1` at p75), keeping search/filter transitions instantaneous without blocking modals.
- **Tesler's & Postel's Laws:** Absorb date normalization, safe zero-baselines, and tolerant search whitespace in code (`textContent` / safe DOM constructors only; `0` raw `innerHTML` sinks).

## 2. WCAG 2.2 AA and WAI-ARIA APG Requirements

- **Contrast (`SC 1.4.3` & `1.4.11`):** Unrounded contrast `>= 4.5:1` for normal text, `>= 3.0:1` for large text (`>= 24 px` or `>= 18.5 px` bold `>= 700`), and `>= 3.0:1` for non-text graphical bars, baselines, active tab indicators, and `>= 2 px` focus rings (`SC 2.4.13`).
- **Resize & Reflow (`SC 1.4.4`, `1.4.10`):** Style typography in `rem`/`em`/fluid `clamp()` so root `200%` text zoom scales proportionally; reflow cleanly at `390 px` and `320 px` without whole-page horizontal scrolling.
- **Focus Not Obscured (`SC 2.4.11`):** Keep focused elements visible outside sticky headers/footers (`scroll-padding` when sticky bars are used).
- **WAI-ARIA APG & SVG-AAM:**
  - Use roving `tabindex` (`0` / `-1`) with `ArrowLeft`/`ArrowRight`/`Home`/`End` on tablists (`role="tablist"`, `aria-selected`) and chart bucket groups.
  - Never place focusable controls inside `role="img"`; set `role="group"` on interactive `<svg>` elements and `role="button"` + `aria-label` on focusable bucket `<g>` elements.
  - Attach `aria-live="polite"` exclusively to dedicated screen-reader status regions updated on focus/selection commit, never on pointer hover.

## 3. Data Visualization & Responsive Table Rules

- **Cleveland-McGill & Stephen Few Integrity:** Always anchor value bars at `0` (switch to dots/lines if scale cannot include zero); use lines only on continuous intervals with explicit breaks for missing data; encode forecasts with hatching, dashed outlines, `(Est.)` badges, and distinct legend items; apply `font-variant-numeric: tabular-nums` and right-align numeric columns.
- **NN/g & Adrian Roselli Table Reflow:** Render modest desktop tables (`<= 12` rows) in full document flow without vertical `max-height` scrollboxes clipping bottom rows. Below mobile breakpoints (`<= 640-760 px`), reflow wide multi-column tables into stacked labeled cards preserving explicit `role="table"`, `role="rowgroup"`, `role="row"`, `role="columnheader"`, and `role="cell"` semantics (or use a scroll region with sticky Column 1 if cross-row comparison dominates, never clipping numeric cells mid-digit without affordance).

## 4. Decision-Density JS & Project Wallace CSS Budgets

- **Per-module AST discipline:** Cognitive complexity `<= 15`/fn, `<= 5` params, `<= 60-80` LOC/fn, `<= 650` LOC/module across cohesive ES modules, `<= 140` chars/line (zero multi-statement compressed one-liners), `0` circular imports, `0` unsafe DOM HTML sinks.
- **Project Wallace CSS discipline:** `0` `!important`, `0` same-context duplicate selectors, `0` `@import`, bounded unique colors/custom tokens, root-relative `rem` scaling, and standard `@media (prefers-reduced-motion: reduce)`.
