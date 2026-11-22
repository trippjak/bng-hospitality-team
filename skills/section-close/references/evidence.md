# Evidence Base — why section-close v2 works the way it does

Compact rationale for the v2 redesign (2026-06-10). Three sources: local audit of 9 real projects,
industry/GitHub practice survey, academic literature review. Full agent reports live in the
2026-06-10 session transcript; this file keeps only the load-bearing findings.

## Local audit findings (the empirical "why now")

1. **Line thresholds were structurally defeated.** marketing-trackstar HANDOFF: 30KB in 42 lines
   (one 11.6KB line); DECISIONS: 118KB in 74 lines. rocketfuel-rebuild passed every line threshold
   yet cost ~44K tokens to cold-boot. → byte thresholds + 600B max-line rule.
2. **Cold-boot read cost was the hidden token leak**: 44–51K tokens on the top three projects to
   load coordination context — 1.5–2× the whole section-close budget. → two-tier read model.
3. **HANDOFF role collapse**: "Prior `hash` — D-NNN…" chains (15 in marketing-trackstar) and
   D-NNN breadcrumb trails (92–123 refs) turned snapshots into logs. → Prior-chain = 0, D-NNN ≤ 20.
4. **The archive workflow works where exercised** (rocketfuel-rebuild: 31 archive files, multiple
   dated DECISIONS snapshots) — kept intact, now triggered by bytes.
5. **Per-project overrides were never created** under the skill dir. → profile now lives co-located
   in the project (`coordination/PROCESS.md`), per the co-location evidence below.

## Strongest external evidence (one line each + source)

- **Structured severity-first handoffs cut errors ~23–30% at zero added time** — I-PASS, 9-hospital
  NEJM study (Starmer et al. 2014). → HANDOFF ordering: blockers first.
- **Models recall the middle of long files at <40% vs >90% at the edges** — "Lost in the Middle"
  (Liu et al., TACL 2023). → most load-bearing content at the top of every file.
- **Receiver read-back substantially improves transfer accuracy** — Lardner, HSE shift-handover
  research (1996/1999); shift changeovers are <5% of time but ~40% of plant incidents. → the
  "On resume: state your understanding first" block in HANDOFF.
- **Explicit externalization beats letting compaction summarize: 93.4% vs 35.3% recall** — MemGPT
  (Packer et al. 2023). → the ceremony must run BEFORE compaction; compaction is not the ceremony.
- **Verbal self-reflection alone: +11pp on HumanEval** — Reflexion (Shinn et al., NeurIPS 2023);
  reflection ablation degrades agents (Generative Agents, Park et al. 2023). → mandatory
  "what changed in understanding / what failed" paragraph in HANDOFF.
- **Structured linked notes ≈ 87% fewer tokens than raw dumps at better recall** — A-MEM
  (Xu et al., NeurIPS 2025). → pointers-not-content; tiered always-read vs on-demand files.
- **Single shared handoff file without size discipline → 122KB + 80% merge conflicts, forced
  read-only** — rjmurillo/ai-agents production case. → hard machine-enforced caps (doclint).
- **Markdown plans cause the "dementia cascade" (agents re-plan planned work) unless status is
  machine-queryable** — Yegge, Beads. → `Status:` on the fixed line after every `## D-NNN` heading;
  grep, don't read.
- **Supersede, never delete; bi-temporal decision history improves temporal reasoning ~+38%** —
  Zep (2025) + MADR status lifecycle. → `supersedes:` field; append-only DECISIONS.
- **Docs distant from the work decay; co-located docs get used** — Lethbridge/Singer/Forward
  (IEEE Software 2003); ~29% of doc references describe code that no longer exists (ESE 2024).
  → log decisions at decision time (close validates, doesn't originate); project profile lives in
  the repo, not the skill dir.
- **Checklists work at pause points with <10 killer items, Do-Confirm style** — WHO surgical
  checklist, >36% complication reduction (Haynes et al., NEJM 2009). → the close checklist stays
  at 6 steps; if it balloons, it's a team-meeting, not a section-close.
- **Recitation: push current objective to the END of context right before compaction** — Manus
  context-engineering (2025). → step 5 snapshot is deliberately the last substantive output before
  the user compacts.
- **Cache/file hygiene: keep errors in context during the session; clean only resolved ones** —
  Manus. → cleanup pass never sanitizes the failure record of the live session.

## Calibration notes

- The "23-minute interruption recovery" figure is folklore (interview claim, not in the
  peer-reviewed paper) — don't cite it. The peer-reviewed finding: 93% of resumptions require
  exploratory navigation first (Parnin & Rugaber 2011) — hence HANDOFF §3 "re-entry map".
- I-PASS/checklist effect sizes are from human safety-critical domains; transfer to agent sessions
  is analogical, not measured. Direction is well-supported; magnitudes are not.
- No published head-to-head of structured vs unstructured LLM agent handoff files exists yet
  (as of 2026-06). The local audit numbers are our own ground truth — keep watching them.
