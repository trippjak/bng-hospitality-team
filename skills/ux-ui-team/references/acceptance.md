# Acceptance and visual verification

Before implementation define named checks with route/slide, state, input/action, expected result, environment and evidence path. A count such as 22/22 has no meaning without coverage. Freeze the contract before a comparison; candidates cannot edit authoritative tests.

## Web/application gates

Use the [UI checklist](ui-checklist.md) to select relevant state and interaction checks.
The [bundled audit guidance](bundled-audit.md) describes the existing auditor's narrow scope
and evidence limits. Neither replaces the task-specific contract or the gates below.

| Gate | Evidence |
|---|---|
| Behavior | Critical journeys, links, forms, navigation and preserved IDs/events/data bindings work; mock integrations are labeled |
| States | Applicable loading, empty, error, success, validation and disabled states exercised |
| Responsive | Explicit dimensions, relevant breakpoints, long content and text enlargement; no unintended clipping/overflow |
| Accessibility | Automated checks plus focused keyboard, focus, semantics, labels, contrast and target-size inspection; disclose untested assistive technology |
| Visual | Fresh full-page/detail renders; independent QA checks hierarchy, spacing, grouping, typography, brand and state consistency |
| Engineering | Required build/type/lint/tests, complete 4D, required blind review; scoped performance budget/no-regression evidence |
| Final target | Post-repair checks/renders tied to final source/build; hosted preview verified before claiming hosted success |

Choose sizes from the product/audience and existing checks, not a universal device list. Exercise journeys; IDs alone do not prove buttons work. Automated accessibility scans do not establish comprehensive compliance. Score cosmetic preference separately from reproducible blocking defects.

Include breakpoint-adjacent widths and long labels where wrapping changes layout; a passing device preset can miss overlapping content between presets. Verify added KPI explanations and workflow/status language against source data, not just unchanged numeric values. Put these checks in the agreed contract before implementation; new findings during a frozen comparison are separately disclosed and assessed consistently across arms.

## Headless permission and isolation

The user authorizes isolated headless testing of the designated project preview. Use an automation-owned browser and fresh temporary profile/storage. Never connect to the desktop, personal browser, saved cookies, personal remote-debugging session, unrelated tabs or customer accounts. Never capture the desktop. This does not authorize deployment, new paid services or live transactions.

Before executing untrusted generated sketches, demonstrate execution isolation: no host credentials/personal sessions; filesystem/network restricted to the designated fixture and permitted static assets; no unrelated loopback access. Keep fixtures, tests, other-arm outputs and evaluator records outside candidate write access. A fresh profile, worktree or hash alone is not a security sandbox. If isolation is unavailable, do not execute candidates; report the render gate missing.

For approved project previews, constrain interactions to defined scope/fixtures. Auth, transactions, third-party calls and persistent writes require appropriate test environments. Local success does not establish hosted behavior. Without an authorized hosted preview, finish local work and hold hosted verification; do not deploy to manufacture PASS.

## Sequence and verdict

Capture initial visual/functional results before cleanup, then final results after remediation. QA inspects current pixels; the orchestrator performs final visual confirmation rather than accepting only a summary. Tie renders to source/build IDs and settings. Geometry checks complement visual inspection.

Reject missing, empty or truncated deliverables before rendering. Render to a fresh output location and retain a receipt binding successful capture to the exact source/build and environment. A leftover screenshot from a failed run is not evidence for the current source. Recheck the binding after the final repair and before presenting acceptance.

Hard failures block technical acceptance. Missing evidence is UNVERIFIED; N/A needs a scope reason. Separate implementation complete, acceptance passed and released. One repair cycle; further substantive failures hold pending replan. Style preferences alone do not trigger unlimited redesign.
