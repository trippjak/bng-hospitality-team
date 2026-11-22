# Improvements

Uncommitted ideas — "worth it someday, maybe." Format:

```
## I-099 — a template entry inside a fence, never extracted
*Status: proposed · YYYY-MM-DD · source: template*
```

---

## I-001 — Drop the redundant index once its successor lands
*Status: proposed · 2026-08-14 · source: section-close*
Migration 0001's index is a strict prefix of 0003's and can never be chosen.
Effort: S. Payoff: one less index to maintain on every write.

## I-002 — Inline the wrapper that only forwards its arguments
*Status: declined 2026-08-20 — the wrapper is the seam a later lane needs · source: /code-review*
One call site, zero logic. Effort: S. Payoff: marginal.

## ~~I-004~~ — A settled idea whose text moved to the archive *(terminal; full text → archive/2026-08-improvements-snapshot.md)*

**I-005** — **Cache the palette between renders** *Status: proposed · 2026-08-15 · source: ad-hoc (PR review)*

- ~~**I-006**~~ — De-duplicate the client plumbing *(declined 2026-08-20 — obsoleted by I-005)* → [archive](archive/2026-08-improvements-snapshot.md)
