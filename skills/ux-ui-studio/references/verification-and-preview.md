# Verification Rig and Staging Preview

All browser checks execute inside an automation-owned isolated browser profile (`ux-ui-team/references/acceptance.md`). Personal desktop browsers, saved cookies, unrelated tabs, and desktop screenshots remain off-limits.

## Tool Split

| Concern | Primary tool / plugin | Evidence captured |
|---|---|---|
| Layout, responsive breakpoints, accessibility snapshots, DOM probe | Global `playwright` MCP (`@playwright/mcp --headless --isolated`) | Accessibility tree snapshots, `dom-probe.mjs` JSON (`NVC-*` / `LUX-*`), multi-viewport PNGs |
| Core Web Vitals, LCP breakdown, focus/keyboard audit, source-mapped JS traces | `chrome-devtools-plugin` (`a11y-debugging`, `debug-optimize-lcp`, `chrome-devtools`) | Trace metrics (LCP/INP/CLS), contrast ratios, live DOM state |
| Motion and interaction choreography | `web-motion-protocol` + `figma-implement-motion` | Reduced-motion checks, frame-rate verification |
| Pre-production visual signoff | `cloudflare` plugin (`node scripts/cf-preview.mjs` / Workers `--env staging`) | Non-public isolated preview URL + fresh full-page screenshot tied to build commit |

## Preview-First Gate (Stage 2 -> Stage 3 -> Stage 4)

1. **Stage 2 (Single Host Evidence Packet):** Run `measure-ui-ratchet.mjs <dir> --out evidence.json` + Playwright `dom-probe.mjs` **once** across `1440px`, `1024px`, `768px`, and `390px` (plus `320px` reflow on text-heavy layouts), exercising applicable interactive/keyboard flows (`UI-01..UI-35`), clearing mechanical static/DOM violations (`0` mobile table clipping, `0` `<= 12`-row desktop scroll traps, `>= 9.5px` SVG labels, `>= 24x24` targets, WCAG AA contrast), and saving `desktop.png` + `mobile.png` into the shared **Evidence Packet**.
2. **Stage 3 (Parallel Gate Subagents, One Batch, Verification Confirm):** Feed the shared **Evidence Packet** in parallel to `no-vibe-code` and `ux-ui-qa` (via `invoke_subagent` or `seat-dispatch.mjs --gate ... --evidence-file packet.json --image desktop.png --image mobile.png`). The Host reconciles peer handoffs, applies **one** repair batch clearing `P0`/`P1` plus all `NVC-*` items needed to pass (`S1`/`S2` and `score < 12`), refreshes the Evidence Packet, and runs one verification-only confirm pass on both gates (holding for operator replan if either remains `FIX`).
3. **Stage 4 (Staging Preview & Hosted Verification):** Verify token readiness (`node scripts/cf-preview.mjs status`), upload an isolated Cloudflare **Staging Preview** (`node scripts/cf-preview.mjs preview --cwd <dir> --env staging`), open the returned **Staging Preview** URL in the isolated **Verification Rig** (`playwright` MCP) to verify zero console/asset errors and revision match, and capture a fresh full-page screenshot for operator sign-off before wiring public navigation or merging to `main`.
4. **Operator readout:** Explain outcomes in plain, everyday terms centered on what visitors see, alongside exact source/preview file links.
