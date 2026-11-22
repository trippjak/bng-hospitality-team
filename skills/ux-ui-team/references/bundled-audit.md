# Bundled UI auditor: scope and limits

The auditor shipped in 0.6.7 is an optional source of diagnostics for compatible local
fixtures. It does not replace independent UX/UI QA, task-specific journeys or final renders.
Use it only when headless project-preview testing is authorized; a user prohibition on
browser automation still applies. No browser run is needed just to read this reference.

```text
node "<this skill's base directory>/scripts/audit_ui_universal.mjs" <candidateDir>
```

Candidate mode expects non-empty `index.html`, `style.css` and `app.js`. Node, a visible
TypeScript compiler API, Playwright and its browser must already be available. The current
script retains machine-specific discovery fallbacks; a plugin install alone does not
prove access. Report a missing prerequisite without incidental installs or configuration
changes. `--selftest` exercises a synthetic fixture only.

Its 22 checks sample selected elements/states at 1440x900 and 390x844. Several heuristics
encode fixture-specific layout/ARIA/CSS conventions; compare findings with the real
contract. Do not add a modal, column-header section, multicolumn filter form or fixed
row-height rule solely to make the auditor green. A vacuous check over absent elements
does not prove that the corresponding interaction was tested.

The URL mode accepts a URL, but its embedded 4D result is a placeholder, not source
measurement. Prefer an approved loopback preview and obtain separate source/graph evidence
using the [4D contract](4d-execution.md). Do not present a URL-mode `ratchetPass` as 4D PASS.
For local bundles, the embedded analysis still does not cover a complete application graph.

The browser uses a fresh context, blocks service workers and filters requests by an origin
string prefix. That filter is not a demonstrated security boundary or guaranteed localhost
containment. Do not execute untrusted generated code with this script alone; satisfy the
execution-isolation requirements in [acceptance](acceptance.md) first. Never use personal
sessions, desktop control or live customer transactions.

Keep raw results, blocked/error logs, source/build identity and tool/environment details.
Use suitable project checks for uncovered states, responsive widths, keyboard behavior,
contrast, source claims and exports. Missing evidence stays unverified; incompatible
heuristics require a documented finding disposition, not a fabricated automated PASS.
