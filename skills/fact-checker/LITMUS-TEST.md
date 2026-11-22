# Fact-Checker × Exa — Litmus Test

**Purpose:** Measure whether wiring Exa MCP into the fact-checker (v1.1) produces a *marked improvement* in source quality over the built-in `WebSearch`/`WebFetch`.
**Date baseline captured:** 2026-06-02
**Method:** Identical fixed claim set, run twice — BEFORE (built-in, this session) vs AFTER (Exa, post-relaunch). Compare on the rubric at the bottom.

> Exa tools (`web_search_exa`, `web_fetch_exa`) only load after a fresh Claude Code launch, so the AFTER run must happen in a new session.

---

## Fixed claim set (run these verbatim both times)

```
/fact-checker "A fractional CFO typically costs $3,000-$12,000/month. Fractional executives cost 50-80% less than a full-time hire. The average fractional CFO engagement lasts 6-12 months."
```

---

## BEFORE — Baseline (built-in WebSearch, 2026-06-02)

```
FACT-CHECK REPORT
=================
Content: Litmus claim set (3 claims)
Retrieval backend: built-in WebSearch
Claims found: 3
Verified: 0
Partially verified: 2
Conflicting: 1
```

### 1. CLAIM: "A fractional CFO typically costs $3,000–$12,000/month"
- **GRADE: PARTIALLY VERIFIED**
- Evidence (all vendor/SEO blogs):
  - [k38consulting.com](https://k38consulting.com/fractional-cfo-pricing-guide-2025/) — "$4,000–$12,000/month" for $1M–$10M businesses (2025)
  - [madrasaccountancy.com](https://madrasaccountancy.com/blog-posts/fractional-cfo-services-pricing-models-complete-guide-to-hourly-rates-cost-structure) — "$5,000–$15,000 monthly"
  - [bennettfinancials.com](https://bennettfinancials.com/fractional-cfo-cost-what-youll-really-pay-and-save-in-2026/) — 2026 pricing overview
- **Recommended text:** "$4,000–$12,000/month for $1M–$10M businesses" (low end $3K is below most cited tiers).

### 2. CLAIM: "Fractional executives cost 50–80% less than a full-time hire"
- **GRADE: CONFLICTING** — cited ranges span 30–80%.
  - [fractionus.com](https://fractionus.com/blog/fractional-executive-cost-us-2026) — "50 to 80 percent less" (CFO) ← only direct match
  - [fractionaljobs.io](https://www.fractionaljobs.io/blog/how-much-fractional-executives-actually-cost-to-hire) — "~60% less"
  - [talentloft.com](https://www.talentloft.com/blog/the-advantages-of-hiring-fractional-talent-vs-full-time-employees) — "30–50%"
- **Recommended text:** "40–70% less than a comparable full-time hire (varies by role and benefits load)." The exact 50–80% traces to a single vendor blog — possible circular figure.

### 3. CLAIM: "The average fractional CFO engagement lasts 6–12 months"
- **GRADE: PARTIALLY VERIFIED (understated)**
  - [mercury.com](https://mercury.com/blog/hiring-a-fractional-CFO) — "ongoing engagements typically run 6–12 months"
  - [eightx.co](https://eightx.co/blog/average-fractional-cfo-engagement-size-by-stage) — "45.6% last 1–2 years"
  - [preferredcfo.com](https://preferredcfo.com/insights/how-much-does-a-fractional-cfo-cost) — "6 months to 2 years"
- **Recommended text:** "typically 6–24 months, with 1–2 years most common."

### Baseline weaknesses (the bar Exa must beat)
1. **0 primary sources.** Everything surfaced was a vendor/SEO blog (CFO firms selling the service). No Robert Half Salary Guide, Deloitte/McKinsey, BLS, or AICPA — the exact tier-1 sources the skill says to prefer.
2. **Snippet-only confirmation.** Figures were aggregated from search snippets; no full-page read confirmed the source actually states the figure in context.
3. **Circular-citation risk.** Key numbers (50–80%, 45.6%) each trace to a single blog — the "industry myth" pattern the skill warns about.

---

## AFTER — Exa run (fill in post-relaunch)

1. Relaunch Claude Code from a fresh terminal (loads Exa tools).
2. Run the identical `/fact-checker` command above. It will use `web_search_exa` as primary (header will read `Retrieval backend: Exa`).
3. Paste/save the resulting report below this line.

*(pending — first attempt 2026-06-03 blocked: Exa returned `401 Invalid API key`. The `EXA_API_KEY` loaded at session start is invalid/rejected — likely a rotation artifact (revoked key still in the env var, or a mistyped new key). Fix: set `EXA_API_KEY` to an active key from dashboard.exa.ai, relaunch from a fresh terminal, then re-run the same `/fact-checker` command. The built-in WebSearch baseline above is unaffected and remains the comparison anchor.)*

---

## Scoring rubric — is the improvement "marked"?

Compare AFTER vs BEFORE on:

| Dimension | Built-in baseline | What "marked improvement" looks like |
|-----------|-------------------|--------------------------------------|
| **Primary sources** | 0 (all vendor blogs) | ≥1 tier-1 source per claim (Robert Half, Deloitte, BLS, association data) |
| **Full-content confirmation** | Snippet-only | `web_fetch_exa` confirms the figure in the source's actual text |
| **Circular-citation detection** | Not flagged | Flags single-source/circular figures explicitly |
| **Grade precision** | 2 partial, 1 conflicting | Tighter grades backed by stronger evidence |
| **Source diversity** | ~3 blogs/claim | Independent, non-self-referential sources |

**Verdict criteria:** "marked improvement" = Exa lifts ≥3 of 5 dimensions, especially *primary sources* and *full-content confirmation* (the two that most reduce hallucinated/circular stats). If it only matches the baseline, keep built-in as default and reconsider before wiring Exa into topical-fan.
