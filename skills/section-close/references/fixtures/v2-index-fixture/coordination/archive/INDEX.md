# Archive index — where retired IDs went

One line per ID. The v2 ledger's rule: every ID ever minted resolves to exactly one place —
a live entry, or an archived entry plus a line here naming the archive that holds it. A gap
declared `never-minted` records WHY the number was skipped; `reserved` means an open claim
may still mint it.

| ID | Archived | Where it lives now | What it was |
|---|---|---|---|
| D-002 | 2026-08-10 | never-minted | Reserved by the P9 claim (PR #7); the lane completed with no decision minted — no amendment was needed. |
| D-010 | 2026-08-26 | never-minted | Declared ahead of the range: the P11 claim released without minting, before any later id existed. |

A documentation example, fenced so no tool mints a reason out of it:

```
| D-099 | 2026-01-01 | never-minted | Example row — this reason must never appear in a stub. |
```
