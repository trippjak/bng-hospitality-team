/**
 * dom-probe.mjs — Browser-executable 5D UI Ratchet DOM, geometry, and WCAG 2.2 probe.
 * Pure browser globals inside functions so measure-ui-ratchet exports it cleanly to Playwright.
 */
import {
  contrastRatio,
  countGenericAriaLabels,
  countLowAlphaSvgRects,
  countLowContrastControls,
  findEffectiveBg,
  isVisibleEl,
  parseRgbaColor,
} from "./dom-probe-controls.mjs";

function checkSvgMetrics(violations) {
  for (const svg of document.querySelectorAll("svg")) {
    const sr = svg.getBoundingClientRect();
    if (!isVisibleEl(svg) || sr.width < 120 || sr.height < 80) continue;
    const boxes = [...svg.querySelectorAll("text")]
      .map((t) => ({ txt: t.textContent.trim(), r: t.getBoundingClientRect() }))
      .filter((x) => x.txt && x.r.width > 0 && x.r.height > 0);
    const small = boxes.filter((b) => b.r.height < 9.5);
    if (small.length) {
      violations.push({ rule: "svg-min-text-height", message: `SVG "${svg.id || "chart"}" has ${small.length} text label(s) smaller than 9.5px (${small[0].txt})` });
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r;
        const b = boxes[j].r;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 1.5 && oy > 1.5) {
          violations.push({ rule: "svg-text-overlap", message: `SVG labels overlap: "${boxes[i].txt}" vs "${boxes[j].txt}"` });
          return;
        }
      }
    }
  }
}

function checkTableLayoutTraps(violations) {
  const vw = window.innerWidth;
  for (const tbl of document.querySelectorAll("table")) {
    if (!isVisibleEl(tbl)) continue;
    const wrap = tbl.parentElement;
    if (!wrap) continue;
    const cs = getComputedStyle(wrap);
    if (vw <= 480 && (cs.overflowX === "auto" || cs.overflowX === "scroll") && wrap.scrollWidth > wrap.clientWidth * 1.15) {
      violations.push({ rule: "mobile-table-clipping", message: `Table clipped horizontally inside container at ${vw}px (${wrap.scrollWidth} > ${wrap.clientWidth})` });
    }
    const rowCount = tbl.querySelectorAll("tbody tr").length;
    if (vw >= 1200 && rowCount > 0 && rowCount <= 12 && wrap.scrollHeight > wrap.clientHeight + 2) {
      violations.push({ rule: "desktop-row-scroll-trap", message: `Desktop ${rowCount}-row table trapped in vertical scroll (${wrap.scrollHeight} > ${wrap.clientHeight})` });
    }
  }
}

function checkSvgButtonA11y(violations) {
  for (const g of document.querySelectorAll("svg g[tabindex], svg g[aria-label]")) {
    if (g.hasAttribute("tabindex") && !g.getAttribute("role")) {
      violations.push({ rule: "svg-focusable-missing-role", message: "Focusable SVG <g> lacks explicit ARIA role (e.g. role=\"button\")" });
      break;
    }
  }
  for (const svg of document.querySelectorAll("svg")) {
    const btns = [...svg.querySelectorAll('[role="button"]')].filter((b) => isVisibleEl(b));
    if (!btns.length) continue;
    const anyMissing = btns.some((b) => !b.hasAttribute("tabindex"));
    const anyReachable = btns.some((b) => Number.parseInt(b.getAttribute("tabindex") || "-1", 10) >= 0);
    if (anyMissing || !anyReachable) {
      violations.push({ rule: "svg-button-not-focusable", message: 'Interactive SVG [role="button"] group has unreachable Tab focus' });
      break;
    }
  }
}

function checkAriaAndTargets(violations) {
  for (const imgEl of document.querySelectorAll('[role="img"]')) {
    const trapped = imgEl.querySelectorAll('button, a[href], input, select, [tabindex]:not([tabindex="-1"]), [role="button"]');
    if (trapped.length > 0) {
      violations.push({ rule: "aria-role-img-trap", message: `Element [role="img"] contains ${trapped.length} interactive descendant(s)` });
    }
  }
  checkSvgButtonA11y(violations);
  for (const ctrl of document.querySelectorAll('button, select, input[type="search"], input[type="text"], [role="tab"]')) {
    if (!isVisibleEl(ctrl)) continue;
    const r = ctrl.getBoundingClientRect();
    if (r.width < 23.5 || r.height < 23.5) {
      violations.push({ rule: "fitts-target-size-wcag258", message: `Interactive control "${ctrl.id || ctrl.textContent.trim().slice(0, 24)}" is ${Math.round(r.width)}x${Math.round(r.height)} (< 24x24)` });
      break;
    }
  }
  for (const hid of document.querySelectorAll("[hidden]")) {
    if (getComputedStyle(hid).display !== "none") {
      violations.push({ rule: "hidden-computed-guard", message: `Element "${hid.id || hid.tagName}" has [hidden] but computed display !== none` });
      break;
    }
  }
}

function checkTextContrast(violations) {
  for (const el of document.querySelectorAll("h1, h2, h3, p, span, button, th, td, label, dt, dd, a")) {
    if (!isVisibleEl(el) || el.children.length > 0 || !el.textContent.trim()) continue;
    const cs = getComputedStyle(el);
    const fg = parseRgbaColor(cs.color);
    const bg = findEffectiveBg(el);
    if (!fg || !bg || fg.a < 0.85) continue;
    const sizePx = Number.parseFloat(cs.fontSize) || 14;
    const weight = Number.parseInt(cs.fontWeight, 10) || 400;
    const isLarge = sizePx >= 24 || (sizePx >= 18.5 && weight >= 700);
    const minRatio = isLarge ? 2.95 : 4.45;
    const ratio = contrastRatio(fg, bg);
    if (ratio < minRatio) {
      violations.push({ rule: "wcag-text-contrast", message: `Low contrast ${ratio}:1 (< ${minRatio}:1) on "${el.textContent.trim().slice(0, 28)}"` });
      return;
    }
  }
}

function makeDomEvidence(checkId, spec) {
  return {
    check_id: checkId,
    method: spec.method,
    value: spec.value,
    threshold: spec.threshold,
    location: { breakpoint: window.innerWidth, selector: spec.selector || "document" },
    result: spec.result,
    confidence: spec.confidence || "measured",
  };
}

function isBoxedElement(el) {
  const cs = getComputedStyle(el);
  const hasBorder = Number.parseFloat(cs.borderTopWidth) > 0 || Number.parseFloat(cs.borderLeftWidth) > 0;
  const bg = parseRgbaColor(cs.backgroundColor);
  const hasBg = Boolean(bg && bg.a >= 0.08);
  const hasShadow = cs.boxShadow && cs.boxShadow !== "none";
  return (hasBorder || hasShadow) && (hasBg || hasBorder);
}

function collectTypoAndEyebrowEvidence() {
  const headings = [...document.querySelectorAll("h1, h2, h3")].filter((h) => isVisibleEl(h));
  let eyebrows = 0;
  for (const h of headings) {
    const prev = h.previousElementSibling;
    if (!prev || !isVisibleEl(prev)) continue;
    const pcs = getComputedStyle(prev);
    const hSize = Number.parseFloat(getComputedStyle(h).fontSize) || 24;
    const pSize = Number.parseFloat(pcs.fontSize) || 14;
    const isSmall = pSize < hSize * 0.65;
    const isEyeStyle = pcs.textTransform === "uppercase" || /mono/i.test(pcs.fontFamily);
    if (isSmall && isEyeStyle && prev.textContent.trim().length > 0) eyebrows++;
  }
  const ratio = headings.length ? Number((eyebrows / headings.length).toFixed(2)) : 0;
  const monoNodes = [...document.querySelectorAll("span, p, div, label, a, button")].filter((el) => {
    if (!isVisibleEl(el) || el.children.length > 0 || el.closest("code, pre, kbd, samp, var")) return false;
    return /mono/i.test(getComputedStyle(el).fontFamily) && el.textContent.trim().length > 0;
  });
  const sizes = new Set();
  for (const el of document.querySelectorAll("h1, h2, h3, h4, p, span, td, th, button, label, a")) {
    if (isVisibleEl(el) && el.textContent.trim()) sizes.add(Math.round(Number.parseFloat(getComputedStyle(el).fontSize) || 14));
  }
  return [
    makeDomEvidence("NVC-TYP-02", { method: "dom", value: `${eyebrows}/${headings.length} (${ratio})`, threshold: "ratio <= 0.5", result: headings.length >= 2 && ratio > 0.5 ? "flag" : "pass" }),
    makeDomEvidence("NVC-TYP-03", { method: "computed_style", value: monoNodes.length, threshold: "< 4 non-code monospace nodes", result: monoNodes.length >= 4 ? "flag" : "pass" }),
    makeDomEvidence("LUX-TYP-01", { method: "computed_style", value: sizes.size, threshold: "<= 8 distinct font sizes", result: sizes.size > 8 ? "flag" : "pass" }),
  ];
}

function isOneSideAccent(cs, rad) {
  if (rad < 6) return false;
  const bl = Number.parseFloat(cs.borderLeftWidth) || 0;
  const bt = Number.parseFloat(cs.borderTopWidth) || 0;
  const br = Number.parseFloat(cs.borderRightWidth) || 0;
  return (bl >= 3 && br <= 1) || (bt >= 3 && br <= 1);
}

function collectBoxAndShadowEvidence() {
  const boxes = [...document.querySelectorAll("div, section, article, aside, input, button, select")].filter((el) => {
    if (!isVisibleEl(el)) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 40 && r.height >= 24 && isBoxedElement(el);
  });
  const boxSet = new Set(boxes);
  let overRounded = 0;
  let nestedCards = 0;
  let accentBorders = 0;
  const shadowCounts = new Map();
  let shadowed = 0;
  for (const el of boxes) {
    const cs = getComputedStyle(el);
    const rad = Number.parseFloat(cs.borderTopLeftRadius) || 0;
    if (rad >= 12 && rad < 999) overRounded++;
    const parentBox = el.parentElement?.closest("main div, main section, main article");
    if (el.closest("main") && parentBox && boxSet.has(parentBox)) nestedCards++;
    if (isOneSideAccent(cs, rad)) accentBorders++;
    if (cs.boxShadow && cs.boxShadow !== "none") {
      shadowed++;
      shadowCounts.set(cs.boxShadow, (shadowCounts.get(cs.boxShadow) || 0) + 1);
    }
  }
  const roundShare = boxes.length ? Number((overRounded / boxes.length).toFixed(2)) : 0;
  const maxShadow = Math.max(0, ...shadowCounts.values());
  const shadowShare = shadowed ? Number((maxShadow / shadowed).toFixed(2)) : 0;
  return [
    makeDomEvidence("NVC-SHP-01", { method: "computed_style", value: `${overRounded}/${boxes.length} (${roundShare})`, threshold: "share <= 0.65 at >= 12px", result: boxes.length >= 6 && roundShare > 0.65 ? "flag" : "pass" }),
    makeDomEvidence("NVC-SHP-02", { method: "dom", value: nestedCards, threshold: "< 2 nested boxed cards in main", result: nestedCards >= 2 ? "flag" : "pass" }),
    makeDomEvidence("NVC-SHP-03", { method: "computed_style", value: accentBorders, threshold: "< 2 rounded one-side accent borders", result: accentBorders >= 2 ? "flag" : "pass" }),
    makeDomEvidence("NVC-COL-06", { method: "computed_style", value: `${maxShadow}/${shadowed} (${shadowShare})`, threshold: "identical shadow share < 0.75", result: shadowed >= 4 && shadowShare >= 0.75 ? "flag" : "pass" }),
  ];
}

function isNonInteractivePill(el, r, rad) {
  const interactive = el.matches("a, button, [role='button'], [role='tab'], input, select") || el.closest("a, button");
  const txtLen = el.textContent.trim().length;
  return !interactive && r.height > 10 && r.height <= 38 && rad >= r.height / 2 - 1 && txtLen > 0 && txtLen <= 36;
}

function collectPillLayoutOverflowEvidence() {
  let pills = 0;
  let pulseDots = 0;
  for (const el of document.querySelectorAll("span, div, p, li")) {
    if (!isVisibleEl(el)) continue;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    const rad = Number.parseFloat(cs.borderTopLeftRadius) || 0;
    if (r.width <= 14 && r.height <= 14 && rad >= r.height / 2 - 1 && cs.animationName !== "none") pulseDots++;
    if (isNonInteractivePill(el, r, rad)) pills++;
  }
  const middots = (document.body?.innerText || "").split("\u00b7").length - 1;
  const textBlocks = [...document.querySelectorAll("h1, h2, h3, p, li")].filter((el) => isVisibleEl(el) && el.textContent.trim().length >= 12);
  const centered = textBlocks.filter((el) => getComputedStyle(el).textAlign === "center").length;
  const centerShare = textBlocks.length ? Number((centered / textBlocks.length).toFixed(2)) : 0;
  const overflowPx = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
  return [
    makeDomEvidence("NVC-CMP-02", { method: "dom", value: `pills:${pills},middot:${middots}`, threshold: "pills < 5 and middots < 4", result: pills >= 5 || middots >= 4 ? "flag" : "pass" }),
    makeDomEvidence("NVC-CMP-03", { method: "computed_style", value: pulseDots, threshold: "0 decorative pulsing status dots", result: pulseDots > 0 ? "flag" : "pass" }),
    makeDomEvidence("NVC-LAY-04", { method: "computed_style", value: `${centered}/${textBlocks.length} (${centerShare})`, threshold: "desktop center share < 0.60", result: window.innerWidth >= 1024 && textBlocks.length >= 5 && centerShare >= 0.6 ? "flag" : "pass" }),
    makeDomEvidence("NVC-INT-04", { method: "dom", value: overflowPx, threshold: "<= 1px horizontal overflow", result: overflowPx > 1 ? "flag" : "pass" }),
  ];
}

function measureSpacingGrid() {
  let samples = 0;
  let aligned = 0;
  for (const el of document.querySelectorAll("main, section, article, div, header, nav")) {
    if (!isVisibleEl(el)) continue;
    const cs = getComputedStyle(el);
    for (const raw of [cs.gap, cs.paddingTop, cs.paddingLeft]) {
      const px = Number.parseFloat(raw);
      if (px > 0 && Number.isFinite(px)) {
        samples++;
        if (Math.abs(px % 4) <= 0.5 || Math.abs((px % 4) - 4) <= 0.5) aligned++;
      }
    }
  }
  const share = samples ? Number((aligned / samples).toFixed(2)) : 1;
  return { samples, aligned, share };
}

function measureChoiceAndHeadingOrder() {
  let maxChoices = 0;
  for (const grp of document.querySelectorAll('nav, [role="tablist"], [role="toolbar"]')) {
    if (!isVisibleEl(grp)) continue;
    const count = [...grp.querySelectorAll('a, button, [role="tab"], select')].filter((c) => isVisibleEl(c)).length;
    if (count > maxChoices) maxChoices = count;
  }
  const levels = [...document.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter((h) => isVisibleEl(h)).map((h) => Number(h.tagName[1]));
  const h1Count = levels.filter((l) => l === 1).length;
  const skipped = levels.some((l, idx) => idx > 0 && l > levels[idx - 1] + 1);
  return { maxChoices, h1Count, skipped };
}

function collectLuxProbeEvidence(violations) {
  const sp = measureSpacingGrid();
  const ch = measureChoiceAndHeadingOrder();
  const contrastFlags = violations.filter((v) => v.rule === "wcag-text-contrast").length;
  const lowAlphaRects = countLowAlphaSvgRects();
  const lowContrastControls = countLowContrastControls();
  const totalContrastFlags = contrastFlags + lowAlphaRects + lowContrastControls;
  const cntVal = (lowAlphaRects > 0 || lowContrastControls > 0)
    ? `text:${contrastFlags},svgRects:${lowAlphaRects},controls:${lowContrastControls}`
    : contrastFlags;
  const fitFlags = violations.filter((v) => v.rule === "fitts-target-size-wcag258").length;
  const genericAria = countGenericAriaLabels();
  return [
    makeDomEvidence("LUX-SPC-01", { method: "computed_style", value: `${sp.aligned}/${sp.samples} (${sp.share})`, threshold: ">= 0.75 on 4px grid", result: sp.samples >= 8 && sp.share < 0.75 ? "flag" : "pass" }),
    makeDomEvidence("LUX-CNT-01", { method: "computed_style", value: cntVal, threshold: "0 WCAG AA text or <3:1 SVG rect / control boundary flags", result: totalContrastFlags > 0 ? "flag" : "pass" }),
    makeDomEvidence("LUX-FIT-01", { method: "dom", value: fitFlags, threshold: "0 targets < 24x24px", result: fitFlags > 0 ? "flag" : "pass" }),
    makeDomEvidence("LUX-HIC-01", { method: "dom", value: ch.maxChoices, threshold: "<= 6 visible top-level choices", result: ch.maxChoices > 6 ? "flag" : "pass" }),
    makeDomEvidence("LUX-HDG-01", { method: "dom", value: `h1:${ch.h1Count},skipped:${ch.skipped}`, threshold: "1 h1 and 0 skipped heading levels", result: ch.h1Count !== 1 || ch.skipped ? "flag" : "pass" }),
    makeDomEvidence("LUX-SEM-01", { method: "dom", value: genericAria, threshold: "0 aria-label/aria-labelledby on unroled div/span", result: genericAria > 0 ? "flag" : "pass" }),
  ];
}

export function runRenderedUiProbe() {
  const violations = [];
  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    violations.push({ rule: "page-overflow", message: `Document scrollWidth ${document.documentElement.scrollWidth} > innerWidth ${window.innerWidth}` });
  }
  checkSvgMetrics(violations);
  checkTableLayoutTraps(violations);
  checkAriaAndTargets(violations);
  checkTextContrast(violations);
  const classifierEvidence = [
    ...collectTypoAndEyebrowEvidence(),
    ...collectBoxAndShadowEvidence(),
    ...collectPillLayoutOverflowEvidence(),
    ...collectLuxProbeEvidence(violations),
  ];
  return {
    viewport: { width: window.innerWidth, height: window.innerHeight },
    scrollWidth: document.documentElement.scrollWidth,
    violationCount: violations.length,
    violations,
    classifierEvidence,
  };
}
