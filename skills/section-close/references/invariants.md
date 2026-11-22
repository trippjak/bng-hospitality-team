# Preservation Invariants

Synthesized from Compass + Iris + Atlas consults during skill design (rocketfuel-rebuild Phase 5 audit context, 2026-05-04). The buckets are project-portable; the file:line citations are rocketfuel-rebuild-specific examples. When applying to other projects, treat the patterns as templates and re-cite against the project's own code.

The principle Atlas surfaced is the master rule: **if `git blame` on this line in 6 months can no longer trace to a `D-NNN` that justifies it, do not touch it.**

## Bucket A — HARD invariants. Default-deny. Never auto-fix.

These cause real harm if removed/changed without explicit user direction. Surface to user, wait for ACK.

### Cross-domain (all leads)
1. **`D-NNN` decision-log anchors** in code, comments, commit messages, MD files. Pattern: `/D-\d{3}/`. These are git-blame anchors back to ratified decisions; severing them breaks the audit trail.
2. **`coordination/` four-file structure** (HANDOFF / DECISIONS / ROADMAP / BLOCKERS). Don't merge, rename, or restructure heading hierarchy — downstream tooling and other agents pattern-match on it.
3. **Voice anchor + banned-jargon list** (typically codified in a structural decision; on rocketfuel-rebuild this is D-103). Banned: `leverage`, `synergies`, `actionable insights`, `seamless`, `best-in-class`, `industry-leading`, `empowers`, `solution` (as lazy substitute for feature/tool), plus project-specific additions.

### Compass domain
4. **Canonical URL constants and the BASE_URL env reference.** Single source of truth for the production hostname. If rewritten to a stale value, every `<link rel="canonical">`, OG `og:url`, schema `@id`, and sitemap loc breaks simultaneously. On rocketfuel-rebuild: `src/lib/config.ts` `CANONICAL_BASE_URL`. **Detect:** any literal containing `workers.dev` or the prod hostname outside config files.
5. **Retired-route 301 chains.** Append-only unless the user explicitly retires one. On rocketfuel-rebuild: `src/index.ts` D-101 + D-103 redirect blocks. A sweep deleting "stale-looking" redirects because the source path doesn't exist in the live route table loses link equity.
6. **Schema.org `@id` values.** Every Organization, WebSite, WebPage, Article, BreadcrumbList, FAQPage `@id` is a stable graph identifier. Search engines deduplicate by `@id` — renaming forks the entity graph.
7. **Sitemap entries.** The route registry that feeds `sitemap.xml` is the hard invariant. Orphan or missing entries silently drop pages from the index.
8. **`robots.txt` directives** — especially `Disallow: /` or `noindex` on dev/staging hosts. Removing prematurely indexes the pre-launch site and creates duplicate-content disasters at cutover.
9. **OG image URLs and dimensions** referenced in social cards. Twitter/LinkedIn/Slack cache aggressively — renaming breaks every cached share preview.

### Iris domain
10. **Ratified design tokens.** Glass recipes (D-085 four-recipe ratification on rocketfuel-rebuild), accent rules (D-074 brand-green: in-motion + 1-per-page moment, max 3 per viewport, never bg/body/button-fill).
11. **Reduced-motion gates.** Every `@media (prefers-reduced-motion: reduce)` block stays. Unpaired animation = flag, not delete-the-animation auto-fix. Removing the gate breaks WCAG 2.3.3.
12. **Web-motion-protocol budgets.** Library tier matrix, JS budget caps, lazy-load gates, INP/LCP impact thresholds. Don't inline a Motion/GSAP import that was deliberately code-split.
13. **WCAG 2.1 AA contrast pairs.** Token combinations validated for 4.5:1 / 3:1 are locked. Don't adjust opacity, swap to a "cleaner" sibling, or normalize `rgba()` → hex (silent contrast failure).
14. **44×44 touch targets** on mobile (WCAG 2.5.8).
15. **Self-hosted woff2 declarations + `font-display: swap`.** Anti-FOIT pattern.

### Atlas domain
16. **Secrets and env-var references.** `LEGAL_CONTACT_EMAIL`, `LEAD_LIMITER`, `ADMIN_EMAIL`, `RESEND_API_KEY`, R2 binding names. Never delete a "seemingly unused" env reference — Workers bindings are declared in `wrangler.toml`, not imported.
17. **CSP nonce middleware and `nonce` attribute usage** in HTML/JSX templates. Removing a nonce attr = inline script blocked in prod.
18. **Type contracts** imported across ≥2 files (e.g., `PillarPage`, `FeatureBulletItem`, `SolutionPage`). Even "unused" optional fields are reserved slots.
19. **`R2_KEYS` constants table** and any string-literal map that's the source of truth for asset addressing.
20. **Hash functions used for cache keys / ETag generation** (e.g., `cyrb53`). Algorithm changes invalidate cached assets globally.
21. **Lead limiter / rate-limit logic** (KV-backed counters, Durable Object state methods). Touching = abuse surface.
22. **`wrangler.toml` bindings, routes, observability, compatibility_date.** A reformat that drops `[observability]` or shifts `compatibility_date` is a real prod incident.
23. **`<noindex>` / `X-Robots-Tag: noindex` headers** on dev hosts. Removing prematurely indexes a pre-launch site.

## Bucket B — SOFT invariants. Touch only with explicit user approval.

Safe to touch but require sign-off because mistakes here cost SEO ranking, design coherence, or audit-trail integrity.

### Compass domain
1. **Schema `name`, `description`, `headline` strings** — appear in rich results.
2. **Internal anchor link topology** — the `<a href>` graph between pages. Site PageRank flows through this; removing "redundant" cross-links shifts authority distribution.
3. **`llms.txt` and `llms-full.txt` entries** — LLM citation surface. Removing entries removes citation eligibility.
4. **Breadcrumb visible labels** — changes ripple to BreadcrumbList `name` schema.
5. **H1 text and primary `<title>` tag content** — SERP CTR signal.
6. **Meta description copy** — same.
7. **Image `alt` text on hero/decorative images that schema or `<figure>` references** — cited captions must stay synced.

### Iris domain
8. **Section H2 phrasings** — shipped copy is ratified by inclusion.
9. **Hero subhead copy and CTA microcopy.**
10. **FAQ ordering and question wording.**
11. **FeatureBulletGrid item content** (icon + label + description triplets).
12. **Section order on a page** — rhythm is intentional, not arbitrary.
13. **Component prop defaults that affect visual rendering** (padding, max-width, accent intensity).

### Atlas domain
14. **`archive/` rotation.** When a doc exceeds threshold, the move-to-archive is a *proposed* operation requiring user approval per cycle, not autopilot. Archived entries must remain greppable by `D-NNN` because code references them.
15. **`pillarShell` template default copy** and other shared shell defaults — copy is iterated, but defaults are quoted in screenshots and decisions.
16. **`BLOCKERS.md` items older than N days** — they look stale but may be deliberately parked. Surface for triage; don't auto-close.
17. **Build-output asset hashes / fingerprinted filenames** in HTML — don't normalize as "noise."
18. **Decision rationale prose in `D-NNN` files** — entry stays, but rewording the "why" needs sign-off.
19. **CSS files past comfort threshold.** Splitting is a real refactor — propose, don't execute.

### Cross-domain
20. **`HANDOFF.md` open-thread bullets** — refresh, don't silently drop unresolved blocker references.
21. **ROADMAP item phrasing and ordering** — mark items DONE, but don't reword scope.
22. **README.md and `coordination/PROCESS.md`-adjacent docs** — these are the spec for other agents.

## Bucket C — Always-safe-to-clean. No prompt needed.

### Universal
1. **Unused imports** — verified by `tsc --noEmit` / `knip` / `ts-prune` against zero remaining workspace refs.
2. **Unused locals + unused exports.**
3. **`console.log` / `console.debug`** introduced this section. Keep `console.error`/`console.warn`.
4. **Trailing whitespace, mixed line endings, BOM artifacts** — only in files this section touched. Do NOT reformat outside the section diff (Atlas: surgical changes).
5. **>2 consecutive blank lines** inside section's edited files only.
6. **Empty rule blocks** (`.foo {}`).
7. **Orphan `.bak` / `.tmp` / `~` files** anywhere in the tree.
8. **Files matching `*.bak`, `*.old`, `*.draft.md`** older than 30 days.
9. **TODO comments older than the section's start commit** that reference completed work.
10. **Comments referencing a `D-NNN` where DECISIONS.md marks that decision as `Status: Reversed`** (not Superseded — superseded decisions still have valid historical context).

### CSS-specific (Iris)
11. **Stale CSS selectors targeting components that no longer exist.**
12. **Orphaned `@keyframes`** — defined but no `animation:` reference anywhere.
13. **Dead `@font-face` declarations** — font family loaded but never used in any selector.
14. **Unused CSS custom properties** — `--token-name` defined in `:root` but never `var()`-referenced.
15. **Commented-out CSS blocks older than the current section.**
16. **Duplicate CSS rules with identical selectors and identical declarations.**

### Doc-specific
17. **MD trailing whitespace, multiple consecutive blank lines (>2), stale ToC entries pointing to removed headings.**

### What "always-safe" does NOT mean
- It does not mean "delete without telling the user." Always emit a one-line summary in the cleanup commit message: "Auto-cleaned 7 unused imports across 3 files."
- It does not extend to files outside the section diff. Atlas's surgical-changes rule overrides — touching files unrelated to this section's work is itself drift.

## Output format — VETO / CONCERN / OK tri-state

Match the team-meeting protocol's output format. Every section close emits:

| Verdict | Meaning | Action |
|---|---|---|
| **VETO** | A HARD invariant violation surfaced. Section does not close until resolved. | Surface to user. Escalate to `team-meeting` if domain-significant. |
| **CONCERN** | SOFT flag(s) accepted as deferred work, OR HARD violations resolved with user sign-off in this sweep. | Surface in snapshot. Roll into ROADMAP if deferred. |
| **OK** | No active flags. Section closes cleanly. | Standard snapshot + commit + push. |
