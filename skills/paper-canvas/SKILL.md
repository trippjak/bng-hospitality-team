---
name: paper-canvas
description: Design, inspect, and extract JSX or CSS on Paper Desktop (paper.design) artboards under the Free-plan 100 MCP calls/week Coarse-Sync budget. Trigger when creating Paper artboards, translating Figma or HTML layouts onto a Paper Canvas, or exporting Paper components to code.
---

# Paper Canvas (Coarse-Sync)

Produce visual layouts in **Paper Desktop** while preserving Free-tier MCP quota (`100 calls/week`, `25 MB` max image). For full multi-model workflows, pair with `ux-ui-studio`.

## Procedure

1. **Iterate locally first:** Prototype layout hierarchy, spacing, and typography tokens in local HTML/CSS and inspect via the isolated **Verification Rig** (`playwright` MCP) before opening Paper mutations.
2. **Initialize Paper session once:** Call `get_guide({ topic: "paper-mcp-instructions" })`, `get_basic_info` (or `get_selection` if the operator highlighted an artboard), and `get_font_family_info` prior to styling text.
   - **Completion criterion:** Paper guide rules loaded, font family metrics retrieved, and target file/page ID confirmed.
3. **Coarse-Sync artboard in grouped writes (`<= 5` MCP calls/screen):**
   - Supply a brief (palette, type scale, spacing, direction) before generating new layouts.
   - Group related visual sections into coarse `write_html` calls; reuse repeating rows/cards via `duplicate_nodes`, `update_styles`, and `set_text_content`.
   - Format font sizes and `line-height` in `px`, `letter-spacing` in `em`; give nav/list icons fixed `flexShrink: 0` slots; set clipped frames to `height: "fit-content"`.
   - **Completion criterion:** Grouped artboard nodes written without per-element micro-churn.
4. **Visually verify and extract exact code:**
   - Run `get_screenshot` after major grouping; inspect geometry and clipping.
   - Call `finish_working_on_nodes` to release editing state.
   - Export to codebase strictly via `get_jsx`, `get_computed_styles`, and `get_fill_image` rather than reading sizes or hex codes off screenshots.
   - **Completion criterion:** Screenshot verified clip-free, editing finalized with `finish_working_on_nodes`, raw node IDs omitted from user replies, and exact JSX/style values extracted.
