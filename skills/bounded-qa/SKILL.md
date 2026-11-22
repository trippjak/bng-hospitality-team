---
name: bounded-qa
description: >-
  Select review scope and stopping rules for code changes and governing-policy edits.
  Use before dispatching reviewers or running a closing ceremony. Ordinary questions,
  read-only status checks, editorial fixes and small changes need no review dispatch.
---

# Bounded QA

Jake approved this shared policy on 2026-09-09 to reduce redundant review and usage. It owns
review intensity; blind-code-review owns source preparation and comprehension, project checks
own mechanical acceptance, and release rules own merge/deployment authority. Prior art: the
Brand Workshop PR #342 pilot, CF LOOP's risk tiers, and the existing blind Stage A/B protocol.

## Scope and precedence

Apply to Jake's personally owned projects and shared harness work. Establish ownership from
the project context; a GitHub username alone is insufficient. Client work retains its own
rules. Held projects, including launch-uk, stay excluded from inspection and changes.

This explicit user-approved amendment supersedes older generic instructions that demand
multiple review seats, a different model, an external panel or a section-close for every
change, every app-class unit, or merely because execution is unattended. Persona names are
lenses, not required dispatches. It does not waive a named task's explicit review request,
specific risk/contract acceptance check, required CI, proof obligation, hold or release rule.
If an apparent conflict concerns a specific safeguard rather than generic ceremony, preserve
it and resolve only that conflict. Do not silently reclassify a repository or lower its care tier.

## Select before editing

Record the class, affected behavior, acceptance checks and reviewer count in the normal claim
or receipt. No separate planning artifact for a small unit.

| Class | Examples | Work required |
|---|---|---|
| Editorial | Typo, formatting, ordinary documentation; no governing-rule or executable change | Author diff check and relevant document validation. No reviewer, new tests or app sweep solely for prose. Required CI remains. |
| Small | At most 50 changed handwritten lines (generated files and lockfiles excluded), impact understood, callers checked, no exported API change; touches none of auth/sessions/permissions, money, any security control (headers/CSP, CORS, CSRF, input validation, rate limiting), secrets, personal/customer data, persistence or migrations, production data, dependencies/lockfiles, deploy/CI config, agent/harness config or shared contracts. If in doubt, not Small. | Author self-check and the repo's pinned check, then a concise receipt. No reviewer dispatch. Required CI remains. |
| Bounded | A UI/behavior fix too large for Small, with bounded callers and no changed security, persistence or shared contract | One fresh reviewer: blind Stage A, then Stage B covering requirements and relevant engineering/UI/consistency lenses. Focused checks during development and one final required mechanical sweep. |
| Elevated | Auth, money, security, persistence, migrations, shared contracts, structural redesign or uncertain impact | Primary blind reviewer for code plus specialists only for named risks not adequately covered. Define integration/negative checks and any external panel before dispatch. |
| Milestone | Launch, cutover or cross-domain structural release | Applicable integrated/hosted checks and scoped milestone review; preserve release approvals. |

Classify by impact, not LOC or repository class alone; Small needs both low impact and the size limit, and size never downgrades an impact-based class. A one-line auth change is elevated;
an isolated label fix in an app can be bounded after checking callers. Mixed changes take
the highest class. Governing-policy prose takes at least bounded informed review; no blind
code preparation or mutations are needed when there is no code. Unresolved impact is elevated.

## Execute once, reuse honestly

- One primary reviewer can satisfy blind comprehension and informed requirements review:
  save Stage A before reveal, then Stage B. Do not add an inner review just to rename that work.
  Fresh context is required; a different model is not required solely for bounded work.
- Run focused checks while editing. Run the project's final mechanical sweep once; if its QA
  wrapper includes the full gates, do not run both consecutively. Keep required final-head CI.
  Existing mutation runners and required coverage remain unchanged. Do not add tests that
  merely assert an ordinary prose edit exists; new guards still require red/green evidence.
- Reuse evidence only after verifying unchanged source, tests, dependencies, configuration and
  relevant environment. Receipt-only edits do not invalidate source review. Record original
  evidence identity and current applicability; a changed SHA alone is not proof of invalidation
  or validity. Required final-head CI still runs. After compaction, reread current state/plan and
  run the pinned baseline check; that does not request another panel or full QA sweep by itself.
- Substantive code repairs require a new fresh blind reviewer and Stage A. Retest affected
  behavior and rerun required final checks. Preserve prior failed evidence; never relabel it PASS.
- Allow one repair-and-verification cycle. Further substantive defects mean pause the affected
  unit with a concrete blocker or explicitly reclassify/replan. A budget/round limit never
  creates PASS. Do not restart the same loop under a different reviewer name.
- Verify findings against concrete failure scenarios. Keep inherited issues separate unless
  they prevent this result or expose a necessary safety blocker. Reopen settled product rulings
  only with new evidence. Do not expand a fix to satisfy reviewer taste.
- Extra reviewers or external panels need a named unresolved risk, a specific acceptance rule
  or an explicit user request. Export permission is not a duty to export. Do not call paid
  providers just to validate this policy. Pending automated advisory jobs alone do not block
  presenting results; triage concrete findings already available before recommending merge.
- Stop when scoped acceptance and required review pass. One concise receipt links necessary
  evidence; batch receipt/coordination updates. Small-change completion needs no section-close
  or team-meeting. At a real section close, reuse completed review for unchanged scope; a new
  specialist needs a named uncovered risk. No mandatory token target, fan-out or new decision
  record merely because a unit ended. Record real project decisions through the existing ledger.

Measure a small prospective sample using existing task timestamps: reviewers, rounds, full
sweeps, QA time and verified/escaped defects. Enroll at initial classification and retain blocked,
reclassified and abandoned outcomes. Unknown is not zero; waiting/overlap must be disclosed.
No automatic monitoring job and no measured usage-saving claim without observed evidence.
