# Reference discovery and applicable patterns

Use reference discovery for a substantial screen, marketing section or flow when it will
inform the brief. An existing approved direction or a small fix may need no new search.
Prior art: PR #53's reference workflow, refined against the connected Mobbin search and
best-practices instructions inspected on 2026-11-03. Generic examples below are design
considerations; they are not evidence that a particular product ships that pattern.

## Discover references

Load the available Mobbin best-practices and search instructions before using its tools.
Discover the actual tool names/schema in the current host; do not assume a namespace.
If the user explicitly requests a Mobbin redesign workflow, follow that workflow's routing.

| Target | Tool | Query example |
|---|---|---|
| App screen/component | `search_screens`, with `platform` | `inbox with conversation list and detail pane` |
| Marketing section | `search_sections`, no `platform` | `pricing section` |
| Journey or screen in journey context | `search_flows`, with `platform` | `workspace setup onboarding` |

Use one target per query and at most three constraints drawn from the request/problem.
Choose `standard` for an unconstrained screen type and `deep` for one to three constraints;
mode applies only to screens. Keep platform out of the query; current platforms are web
and iOS. Android work may use iOS references only with that difference disclosed.
Set output destination for the immediate deliverable: code, design canvas or document,
not always `code`. Keep task-wide destination/tool/intent fields consistent where exposed.

Start with a small useful result set and inspect actual preview images. Extract concrete
layout/interaction observations into the brief and cite every used result with its
`mobbin_url`. Do not describe unseen images from metadata. If previews cannot open, try
the supported JPEG format; unusable images are not references. Preserve any returned
`ai_usage_notice.text` word for word in its own block. Follow current image/export rules.

For more matching screens use unseen IDs; for sections/flows use supported pagination.
Weak results warrant revising the query, not inventing examples. Missing tools or refused
access stop the Mobbin step; report the actual status per its instructions. Retry an
unexplained transient error once. Never replace unavailable Mobbin results with remembered
product claims, web search or another connector. Separately scoped project work may
continue using supplied references and its own design decisions, with the missing evidence
explicit; if live references are required for acceptance, that gate remains unverified.

## Pattern considerations

- **Triage inboxes:** consider a list/detail layout when the task needs persistent context.
  Let panes shrink and stack at content-driven widths. Keep bulk actions tied to selection;
  specify recovery/undo where the brief requires it. Keyboard shortcuts must avoid editable
  targets and coexist with the product's established behavior.
- **Public/internal composers:** show the audience through text and semantics as well as
  color. Keep submit labels, mode state and validation aligned. A tint alone cannot prevent
  an audience-selection error.
- **Token/contrast workbenches:** make previews and computed contrast inspectable. State
  the applicable text/component criterion and calculation source; do not label every ratio
  below 4.5:1 a universal failure or claim whole-product compliance from a token preview.
- **Dense tables:** keep headers legible over scrolled rows and choose wrapping/row density
  for actual content. Explain whether KPIs are global or filtered; consistent labels and
  data semantics matter more than one fixed rollup policy or row-height target.

UXKin references need their actual supplied or retrieved source link and observed evidence.
This file carries no verified UXKin catalog, connector, product examples or benchmark result.
