=== PROMPT-SPEC v1 ===
task_type:       6 (Agentic / Tool-use — procedural workflow skill)
meta_archetype:  skill-lens
dispatch_shape:  n/a
deploy_target:   skill-reference (~/.claude/skills/ratchet-review)
model_class:     reasoning
inputs_known:    {audience: fresh Claude/Antigravity sessions on Jake's stack (solo operator + agents; prod-deploy-on-main repos; two-machine topology),
                  format: SKILL.md + references/{standards,measure-tools,run-template}.md + evals seeds,
                  success_criteria: resumable cross-session/machine via locked run file; no batch lands without recorded passing proof; 4D deep-module ratchet prevents Goodhart's Law syntactic evacuation; zero sibling-trigger cannibalization (code-review/section-close/team-meeting/improve-codebase-architecture)}
applied:         [task+acceptance criteria, constraints/autonomy bounds, output-format lock (run-template), 6-phase decomposition, 4D deep-module ratchet (cycles, interface depth ratio & maxParams, cognitive complexity, depth-adjusted LOC), two-cadence Tidy First + milestone fitness function workflow, sibling boundary table, anti-patterns, primary-source evidence]
stripped:        [none at tune-time — pre-score flags: 0; authored post-anti-folklore so no persona-for-accuracy/forced-CoT/prefill to strip]
rubric_scores:   {clarity:5, specificity:5, output_format:5, eval_ability:5, robustness:5, interpretability:5, token_efficiency:4.5}
open_risks:      [description-optimizer loop not yet re-run on revision 3]
revision:        3
--- PROMPT BODY ---
(see ../SKILL.md — the skill file is the authoritative body; this spec tracks its loop state)
--- KNOWN FAILURES ---
- Revision 2 failure mode discovered on stronglandscape-visualizer (2026-10-25): when a repo
  operationalized the 400-line batch diff gate and 60-line soft function gate as a 1D binary file/fn
  LOC guillotine (`measure-visualizer-ratchet.mjs --strict`), agents at 395 LOC performed "Syntactic
  Evacuation" — evicting 30-50 lines into neighbor files with 8-12 positional arguments, creating
  circular imports (`spatial-zones.ts` <-> `vision-zones.ts`), and exporting 31 private helpers for
  tests. Revision 3 upgrades Phase 1, Phase 3, Phase 4, `standards.md`, `measure-tools.md`, and
  `run-template.md` to the 4D Deep-Module Ratchet (Ousterhout 2018, Pocock `codebase-design`,
  SonarSource Cognitive Complexity, RepoMirage/CodeCompass 2026).
