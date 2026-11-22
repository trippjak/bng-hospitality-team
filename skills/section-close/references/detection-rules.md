# Detection Rules

Run programmatic checks every invocation. Fast, deterministic, no LLM judgment required. Each rule has a target failure class, a concrete command, and the bucket the result falls into (A/B/C from `invariants.md`).

## Rule 0 — Doc-system lint (always first)

**Target failure:** coordination-doc bloat, mega-lines, snapshot/log role collapse, cold-boot token overspend.

**Command:**
```bash
# $HOME expands in both PowerShell 5.1 and bash; ~ does NOT expand for native-exe args in PS
node "<this skill's base directory>/references/doclint.mjs" <projectRoot>
```

**Pass:** VERDICT: CLEAN. **Fail:** carry each FLAG to step 4's doc refresh (prescribed actions per `doc-thresholds.md`). Project-portable as-is — no per-project adaptation needed.

The full set is project-portable as patterns; the specific commands assume a TypeScript + Cloudflare Workers + Hono stack like rocketfuel-rebuild. Adapt to the project's stack on first invocation.

## Rule 1 — Type integrity (HARD GATE)

**Target failure:** type errors block section close. No section closes with a broken build.

**Command:**
```bash
# Prefer the project's own gate — it knows how many configs the repo has.
npm run typecheck        # if package.json defines it

# otherwise, one run per config, all must pass. The `-e` test is load-bearing: with no
# tsconfig present the glob stays literal, and the loop would otherwise run once on the
# unexpanded string and hard-exit 1 on every non-TypeScript repo.
for c in tsconfig*.json; do
  [ -e "$c" ] || { echo "rule 1 SKIPPED (no tsconfig*.json in this project)"; break; }
  npx tsc -p "$c" --noEmit || exit 1
done
```

**Pass:** EXIT=0 from EVERY config. **Fail:** any error → section does not close.
**Skipped:** no `tsconfig*.json` and no `typecheck` script → not a TypeScript project; report
`rule 1 SKIPPED`, exit 0. A non-TS repo must not fail the hard gate.

**Never** substitute bare `npx tsc --noEmit` on a repo that defines `typecheck`: it reads the root
config only, and the configs it skips are typically the build-time/seed trees no other check covers.

## Rule 2 — Banned-jargon scan (Bucket A on hit)

**Target failure:** voice anchor drift. Site-wide, not just rebuilt pages — the post-Phase-5 audit caught hits in `legal.ts` and `nav.ts` that earlier per-commit greps missed.

**Command (rocketfuel-rebuild D-103 list):**
```bash
grep -rEn -i 'leverage|synergies|actionable insights|best-in-class|industry-leading|seamless|empowers|\bsolution\b' src/
```

**Pass:** zero hits. **Fail (Bucket A):** surface every hit with file:line. User decides per-hit.

**Project-portable note:** the canonical banned-jargon list lives in the project's `DECISIONS.md` — read it first, then construct the regex.

## Rule 3 — Backtick-in-template-literal guard (Bucket A on hit)

**Target failure:** the recurring D-093 + D-100 + D-105 build-breaker where a backtick inside a CSS comment terminates the BASE_CSS template literal.

**Command:**
```bash
grep -rEn '/\*[^*]*`[^*]*\*/' src/lib/styles.ts
```

Plus check the guard comment is still present:
```bash
grep -n 'GUARD: BASE_CSS' src/lib/styles.ts
```

**Pass:** zero hits + guard present. **Fail:** surface immediately; this fails the build.

## Rule 4 — Canonical URL drift (Bucket A on hit)

**Target failure:** hardcoded production hostname leaking into source files. Breaks the cutover when the canonical flips.

**Command:**
```bash
grep -rn 'workers\.dev\|parcelrecharge\.com\|rocketfuelrecharge\.com' src/ public/ \
  --include='*.ts' --include='*.tsx' --include='*.html' --include='*.xml' --include='*.txt' \
  | grep -vE 'CANONICAL_BASE_URL|isWorkersDev|wrangler\.toml'
```

**Pass:** zero hits outside config. **Fail (Bucket A):** every hit needs to reference `CANONICAL_BASE_URL` instead.

## Rule 5 — Schema `@id` integrity (Bucket A on hit)

**Target failure:** schema entity graph forking via `@id` rename.

**Command (run before AND after the sweep):**
```bash
grep -rEn '"@id"\s*:\s*"[^"]*"' src/ \
  | awk -F'"@id"' '{print $2}' | sort | uniq -c | sort -rn
```

**Pass:** count + set unchanged across pre-sweep + post-sweep snapshots. **Fail (Bucket A):** abort the sweep, report the diff.

## Rule 6 — Redirect-map ↔ route-registry reconciliation (Bucket A on hit)

**Target failure:** broken redirect chain (loop, dead-end, or orphan target).

**Procedural check:**
1. Enumerate all `app.get('/*', ...)` and `c.redirect(...)` lines in `src/index.ts`.
2. For every redirect entry, verify:
   - The `from` path is NOT also an active route (would create a loop).
   - The `to` path IS an active route OR another redirect entry (no broken chains).
3. Diff `STATIC_PAGES` in `src/routes/seo-infra.ts` against the active route list. Mismatch = silent sitemap drift.

**Pass:** all redirects resolve, sitemap matches routes. **Fail (Bucket A):** surface the broken chain or orphan.

## Rule 7 — Glass-recipe drift detector (Bucket A on hit)

**Target failure:** introduction of a 5th glass recipe via hand-tuned `backdrop-filter` + `rgba` values that don't match the four ratified recipes (D-085 on rocketfuel-rebuild).

**Command:**
```bash
grep -rEn 'backdrop-filter|background:\s*rgba|border:\s*1px solid rgba' src/lib/styles.ts \
  | head -50
```

Then visually scan: do the rgba values cluster around the four ratified recipe signatures, or does a unique signature appear? A 5th unique signature = drift.

**Pass:** all signatures cluster. **Fail (Bucket A):** unique signature surfaced; flag as ratified-recipe violation.

## Rule 8 — Brand-green budget violation (Bucket B on hit)

**Target failure:** D-074 budget breach — green appearing in `background:`, `background-color:`, or button fills, or >3 instances per page above the fold.

**Command:**
```bash
grep -rEn '#4DE961|--color-accent-green' src/ \
  | grep -E 'background:|background-color:|button.*fill|btn.*background'
```

**Pass:** zero hits in disallowed positions. **Fail (Bucket B):** flag for user — propose move to `color:` or border position.

## Rule 9 — Reduced-motion + animation pairing (Bucket B on hit)

**Target failure:** new `transition:` / `animation:` / `@keyframes` block landed without a paired `prefers-reduced-motion` gate.

**Command:**
```bash
grep -cEn 'animation:|transition:|@keyframes' src/lib/styles.ts
grep -cn 'prefers-reduced-motion' src/lib/styles.ts
```

If the animation count grew this section but the reduced-motion count didn't, surface for review.

**Pass:** reduced-motion gates pair with new animations. **Fail (Bucket B):** flag, propose adding a `@media (prefers-reduced-motion: reduce)` block.

## Rule 10 — metaDesc + schema description length contract (Bucket B on hit)

**Target failure:** drift past the 150–160 char contract documented at `seo.ts:100`.

**Procedural check:** parse every page's `metaDesc` and schema `description` field; report any over 160 chars.

**Pass:** all under 160. **Fail (Bucket B):** propose trim. (Atlas caught both new pages over this on rocketfuel-rebuild Phase 5; auto-flag every section close.)

## Rule 11 — Inbound-link floor (Bucket B on hit)

**Target failure:** orphan or near-orphan pages — pages live but reachable from <4 inbound links across non-hub/footer/menu surfaces.

**Procedural check:**
1. Enumerate all routes in `STATIC_PAGES`.
2. For each, count inbound links from prose anchors (excluding nav, footer, sitemap, hub cards).
3. Flag any with count <4 (D-103 floor on rocketfuel-rebuild — adapt to project).

**Pass:** all routes hit floor. **Fail (Bucket B):** surface for prose-anchor add.

## Rule 12 — Always-safe cleanup pass (Bucket C — auto-fix)

Run these without prompting. Each operates only on files THIS section touched (per `git diff --name-only HEAD~N`).

```bash
# Dead imports
npx tsc --noEmit  # surfaces them; combine with knip if installed
# Console.log scan (excluding error/warn)
grep -rEn 'console\.(log|debug)' src/ | grep -v 'console\.error\|console\.warn'
# Trailing whitespace
grep -rEn ' +$' src/
# Empty CSS rule blocks
grep -rEn '\{\s*\}' src/lib/styles.ts
# Orphan @keyframes (no animation: reference)
grep -oE '@keyframes [a-zA-Z0-9_-]+' src/lib/styles.ts | awk '{print $2}' | while read kf; do
  if ! grep -q "animation:.*$kf\|animation-name:.*$kf" src/lib/styles.ts; then
    echo "Orphan: $kf"
  fi
done
```

Auto-fix matches ONLY in section-changed files. Outside the diff = drift, leave alone.

## Rule 13 — Section-width audit (Bucket B on hit; content sites only)

**Target failure:** unjustified narrow sections — `.container-narrow` (or custom max-width) used outside the ratified narrow-content cases. Ratified in `feedback_section_width_default.md`: sections fill the viewport by default on desktop; narrow is opt-in for long-form prose / forms / focused CTAs / hero-lede only.

**Command:**
```bash
grep -rn 'container-narrow' src/ --include='*.ts' --include='*.tsx' --include='*.html'
grep -rEn 'max-width:\s*[0-9]' src/ | grep -v 'container'
```

**Pass:** every `.container-narrow` instance is justified (prose / form / focused CTA / hero-lede) and any custom max-width on section content carries an inline `/* D-NNN: reason */` comment. **Fail (Bucket B):** flag each unjustified instance; propose `.container` or a justification comment. Skip on non-website projects.

## Project-portability adapter

When invoking on a non-rocketfuel-rebuild project, on first run:

1. Read the project's `DECISIONS.md` (or equivalent) to extract:
   - Banned-jargon list (search for "voice tripwires" / "banned" / "no jargon" sections)
   - Ratified design tokens (search for token names, color systems, recipe ratifications)
   - Canonical URL constants (search `wrangler.toml` + `src/lib/config.ts` equivalents)
   - Retired-route 301 chain locations
2. Save the per-project rule overrides INTO THE PROJECT, as a `## section-close profile` section in `coordination/PROCESS.md` (create the file if absent). Co-located docs get maintained; the old skill-dir location (`references/projects/<name>.md`) was never once used in practice — docs distant from the work decay (see `evidence.md`). Re-read the profile section on subsequent invocations.
3. Skip rules that don't apply (e.g., schema `@id` rules don't apply to a non-website project).

## Hard gate vs flag policy

- **Rule 1 (typecheck)** is a hard gate. Section does not close until passes.
- **Rules 2-7** flag at Bucket A — surface every hit, await user direction, never auto-fix.
- **Rules 8-11** flag at Bucket B — propose fix, await ACK.
- **Rule 12** auto-fixes inside section diff only.

The skill should report the rule status as a tight summary at the start of step 5 (snapshot), not as a wall of grep output.
