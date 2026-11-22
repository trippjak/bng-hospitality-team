#!/usr/bin/env node
/**
 * measure-ui-ratchet.mjs — Static 5D UX/UI AST/CSS checker & Playwright DOM-probe exporter.
 * Replaces raw backend 400-LOC truncation with Decision-Density module checks, anti-cramming,
 * multi-file cycle detection, typography/motion CSS rules, and rendered DOM assertions.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { collectStaticClassifierEvidence } from "./classifier-evidence.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CODE_EXTS = new Set([".js", ".mjs", ".ts", ".tsx"]);
const IGNORE_DIRS = new Set([".git", "node_modules", ".venv", "sealed", "dist"]);
const TS_CANDIDATES = [
  resolve(SCRIPT_DIR, "..", "..", "..", "node_modules", "typescript", "lib", "typescript.js"),
  join(process.cwd(), "node_modules", "typescript", "lib", "typescript.js"),
  join(homedir(), "code", "JEV-harness-framework", "node_modules", "typescript", "lib", "typescript.js"),
  join(homedir(), "code", "rocketfuel-rebuild", "node_modules", "typescript", "lib", "typescript.js"),
  join(homedir(), "code", "business-club-ops", "node_modules", "typescript", "lib", "typescript.js"),
];
export const UI_LIMITS = { fileLines: 650, maxParams: 5, cognitive: 15, linearFnLines: 80, complexFnLines: 60, lineChars: 140 };

let cachedAst = null;

async function loadAst4d() {
  if (cachedAst) return cachedAst;
  if (!process.env.FOURD_TS_MODULE || !existsSync(process.env.FOURD_TS_MODULE)) {
    const found = TS_CANDIDATES.find((c) => existsSync(c));
    if (found) process.env.FOURD_TS_MODULE = found;
  }
  const siblingAst = resolve(SCRIPT_DIR, "..", "..", "ratchet-review", "scripts", "lib", "ast_4d.mjs");
  const repoAst = join(homedir(), "code", "my-skills", "ratchet-review", "scripts", "lib", "ast_4d.mjs");
  const astPath = [siblingAst, repoAst].find((p) => existsSync(p));
  if (!astPath) throw new Error(`Missing ast_4d.mjs (checked ${siblingAst} and ${repoAst})`);
  cachedAst = await import(pathToFileURL(astPath).href);
  return cachedAst;
}

function walkFilesByExt(dirPath, rootDir, exts, out = []) {
  if (!existsSync(dirPath)) return out;
  for (const entry of readdirSync(dirPath)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dirPath, entry);
    const st = statSync(full);
    if (st.isDirectory()) walkFilesByExt(full, rootDir, exts, out);
    else if (exts.has(extname(entry))) out.push(relative(rootDir, full));
  }
  return out.sort();
}

function stripStringLiterals(line) {
  return line.replace(/(["'`])(?:\\.|(?!\1).)*\1/g, '""');
}

function collectLineAndSinkViolations(relPath, content) {
  const violations = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const trim = raw.trim();
    if (!trim || trim.startsWith("//") || trim.startsWith("/*") || trim.startsWith("*")) continue;
    if (/\.(?:innerHTML|outerHTML)\s*=|\.insertAdjacentHTML\s*\(/.test(raw)) {
      violations.push({ file: relPath, rule: "unsafe-html-sink", message: `${relPath}:${i + 1} uses unsafe HTML injection sink` });
    }
    const clean = stripStringLiterals(raw);
    const exemptLong = /(https?:\/\/|data:image\/|\b(?:points|d)\s*[:=])/i.test(raw);
    if (!exemptLong && raw.length > UI_LIMITS.lineChars) {
      violations.push({ file: relPath, rule: "line-cramming", message: `${relPath}:${i + 1} has ${raw.length} chars (limit <= ${UI_LIMITS.lineChars})` });
    }
    if (!/^\s*for\s*\(/.test(raw) && (clean.match(/;/g) || []).length >= 3) {
      violations.push({ file: relPath, rule: "multi-statement-line", message: `${relPath}:${i + 1} packs 3+ statements onto one line` });
    }
  }
  return violations;
}

function collectUiAstViolations(relPath, report) {
  const out = [];
  if (report.lines > UI_LIMITS.fileLines) {
    out.push({ file: relPath, rule: "ui-file-lines", message: `${relPath} has ${report.lines} lines (limit <= ${UI_LIMITS.fileLines})` });
  }
  for (const v of report.violations) {
    if (v.rule === "shallow-trampoline") out.push(v);
  }
  for (const fn of report.functions) {
    if (fn.params > UI_LIMITS.maxParams) {
      out.push({ file: relPath, rule: "max-params", message: `${relPath}:${fn.startLine} "${fn.name}" takes ${fn.params} params (<= ${UI_LIMITS.maxParams})` });
    }
    if (fn.cognitive > UI_LIMITS.cognitive) {
      out.push({ file: relPath, rule: "ui-cognitive-complexity", message: `${relPath}:${fn.startLine} "${fn.name}" has cognitive complexity ${fn.cognitive} (<= ${UI_LIMITS.cognitive})` });
    }
    const fnLimit = fn.cognitive <= UI_LIMITS.cognitive ? UI_LIMITS.linearFnLines : UI_LIMITS.complexFnLines;
    if (fn.lines > fnLimit) {
      out.push({ file: relPath, rule: "ui-function-lines", message: `${relPath}:${fn.startLine} "${fn.name}" spans ${fn.lines} lines (<= ${fnLimit})` });
    }
  }
  return out;
}

function auditCssText(relPath, cssText, ast) {
  const analysis = ast.analyzeCssSource(cssText);
  const violations = [];
  if (analysis.importantCount > 0) {
    violations.push({ file: relPath, rule: "css-no-important", message: `${relPath} has ${analysis.importantCount} !important declaration(s)` });
  }
  if (analysis.sameContextDuplicateSelectors > 0) {
    violations.push({ file: relPath, rule: "css-duplicate-selector", message: `${relPath} repeats selectors in same context: ${analysis.duplicateSelectors.join(", ")}` });
  }
  const stripped = cssText.replace(/\/\*[\s\S]*?\*\//g, "");
  const fontSizes = [...stripped.matchAll(/font-size\s*:\s*([^;}\n]+)/gi)].map((m) => m[1].trim());
  const pxCount = fontSizes.filter((v) => /\dpx\b/i.test(v)).length;
  const relCount = fontSizes.filter((v) => /\b(?:rem|em)\b|clamp\(|var\(/i.test(v)).length;
  if (pxCount > 2 && pxCount > relCount) {
    violations.push({ file: relPath, rule: "css-rem-typography", message: `${relPath} uses ${pxCount} hardcoded px font-size rules vs ${relCount} rem/fluid rules` });
  }
  if (/\b(?:transition|animation)\s*:/i.test(stripped) && !/@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/i.test(stripped)) {
    violations.push({ file: relPath, rule: "css-reduced-motion", message: `${relPath} uses motion without @media (prefers-reduced-motion: reduce)` });
  }
  if (/@import\b/i.test(stripped)) {
    violations.push({ file: relPath, rule: "css-no-import", message: `${relPath} uses blocking @import rule` });
  }
  return { analysis, violations };
}

function resolveRelImport(fromRel, spec, absRoot) {
  const base = resolve(dirname(resolve(absRoot, fromRel)), spec);
  for (const cand of [base, `${base}.js`, `${base}.mjs`, `${base}.ts`, `${base}.tsx`]) {
    if (existsSync(cand)) return relative(absRoot, cand);
  }
  return null;
}

export async function auditUiBundle(candidateDir, opts = {}) {
  const absRoot = resolve(candidateDir);
  const ast = await loadAst4d();
  const codeFiles = walkFilesByExt(absRoot, absRoot, CODE_EXTS);
  const cssFiles = walkFilesByExt(absRoot, absRoot, new Set([".css"]));
  const htmlFiles = walkFilesByExt(absRoot, absRoot, new Set([".html"]));
  const violations = [];
  const adjacency = new Map();
  const codeReports = [];
  const codeSources = [];
  const cssSources = [];
  const htmlSources = [];

  for (const relPath of codeFiles) {
    const content = readFileSync(resolve(absRoot, relPath), "utf8");
    codeSources.push({ file: relPath, text: content });
    const report = ast.analyzeTsSource(relPath, content);
    codeReports.push({ file: relPath, lines: report.lines, functions: report.functions.length, exports: report.runtimeExports });
    violations.push(...collectUiAstViolations(relPath, report), ...collectLineAndSinkViolations(relPath, content));
    adjacency.set(relPath, report.relativeImports.map((s) => resolveRelImport(relPath, s, absRoot)).filter(Boolean));
  }
  for (const cycle of ast.findCircularComponents(adjacency)) {
    violations.push({ file: cycle[0], rule: "circular-dependency", message: `Circular import detected: ${cycle.join(" -> ")}` });
  }

  let cssSummary = null;
  for (const relCss of cssFiles) {
    const cssText = readFileSync(resolve(absRoot, relCss), "utf8");
    cssSources.push({ file: relCss, text: cssText });
    const res = auditCssText(relCss, cssText, ast);
    cssSummary = res.analysis;
    violations.push(...res.violations);
  }
  for (const relHtml of htmlFiles) {
    const html = readFileSync(resolve(absRoot, relHtml), "utf8");
    htmlSources.push({ file: relHtml, text: html });
    if (!/<html[^>]*\blang=["'][^"']+["']/i.test(html) || !/<meta[^>]*name=["']viewport["']/i.test(html) || !/<main\b/i.test(html)) {
      violations.push({ file: relHtml, rule: "html-landmarks", message: `${relHtml} requires <html lang>, viewport meta, and <main>` });
    }
  }
  if (!codeFiles.length || !cssFiles.length || !htmlFiles.length) {
    violations.push({ file: absRoot, rule: "incomplete-bundle", message: "Bundle must contain HTML, CSS, and JS/TS files" });
  }
  const classifierEvidence = collectStaticClassifierEvidence({
    codeSources,
    cssSources,
    htmlSources,
    brandTokens: opts.brandTokens || null,
  });
  return { ratchetPass: violations.length === 0, violationCount: violations.length, violations, codeFiles: codeReports, cssSummary, classifierEvidence };
}

function stripModuleGlue(src) {
  return src
    .replace(/import\s*\{[\s\S]*?\}\s*from\s*["'][^"']+["'];?\r?\n?/g, "")
    .replace(/\bexport\s+/g, "");
}

export function getRenderedDomProbeSource() {
  const controlsRaw = stripModuleGlue(readFileSync(join(SCRIPT_DIR, "dom-probe-controls.mjs"), "utf8"));
  const probeRaw = stripModuleGlue(readFileSync(join(SCRIPT_DIR, "dom-probe.mjs"), "utf8"));
  return `() => {\n${controlsRaw}\n${probeRaw}\nreturn runRenderedUiProbe();\n}`;
}

export async function runUiRatchetSelftest() {
  const ast = await loadAst4d();
  const crammed = `const a = 1; const b = 2; const c = 3;\nconst longStr = "${"x".repeat(150)}";\n`;
  const cramViol = collectLineAndSinkViolations("cram.js", crammed);
  const cssBad = auditCssText("bad.css", "body { font-size: 14px; } h1 { font-size: 20px; } p { font-size: 13px; transition: all 0.2s; }", ast);
  const cssGood = auditCssText("good.css", "body { font-size: 1rem; } h1 { font-size: 1.5rem; } @media (prefers-reduced-motion: reduce) { * { transition: none; } }", ast);
  const staticEv = collectStaticClassifierEvidence({
    htmlSources: [{ file: "index.html", text: '<button class="bg-indigo-600">\u{1F680} Supercharge</button><a href="#">Go</a>' }],
    cssSources: [{ file: "style.css", text: "body { font-family: Inter, sans-serif; }" }],
    codeSources: [],
  });
  const evPass = ["NVC-COL-01", "NVC-ICO-01", "NVC-INT-02", "NVC-TYP-01"].every((id) => staticEv.some((e) => e.check_id === id && e.result === "flag"));
  const results = [
    { name: "cramming-red", ok: cramViol.some((v) => v.rule === "multi-statement-line") && cramViol.some((v) => v.rule === "line-cramming") },
    { name: "css-rem-motion-red", ok: cssBad.violations.some((v) => v.rule === "css-rem-typography") && cssBad.violations.some((v) => v.rule === "css-reduced-motion") },
    { name: "css-clean-green", ok: cssGood.violations.length === 0 },
    { name: "classifier-evidence-red", ok: evPass },
    { name: "dom-probe-source-nonempty", ok: getRenderedDomProbeSource().includes("classifierEvidence") },
  ];
  return { selftest: results.every((r) => r.ok) ? "PASS" : "FAIL", results };
}

function parseMeasureArgs(args) {
  let target = "";
  let brandTokens = null;
  let outPath = "";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--brand-tokens" && args[i + 1]) {
      brandTokens = JSON.parse(readFileSync(resolve(args[++i]), "utf8"));
    } else if (a === "--out" && args[i + 1]) {
      outPath = resolve(args[++i]);
    } else if (!a.startsWith("-")) {
      target = a;
    }
  }
  return { target, brandTokens, outPath, evidenceOnly: args.includes("--evidence") };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--selftest")) {
    const res = await runUiRatchetSelftest();
    console.log(JSON.stringify(res, null, 2));
    process.exit(res.selftest === "PASS" ? 0 : 1);
  }
  if (args.includes("--print-dom-probe")) {
    console.log(getRenderedDomProbeSource());
    return;
  }
  const { target, brandTokens, outPath, evidenceOnly } = parseMeasureArgs(args);
  if (!target) {
    console.error("Usage: measure-ui-ratchet.mjs <candidateDir> [--evidence] [--out <json>] [--brand-tokens <json>] | --selftest | --print-dom-probe");
    process.exit(2);
  }
  const report = await auditUiBundle(target, { brandTokens });
  const jsonText = JSON.stringify(report, null, 2);
  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${jsonText}\n`, "utf8");
  }
  console.log(jsonText);
  process.exit(evidenceOnly || report.ratchetPass ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(JSON.stringify({ status: "error", message: err.message }));
    process.exit(1);
  });
}
