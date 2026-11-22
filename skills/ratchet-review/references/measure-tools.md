# Instruments by Target Type (Proven Snippets)

Install analysis packages into a scratchpad sandbox, never into the target repo, unless the
run has explicitly adopted them as devDependencies (that adoption is itself a batch).

## Bundled scanner in 0.6.7

Resolve the skill's actual base directory from the loaded catalog, rather than assuming a
`~/code/my-skills` checkout. Existing project instruments remain valid:

```text
node "<this skill's base directory>/scripts/measure_4d.mjs" --dir <repoRoot> <subdir,subdir>
node "<this skill's base directory>/scripts/measure_4d.mjs" --measure-candidate <candidateDir>
```

Repository mode scans JS/MJS/TS/TSX/Python in the selected paths. Include relevant neighbors
in those paths and inspect import coverage: the current resolver handles selected relative
file imports, not every alias, package, index-module or dynamic edge. Unsupported languages,
empty targets and unresolved relevant edges cannot establish a clean graph. Use a suitable
project instrument for the missing coverage.

Candidate mode is for a non-empty `index.html`, `style.css`, `app.js` bundle. It measures
that bundle, not an application's complete module graph or shipped stylesheet inventory.
Its CSS guards and marker-based allowance detection are instrument conventions, not new
project requirements. The measured allowances in [standards](standards.md) remain the
authority; do not add narration markers, change CSS or omit source merely to satisfy a
mismatched instrument. Resolve the mismatch or hold the affected gate.

Run from a project with a visible TypeScript compiler API, use an existing global install,
or set `FOURD_TS_MODULE` to an existing TypeScript module path. Python needs Python 3.
Missing prerequisites are not permission to install dependencies. Retain raw results and
exit status, source/configuration hashes, exclusions and baseline/final comparisons.
`--selftest` proves the bundled fixtures only; it does not replace target-specific evidence.

## CSS / CSS-in-TS / Shipped Bundles

**Fetch the shipped bundle** (analyze what users receive — Wallace's own guidance):

```bash
node -e "fetch('https://<site>/assets/styles.css').then(r=>{console.log('status',r.status,'hash',r.headers.get('x-style-hash'));return r.text()}).then(t=>require('fs').writeFileSync('bundle.css',t))"
```

**Analyze** (scratchpad sandbox: `npm init -y && npm i @projectwallace/css-analyzer @projectwallace/css-code-quality`):

```js
import { analyze } from '@projectwallace/css-analyzer';
const r = analyze(css);
// headline metrics for the baseline table:
// r.stylesheet.size · r.rules.total/empty · r.selectors.total/totalUnique/uniquenessRatio
// r.declarations.total (+uniqueness — Wallace flags <66%) · importants ratio
// r.selectors.specificity.max/mean · complexity.max/mean
// r.values.colors.totalUnique  <-- design-token drift headline
// r.values.fontSizes.totalUnique · zindexes.unique (arms-race check) · atrules.media/keyframes
import { calculate } from '@projectwallace/css-code-quality'; // perf/maintainability/complexity /100
```

**Context-aware duplicate scan** — the correct semantics (same selector in a DIFFERENT
`@media` block is responsive CSS, not duplication; stylelint's `no-duplicate-selectors`
agrees). Track `{` / `}` depth, key each selector by its at-rule context stack, count
repeats only within the same context. A raw string-match dup count is a `heuristic` label,
nothing more — on the reference project it said 269 where the truth was 15.

**Byte-identical proof** (concat → minify → hash builds): after a purely mechanical split or
move, rebuild and compare the bundle hash (e.g. the `x-style-hash` response header). Equal
hash = mathematically zero shipped change. This proof is total — prefer it over eyeballs
whenever the build is deterministic.

**Visual regression** (when output legitimately changes): Playwright `toHaveScreenshot`
across ~6 representative pages against the local dev server; capture goldens before the
first edit; re-run per batch.

---

## TypeScript / Logic — The 4D Deep-Module AST Analyzer

- Bare, unpiped `npx tsc --noEmit` (or the project's typecheck script) — the commit gate.
- `knip` — unused files/exports/deps. `biome check` — lint + format drift.
- **4D Deep-Module AST Ratchet** (uses the repo's installed `typescript` compiler API; zero extra
  packages needed). Measures **Circular Imports**, **Runtime Exports & Depth Ratio ($\text{LOC}/\text{Export}$)**,
  **Function Parameter Counts (`maxParams`)**, **Sonar-style Cognitive Complexity (`cog`)**, and
  **Depth-Adjusted File/Function Size**:

```js
// Run via: node scripts/measure-visualizer-ratchet.mjs [--strict]
// Using TypeScript's AST (ts.createSourceFile):
// 1. Resolve relative imports across TARGET_FILES and detect any directed cycle (DFS).
// 2. Count exported runtime symbols (functions, consts, classes — excluding pure type/interface exports)
//    and compute Module Depth Ratio = Math.round(loc / Math.max(1, runtimeExports)).
// 3. For each function/method, measure:
//    - len (endLine - startLine + 1)
//    - params (node.parameters.length)
//    - cognitiveComplexity (each if/else-if/for/while/do/catch/switch/ternary/&&/|| adds 1 + nestingDepth)
// 4. Apply Depth-Adjusted Thresholds:
//    - File limit: 400 LOC standard, or 500 LOC Deep-Module Allowance when runtimeExports <= 5 & cycles === 0
//    - Function limit: 60 LOC standard, or 80 LOC Linear-Narrative Allowance when cog <= 15 & params <= 4
```

- **LOC forensics:** count blank/comment/code per file; classify CSS-in-TS vs markup vs logic
  before quoting any "X thousand lines" number — raw LOC lies on SSR string-template stacks.

---

## Docs / Markdown

- `section-close`'s doclint (`../section-close/references/doclint.mjs`) — bytes,
  ~tokens, megalines, cold-boot cost.

## Dead-Code Candidates (ANY Target Type)

Grep-based "unused" findings are heuristics: dynamically-built names (`thing--${n}`,
`grid--cols-N`) look dead to static search. Confirm against rendered output (crawl the live
pages, collect class attributes) and safelist dynamic patterns before deleting anything.
