---
name: fact-checker
disable-model-invocation: true
description: Verify data claims in content via web search. Extract claims, search for evidence, grade confidence, and return sourced citations.
version: 1.2
author: Loki (Marketing Director)
tags: [fact-check, citations, sources, content-quality, verification]
user_invocable: true
---

# Fact-Checker — Data Claim Verification Skill

Verify every data claim in a piece of content before it gets published. This skill extracts quantitative and factual claims, searches for evidence, and returns a graded report with source URLs ready to embed as citations.

## When to Use

- Before publishing any guide, blog post, or landing page that contains data claims
- When reviewing existing content for citation gaps
- When a specific claim needs independent verification
- After AI-generated content is drafted (LLMs hallucinate statistics)

## Input Formats

The user will provide ONE of:

1. **A file path** to a draft guide (HTML body or markdown)
2. **A list of claims** as plain text (one per line)
3. **A topic keyword** with "audit existing" to scan a published page

## Execution Topology (agent-framework + harness)

Classified via the agent-framework classifier (v0.2.1) and placed in the cf-site-harness orchestration. Full JSON + rationale: `cf-site-harness/examples/factchecker-topicalfan.md`.

**Pattern: orchestrator-workers** (read-heavy, parallelizable, independent subtasks).

- **Extract (PROMPT, main thread):** read the content, enumerate independent data claims.
- **Verify (parallel SUBAGENTS):** dispatch one verification worker per claim (or per small batch) *in a single message with multiple Agent calls*. Each worker gets isolated context + Exa tools, runs `web_search_exa`/`web_fetch_exa`, and returns a structured finding only — `{claim, grade, sources[], confidence, source_quote}`. Workers don't see each other: verification is against the source, not agent consensus (monoculture risk: low).
- **Synthesize (PROMPT, main thread):** aggregate worker findings into the report. Synthesis is always single-agent.

**Why parallel, not sequential:** claims are independent and verification is read-heavy with throwaway intermediate state (search results, fetched pages) — exactly where the classifier escalates past single-agent (Rules 1, 2, 10). Sequential per-claim search also pollutes the main thread; isolating each claim in a worker keeps it clean.

**Verification (external_tool):** a fetched source's full text must state the figure. The main thread MUST re-read any source URL a worker cites before trusting it (harness anti-pattern: trusting subagent citations).

**Harness placement:** run within the single-thread main conversation; log to `DECISIONS.md` as `D-NNN — Fact-check: [content]` (or `[STRUCTURAL]` if a correction forces an ICP/messaging change); run `section-close` after (Compass lead). Publish-to-D1 is the irreversible gate (Rule 4) — keep a human/CI quality check (zero UNVERIFIED/CONFLICTING, ≥3 sources) before it.

**Small inputs (1–3 claims):** skip the fan-out, run inline in the main thread. The topology earns its overhead at ~4+ claims.

## Process

### Step 1: Extract Claims

Scan the input for data claims. A "data claim" is any statement that:
- Contains a specific number, percentage, dollar amount, or range
- States a fact that could be true or false (not an opinion)
- References a statistic, study, survey, or industry benchmark
- Makes a comparison claim ("X is Y% more than Z")

**Do NOT flag:**
- Subjective statements ("fractional executives bring strategic value")
- Self-referential facts ("United Income has 2,500+ firms" — internal data)
- Definitional statements ("a fractional executive works part-time")

### Step 2: Search for Evidence

**Primary tool: `web_search_exa` (Exa MCP).** Exa returns clean, full extracted page content rather than snippets, so you can confirm a source *actually states* the claim — not just that keywords matched — and it surfaces primary sources more reliably. Fall back to the built-in `WebSearch` only if the Exa tools are unavailable (e.g., not loaded this session). Record which backend you used in the report header.

For each extracted claim, run a web search with a specific query designed to verify or refute it:

- **Pricing claims** ("$3,000-$12,000/month") → search: `fractional CFO cost per month 2025 2026`
- **Percentage claims** ("60-80% savings") → search: `fractional executive cost savings vs full time`
- **Market size claims** → search: `fractional executive market size 2025 2026`
- **Engagement length claims** → search: `fractional CFO average engagement length months`

Use the current year or one year prior. Prefer sources from:
1. Industry reports (Deloitte, McKinsey, PwC, Gartner, Forrester)
2. Salary/compensation databases (Glassdoor, Payscale, Robert Half, Salary.com)
3. Professional associations (FEF, CEO Roundtable, AICPA)
4. Established business media (Forbes, Harvard Business Review, Inc., Entrepreneur)
5. Platform data (Toptal, Catalant, Business Talent Group — they publish pricing)

**Do NOT cite:**
- Other blog posts that also cite no sources (circular citing)
- SEO content farms
- Reddit/Quora (acceptable as color commentary, not as evidence)
- Content older than 3 years for pricing/market data

### Step 3: Grade Each Claim

| Grade | Meaning | Action |
|-------|---------|--------|
| VERIFIED | 2+ independent sources confirm the claim | Add citation footnotes |
| PARTIALLY VERIFIED | 1 source confirms, or range is close but not exact | Adjust claim to match evidence, add citation |
| UNVERIFIED | No sources found for or against | Flag for removal or rewrite as estimate ("industry estimates suggest...") |
| CONFLICTING | Sources disagree with the claim | Flag with correction and competing sources |
| OUTDATED | Claim was true for a prior year but data has changed | Update with current figures and cite |

### Step 4: Output Report

Return a structured report:

```
FACT-CHECK REPORT
=================
Content: [title or file path]
Retrieval backend: [Exa (web_search_exa) | built-in WebSearch]
Claims found: X
Verified: Y
Partially verified: Z
Unverified: W
Conflicting: V

CLAIM-BY-CLAIM RESULTS
=======================

1. CLAIM: "A fractional CFO typically costs $3,000-$12,000/month"
   GRADE: VERIFIED
   EVIDENCE:
   - Robert Half 2025 Salary Guide: $3,500-$10,000/month for part-time CFO
   - Toptal published rate: $150-$500/hour (aligns with $3K-$12K monthly)
   - Forbes (2024): "$3,000 to $12,000 per month for most engagements"
   CITATION: <sup><a href="[url]">[1]</a></sup>
   RECOMMENDED TEXT: "A fractional CFO typically costs $3,000-$12,000/month on retainer<sup><a href='[url]'>[1]</a></sup>"

2. CLAIM: "60-80% savings vs full-time"
   GRADE: PARTIALLY VERIFIED
   EVIDENCE:
   - Chief Outsiders (industry source): "up to 75% less than a full-time CMO"
   - Business Talent Group: "50-70% cost reduction"
   CITATION: <sup><a href="[url]">[2]</a></sup>
   RECOMMENDED TEXT: "50-75% savings compared to a full-time hire<sup><a href='[url]'>[2]</a></sup>"
   NOTE: Adjusted range downward to match evidence.

...

SUGGESTED SOURCES SECTION (for end of article)
===============================================
<section class="guide-sources">
  <h3>Sources</h3>
  <ol>
    <li id="src-1"><a href="[url]" target="_blank" rel="noopener">[Source name], [year]</a></li>
    <li id="src-2"><a href="[url]" target="_blank" rel="noopener">[Source name], [year]</a></li>
  </ol>
</section>
```

## Quality Rules

- **Never invent a source.** If you cannot find evidence, say UNVERIFIED. Do not fabricate URLs.
- **Prefer primary sources** over secondary reporting. If Forbes cites a Deloitte study, cite the Deloitte study.
- **Date-stamp everything.** A 2022 pricing stat is less reliable than a 2025 one for current content.
- **Verify the source itself.** Check that the URL actually exists and says what you claim it says. Use `web_fetch_exa` (Exa MCP — returns clean full-page markdown) to read the source page when in doubt; fall back to `WebFetch` if Exa is unavailable. Reading the full page rather than a snippet is the point — confirm the source supports the exact figure.
- **Flag circular citations.** If the top 3 search results all cite each other with no primary source, note this — the claim may be an industry myth.
- **Separate correlation from causation.** "Companies that use fractional executives grow 2x faster" needs a study, not an anecdote.

## Integration with Guide Content

When the fact-check is complete, the user can:

1. **Embed inline citations** using the `<sup><a>` pattern in the guide body HTML
2. **Add a Sources section** at the bottom of the guide using the `guide-sources` class
3. **Update the guide in D1** with the corrected claims and citations

The guide template already supports these HTML elements in the `.guide-body` prose styles.

## Credit Budget

This skill uses web search, primarily via **Exa MCP** (`web_search_exa` + `web_fetch_exa`), falling back to the built-in `WebSearch`/`WebFetch`. Typical usage:
- 5-15 searches per guide (one per claim), plus a source-verification fetch where needed
- Exa runs on its free tier by default; higher rate limits use the configured `EXA_API_KEY` (header `x-api-key: ${EXA_API_KEY}`)
- Built-in `WebSearch`/`WebFetch` consume no Exa quota — used automatically if Exa is unavailable

## Example Invocations

```
/fact-checker src/content/fractional-cfo-cost.html
/fact-checker "A fractional CFO costs $3,000-$12,000/month. Fractional CMOs cost $4,000-$15,000/month. 60-80% savings vs full-time."
/fact-checker audit https://united-income.jake-5df.workers.dev/guides/fractional-cfo-cost/
```
