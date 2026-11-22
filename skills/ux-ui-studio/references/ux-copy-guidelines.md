# UX/UI Copy & Microcopy Guidelines

Primary-source copywriting rules for the `ux-copywriter` specialist subagent, Mode B authors, and `NVC-CNT-01..04` / `LUX-*` remediation. Cut bloat by **30-50%** without dropping required facts, metrics, units, caveats, or brand voice.

## 1. Core Writing Rules (NN/g, Podmajersky, HIG, Material 3, Polaris, GOV.UK)

- **Purposeful first:** Every heading, subhead, label, badge, and helper note must help the user decide or act right now. If an interface element explains itself visually or via its label, delete the explanatory prose completely.
- **Scannable & front-loaded:** Put the action verb or decisive noun in the first 1-3 words (`Add dashboard`, `Used in issue IDs`). Never lead UI copy with pleasantries or staging phrases (`Welcome to`, `Here you can`, `Click below to`).
- **Sentence case default:** Write labels, buttons, headings, table headers, and toasts in sentence case unless documented `brand-tokens.json` or brand typography specifies uppercase/Title Case.
- **Clear & concrete:** Name real outcomes, units, cohorts, and time windows. Replace empty "marketese" (`Supercharge`, `Seamless`, `Unlock`, `Next-generation`) with plain domain words.
- **Fact, SKU & compliance boundary:** Preserve authentic numbers, currency/time units, denominators (`N = ...`), proper catalog SKU/product/plan names (exempt from `2-4w` card truncation), and brief-requested topics unchanged. Never invent stats or testimonials (`NVC-CNT-01`). Leave `.legal`, `.disclaimer`, and regulatory disclosures untouched for the separate Compliance team (`hands-off`).
- **CTA destination truth:** Match transactional verbs (`Shop`, `Buy`, `Add to bag`) vs exploratory verbs (`Explore`, `View`, `Compare`) to actual target capability; never label an anchor link to a read-only section `"Shop ..."`.

## 2. Hard Component Word Budgets

| UI Component | Word / Line Budget | Required Structure & Cut Rule |
|---|---|---|
| **Nav / Tab / Filter** | `1-2 words` | Concrete noun (`Overview`, `Public`, `Cohorts`); no verbs or punctuation |
| **Eyebrow label** | `0 words` default (`1-3w` max) | Omit on most headings (`NVC-TYP-02`); use only for net-new taxonomy/category |
| **App H1 (Workspace/View)** | `1-5 words` | View or workflow noun (`General`, `Projects`, `Cohort Expansion`); 0 subhead if clear |
| **Marketing Hero H1** | `4-8 words` | Concrete user outcome or product job; no greeting filler |
| **Hero Subhead** | `8-18 words` (1 sentence) | How it works + for whom; zero stacked multi-sentence paragraphs |
| **Section H2** | `2-6 words` + `0w` echoing subhead | Never add a subhead that merely paraphrases the H2 above it |
| **CTA Button** | `1-3 words` (`Verb + Noun`) | Name destination/outcome (`Declare incident`, `Create first board`, `Reset filters`) |
| **Feature / Info Card** | `2-4w` title + `<= 16w` body (1 clause) | Delete redundant body prose when title or control already communicates state |
| **KPI Tile / Metric Box** | `2-3w` label + value + `2-4w` delta | Unit + baseline comparison only (`+$320 vs FY23`); `0 words` narrative paragraph |
| **Table Header / Cell** | `1-2w` header; `-` empty cell | `tabular-nums` alignment; avoid multi-word prose wrapped inside table headers |
| **Form Label + Helper** | `1-3w` label; `0w` default helper (`<= 12w` max) | Put format examples inside select/placeholder; helper text only for constraints or side effects |
| **Empty State** | `2-5w` title + `<= 16w` body + `1-3w` CTA | What is missing + direct first action (`No projects yet` / `+ New project`) |
| **Error Message** | `<= 18 words` (1 inline sentence) | Blame-free: **what failed + exact fix** (`WCAG 3.3.1 / 3.3.3`); never `"Something went wrong"` |
| **Toast / Confirmation** | `2-5 words` | Past-tense confirmed fact emitted **after** async success (`Timezone updated`) |
| **Tooltip / Legend** | `<= 15 words` | Net-new keyboard shortcut, series key, or formula; never repeat visible button text |

## 3. Vibe-Code Copy Deflation (`NVC-CNT-01..04`, `NVC-TYP-02`)

| Vibe-Code Tell | Bloated / AI Default (`Before`) | Distilled Microcopy (`After`) |
|---|---|---|
| Redundant section subhead (`NVC-CNT-03`) | `Workspace Settings / Here you can view and manage your workspace settings below.` | `Workspace settings` (0 subhead words) |
| Directional UI filler (`NVC-CNT-03`) | `Click the button below to create a new project and start collaborating.` | `+ New project` (or `Start a project to organize documents.`) |
| Obvious form helper (`NVC-CNT-03`) | `Timezone: Choose your timezone from the dropdown so your dashboard knows your hours.` | `Timezone` (plus `Used for billing cycles` only if non-obvious) |
| AI buzzwords & cadence (`NVC-CNT-02`) | `Supercharge your analytics. Unlock seamless next-gen insights. No setup. No hassle. Just speed.` | `Live revenue and retention cohorts in under two minutes.` |
| AI tics & em-dashes (`NVC-CNT-04`) | `It's worth noting that \u2014 when enabled \u2014 this seamlessly elevates performance.` | `Applies to new exports after save.` |
| Unbacked proof (`NVC-CNT-01`) | `Trusted by 10,000+ fast-growing teams with 99.9% guaranteed ROI.` | Replace with verified metric + denominator or delete slot cleanly. |

**Purge list (remove unless quoting primary user/brand data):** `supercharge`, `transform your`, `unlock`, `elevate`, `seamless`, `seamlessly`, `next-generation`, `game-changer`, `delve`, `dive into`, `it's worth noting`, `No X. No Y. Just Z.`, `It's not X, it's Y`, `click the button below to`, `here you can`, literal `\u2014` em-dashes, and literal `\u2013` en-dashes.

## 4. Editorial & Merchandising Composition Fit

- **Post-tightening media ratio fit:** Match card or split-feature image aspect ratios (`4:5` portrait vs `3:2` or `16:9` landscape) to post-tightened text height so horizontal feature cards never leave large dead space under 1-2 clause descriptions.
- **Offer price salience & single-slot rule:** Render primary bundle or tier prices larger and heavier than `1rem` body copy (`>= 1.25rem`), and state an offer price tagline once per decision zone rather than repeating it across eyebrow, prose, and CTA.
- **Superordinate section headings:** Keep every section `<h2>` strictly superordinate to every child card or row underneath it (never place packaging, refill, or shipping notes under an `"Actives"` heading).

## 5. Visually Verified Mobbin Microcopy Benchmarks

- [Linear workspace settings](https://mobbin.com/screens/f3134ca3-b7e5-47ab-a283-92ce2db403db) - `General` heading with zero subhead, `Used in issue IDs` (4-word scope hint only where needed).
- [Unify workspace settings](https://mobbin.com/screens/832992d1-1c53-4fee-9936-d5524c0694b8) - Zero helper text beneath self-evident text inputs; 1-2 word actions (`Update`, `Save`, `Cancel`).
- [Toggl Track time settings](https://mobbin.com/screens/b786d87d-311b-44c9-a51e-ba3e8d8fbb20) - Format example placed inside dropdown option `Improved (0:47:06)` instead of external helper prose.
- [Remote empty state](https://mobbin.com/screens/18d70bec-8bea-42a1-b319-e32eff1ea0ba) - 3-word state header (`No clients yet`) paired with one concrete next-step sentence.
- [incident.io active incidents](https://mobbin.com/screens/9e56f5e3-733a-4db1-b575-a1dbc68e9044) - Two-word top actions (`Start tutorial`, `Declare incident`) and scannable status empty state.
- [Plane public dashboards](https://mobbin.com/screens/b768d1ca-46dd-497c-9713-dfe2c9281e3d) - 1-word scope tabs (`Public`, `Private`, `Shared`) and 2-word action (`Add dashboard`).
- [Spellbook projects empty state](https://mobbin.com/screens/230115c0-4df8-4f42-bfcc-1199e004a942) - Minimalist `Projects` / `No projects yet` / `+ New project` hierarchy.
- [Canny portal setup](https://mobbin.com/screens/258b4dc5-b41f-4613-b778-c4fa4ab912b4) - Clear setup blocker state + direct 3-word CTA (`Create first board`).
- [Featurebase timezone update](https://mobbin.com/screens/ed428ce4-fdb1-476e-b53f-69d247fd930a) - 3-word past-tense toast (`Timezone updated successfully`) contrasted against avoidably repeated timezone descriptions.
- [Klaviyo executive dashboard](https://mobbin.com/screens/391490e9-d138-410f-b871-a214fdd30901) - Anti-pattern reference showing how directional `"by clicking below"` filler inflates empty-state copy.
- [1Password Developer Tools hero](https://mobbin.com/sites/sections/84ae4767-03c2-40fd-a88b-d10071d797d8) - Zero eyebrow noise, 6-word H1, 12-word subhead, explicit action CTAs.
- [Frontify developer platform hero](https://mobbin.com/sites/sections/67380933-75aa-40ed-b13c-617db6250c9c) - Tight 5-word H1 paired with 16-word single-sentence capability summary.
