# Applicable UI checks

Adapted from PR #53's UI-01..UI-35 checklist. Select relevant checks before implementation;
record scope reasons for N/A rather than adding absent features to satisfy this list.
Project requirements and the [acceptance contract](acceptance.md) govern. IDs retain
traceability to the candidate; they do not imply automated coverage or universal CSS rules.

| ID | When applicable | Check |
|---|---|---|
| UI-01 | Hidden/toggled content | Hidden content stays hidden when flex/grid styles change; verify the computed result and accessibility exposure. |
| UI-02 | Headings | Long headings wrap at relevant widths/text sizes without obscuring meaning or accessible text. |
| UI-03 | Scenario/period switches | Related KPIs, charts, labels and summaries update consistently from the intended state. |
| UI-04 | Responsive layouts | Test content-driven breakpoints and adjacent widths; avoid unintended page overflow. No single mobile preset proves this. |
| UI-05 | Wide inner content | Tables/diagrams can scroll where intended while card headers and essential controls remain usable. |
| UI-06 | Touch controls/badges | Meet the project's target-size requirements and keep fixed-shape badges/icons from unintended distortion. |
| UI-07 | Table rows | Choose density and wrapping for real content; prevent clipped labels and misaligned cells without imposing uniform row heights. |
| UI-08 | Filters/rollups | KPIs, counts and labels agree on global versus filtered scope. |
| UI-09 | Wizards/forms | Current step, invalid fields, visible errors, correction and successful advance agree semantically and visually. |
| UI-10 | Modal/destructive actions | Modal semantics match actual focus/keyboard behavior; recovery and confirmation are proportionate to the action and project rules. |
| UI-11 | Undo/recovery | Where required, recovery restores the intended state and updates transient feedback; do not invent a new persistence contract. |
| UI-12 | Toggle/filter controls | Visual state and the appropriate native/ARIA state stay synchronized. |
| UI-13 | List/detail layouts | The important detail remains reachable at desktop and narrow widths; do not require a split pane on unrelated screens. |
| UI-14 | Command palettes/comboboxes | Pointer and documented keyboard triggers work with the appropriate semantic pattern and focus behavior. |
| UI-15 | Untrusted text/statistics | Render untrusted text through safe text/template mechanisms; verify displayed calculations against the project's defined method, units and source data. |
| UI-16 | Editable grids | Navigation respects hidden columns; filtering and edit completion/cancellation cannot leave stale or misplaced editors. |
| UI-17 | Motion | Honor reduced-motion needs and the project's motion contract; inspect spatial effects and retained cues rather than requiring one selector or duration. |
| UI-18 | SVG charts | Labels and marks fit the intended bounds at relevant sizes without collisions; geometry complements visual inspection. |
| UI-19 | Tab interfaces | Use the chosen tabs pattern consistently: selection, focus, keyboard navigation and panel visibility agree. |
| UI-20 | Permission interfaces | Display and apply the actual authorization contract; never impose a new precedence rule from this checklist. |
| UI-21 | Slides/handouts | Headers, bodies and footers fit the requested aspect/print format; verify actual exports. |
| UI-22 | Documents/units | Verify language, title, viewport where relevant, and singular/plural/unit agreement. |
| UI-23 | Themes | Tokens, component states and charts retain legibility and intended meaning in each supported theme. |
| UI-24 | Printing | When print is a deliverable, verify paper surfaces, content bounds and appropriate interactive-chrome treatment. |
| UI-25 | Async mutations | Busy/disabled feedback, completion and failure/recovery match the actual request lifecycle. |
| UI-26 | Skip links | When present, the link becomes visible and moves focus meaningfully on keyboard activation. |
| UI-27 | Metric cards | Values, units, explanations and source labels remain distinct without clipping or collision. |
| UI-28 | Filter groups | Controls remain readable, grouped and usable across widths; do not require multiple columns for every form. |
| UI-29 | Generated CSS | Inspect the delivered CSS and interactions against the same contract; model provenance does not waive review or permit automatic rewrites. |
| UI-30 | Form controls | Visible inputs have meaningful accessible names and usable label relationships. |
| UI-31 | Buttons | Controls have meaningful accessible names and the intended submit/button/reset behavior; verify accidental-submission paths. |
| UI-32 | Sticky tables | Sticky headers/cells remain legible while content scrolls beneath them. |
| UI-33 | Long content | Headings, metrics and controls avoid unintended clipping; essential content cannot rely on a hover title alone. |
| UI-34 | Dialogs | Dialogs have an accessible name; only genuinely modal behavior is represented as modal. |
| UI-35 | Data tables | Header relationships match the data structure; a row-header table need not acquire an irrelevant column-header section. |

The bundled auditor covers selected heuristics, not this whole list. Record actual exercised
journeys, states and sizes. A count cannot establish source fidelity, accessibility
compliance, general visual quality or acceptance of a different product.
