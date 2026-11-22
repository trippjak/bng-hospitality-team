# Milestone Triggers — When to invoke team-meeting

The protocol is designed for landmark moments where multiple specialist lenses produce more value than a single agent dispatch. Use this list as a gate.

## Strong triggers — fire the protocol

### 1. Page launch / new section ships

A new route or major page section is about to land in main. The change crosses multiple domains by definition — design (Iris), perf budget (Compass), implementation pattern (Atlas).

**Example:** New `/pricing` page added with 3-tier card grid, new pricing schema, new mobile carousel. → invoke. Compass on the schema + LCP, Iris on three-viewport + voice on tier copy, Atlas on the carousel implementation pattern.

### 2. Sprint close / phase boundary

End of a defined work cycle. Captures drift before it compounds into the next sprint.

**Example:** Sprint 2 closing with 11 commits across hero rebuild, mega-menu, integrations orbit, customer voices. → invoke. Each lead audits their domain across the sprint's changes; conductor synthesizes a single sprint-retro decision.

### 3. Pre-cutover (custom-domain flip, prod toggle, lifting noindex)

The site is about to transition from preview / build-phase to production. Hardcoded URLs, robots.txt, schema canonical fields, secrets bindings all become load-bearing.

**Example:** Cutover from `*.workers.dev` to `rocketfuelrecharge.com` queued. → invoke. Compass leads on hardcoded-URL audit and schema canonical sweep, Atlas on secrets / bindings / wrangler routes, Iris on visual regression check on production-mode features (banners, analytics beacons, etc.).

### 4. Post-major-refactor

A structural change touched 5+ files, moved a contract (URL structure, schema, token), or rewrote a system.

The bar: would a "before vs. after" diff confuse a future-Jake who hadn't been in the conversation? If yes, audit. If the diff is obvious (a typo, a CSS tweak), skip.

**Example:** `styles.ts` split from one 2,900-line file into tokens / base / nav / home / pillar concatenated at build. → invoke. The refactor itself is mechanical; the audit is about whether the new shape is durable.

**Counter-example:** Convergence-diagram SVG markup extracted from `home.ts` into `convergence-diagram.ts` (rocketfuel-rebuild D-091). One file boundary moved, 95 lines repositioned, DOM output verified identical. → SKIP. That's housekeeping; a single Read + verify is enough.

### 5. Pre-launch comprehensive audit

Last call before lifting noindex / going live. The protocol catches the cross-domain things that escaped the daily flow.

**Example:** Soft-launch property going public next week, all checklists ticked, but no synthesis-level review yet. → invoke. This is the "is the site actually launchable" milestone. Each lead gives a launch readiness verdict; conductor synthesizes a go / no-go.

### 6. Structural decision pending

Any change that warrants a `[STRUCTURAL]` tag in the project decision log (architecture pivot, IA / brand change, contract amendment, replacing a system).

**Example:** Pivoting from D1 to Supabase for a content table. → invoke. Compass evaluates indexability and `<lastmod>` freshness implications, Atlas evaluates migration discipline + RLS + service-role exposure, Iris evaluates downstream template impact.

**Example:** Replacing a CMS or other cross-cutting dependency. → invoke. Each lead evaluates the cost in their domain.

### 7. Cross-domain conflict already in conversation

The conductor is already noticing two specialist lenses disagreeing in conversation, and a synthesis decision is being delayed. Formalize it.

**Example:** Designer wants a video hero; perf consult flags 4MB budget. Conversation is going in circles. → invoke for formal Compass / Iris synthesis with Atlas on implementation feasibility (lazy-load on scroll, click-to-play, etc.).

## Weak triggers — consider, don't auto-fire

- A copy refresh on a single page — usually a single specialist (Iris alone, or `seo-writer` alone) is enough
- A token recolor across the site — Iris + maybe a quick Compass contrast check
- Adding a single dependency under 30KB gzip — Atlas alone
- Adding a single test — single-domain, no synthesis needed
- A new image asset — Iris alone, unless it's a hero image (then Compass for LCP)

If you're tempted to invoke the protocol for one of these, ask: would three lenses surface meaningfully different findings, or am I just performing thoroughness? The latter is ceremony tax — don't pay it.

## Anti-triggers — do not invoke

- **Typo fix** — a single agent (or no agent) is enough
- **Tactical CSS tweak** — change a margin, ship it
- **Single-domain bug fix** — `debugger` agent is enough
- **"Quick check"** — that's a single specialist agent dispatch, not a team meeting
- **Routine commit** — daily commits that touch one component file with no contract impact don't need three lenses
- **Already-decided changes** — if a `D-NNN` decision is already ratified, don't invoke a team-meeting to second-guess it. New evidence → propose a superseding decision instead, don't re-litigate via ceremony

## Decision tree

```
Question 1: Does the change touch 2+ specialist domains?
  ├── No  → don't invoke. Use a single specialist agent or no agent.
  └── Yes → continue

Question 2: Is the answer ambiguous? Are there real tradeoffs to surface?
  ├── No  → don't invoke. The answer is clear; just do it.
  └── Yes → continue

Question 3: Is this a milestone (per the strong triggers above)?
  ├── No  → consider deferring; bundle with the next milestone audit.
  └── Yes → invoke the protocol.
```

If you're at "Yes" three times, the protocol earns its tokens. If not, save the ceremony for when it matters.

## Frequency target

For a single project running at typical pace (a sprint per week or two):
- 2–4 team meetings per sprint
- 1 pre-launch comprehensive audit
- 1 cutover audit
- 0–2 ad-hoc conflict-synthesis meetings

If a project is firing the skill 10× per sprint, the threshold is too low and the meetings are devaluing themselves. If a project is firing it 0× per sprint, either nothing structural is happening (fine) or the conductor is missing the triggers (not fine — review the strong-trigger list).

## How to start a meeting from a user prompt

The user might say things like:

- "Let's audit the home page"
- "Run a team review on /pricing"
- "Pre-launch check"
- "Get me the team's read on this refactor"
- "I want a synthesis review before cutover"
- "Hold a team meeting on whether to add Supabase"

Each of these maps to a milestone trigger. Confirm the trigger explicitly back to the user when the protocol fires:

> "Invoking team-meeting — pre-cutover trigger. Compass on hardcoded URLs and schema canonicals, Iris on visual regression in production-mode toggles, Atlas on secrets/bindings/wrangler routes. Reading project context first."

That confirmation makes the audit visible and lets the user redirect the framing before the dispatch happens.
