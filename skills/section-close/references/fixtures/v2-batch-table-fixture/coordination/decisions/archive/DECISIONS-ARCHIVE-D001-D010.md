# DECISIONS — Archive (D-001..D-010)

Batch 1 (D-001..D-003, pre-heading) + **batch 2 (D-004..D-007)** + **batch 2 (D-008..D-010)** — two
batches share the "Batch 2" label on purpose, a fixture case mirroring the real corpus's duplicate
"Batch 10" label (T0b brief). Moved out of the live log to keep it under the byte threshold.

| # | Decision | Rationale | Date |
|---|---|---|---|
| **D-001** | **[STRUCTURAL]** Ship this fixture as a standalone batch-table archive reproducing the brand-workshop-harness monolith's shape. | Proves `migrate` reads rows sitting above the first batch heading. | 2026-06-01 |
| **D-002** | Config is keyed anchor|support|accent, three roles with no escaping — an embedded pipe inside plain prose. | Embedded pipes must not fragment positional extraction. | 2026-06-02 |
| **D-003** | A plain four-column row with nothing unusual, control case for the 4-column era. | Control row. | 2026-06-03 |

## Batch 2 — D-004..D-007 (no header repeat, mirrors the real corpus's Batch 3)

| **D-004** | A row landing right after a batch heading with no repeated table header row. | Batch headings do not always restate `| # | Decision | Rationale | Date |`. | 2026-06-04 |
| **D-005** | Rationale folded into the decision text — the three-column era begins here. | 2026-06-05 |
| **D-006** | A malformed row whose last cell is not a date. | not-a-date |
| **D-007** | Uses the JS OR operator `a || b`, two literal pipes inside a three-column row's prose. | 2026-06-07 |

## Batch 2 — D-008..D-010 (duplicate label, archived later — the source's own irregularity, kept verbatim)

| # | Decision | Rationale | Date |
|---|---|---|---|
| **D-008** | **A clean bold headline for D-008.** Extra unbolded detail follows the headline span. | Batch headings sometimes DO restate the header row. | 2026-06-08 |
| **D-009** | Second three-column-era row for the fixture, no leading bold headline this time so the title falls back to a truncated snippet of the decision text instead of an invented one. | 2026-06-09 |
| ~~**D-010**~~ | **[STRUCTURAL] The tag folded INSIDE the headline span, on a struck-through id.** Two real-corpus shapes at once: `~~**D-NNN**~~` for a retired-but-recorded row, and `**[STRUCTURAL] title**` (D-016/D-060/D-062/D-140). | Both must extract; neither is repairable after mint. | 2026-06-10 |

A fenced documentation example must never be extracted, same fence-tracking rule as heading entries:

```
| **D-099** | Documentation example row living inside a fence. | Must not mint a phantom D-099. | 2026-01-01 |
```
