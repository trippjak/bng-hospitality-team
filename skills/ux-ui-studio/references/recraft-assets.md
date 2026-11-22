# Recraft Asset Studio Workflow

Primary interactive route: **`ux-ui-studio-recraft`** (`https://mcp.recraft.ai/mcp`, Streamable HTTP + OAuth 2.0 billing Studio subscription credits).
Optional headless batch fallback: **`../scripts/recraft-cli.mjs`** (direct REST v1 using `RECRAFT_API_KEY`; never use deprecated `@recraft-ai/mcp-recraft-server`).

## Model and Style Rules (`recraft.ai/docs/mcp-reference/tools.md`)

- **Vector UI icons & logos:** Target **`recraftv4_vector`** (or `_vector` variants) paired strictly with vector styles to produce editable inline SVG output.
- **Editorial/hero photography & raster art:** Target **Recraft V4 / V4.1 Pro** (`generate_image`, `image_to_image`, `replace_background`) paired strictly with raster styles.
- **Brand style lock (`style_id` / `custom_style_id`):** Create a custom style once per brand (`create_style` from 1-5 reference images) on V4/V4.1, record the returned `custom_style_id` in the instance repo, and reuse it strictly with the same base model and style family. When calling `generate_image` with `input_style_id`, omit both `model` and `input_style` (`custom_style_id` already binds both).
- **Unlabeled product & packaging rasters:** For bottles, jars, UI hardware, or vessels where HTML/CSS renders the real typography separately, include `"unlabeled blank vessel, strictly zero printed text, no letters, no typography"` in the prompt so generative labels do not corrupt brand typography.
- **Asset post-processing & `normalize-svg`:** Use `vectorize_image` on clean raster marks, `remove_background` for cutouts, and `crisp_upscale` (preserving composition) over `creative_upscale` (regenerates detail) when fidelity to layout matters. Because Recraft `_vector` outputs embed `<metadata><c2pa:manifest>`, `preserveAspectRatio="none"`, full-canvas background `<path>` backdrops, and oversized artboard margins (`4358x4358`), immediately run `node ../scripts/recraft-cli.mjs normalize-svg --in <icon.svg> --ink "#16211E" --knockout "#F7F6F2"` (works offline with zero `RECRAFT_API_KEY`) to strip C2PA/backdrop bloat, bind palette ink, and square-crop every `viewBox` to uniform optical weight.
- **Provenance constraint:** Generated visuals never establish factual product claims or measured charts (`ux-ui-team/references/roles.md`). Keep asset dimensions and aspect ratios aligned with Paper's `25 MB` Free-plan ceiling and Cloudflare edge asset budgets.
