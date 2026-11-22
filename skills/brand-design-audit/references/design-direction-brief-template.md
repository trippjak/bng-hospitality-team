# Design Direction Brief — template

> Output of the brand-design-audit. The canonical design reference that gates the site scaffold. Fill each section from the Phase-4 specialist findings + the Phase-3 trademark verdict. Keep it lean — tokens + direction the build consumes, not a full design system.

**Brand:** {mark} · **Mode:** {greenfield|brownfield} · **Date:** {YYYY-MM-DD}

> {Any brand-mark / naming constraint — e.g. "use the coined mark X; never spell out the risky expansion." Route the name through one `BRAND` constant.}

## 1. Color system (verified)
- **Verdict:** {works / works-with-adjustments / needs-rework}.
- **Final brand colors:** {list w/ hex + role}.
- **Token map (build-ready CSS custom properties):** bg · surface · surface-elevated · text-primary · text-secondary · text-disabled · border · border-strong · brand · accent / accent-hover · star · success · error (distinct from brand) · warning · focus-ring. {Include hexes + the WCAG ratio for each text/UI pair, computed.}
- **Usage rules:** which colors are text-safe vs fill/decoration-only; one-accent discipline; 60-30-10 balance; any logo-vs-swatch reconciliation; gaps filled (e.g. neutral ramp).

## 2. Typography
- Display + body faces ({self-hostable, subset, OFL where possible}); type scale; line-heights; CWV notes (font-display, metric-matched fallback to avoid CLS).

## 3. Navigation
- The nav pattern (and the reference site it mirrors, if any): header structure, desktop menu (mega vs dropdown), mobile behavior, focus-trap/keyboard/a11y. Adapted top-level + catalog structure.

## 4. Homepage page-rhythm
- Section order + hierarchy + spacing rhythm; full-width vs contained per section; hero strategy; LCP handling.

## 5. Key templates
- Collection · Product/PDP · Cart/mini-cart (+ any commerce-handoff notes).

## 6. Prioritized design improvements
- Table of ideas ranked by impact ÷ effort.

## 7. Asset plan (R2 + CDN)
- R2 bucket/prefix (confirmed); what's ready vs placeholder; the R2-vs-commerce-CDN split; WebP/optimization + CWV notes.

## 8. Integrity & brand rules (non-negotiable)
- Verified-claims rules (no false ownership/origin/SLA/reviews/giving); CWV + WCAG veto; coined-mark discipline; any project-specific truth (e.g. accurate ownership framing).

## 9. Trademark verdict (greenfield)
- {HIGH / MED / LOW}; summary of conflicts found; domain status; clearable alternatives; **counsel recommended before filing/domain.**

## 10. Decisions status
- Accepted by client; still-open external dependencies / info needed.
