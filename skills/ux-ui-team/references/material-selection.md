# Materials and coherent expression

Explore styles against the audience, task, brand and platform. Names are a vocabulary,
not an exhaustive taxonomy or implementation quota; some describe composition/illustration.
A quiet base with an accent and an explicitly maximalist direction can both fit a brief.
Evaluate emerging names by the same criteria.

| Family / possible role | Risk → safeguard |
|---|---|
| Flat/minimal, Swiss/editorial / reading, dense tasks | Weak affordances, generic grids → explicit states and content hierarchy |
| Material/Fluent / familiar elevation | Mixed systems, arbitrary shadows → consistent elevation and interaction grammar |
| Skeuomorphism / physical-domain metaphor | False affordances, visual weight → native behavior and readable labels |
| Neumorphism/soft UI / tactile accent | Ambiguous boundaries/states → outlines, fills, symbols and visible focus beyond shadows |
| Glassmorphism / layering, bounded overlays/navigation | Backdrop-dependent contrast → validate supported backgrounds and opaque fallback |
| Liquid/refractive glass / expressive chrome, showcase | Distortion, moving contrast, rendering cost → stable essential content, measured rendering and fallback |
| Claymorphism / playful objects, onboarding | Inflated geometry competes with content → legible text and usable control geometry/targets |
| Neu/neo-brutalism / graphic identity | Aggressive weight → clear grouping, focus and semantics |
| Paper/e-ink/texture / reading, craft | Texture reduces legibility → separate text surfaces from decoration |
| 3D/spatial/hyperreal / product or spatial explanation | Occlusion, weight, unfamiliar controls → accessible alternatives and bounded rendering |
| Aurora/mesh/iridescence/chrome / ambient accent | Competing focal points, unstable contrast → bound effects and isolate essential text |
| Organic/biomorphic / subject-specific rhythm | Unclear grouping, irregular hit areas → preserve layout logic and usable controls |

For candidates record adopt/restrict/reject, surface, user benefit, token family, states,
fallback and verification plan. Reject with a brief reason, not a compulsory prototype.
Implement compatible selected treatments; style names earn no exception from acceptance.

## Specify once, verify in context

Use semantic tokens/component variants for surface roles, opacity, border, elevation, radius,
light direction, texture, type and motion; state where accents belong. Map Figma variables/
styles to code tokens where supported and record gaps. Avoid incompatible per-card lighting.
Preserve semantic colors/states across materials/themes, and scanning/comparison/data accuracy
in task-heavy views.

- Measure actual background/state combinations: WCAG 2.2 AA normal text 4.5:1, qualifying
  large text 3:1, applicable required non-text visual information 3:1, with criterion exceptions.
  A palette swatch cannot certify translucent surfaces.
- Check keyboard access, visible/unobscured focus, names, semantic controls and distinct
  selected/pressed/disabled states. Shadows/color alone cannot communicate state.
- Apply the actual target-size contract: WCAG 2.2 AA 24 by 24 CSS px or qualifying exception;
  enhanced 44 by 44 and stricter project/platform targets are separate requirements.
- Inspect narrow/breakpoint-adjacent widths, zoom, long text, supported themes, relevant forced
  colors and motion/transparency preferences or explicit fallbacks. Feature-detect optional
  CSS; fallback must retain essential content/feedback. Print/export needs solid treatments.
- Profile blur, filters, shadows, animated texture and 3D on representative hardware against
  project budgets/baselines. Style labels guarantee no performance; distinguish lab from field evidence.

[Acceptance](acceptance.md) and [4D execution](4d-execution.md) govern verification.
These design checks alone establish neither full accessibility nor performance compliance.

Sources: [UI UX Pro Max style data](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill/blob/4f2dbb67e64969a9a30ab00742f2d55d66ddec2b/src/ui-ux-pro-max/data/styles.csv)
(discovery vocabulary; risk/cost/industry labels are hypotheses),
[Nick Black](https://medium.com/@nickblack321/neumorphism-in-ui-design-optimising-components-for-learnability-accessibility-7a175fb45989)
(firsthand component exploration, not a controlled population study),
[WCAG 2.2](https://www.w3.org/TR/WCAG22/) (criteria/exceptions),
[Web Vitals](https://web.dev/articles/vitals) (field measurement context).
