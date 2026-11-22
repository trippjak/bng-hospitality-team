/**
 * classifier-evidence.mjs - Deterministic static [D] evidence extractor for NVC-* tells.
 * Emits typed Classifier Evidence records without altering UI Ratchet pass/fail counts.
 */

const DEFAULT_PURPLE_RE = /\b(?:bg|text|border|from|via|to|ring)-(?:indigo|violet|purple)-[3-9]00\b|(?:#6366f1|#8b5cf6|#7c3aed|#a855f7|#4f46e5|#9333ea)\b/gi;
const GRADIENT_RE = /(?:linear|radial|conic)-gradient\s*\(|\bbg-gradient-to-(?:[trbl]{1,2})\b|<(?:linearGradient|radialGradient)\b|(?:createElementNS|svgEl)\s*\([^)\n]*["'](?:linearGradient|radialGradient)["']/gi;
const GRADIENT_TEXT_RE = /(?:background-clip\s*:\s*text|-webkit-background-clip\s*:\s*text|\bbg-clip-text\b)/gi;
const JS_SVG_GLOW_RE = /(?:createElementNS|svgEl)\s*\([^)\n]*["']feDropShadow["']/i;
const INLINE_SVG_HEX_RE = /(?:fill|stroke|stop-color|stopColor|flood-color|floodColor)\s*[:=]\s*["'](#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3}))["']/gi;
const CSS_FONT_RE = /(?:font-family|--font-(?:family|sans|serif|display|body|heading|text|ui|alt|base|stack)(?:-[a-z0-9]+)?)\s*:\s*([^;}\n]+)/gi;
const HTML_FONT_RE = /(?:font-family|--font-(?:family|sans|serif|display|body|heading|text|ui|alt|base|stack)(?:-[a-z0-9]+)?)\s*:\s*([^;}"<>\n]+)/gi;
const NON_FONT_TOKEN_RE = /^(?:[\d.]+(?:px|rem|em|%|vw|vh|pt|ms|s)?|normal|italic|oblique|bold|bolder|lighter|none|auto|inherit|initial|unset)$/i;
const GLASS_RE = /backdrop-filter\s*:[^;]*blur\(|\bbackdrop-blur(?:-[a-z0-9]+)?\b/gi;
const DEFAULT_FONTS = new Set(["inter", "roboto", "arial", "system-ui", "-apple-system", "blinkmacsystemfont", "segoe ui", "sans-serif", "geist", "space grotesk"]);
const SHADCN_FP_RE = /--primary\s*:\s*222\.2\s+47\.4%\s+11\.2%|--radius\s*:\s*0\.5rem/i;
const ICON_TAG_TEXT_RE = /<(?:nav|button|a|h[1-4]|li)\b[^>]*>([^<]{1,140})</gi;
const EMOJI_RE = /\p{Extended_Pictographic}/gu;
const PLACEHOLDER_RE = /\b(?:lorem\s+ipsum|john\s+doe|jane\s+doe|example\.com)\b|\b(?:10,?000\+|10k\+|99\.9%)\s+(?:users|teams|customers|companies|uptime)\b/gi;
const BUZZWORD_RE = /\b(?:supercharge|transform your|unlock|elevate|seamlessly|next-generation|game-changer)\b|\bno\s+\w+\.\s+no\s+\w+\.\s+just\b/gi;
const TIC_RE = /\u2014|\b(?:delve|it's worth noting|seamlessly)\b/gi;
const REDUNDANT_HELPER_RE = /\b(?:click\s+(?:the\s+button\s+)?(?:here|below)\s+to|use\s+this\s+(?:section|panel|page|form|dropdown|toggle|table)\s+to|here\s+you\s+can\s+(?:view|manage|configure|track|customize)|welcome\s+to\s+your\s+\w+[.!]\s+here\s+you|enter\s+your\s+[a-z\s]{2,20}\s+(?:here|below))\b/gi;
const UI_PARA_RE = /<(p|Text)\b([^>]*)>([\s\S]*?)<\/\1>/g;
const INLINE_TAG_RE = /<\/?(?:a|abbr|b|bdi|bdo|cite|code|em|i|kbd|mark|q|s|samp|small|span|strong|sub|sup|time|u|var)\b[^>]*>/gi;
const EXEMPT_CLASS_RE = /\bclass(?:Name)?\s*=\s*(?:"(?:[^"]*\s)?(?:prose|legal|disclaimer|sr-only)(?:\s[^"]*)?"|'(?:[^']*\s)?(?:prose|legal|disclaimer|sr-only)(?:\s[^']*)?')/i;
const DEAD_HREF_RE = /href\s*=\s*["'](?:#|javascript:void\(0\))["']/gi;
const TOOL_FP_RE = /Made with (?:Lovable|Bolt)|Built with v0|Edit with Lovable|vite\.svg|<title>\s*(?:Vite App|Vite \+ React|Create Next App)\s*<\/title>/gi;

function buildEvidence(checkId, spec) {
  return {
    check_id: checkId,
    method: spec.method,
    value: spec.value,
    threshold: spec.threshold,
    location: spec.location,
    result: spec.result,
    confidence: spec.confidence || "measured",
  };
}

function collectMatches(sources, regex, filterFn = null) {
  const hits = [];
  for (const src of sources) {
    regex.lastIndex = 0;
    for (const m of src.text.matchAll(regex)) {
      if (filterFn && !filterFn(m[0], src)) continue;
      hits.push({ file: src.file, match: m[0] });
    }
  }
  return hits;
}

function normalizeSet(list) {
  return new Set((list || []).map((v) => String(v).trim().toLowerCase()).filter(Boolean));
}

function stripCssComments(cssText) {
  return cssText.replace(/\/\*[\s\S]*?\*\//g, "");
}

function checkPurplePalette(allSources, brandColors) {
  const hits = collectMatches(allSources, DEFAULT_PURPLE_RE, (m) => !brandColors.has(m.toLowerCase()));
  return buildEvidence("NVC-COL-01", {
    method: "token_parse",
    value: hits.length,
    threshold: "0 unbranded purple/indigo/violet defaults",
    location: { file: hits[0]?.file || allSources[0]?.file || "." },
    result: hits.length > 0 ? "flag" : "pass",
  });
}

function checkGradientsAndClip(allSources, allowGradients = false) {
  const grads = collectMatches(allSources, GRADIENT_RE);
  const clips = collectMatches(allSources, GRADIENT_TEXT_RE);
  return [
    buildEvidence("NVC-COL-02", {
      method: "token_parse",
      value: grads.length,
      threshold: allowGradients ? "Documented brandTokens.allowGradients override" : "<= 1 gradient declaration",
      location: { file: grads[0]?.file || allSources[0]?.file || "." },
      result: allowGradients || grads.length <= 1 ? "pass" : "flag",
    }),
    buildEvidence("NVC-COL-03", {
      method: "token_parse",
      value: clips.length,
      threshold: "0 gradient-clipped heading rules",
      location: { file: clips[0]?.file || allSources[0]?.file || "." },
      result: clips.length > 0 ? "flag" : "pass",
    }),
  ];
}

function isColoredShadow(decl) {
  if (JS_SVG_GLOW_RE.test(decl)) return true;
  if (/<feDropShadow\b/i.test(decl) && !/flood-color\s*=/i.test(decl)) return true;
  if (/\bshadow-(?:indigo|purple|violet|cyan|pink|blue)-[3-7]00\b/i.test(decl)) return true;
  const rgbMatch = /rgba?\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)(?:\s*[,/]\s*([\d.]+))?/i.exec(decl);
  if (rgbMatch) {
    const channels = [Number(rgbMatch[1]), Number(rgbMatch[2]), Number(rgbMatch[3])];
    const spread = Math.max(...channels) - Math.min(...channels);
    const alpha = rgbMatch[4] === undefined ? 1 : Number(rgbMatch[4]);
    return spread > 35 && alpha > 0.14;
  }
  const hexMatch = /#([0-9a-f]{6}|[0-9a-f]{3})\b/i.exec(decl);
  if (!hexMatch) return false;
  const raw = hexMatch[1];
  const full = raw.length === 3 ? raw.split("").map((ch) => ch + ch).join("") : raw;
  const n = Number.parseInt(full, 16);
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return Math.max(...channels) - Math.min(...channels) > 35;
}

function checkGlowAndGlass(allSources, allowGlow = false) {
  const glowRe = /box-shadow\s*:[^;\n]+|drop-shadow\([^)]+\)|\bshadow-(?:indigo|purple|violet|cyan|pink|blue)-[3-7]00\b|<feDropShadow\b[^>]*>|(?:createElementNS|svgEl)\s*\([^)\n]*["']feDropShadow["']/gi;
  const glows = collectMatches(allSources, glowRe, (m) => isColoredShadow(m));
  const glass = collectMatches(allSources, GLASS_RE);
  return [
    buildEvidence("NVC-COL-04", {
      method: "token_parse",
      value: glows.length,
      threshold: allowGlow ? "Documented brandTokens.allowGlow override" : "0 colored glow/neon shadows",
      location: { file: glows[0]?.file || allSources[0]?.file || "." },
      result: !allowGlow && glows.length > 0 ? "flag" : "pass",
    }),
    buildEvidence("NVC-COL-05", {
      method: "token_parse",
      value: glass.length,
      threshold: "0 unbranded backdrop-blur panels",
      location: { file: glass[0]?.file || allSources[0]?.file || "." },
      result: glass.length > 0 ? "flag" : "pass",
    }),
  ];
}

function pushFontFamilies(rawList, out) {
  if (!rawList) return;
  const unwrapped = rawList.replace(/\bvar\(\s*--[a-z0-9-]+\s*,?/gi, "").replace(/\)/g, "");
  for (const part of unwrapped.split(",")) {
    const clean = part.replace(/["']/g, "").trim().toLowerCase();
    if (!clean || clean === "monospace" || clean.includes("(") || clean.startsWith("--")) continue;
    if (!NON_FONT_TOKEN_RE.test(clean)) out.push(clean);
  }
}

function collectFontDecls(text, regex, file, families, currentFirst) {
  let firstFile = currentFirst;
  for (const m of text.matchAll(regex)) {
    firstFile = file;
    pushFontFamilies(m[1], families);
  }
  return firstFile;
}

function checkFontStack(cssSources, htmlSources, brandFonts) {
  const families = [];
  let firstFile = cssSources[0]?.file || htmlSources[0]?.file || ".";
  for (const src of cssSources) {
    firstFile = collectFontDecls(stripCssComments(src.text), CSS_FONT_RE, src.file, families, firstFile);
  }
  for (const src of htmlSources) {
    for (const sb of src.text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
      firstFile = collectFontDecls(stripCssComments(sb[1]), CSS_FONT_RE, src.file, families, firstFile);
    }
    firstFile = collectFontDecls(src.text, HTML_FONT_RE, src.file, families, firstFile);
  }
  const nonDefault = families.filter((f) => !DEFAULT_FONTS.has(f));
  const whitelisted = families.some((f) => brandFonts.has(f));
  const flagged = families.length > 0 && nonDefault.length === 0 && !whitelisted;
  return buildEvidence("NVC-TYP-01", {
    method: "token_parse",
    value: [...new Set(families)].slice(0, 5).join(", ") || "none",
    threshold: "Intentional non-default or brand-listed typeface",
    location: { file: firstFile },
    result: flagged ? "flag" : "pass",
  });
}

function collectCssTokenStats(cssSources, brandColors) {
  let tokenDefs = 0;
  let shadcnHitFile = "";
  const nonRootHex = new Set();
  for (const src of cssSources) {
    const clean = stripCssComments(src.text);
    tokenDefs += (clean.match(/--[a-z0-9-]+\s*:/gi) || []).length;
    if (!shadcnHitFile && SHADCN_FP_RE.test(clean) && !/--brand-|--accent-brand/i.test(clean)) shadcnHitFile = src.file;
    for (const hm of clean.replace(/:root\s*\{[^}]*\}/g, "").matchAll(/#(?:[0-9a-f]{3}|[0-9a-f]{6})\b/gi)) {
      const hex = hm[0].toLowerCase();
      if (!brandColors.has(hex)) nonRootHex.add(hex);
    }
  }
  return { tokenDefs, shadcnHitFile, nonRootHex };
}

function collectUnbrandedSvgHexes(sources, brandColors) {
  const found = new Set();
  for (const src of sources) {
    for (const hm of src.text.matchAll(INLINE_SVG_HEX_RE)) {
      const hex = hm[1].toLowerCase();
      if (!brandColors.has(hex)) found.add(hex);
    }
  }
  return found;
}

function checkUntouchedLibAndTokens(bundleSources, brandColors, brandFonts) {
  const { cssSources, htmlSources, codeSources } = bundleSources;
  const { tokenDefs, shadcnHitFile, nonRootHex } = collectCssTokenStats(cssSources, brandColors);
  const unbrandedSvgHex = collectUnbrandedSvgHexes([...htmlSources, ...codeSources], brandColors);
  const hasBrand = brandColors.size > 0 || brandFonts.size > 0;
  const libFlag = Boolean(shadcnHitFile) && !hasBrand;
  const sysFlag = (nonRootHex.size > 6 && tokenDefs < 4) || unbrandedSvgHex.size > 6;
  return [
    buildEvidence("NVC-CMP-01", {
      method: "token_parse",
      value: libFlag ? "default-tokens" : "themed-or-custom",
      threshold: "Custom brand tokens overriding library defaults",
      location: { file: shadcnHitFile || cssSources[0]?.file || "." },
      result: libFlag ? "flag" : "pass",
    }),
    buildEvidence("NVC-SYS-01", {
      method: "token_parse",
      value: `tokens:${tokenDefs},rawHex:${nonRootHex.size},svgHex:${unbrandedSvgHex.size}`,
      threshold: "(tokenDefs >= 4 or rawHex <= 6) and svgHex <= 6",
      location: { file: cssSources[0]?.file || htmlSources[0]?.file || "." },
      result: sysFlag ? "flag" : "pass",
    }),
  ];
}

function buildCountFlag(checkId, hits, fallbackFile, spec) {
  const minCount = spec.minCount ?? 1;
  return buildEvidence(checkId, {
    method: spec.method || "text",
    value: hits.length,
    threshold: spec.threshold,
    location: { file: hits[0]?.file || fallbackFile || "." },
    result: hits.length >= minCount ? "flag" : "pass",
    confidence: spec.confidence || "measured",
  });
}

function checkEmojiAndDeadLinks(htmlAndCodeSources) {
  const emojiHits = [];
  for (const src of htmlAndCodeSources) {
    ICON_TAG_TEXT_RE.lastIndex = 0;
    for (const m of src.text.matchAll(ICON_TAG_TEXT_RE)) {
      const found = m[1].match(EMOJI_RE);
      if (found) emojiHits.push({ file: src.file, emoji: found[0] });
    }
  }
  const fallback = htmlAndCodeSources[0]?.file;
  const deadHits = collectMatches(htmlAndCodeSources, DEAD_HREF_RE);
  const toolHits = collectMatches(htmlAndCodeSources, TOOL_FP_RE);
  return [
    buildCountFlag("NVC-ICO-01", emojiHits, fallback, { threshold: "0 emoji icons inside UI controls or headings" }),
    buildCountFlag("NVC-INT-02", deadHits, fallback, { method: "dom", threshold: "0 dead href=# or javascript:void(0) links" }),
    buildCountFlag("NVC-SYS-02", toolHits, fallback, { method: "dom", threshold: "0 starter builder badges or Vite/Next default titles" }),
  ];
}

function extractUiCopySources(htmlSources, codeSources) {
  const out = [...htmlSources];
  for (const src of codeSources) {
    const literals = [...src.text.matchAll(/(["'`])(?:\\[\s\S]|(?!\1)[^\\]){3,2000}\1/g)].map((m) => m[0]);
    if (literals.length) out.push({ file: src.file, text: literals.join("\n") });
  }
  return out;
}

function findClosingTagIndex(lower, tagName, fromIdx) {
  let depth = 1;
  let pos = fromIdx;
  const openRe = new RegExp(`<${tagName}\\b[^>]*>`, "gi");
  const closeTag = `</${tagName}>`;
  while (depth > 0 && pos < lower.length) {
    const nextClose = lower.indexOf(closeTag, pos);
    if (nextClose === -1) return lower.length;
    openRe.lastIndex = pos;
    const nextOpen = openRe.exec(lower);
    if (nextOpen && nextOpen.index < nextClose) {
      depth += 1;
      pos = nextOpen.index + nextOpen[0].length;
    } else {
      depth -= 1;
      pos = nextClose + closeTag.length;
    }
  }
  return pos;
}

function stripExemptCopyBlocks(text) {
  const lower = text.toLowerCase();
  const openRe = /<(article|section|div|aside|footer|p|span|Text)\b([^>]*)>/g;
  let out = "";
  let cursor = 0;
  for (let m = openRe.exec(text); m; m = openRe.exec(text)) {
    if (m.index < cursor || m[0].endsWith("/>") || !EXEMPT_CLASS_RE.test(m[2])) continue;
    out += text.slice(cursor, m.index);
    cursor = findClosingTagIndex(lower, m[1].toLowerCase(), m.index + m[0].length);
    openRe.lastIndex = cursor;
  }
  return out + text.slice(cursor);
}

function countParaWords(rawInner) {
  return rawInner.replace(INLINE_TAG_RE, "").replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
}

function scanBloatedParas(sources) {
  let bloatedCount = 0;
  let maxWords = 0;
  let firstFile = "";
  for (const src of sources) {
    UI_PARA_RE.lastIndex = 0;
    for (const m of src.text.matchAll(UI_PARA_RE)) {
      const words = countParaWords(m[3]);
      maxWords = Math.max(maxWords, words);
      if (words > 35) {
        bloatedCount += 1;
        firstFile ||= src.file;
      }
    }
  }
  return { bloatedCount, maxWords, firstFile };
}

function checkCopyDensity(htmlAndCodeSources, copySources, allowLongCopy) {
  const cleanUi = htmlAndCodeSources.map((s) => ({ file: s.file, text: stripExemptCopyBlocks(s.text) }));
  const cleanCopy = copySources.map((s) => ({ file: s.file, text: stripExemptCopyBlocks(s.text) }));
  const redundant = collectMatches(cleanCopy, REDUNDANT_HELPER_RE);
  const { bloatedCount, maxWords, firstFile } = scanBloatedParas(cleanUi);
  const flagged = !allowLongCopy && (redundant.length > 0 || bloatedCount >= 2 || maxWords > 50);
  return buildEvidence("NVC-CNT-03", {
    method: "text",
    value: `redundant:${redundant.length},bloatedParas:${bloatedCount},maxParaWords:${maxWords}`,
    threshold: allowLongCopy
      ? "Documented brandTokens.allowLongCopy override"
      : "0 redundant helper phrases, <= 1 UI <p> > 35w, max <p> <= 50w",
    location: { file: redundant[0]?.file || firstFile || copySources[0]?.file || "." },
    result: flagged ? "flag" : "pass",
    confidence: "heuristic",
  });
}

function checkCopyTells(htmlSources, codeSources, allowLongCopy = false) {
  const copySources = extractUiCopySources(htmlSources, codeSources);
  const fallback = copySources[0]?.file;
  const placeholders = collectMatches(copySources, PLACEHOLDER_RE);
  const buzzwords = collectMatches(copySources, BUZZWORD_RE);
  const tics = collectMatches(copySources, TIC_RE);
  return [
    buildCountFlag("NVC-CNT-01", placeholders, fallback, { threshold: "0 placeholder names/domains/unattributed stats", confidence: "heuristic" }),
    buildCountFlag("NVC-CNT-02", buzzwords, fallback, { threshold: "0 stock AI buzzword phrases", confidence: "heuristic" }),
    checkCopyDensity([...htmlSources, ...codeSources], copySources, allowLongCopy),
    buildCountFlag("NVC-CNT-04", tics, fallback, { minCount: 3, threshold: "< 3 em-dash or AI copy tic hits", confidence: "heuristic" }),
  ];
}

/** Collect typed static [D] Classifier Evidence records across code, CSS, and HTML sources. */
export function collectStaticClassifierEvidence(bundle) {
  const codeSources = bundle.codeSources || [];
  const cssSources = bundle.cssSources || [];
  const htmlSources = bundle.htmlSources || [];
  const allSources = [...cssSources, ...htmlSources, ...codeSources];
  const brandColors = normalizeSet(bundle.brandTokens?.colors);
  const brandFonts = normalizeSet(bundle.brandTokens?.fonts);
  const allowGradients = Boolean(bundle.brandTokens?.allowGradients);
  const allowGlow = Boolean(bundle.brandTokens?.allowGlow);
  const allowLongCopy = Boolean(bundle.brandTokens?.allowLongCopy);

  return [
    checkPurplePalette(allSources, brandColors),
    ...checkGradientsAndClip(allSources, allowGradients),
    ...checkGlowAndGlass(allSources, allowGlow),
    checkFontStack(cssSources, htmlSources, brandFonts),
    ...checkUntouchedLibAndTokens({ cssSources, htmlSources, codeSources }, brandColors, brandFonts),
    ...checkEmojiAndDeadLinks([...htmlSources, ...codeSources]),
    ...checkCopyTells(htmlSources, codeSources, allowLongCopy),
  ];
}
