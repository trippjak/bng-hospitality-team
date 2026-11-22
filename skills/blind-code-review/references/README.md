# blind-code-review — reference tooling

Two scripts distilled from the 2026-09-07 brand-workshop-harness reviews (four PRs, seven Stage A reads), after the business-club-ops PR #305 prior art. Both run from anywhere with `node`; neither is part of any repo's gates.

## prepare-view.mjs — build the comment-stripped view

```
BLIND_REVIEW_ROOT=<repo root> BLIND_REVIEW_TS_URL=file:///<repo>/app/node_modules/typescript/lib/typescript.js \
  node prepare-view.mjs <config.json>
```

Config: `{ out, code: [paths], deps: { path: {from, to} }, json: [manifest paths], yaml: [paths] }` — `code` files are masked whole, `deps` files keep only the statements overlapping the line range, `json` masks `"why"` values, `yaml` masks whole-line `#` comments. Method: AST token leaves from a fresh parse; scanner only over trivia gaps; comment spans and excluded statements space-masked; newlines and offsets preserved; shebang retained and disclosed. Refuses a dirty tree, a parse diagnostic on either side, an embedded comment marker inside a string/template/JSX text, or any token-parity or line-count drift. Writes `<out>/view/…` and `<out>/manifest.json` (hashes, ranges, method).

**Always run the independent check after it** — the fidelity lesson from the same day: a checker built from the tool under test agrees with its blind spots.
```
grep -rnE "//|/\*|^\s*\*|^\s*#" <out>/view | grep -vE "https?://|#!/usr/bin/env"
```

## hand-run.mjs — read WHICH assertion a mutation fires

```
BLIND_REVIEW_APP=<app dir> node hand-run.mjs tests/x.mutations.json:a tests/y.mutations.json:c …
```

Applies each needle by raw string replace (refuses a non-unique needle), runs the manifest's test, prints the first `×` / `expected` lines, restores from the in-memory original (never `git checkout`, which would also discard uncommitted edits). "CAUGHT" from the harness proves the suite moved, not that your assertion fired; this reads the assertion.

## Stage B without SendMessage

When the harness disables `SendMessage`, Stage B cannot continue the Stage A reviewer's context. Save the Stage A report verbatim outside the reviewer's control, then launch a fresh reconciler agent with: the saved report(s), the originals addressed by `git show <fixed sha>:<path>` (never the working tree — other branches may be checked out), the requirements, what changed after the read, and the executable checks with the first failing assertion of every hand-run mutation. Record the substitution as a limitation in the receipt.

## Bundled CLI in 0.6.7

The bundled version also exposes an explicit-file CLI; the config-file mode above remains
available. Resolve the base directory from the loaded skill, including plugin-cache installs:

```text
node "<this skill's base directory>/scripts/prepare_stage_a.mjs" --root <repoRoot> --out <scratchDir>/blind-stage-a <file1> <file2>
```

Include required dependencies/callers explicitly. Refuse an empty or incomplete scope even
if the manifest says `PREPARED`. Use `--allow-dirty` only for a deliberately pinned working
snapshot; record dirty inputs and compare original/prepared hashes against the actual tree.
The tool also accepts `--git-diff <baseRef>`; it implicitly allows dirty inputs, so it is
not a frozen-revision or coverage guarantee. Tests run on original source, never the view.

The current implementation masks TS/JS, Python, CSS, HTML, YAML and JSON, but the protocol's
language-aware preparation requirements still apply. Inspect retained directives and
comment-like string/template contents; disclose unsupported or unverified embedded syntax.
`PREPARED` is a preparation status, not independent review or an acceptance verdict.

Node and a visible TypeScript compiler API are required. Run from a project containing
TypeScript, use an existing global install, or set `BLIND_REVIEW_TS_URL` to an existing
compiler module URL. Python inputs need Python 3 (`python3`, `python`, or `py -3`). Missing
prerequisites leave preparation incomplete; do not install packages or change user config
as an incidental review step. `--selftest` exercises bundled fixtures, not target coverage.
