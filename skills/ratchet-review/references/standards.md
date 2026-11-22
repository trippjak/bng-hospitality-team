# Size & Depth Gates + Primary-Source Evidence (Portable Defaults)

A project-local `docs/CODE-REVIEW-STANDARDS.md` overrides this file. These are the defaults
a `ratchet-review` run applies when the project has none.

## 1 · Per-Category Review-Batch Gates (Diff Size per Commit)

Review cost scales with **decision density**, not raw file lines. (Measured on the reference
project: only ~15% of hand-written `src/**/*.ts` was logic; the rest was CSS-in-TS, markup,
and marketing copy.)

| Category | Gate per reviewed batch (DIFF size) | Why |
|---|---|---|
| Logic (`lib`, middleware, scripts, chat) | ≤ ~400 **changed lines per batch** (prefer ≤ 200) | SmartBear/Cisco defect-density curve on review diffs |
| CSS section files | ≤ ~750 source lines per FILE; split by page-domain beyond that | Navigability — a reviewable diff needs a reviewable file |
| Routes / copy / components | No hard line cap; one page or feature per batch | Declarative, low decision density; Google "one self-contained change" |
| Mechanical sweeps | Any size IFF idempotent committed script + verified 0-residual | Google generated-change carve-out; review the generator |
| Generated files | Never reviewed line-by-line | Review the generator |

---

## 2 · The 4D Deep-Module Ratchet for TypeScript / Logic Modules

Treating `400 LOC/file` and `60 LOC/function` as a 1D binary guillotine triggers **Goodhart's Law**:
agents and developers evade the line cap via **Syntactic Evacuation** — chopping a cohesive module
into shallow fragments connected by 8–12 positional parameters, circular imports, and 25+ exported
private helpers. Instead, evaluate TypeScript / logic modules across **four orthogonal dimensions**:

| Dimension | Metric | Target / Hard Gate | Architectural Meaning |
|---|---|---|---|
| **1. Seam & Graph Hygiene** | **Circular Imports (`cycles`)** | **`0` cycles (Hard Gate)** | Modules form a strict DAG; domain/planner modules never import upward from HTTP routes or vendor transport adapters (`codebase-design`, Pocock `setup-ts-deep-modules`). |
| **2. Interface Width & Depth** | **Max Function Parameters (`maxParams`)**<br>**Module Depth Ratio (`LOC / runtimeExports`)** | **`<= 5` params** (prefer `<= 4` via Value Objects / options bags)<br>**Depth Ratio `>= 25` LOC/export** on logic modules (or hold/improve vs. baseline) | Prevents 8–12-arg positional trampolines (`Primitive Obsession`); rewards **deep modules** (rich implementation hidden behind 1–5 public entry points; Ousterhout 2018). |
| **3. Cognitive & Narrative Complexity** | **Cognitive Complexity (`cog`)**<br>**Function Length (`fnLines`)** | **`cog <= 15` target** (`<= 25` hard gate)<br>**`<= 60` LOC soft**; up to **`80` LOC** allowed when `cog <= 15` and `params <= 4` | Distinguishes a flat, readable 70-line linear pipeline from a deeply nested 45-line tangler (Campbell / SonarSource 2023; NASA P10 Rule 4 soft). |
| **4. Depth-Adjusted File Size** | **Source Lines (`fileLines`)** | **`<= 400` LOC standard**; up to **`500` LOC Deep-Module Allowance** when `cycles === 0`, `runtimeExports <= 5`, and `0` functions exceed `cog`/`params` caps | Rewards keeping a cohesive domain concept in **one deep module** rather than evicting 40 lines into a shallow neighbor file (*RepoMirage* / *CodeCompass* 2026). |

---

## 3 · Primary-Source Evidence (Verified 2026-10-25)

- **SmartBear/Cisco study** (2006; 2,500 reviews, 3.2M LOC, 50 devs): defect detection strong
  under 200 LOC *per review sitting*, degrades after, "almost zero after 400"; inspect < 500 LOC/hour;
  sessions ≤ 60-90 min. Governs **review batch diff size**, not arbitrary file-splitting.
  `smartbear.com/learn/code-review/best-practices-for-peer-code-review/`
- **"NASA's 400-line PR rule" is a misattribution.** NASA/JPL's documented rule is
  function-level: Power of 10 (Holzmann, 2006), rule 4 — no function longer than ~60 lines
  (one printed page), for safety-critical C. Treated as a **soft** signal paired with cognitive
  complexity in TypeScript. `spinroot.com/p10/`
- **John Ousterhout, *A Philosophy of Software Design* (2018) & Matt Pocock (`codebase-design` /
  `setup-ts-deep-modules`):** the fundamental weapon against complexity is **module depth**
  (a lot of functionality behind a simple, narrow interface). Splitting functions or files to hit
  arbitrary length targets creates **shallow modules**, **conjoined methods**, and **pass-through
  parameter lists** that multiply cognitive load across callers.
- **SonarSource Cognitive Complexity (G. Ann Campbell, 2023) & CodeScene Code Health (Tornhill):**
  raw LOC predicts 90% of McCabe Cyclomatic Complexity variance (Jay et al., 2009), whereas
  **Cognitive Complexity** (nesting depth + control-flow interruptions), **Excess Number of
   Function Arguments (`> 4-5` params)**, and **Low Cohesion (`LCOM4`)** directly predict defect
  risk and maintenance cost.
- **Agentic Navigation Paradox (*CodeCompass*, `arXiv:2602.20048`, Feb 2026; *RepoMirage*,
  `arXiv:2605.26177`, May 2026; *RepoGraph*, `arXiv:2410.14684`):** on SWE-Bench Verified,
  fragmenting cohesive domain logic across multiple shallow files with hidden cross-file
  dependencies causes **Exploration Drift**, dropping LLM agent resolution accuracy from **66.8%
  to 25.3%** even with 1M-token context windows. Keeping 1 domain concept in 1 deep module with
  explicit Port/Value-Object seams maximizes both human and AI navigability.
- **Kent Beck (*Tidy First?*, 2023) & Martin Fowler (*Preparatory Refactoring*):** wear one hat at
  a time ("make the change easy, then make the easy change"). Combine per-commit 4D constraints
  with periodic **Architectural Fitness Function** passes (`improve-codebase-architecture`, Ford
  et al. *Building Evolutionary Architectures*).
- **Google eng-practices & Wallace CSS guidance:** ~100-200 line CLs are ideal; lint the shipped
  CSS bundle (`@projectwallace/css-analyzer`), not raw source strings alone.

---

## 4 · Ratchet Semantics

Gate on **deltas against the pinned baseline**, never on gaming a single number at the expense of
another dimension. Success = every tracked dimension (**Cycles**, **Interface Width / Params**,
**Depth Ratio**, **Cognitive Complexity**, and **Depth-Adjusted Size**) held or improved. A file
split that reduces file LOC from 410 to 260 by introducing a circular import or an 11-parameter
trampoline is a **FAILED ratchet**. Tolerances must be declared in the run file BEFORE the batch
that needs them, not after.
