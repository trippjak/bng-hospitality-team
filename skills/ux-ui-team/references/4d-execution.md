# Full 4D execution contract

All four dimensions are mandatory for applicable authored/generated code, including custom visualization/export code. A size-only `check_nasa_p10.mjs` is not this gate. This reference specifies execution and evidence; it is not an analyzer and cannot itself produce a PASS.

## Select and prove instruments

The existing [bundled scanner guidance](../../ratchet-review/references/measure-tools.md#bundled-scanner-in-067)
provides commands for 0.6.7's analyzer. Verify its language/import coverage before choosing it;
its existence does not establish all four dimensions for a target.

1. Read project code-review standards; otherwise use maintained `ratchet-review/references/standards.md`. Read its `measure-tools.md` and applicable bounded/blind protocols. Resolve skills from installed catalogs, not assumed OS paths. Missing instruments/protocols leave the gate unverified; retrieve or implement them as a separately reviewed unit.
2. Inventory languages, logic versus markup/CSS/generated output, aliases, dynamic edges and neighboring modules. Choose maintained language-aware instruments. For TS/JS, examples include a TypeScript compiler resolver for imports/exports/parameters, a supported Sonar cognitive-complexity rule, and a resolver-aware cycle tool. These are choices, not claims of installed packages. Python-only analysis cannot certify TS.
3. Pin versions, configuration, exact commands, graph and source hashes. Verify coverage with existing meaningful red/green fixtures or focused negative fixtures for newly adopted dimensions: a cycle through a neighbor, broad signature, nested high-complexity logic, and size/allowance boundaries. Unsupported syntax or unresolved edges remain gaps. Regex guesses and pseudocode cannot certify cognition or graph integrity.
4. Run baseline and final tools. Retain raw output/exit status plus per-file/function results. Crashes, empty targets, omitted languages, relevant unresolved dependencies and unsupported syntax cannot count as clean. Exclusions need reasons and must not remove candidate implementation from evaluation.

## Measurements and thresholds

| Dimension | Measurement | Portable default |
|---|---|---|
| Dependency hygiene | Directed cycles across changed modules and relevant transitive neighbors; layering violations | Zero cycles; no new upward layer leaks |
| Interface width and depth | Function parameters, runtime exports excluding type-only declarations, source LOC/runtime export | Max 5 params, prefer 4 via cohesive value objects; depth target >=25 LOC/export on logic modules or hold/improve baseline |
| Cognitive and narrative complexity | Supported cognitive complexity per function and function spans | Complexity target <=15, cap <=25; functions <=60 LOC, or <=80 only with complexity <=15 and params <=4 |
| Depth-adjusted file size | File source LOC, classification, exports, cycles and allowance eligibility | <=400 LOC; <=500 only with <=5 runtime exports, zero cycles and no function over applicable parameter/complexity caps |

Apply project overrides explicitly. Document allowances; never invent them after failure. Do not pad LOC to increase depth ratio, export private helpers for tests, or split cohesive logic into shallow wrappers to hit size. Assess generated candidate code that will be delivered; generator review governs reproducibility. Declarative markup/CSS uses project category rules rather than fabricated logic scores.

For CSS/CSS-in-TS also inspect built CSS with maintained CSS instruments: specificity, contextual duplication, token drift, stylesheet size and relevant complexity. Identical selectors in different media contexts are not automatically defects. JS wrapper length does not establish CSS quality.

## Interpret honestly

- Feature work meets applicable limits; justified capability may add size. Do not label it an all-metrics-decreased refactor.
- Behavior-preserving cleanup also uses the actual ratchet run contract: passing baseline behavior, declared tolerances, all dimensions held or improved. Increasing params/cycles to shrink a file fails.
- Record inherited out-of-scope issues separately. If they prevent certifying the changed graph, report the held gate.
- Build/type/lint/tests and independent blind review remain separate. Metrics do not prove behavior, accessibility, security or visual fidelity.
- Results are PASS, FAIL, UNVERIFIED or justified NOT APPLICABLE. Pure native presentation edits can be N/A for code; authoring scripts cannot.
- After substantive repair, rerun final-input checks and obtain fresh blind source review. Keep earlier failed evidence.
