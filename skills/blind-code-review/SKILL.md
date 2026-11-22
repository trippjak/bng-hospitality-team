---
name: blind-code-review
description: >-
  Independent, comment-free comprehension review required for code changes above the small-change tier (see bounded-qa).
  Use before approving logic, query, script, configuration-behavior, or UI-behavior changes,
  including behavior-preserving refactors. Small changes and trivial spelling/formatting edits are exempt.
---

# Blind Code Review

Use [bounded QA](../bounded-qa/SKILL.md) for review intensity. For a bounded code change, one
fresh reviewer completes both Stage A and Stage B across the relevant lenses; this satisfies
the informed inner review too. No extra reviewer or panel solely for another review label.
Preparation, fidelity, coverage and repair invalidation below remain required. After one
repair cycle, unresolved substantive findings pause the unit or trigger explicit reclassification.

Review new and changed handwritten code, including enough surrounding code to understand its
effects. Read every statement in that scope; report by function or logical block, not by
copying line-by-line narration back into the source. Legacy cleanup beyond the change belongs
in a separately claimed ratchet-review target.

The standard is comprehension plus correct behavior. Removing comments or reducing LOC alone
does not establish either. Names, types, structure and control flow should explain the code.
Keep concise why/constraint comments only for necessary information code cannot express;
preserve required notices, tooling directives and useful public API contracts. Avoid narration,
author history, obvious dividers and documentation that merely restates signatures.

Prior art: [Google's review guidance](https://google.github.io/eng-practices/review/reviewer/looking-for.html)
on complexity, comments and every-line review; ratchet-review's bounded remediation and
behavior-preservation proof. This protocol adds a recorded first reading before rationale.

## Scope and preparation — coordinator

The bundled [preparation tooling](references/README.md#bundled-cli-in-067) can build the
review view. Tool success does not waive the source-fidelity and isolation checks below.

1. Record the base/head revisions, complete changed-file list, reviewed ranges, and required
   dependencies/callers. Small changes under bounded-qa and trivial spelling/formatting edits
   are exempt; the exemption needs a reason in the normal QA receipt. A change touching any item
   excluded from Small in bounded-qa is never small, even at one line, and mixed changes do not
   inherit the exemption.
2. Prepare a separate read-only review view at that revision. Withhold explanatory comments,
   author discussion, requirements narrative, prior findings and suggested fixes from the first
   reading. Supply governing instructions without solution-specific narrative. Include names,
   types, schemas and enough dependency/caller code to follow behavior. Missing context must be
   requested through the coordinator, who supplies equally prepared source.
3. Use language-aware comment ranges and replace explanatory comment characters with spaces,
   preserving newlines and source locations. Compare non-comment tokens and parse results with
   the original; do not use a regex stripper. Preserve directives and notices in the original
   build/test copy. A required directive retained in the review view is disclosed in the receipt.
   Embedded languages need their own handling; comments inside executable template strings
   cannot be silently left visible or altered as though they were host-language comments.
   Unsupported syntax or unverified preparation makes the review INCOMPLETE.
4. Record hashes of original and prepared files, the preparation method, fidelity check and
   mapping. The source manifest must be checked against the actual target tree, not merely an
   author-provided extract. The snapshot is for reading only; tests run against original source.
5. Start a reviewer with fresh context and no inherited author/reviewer history. Give it only
   this protocol, governing rules and the prepared view. Do not name suspected defects, expected
   verdicts or desired reductions. Do not give it the original checkout or rationale until its
   first-reading report has been saved outside its control. Use a scoped filesystem/toolset when
   available. A toolset exposing the original is not access-isolated: explicitly record this
   limitation and require a complete read trace confirming no withheld material was accessed;
   otherwise the blind review is INCOMPLETE. Never claim a prompt restriction is a sandbox.

## Stage A — reviewer, before explanations

Read only the prepared view. For every function/logical block in scope, record:

- File/ranges read and any uncovered ranges or missing dependencies.
- Inputs and units where discernible; outputs, transformations, side effects, branches,
  failures and ordering. Distinguish observed behavior from an inferred business purpose.
- Predicted results for representative normal and boundary inputs, based on the code.
- Concrete ambiguities, misleading names, dense expressions or unnecessary indirection,
  with locations and the smallest clarification needed. Do not invent business requirements.

Save this report before requesting the reveal. If source cannot establish an external reason,
mark that reason unknown; code need not encode vendor history or justify business policy.
An assertion that everything is understandable, without coverage and behavioral predictions,
is insufficient evidence. The reviewer diagnoses; it does not edit the implementation.

## Stage B — reveal, reconcile and verify

The coordinator now supplies original source/comments, requirements, relevant decisions,
behavior checks and prior findings. Preserve Stage A verbatim; do not rewrite it after reveal.

Compare Stage A's predictions with the required behavior and executable checks. Investigate
mismatches: code may be readable but wrong, the reviewer may have misread it, or preparation
may have omitted needed context. A comment explaining a hidden external reason is legitimate;
a comment needed to decode ordinary control/data flow calls for clearer code. Useful API
contracts remain documentation, not a license to narrate the implementation.

Apply these criteria to findings:

- **Comprehension:** no unresolved ambiguity about scoped implementation behavior; coverage
  accounts for every handwritten statement, with generated/vendor exclusions explicit.
- **Necessity:** remove code and narration with no behavior, protection or clarity value.
  Preserve a named helper/type when it clarifies intent or enforces a meaningful boundary,
  even with one caller. No deletion quota, code golf, or moving bloat outside the measured scope.
- **Truth and preservation:** comments and names agree with the implementation; required
  behavior and safeguards survive. A clear but incorrect implementation still fails QA.

Blockers cite the location, concrete ambiguity or violated requirement, and smallest repair.
Do not block on taste, missing business history, or a bare confidence score. Unknown behavior
is INCOMPLETE until context settles it, never an automatic PASS. If new context clears the
finding without code changes, record why. Substantive repairs require a new fresh reviewer
and a new Stage A; retain the old evidence and bind the new receipt to the repaired source.

## Receipt and verdict

Store one concise receipt in the project's normal QA evidence location:

- Base/head, original/prepared hashes and source fidelity; scope, exclusions and coverage.
- Fresh-context identity; available tools, read trace or access isolation; contamination limits.
- Saved Stage A path/hash and reveal order; predictions and observed verification results.
- Findings and resolutions, essential retained-comment reasons, source/complexity deltas when
  measured, and commands/results for required behavior checks. LOC is evidence, not a target.
- `READABILITY: PASS | BLOCK | INCOMPLETE` and `BEHAVIOR: PASS | BLOCK | INCOMPLETE`.

Overall approval requires both PASS and the project's other required QA. A changed source,
missing coverage, unverified snapshot, inherited context or early rationale access invalidates
the blind result. Record INCOMPLETE and rerun; ordinary informed review remains useful but
cannot be relabeled blind. No live provider, hosted behavior or CI enforcement is proved merely
by saving a receipt. A review iteration limit leaves the work blocked/incomplete; it never
lowers the acceptance bar. Merge, deployment and production actions keep their own approvals.
