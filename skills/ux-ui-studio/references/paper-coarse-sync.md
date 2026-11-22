# Paper Canvas Coarse-Sync Strategy

Paper Desktop runs on the Free tier (`100 MCP calls/week`, `25 MB` max image size) via `C:/Users/jake/.paper/bin/paper mcp`. Paper Desktop must remain open with the target file active.

## Canvas Selection and Budget

- **Use Paper Canvas pre-code only when exploring visual directions:** Reserve Paper MCP (`paper-canvas` skill, `<= 5` calls/screen) for upfront direction exploration and extracting JSX/styles (`get_jsx`, `get_computed_styles`) before coding. Skip Paper on direct code-to-preview iterations, and never duplicate an already-coded screen back into Paper post-hoc.
- **Use Figma Canvas** (`figma-generate-design`, `figma-design-to-code`, `figma-use-slides`) for design-system variable governance, Code Connect mappings, or stakeholder slide decks.
- **Iterate locally first:** Test palette/type/breakpoint refinements in local HTML/CSS with headless isolated `playwright` MCP before spending Paper MCP calls.

## Figma-to-Paper Migration Caveats (`paper.design/docs/mcp`)

- Figma MCP flattens SVG fills to raster images and drops color overrides inside SVG instances — regenerate clean vectors via **Asset Studio** (`recraftv4_vector`).
- Figma inset borders and spacer frames frequently drop or misalign — convert to outline padding/borders in Paper HTML.
- Break oversized deeply nested Figma frames into section-level reads to prevent Figma MCP payload errors.
