---
name: ux-ui-studio
description: Run UX/UI Studio workflows alongside ux-ui-team using subscription Model Seats, Paper Canvas Coarse-Sync, Figma Canvas, Recraft Asset Studio, isolated Playwright and Chrome DevTools Verification Rigs, Cloudflare Staging Previews, or Basic Memory rulings. Trigger for multi-model UI creation or redesigns, CLI seat dispatch, Recraft vector or style pipelines, isolated visual verification, or Cloudflare UX staging rollouts.
---

# UX/UI Studio

Build and ship interfaces alongside `ux-ui-team` using subscription **Model Seats**, visual canvases, **Asset Studio**, one Host-run **Verification Rig**, and orthogonal **Gate Subagents** (`no-vibe-code` and `ux-ui-qa`) without mutating `~/code/my-skills`.

## Workforce and Gate Boundaries

| Role / Channel | Responsibility | Never owns |
|---|---|---|
| **Specialist Role** (`ux-ui-team` + `ux-copywriter`) | One lead writer builds/repairs UI. Astra leads [UI Ratchet](../ui-ratchet/SKILL.md) repairs; `ux-copywriter` tightens bloated UI microcopy, states, and labels per [UX copy guidelines](references/ux-copy-guidelines.md) | Self-approving QA |
| **UI Ratchet + Classifier Evidence** | Deterministic AST/CSS/DOM measurements (`0` LLM tokens) producing one shared Evidence Packet | Context or brand intent judgment |
| **`no-vibe-code` Gate Subagent** | Brand intent and anti-default craft (`NVC-*`, `S1..S4`, brand-token intent exceptions); logs `NVC-HO-LUX` / `NVC-HO-A11Y` (`0` pts) | Laws of UX math, contrast, or final functional QA |
| **`ux-ui-qa` Gate Subagent** | Ergonomics, WCAG 2.2 AA, WAI-ARIA/SVG-AAM, Cleveland-McGill data-viz, and `UI-01..UI-35` (`LUX-*`, `P0..P2`) | Re-scoring aesthetic tells or adding unrequested columns |
| **Model Seat** (`antigravity-native`, `codex-cli`, `claude-cli`) | Subscription-strict execution channel (`invoke_subagent` natively or `seat-dispatch.mjs --gate` / `--agent` externally) | A separate third reviewer taxonomy |
| **Veto Lens** (`Compass`, `Iris`, `Atlas` via `team-meeting`) | Site-wide landmark cutovers (new route launch, domain flip, sprint close) | Per-screen UX/UI build loops |

## Mode A: Quick Gate & Copy Audit (Anytime Single Pass)

Run either **Gate Subagent** standalone (`pass_type: single`) or `ux-copywriter` (`mode: audit|tighten`) without triggering the 4-stage studio loop:
- **Native host subagent**: `invoke_subagent(TypeName="no-vibe-code" | "ux-ui-qa" | "ux-copywriter", Role="...", Prompt="Run pass_type: single (or mode: audit|tighten) on <project_id>/<brand_name> targeting <url|dir|screenshots>...")`
- **External CLI Model Seat**: `node scripts/seat-dispatch.mjs --seat <codex-cli|claude-cli> (--gate <no-vibe-code|ux-ui-qa> | --agent ux-copywriter) (--target <dir> | --evidence-file <packet.json>) [--brand-tokens <json>] --image desktop.png --image mobile.png`

When called standalone without a pre-computed Evidence Packet, the invoked subagent runs `measure-ui-ratchet.mjs` (and Playwright `dom-probe.mjs` for `Gate Subagents`) itself.

## Mode B: Studio Visual Loop (4 Stages)

The **Agent Host** orchestrates all dispatch, browser collection, handoff reconciliation, repair batching, and release gates; **Gate Subagents** return findings without dispatching one another.

### Stage 1: Lock (Preflight, Tokens & Baseline)
1. Run `node scripts/studio-preflight.mjs` (relative to this skill directory) to verify live **Model Seats**, binaries, and MCP servers without logging secrets.
2. Load `ux-ui-team` for **Specialist Role** staffing and acceptance contracts; read [knowledge and rulings](references/knowledge-and-rulings.md) for `basic-memory` brand ontologies or Notion specs.
3. On redesigns/revisions of existing UI, run `no-vibe-code` (`pass_type: initial`) to pin `{project_id}-{tell_id}-{nn}` baseline IDs.
4. Lock one visual direction (2 options for new interfaces/redesigns unless pre-approved), Mobbin/[dashboard data-viz](references/dashboard-data-viz.md) references, explicit brand tokens (palette, type, radius, shadow), and [recraft assets](references/recraft-assets.md) (`recraftv4_vector` / `style_id`).
5. **Exit criterion:** Preflight JSON, clean git status, locked brand tokens, and assets (plus `initial` baseline when redesigning) recorded before coding.

### Stage 2: Build & Measure (Code + Host Evidence Packet)
1. Explore optional pre-code layouts in **Paper Canvas** (`paper-canvas` skill / [paper coarse-sync](references/paper-coarse-sync.md)) within `<= 5` calls/screen only when comparing competing directions; use **Figma Canvas** for shared design-system governance.
2. Implement clean multi-module UI code (`index.html`, `style.css`, `app.js`, cohesive ES modules) governed by `ui-ratchet`, [dashboard data-viz](references/dashboard-data-viz.md), and [UX copy guidelines](references/ux-copy-guidelines.md) (optionally run `ux-copywriter` in `tighten` mode on prose-heavy or multi-screen copy before measuring).
3. **Host runs the Verification Rig once** (single browser owner, zero tab contention):
   - Execute `node ../ui-ratchet/scripts/measure-ui-ratchet.mjs <dir> --out evidence.json [--brand-tokens <json>]` and clear any mechanical static violations immediately.
   - Run Playwright `dom-probe.mjs` across `1440px`, `1024px`, `768px`, and `390px` (plus `320px` reflow on text-heavy pages), exercise applicable interactive/keyboard states (`UI-01..UI-35`), capture full-page `desktop.png` (`1440x900`) and `mobile.png` (`390x844`), and assemble one **Evidence Packet** (`revision`, `viewports`, `states`, `evidence.json`, `dom-probe` output, `desktop.png`, `mobile.png`).
4. **Exit criterion:** Host holds one complete **Evidence Packet** with `0` mechanical static/DOM clipping failures.

### Stage 3: Judge & Repair Once (Parallel Gate Subagents -> One Batch)
1. Feed the shared **Evidence Packet** in parallel to:
   - `no-vibe-code` (`pass_type: final` on redesigns or `single` on greenfield builds) for brand intent, unexamined defaults, and second-wave tells (`NVC-COL-07`, `NVC-TYP-02`, `NVC-CMP-02`, `NVC-TYP-03`); and
   - `ux-ui-qa` (`pass_type: final`) for Laws of UX, WCAG 2.2 AA, WAI-ARIA, data-viz integrity, and `UI-01..UI-35` (invoked natively via `invoke_subagent` or cross-model via `seat-dispatch.mjs --seat codex-cli --gate ux-ui-qa --evidence-file packet.json --image desktop.png --image mobile.png` per [seat routing](references/seat-routing.md)).
2. Neither subagent re-runs `measure-ui-ratchet.mjs` or Playwright; `ux-ui-qa` holds sole blocking scoring for `NVC-INT-01`, `NVC-INT-02`, and `NVC-INT-04`, while `no-vibe-code` returns `0`-pt `NVC-HO-*` handoffs to the Host.
3. The Host reconciles both reports (including any late `NVC-HO-LUX`, `NVC-HO-A11Y`, or `NVC-HO-COPY` items) and routes **all `P0`/`P1` findings plus all open NVC items needed to clear `FIX`** (using `ux-copywriter` in `tighten` mode for copy-density/microcopy fixes alongside UI engineering fixes) into **one** bounded repair batch.
4. After the single repair batch, the Host refreshes the **Evidence Packet** (`measure-ui-ratchet.mjs`, `dom-probe.mjs`, `desktop.png`, `mobile.png`) and runs one verification-only confirm pass on `no-vibe-code` and `ux-ui-qa`. If either remains `FIX`, **stop and hold for explicit operator replan**.
5. **Exit criterion:** Static + DOM probes report `0` violations, both `Gate Subagents` confirm `PASS`, and final pixels match source.

### Stage 4: Preview (Cloudflare Staging Sign-Off)
1. Deploy to isolated Cloudflare **Staging Preview** (`node scripts/cf-preview.mjs preview --cwd <dir> --env staging`) per [verification and preview](references/verification-and-preview.md).
2. The Host opens the returned **Staging Preview** URL in the isolated **Verification Rig** (`playwright` MCP), confirms zero console/asset errors and current revision match, and captures a fresh full-page screenshot.
3. Present the **Staging Preview** URL and hosted screenshot to the operator for approval before wiring public navigation or merging to `main`, then persist reusable `D-NNN` **Rulings** per [knowledge and rulings](references/knowledge-and-rulings.md).
4. **Exit criterion:** Hosted preview matches final source revision, limitation/seat metadata is logged, and public nav/merge remains operator-gated.

## Reference Routing

| Branch condition | Disclosed reference |
|---|---|
| Running a standalone or paired **Vibe-Code Tell** gate | [No-Vibe-Code Gate Subagent](../../agents/no-vibe-code.md) |
| Running a standalone or final Laws of UX, WCAG 2.2 AA, and `UI-01..UI-35` gate | [UX/UI QA Gate Subagent](../../agents/ux-ui-qa.md) |
| Auditing or tightening UI copy, microcopy, states, and word budgets | [UX Copywriter Specialist Subagent](../../agents/ux-copywriter.md), [UX copy guidelines](references/ux-copy-guidelines.md) |
| Governing 5D static/DOM checks, Laws of UX, and **Classifier Evidence** | [UI Ratchet](../ui-ratchet/SKILL.md) |
| Designing analytics dashboards, KPI strips, charts, or dense tables | [Dashboard data-viz](references/dashboard-data-viz.md) |
| Routing `antigravity-native`, `codex-cli`, or `claude-cli` **Model Seats** (`--gate`) | [Seat routing](references/seat-routing.md) |
| Exploring pre-code layouts on **Paper Canvas** within the 100/week Free cap | [Paper coarse-sync](references/paper-coarse-sync.md) |
| Generating Recraft V4/V4.1 styles, vectors, or batch REST assets | [Recraft assets](references/recraft-assets.md) |
| Running isolated Playwright, Chrome DevTools CWV/a11y, or Cloudflare **Staging Previews** | [Verification and preview](references/verification-and-preview.md) |
| Querying/updating `basic-memory` ontologies, Notion specs, or Doc-system v3 `D-NNN` **Rulings** | [Knowledge and rulings](references/knowledge-and-rulings.md) |
