/**
 * dom-probe-controls.mjs — Color, WCAG 1.4.11 control/SVG contrast, and generic ARIA label checks.
 * Pure browser globals inside functions so measure-ui-ratchet concatenates it cleanly into dom-probe.
 */

const CONTROL_SELECTOR = [
  'input:not([type="hidden"]):not([type="range"]):not([type="file"]):not([type="checkbox"]):not([type="radio"])',
  "select",
  "textarea",
  "button",
].join(", ");

const BORDER_SIDES = [
  ["borderTopWidth", "borderTopColor"],
  ["borderBottomWidth", "borderBottomColor"],
  ["borderLeftWidth", "borderLeftColor"],
  ["borderRightWidth", "borderRightColor"],
];

export function parseRgbaColor(raw) {
  const m = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/i.exec(raw || "");
  if (!m) return null;
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a: m[4] === undefined ? 1 : Number(m[4]) };
}

function channelLuminance(v) {
  const srgb = v / 255;
  return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
}

export function rawContrast(fg, bg) {
  const l1 = 0.2126 * channelLuminance(fg.r) + 0.7152 * channelLuminance(fg.g) + 0.0722 * channelLuminance(fg.b);
  const l2 = 0.2126 * channelLuminance(bg.r) + 0.7152 * channelLuminance(bg.g) + 0.0722 * channelLuminance(bg.b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export function contrastRatio(fg, bg) {
  return Number(rawContrast(fg, bg).toFixed(2));
}

export function findEffectiveBg(el) {
  let cur = el;
  while (cur && cur.nodeType === 1) {
    const cs = getComputedStyle(cur);
    if (cs.backgroundImage && cs.backgroundImage !== "none") return null;
    const c = parseRgbaColor(cs.backgroundColor);
    if (c && c.a >= 0.92) return c;
    cur = cur.parentElement;
  }
  return { r: 255, g: 255, b: 255, a: 1 };
}

function effectiveNodeOpacity(el) {
  let mult = 1;
  for (let cur = el; cur && cur.nodeType === 1; cur = cur.parentElement) {
    const op = Number(getComputedStyle(cur).opacity);
    if (Number.isFinite(op)) mult *= Math.max(0, Math.min(1, op));
  }
  return mult;
}

export function isVisibleEl(el) {
  if (!el || el.closest("[hidden]")) return false;
  const cs = getComputedStyle(el);
  if (cs.display === "none" || cs.visibility === "hidden" || el.classList.contains("sr-only")) return false;
  if (effectiveNodeOpacity(el) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 1 && r.height > 1;
}

function compositedContrast(rawColor, opMult, bg) {
  const c = parseRgbaColor(rawColor);
  if (!c) return 0;
  const a = Math.max(0, Math.min(1, c.a * opMult));
  return rawContrast({ r: c.r * a + bg.r * (1 - a), g: c.g * a + bg.g * (1 - a), b: c.b * a + bg.b * (1 - a) }, bg);
}

function hasLowContrastStop(grad, bg, fillMult) {
  for (const stop of grad.querySelectorAll("stop")) {
    const scs = getComputedStyle(stop);
    const op = Number.parseFloat(scs.stopOpacity ?? "1");
    if (compositedContrast(scs.stopColor, fillMult * (Number.isFinite(op) ? op : 1), bg) < 3.0) return true;
  }
  return false;
}

function rectHasVisibleStroke(cs, bg, nodeOp) {
  const sw = Number.parseFloat(cs.strokeWidth) || 0;
  if (!cs.stroke || cs.stroke === "none" || sw <= 0) return false;
  const so = Number.parseFloat(cs.strokeOpacity ?? "1");
  return compositedContrast(cs.stroke, nodeOp * (Number.isFinite(so) ? so : 1), bg) >= 3.0;
}

export function countLowAlphaSvgRects() {
  let flagged = 0;
  for (const rect of document.querySelectorAll("svg rect")) {
    if (!isVisibleEl(rect)) continue;
    const cs = getComputedStyle(rect);
    const fillRaw = (cs.fill && cs.fill !== "none" ? cs.fill : rect.getAttribute("fill")) || "";
    const ref = /url\(\s*["']?[^)"'#]*#([^)"'\s]+)["']?\s*\)/i.exec(fillRaw);
    const grad = ref ? document.getElementById(ref[1]) : null;
    if (!grad || !/linearGradient|radialGradient/i.test(grad.tagName)) continue;
    const bg = findEffectiveBg(rect);
    if (!bg) continue;
    const nodeOp = effectiveNodeOpacity(rect);
    const fillOp = Number.parseFloat(cs.fillOpacity ?? "1");
    const fillMult = nodeOp * (Number.isFinite(fillOp) ? fillOp : 1);
    if (hasLowContrastStop(grad, bg, fillMult) && !rectHasVisibleStroke(cs, bg, nodeOp)) flagged++;
  }
  return flagged;
}

function bestBorderContrast(cs, nodeOp, parentBg) {
  let hasVisible = false;
  let best = 0;
  for (const [wKey, cKey] of BORDER_SIDES) {
    const w = Number.parseFloat(cs[wKey]) || 0;
    if (w < 1) continue;
    const c = parseRgbaColor(cs[cKey]);
    if (!c || c.a * nodeOp < 0.15) continue;
    hasVisible = true;
    best = Math.max(best, compositedContrast(cs[cKey], nodeOp, parentBg));
  }
  return hasVisible ? best : null;
}

function boxShadowRingPasses(cs, nodeOp, parentBg) {
  const sh = cs.boxShadow;
  if (!sh || sh === "none") return false;
  const matches = sh.match(/rgba?\([^)]+\)/gi) || [];
  return matches.some((col) => compositedContrast(col, nodeOp, parentBg) >= 3.0);
}

function controlBoundaryFails(el) {
  if (!isVisibleEl(el) || el.matches(":disabled") || el.getAttribute("aria-disabled") === "true") return false;
  const parentBg = findEffectiveBg(el.parentElement);
  if (!parentBg) return false;
  const nodeOp = effectiveNodeOpacity(el);
  const cs = getComputedStyle(el);
  const fill = parseRgbaColor(cs.backgroundColor);
  if (fill && fill.a * nodeOp >= 0.08 && compositedContrast(cs.backgroundColor, nodeOp, parentBg) >= 3.0) return false;
  const borderRatio = bestBorderContrast(cs, nodeOp, parentBg);
  if (el.tagName === "BUTTON") return borderRatio !== null && borderRatio < 3.0;
  if (borderRatio !== null) return borderRatio < 3.0;
  return !boxShadowRingPasses(cs, nodeOp, parentBg);
}

export function countLowContrastControls() {
  let flagged = 0;
  for (const el of document.querySelectorAll(CONTROL_SELECTOR)) {
    if (controlBoundaryFails(el)) flagged++;
  }
  return flagged;
}

export function countGenericAriaLabels() {
  let flagged = 0;
  for (const el of document.querySelectorAll("div[aria-label], span[aria-label], div[aria-labelledby], span[aria-labelledby]")) {
    if (el.closest("[hidden]") || el.classList.contains("sr-only")) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (!el.getAttribute("role")?.trim()) flagged++;
  }
  return flagged;
}
