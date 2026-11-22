# Dashboard and Data-Visualization Patterns

Empirical layout, encoding, and verification patterns distilled from 16 inspected Mobbin web dashboards alongside `ux-ui-team` (`UI-01`..`UI-35`) and `measure_4d.mjs` candidate gates. Apply these patterns when designing analytics consoles, KPI headers, time-series charts, and breakdown tables.

## 1. KPI-Tab Strip Fused to the Primary Chart Card

Fuse 3 to 4 headline KPIs directly into the top header border of the primary time-series card using an accessible `role="tablist"` (`aria-selected`, Left/Right arrow focus movement per `UI-19`). Selecting a KPI updates the plotted chart series (`UI-03`) rather than floating disconnected summary cards above an unrelated graph. Keep each tab cell focused on metric label, primary formatted value with units, and period delta (`UI-27`).

- References: [Dub](https://mobbin.com/screens/d0f6f9cb-db3a-43e1-ba0c-97950979f096?utm_source=antigravity&utm_medium=ai-assistant&utm_source_platform=mcp) (3-stage funnel KPI tabs `Clicks -> Leads -> Sales` above a shared chart), [Profound](https://mobbin.com/screens/f9423573-e4eb-4e70-8968-f545da183ce5?utm_source=antigravity&utm_medium=ai-assistant&utm_source_platform=mcp) (dark-mode 4-KPI tab strip over a multi-series comparison line).

## 2. Inline Proportional Fill Bars Inside Ranked Breakdown Lists

When ranking routes, referrers, pages, or tags, render a subtle horizontal surface-tint bar (`0%` to `100%` of the top visible row's value) behind each row label instead of building a separate horizontal bar-chart widget. Align numeric columns with `font-variant-numeric: tabular-nums` and place compact header dimension toggles (`Top | Exit`, `Referrer | Campaign`, `# | %`) directly inside the breakdown card header.

- References: [Seline](https://mobbin.com/screens/381e7a1c-6678-4f19-a743-59aa944301ec?utm_source=antigravity&utm_medium=ai-assistant&utm_source_platform=mcp), [Dub](https://mobbin.com/screens/d0f6f9cb-db3a-43e1-ba0c-97950979f096?utm_source=antigravity&utm_medium=ai-assistant&utm_source_platform=mcp), [Framer](https://mobbin.com/screens/27a96864-839c-45f8-b1f4-479672827122?utm_source=antigravity&utm_medium=ai-assistant&utm_source_platform=mcp), [Gorgias](https://mobbin.com/screens/83b1c501-cb7d-48b4-a689-be8f869d68d6?utm_source=antigravity&utm_medium=ai-assistant&utm_source_platform=mcp).

## 3. Actual vs. Projected Encoding, Baseline Rules, and Variance Tooltips

Never render forecasts, estimates, or modeled values in the same solid visual treatment as realized measurements (`ux-ui-team/references/roles.md`).

- **Visual separation:** Render realized observations as solid marks and projected buckets with a distinct accent hue, hatched SVG pattern, translucent cap, or dashed stroke paired with an explicit `Estimate` / `Projected` legend chip and badge.
- **Reference baselines:** Overlay a horizontal dashed period-mean rule (`Average` or target SLA) across sparse or spiky series, and extend negative bars or area fills cleanly below an explicit `0` baseline.
- **Structured variance hover/focus:** Show `Actual | Projected | Variance` aligned columns inside chart tooltips or readout strips, and anchor multi-row tables with a pinned `Total` / `Average` summary footer row.
- References: [Fey](https://mobbin.com/screens/53b13638-08f1-4e1e-a2bd-56a71ea32975?utm_source=antigravity&utm_medium=ai-assistant&utm_source_platform=mcp), [Churnkey](https://mobbin.com/screens/662e2c1b-6679-405f-9aed-c4a96abbc4f0?utm_source=antigravity&utm_medium=ai-assistant&utm_source_platform=mcp), [Midday](https://mobbin.com/screens/d268f563-9b67-4a56-969a-3f650c6f958f?utm_source=antigravity&utm_medium=ai-assistant&utm_source_platform=mcp), [Monarch](https://mobbin.com/screens/3efb363a-8057-453e-b98b-d652d2d5e73d?utm_source=antigravity&utm_medium=ai-assistant&utm_source_platform=mcp), [7shifts](https://mobbin.com/screens/e2898f88-4ec5-4b2b-8c16-b3970264c225?utm_source=antigravity&utm_medium=ai-assistant&utm_source_platform=mcp).

## 4. Synchronized Series Tables, Hairline Pillars, and Non-Destructive Inspectors

Connect chart series and tabular breakdowns so operators inspect trends without losing context:

- **Swatch checkboxes (`UI-08`, `UI-12`):** Bind table rows to plotted overlays or highlight selection using colored checkboxes whose accessible label and visual checked state stay synchronized.
- **Inline micro-sparklines and hairline pillars:** Place compact 7-point SVG sparklines inside table rows (`Trend` column) or divide multi-pillar summaries (`Cash | Expenses | Revenue`) with crisp `1px` vertical hairlines instead of heavy nested card boxes.
- **Side detail drawer (`UI-13`):** Open row or tag inspection in a non-modal right-hand drawer at desktop widths that collapses or stacks cleanly at narrow widths without hiding headline controls or forcing route navigation.
- References: [Amplitude](https://mobbin.com/screens/61faa12c-ea78-4eb7-ae47-cc8cf1bb1a0e?utm_source=antigravity&utm_medium=ai-assistant&utm_source_platform=mcp), [Mixpanel](https://mobbin.com/screens/fbb45c21-1d76-4184-9ed2-f5b40ea154e9?utm_source=antigravity&utm_medium=ai-assistant&utm_source_platform=mcp), [Causal](https://mobbin.com/screens/43542a5d-adb9-4643-ae72-e16361967b19?utm_source=antigravity&utm_medium=ai-assistant&utm_source_platform=mcp), [Mercury](https://mobbin.com/screens/db1f0dad-fe1c-4a3d-992a-1900c331e113?utm_source=antigravity&utm_medium=ai-assistant&utm_source_platform=mcp).

## 5. Provenance Headers, Denominator Summaries, and Honest Empty States

- **Data freshness and comparison dates:** Display `Data from up to ...` and exact `Previous period: <start> to <end>` dates next to period controls (`UI-03`).
- **Explicit rollup scope (`UI-08`):** State clearly near the KPIs and breakdown header whether headline figures represent `Global period totals` or `Filtered subset (X of Y rows)`.
- **Plain-English denominator lead-in:** Preceding complex attribution breakdowns, state the base population in one concise sentence (`N of M sessions...`) so percentages carry verifiable denominators.
- **Honest unrecorded values:** Render `null` or unmeasured metrics as `-` with a `None yet` or `Unrecorded` helper label rather than fabricating `0` or `+0%`.
- References: [Front](https://mobbin.com/screens/2a4fd730-6e58-445f-b382-9adfbd99b16d?utm_source=antigravity&utm_medium=ai-assistant&utm_source_platform=mcp), [Clockwise](https://mobbin.com/screens/a2502694-10b9-4ab2-9116-fd54cd9bd49b?utm_source=antigravity&utm_medium=ai-assistant&utm_source_platform=mcp), [Churnkey](https://mobbin.com/screens/5f76714e-953a-4edc-a49c-72bfe343c4d9?utm_source=antigravity&utm_medium=ai-assistant&utm_source_platform=mcp).

## 6. 4D Candidate and Verification Gates (`measure_4d.mjs` + `ux-ui-team`)

Every static or bundled dashboard candidate must pass these structural checks before signoff:

1. **HTML landmarks (`UI-22`):** `<html lang="...">`, `<meta name="viewport">`, non-empty `<title>`, `<main>`, and accessible button/input labels (`UI-30`, `UI-31`).
2. **CSS hygiene (`measure_4d.mjs`):** Zero `!important` declarations, zero duplicate selectors inside the same `@media` context, `[hidden][hidden] { display: none; }` when `[hidden]` toggles empty/panel states (`UI-01`), and `@media (prefers-reduced-motion: reduce) { :root:root * { animation-duration: 0.01ms; transition-duration: 0.01ms; } }` (using `:root:root *` specificity rather than `!important`) whenever `transition` or `animation` is used (`UI-17`).
3. **AST depth and safety (`UI-15`):** `app.js` <= 400 LOC (<= 500 only with `@deep-module:` and `<= 5` exports), `maxParams <= 5`, `cog <= 15` target (`<= 25` hard cap), zero shallow pass-through trampolines, and strictly `textContent` / safe DOM constructors for any untrusted row strings or operator notes.
4. **Geometry and SVG bounds (`UI-04`, `UI-18`):** Zero horizontal page overflow (`scrollWidth <= innerWidth`) across desktop, laptop, tablet, and `390px` mobile widths, and zero colliding or clipped SVG tick/value `<text>` nodes.
