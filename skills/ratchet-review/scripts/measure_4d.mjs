#!/usr/bin/env node
/**
 * scripts/measure_4d.mjs — 4D Deep-Module AST + CSS Ratchet Gate (R-12).
 * @deep-module: cohesive 4D repository scanner, UI candidate evaluator, and Phase 1->5 baseline ratchet comparator.
 *
 * Scans the current repository (or the given paths) and any candidate UI directories for 4D structural violations:
 *   1. File size < 400 lines (or <= 500 with @deep-module:)
 *   2. Function size <= 60 lines (or <= 80 with @linear:)
 *   3. Function parameter count <= 5
 *   4. Cognitive complexity <= 15 target / <= 25 hard cap
 *   5. 0 circular import dependencies + 0 shallow pass-through trampolines
 *
 * Usage:
 *   node scripts/measure_4d.mjs [paths...] [--save-baseline <json>] [--compare-baseline <json>]
 *   node scripts/measure_4d.mjs --dir <root> [subdir,subdir]
 *   node scripts/measure_4d.mjs --measure-candidate <dir>
 *   node scripts/measure_4d.mjs --selftest
 */

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LIMITS,
  analyzeTsSource,
  analyzePySource,
  analyzeCssSource,
  findCircularComponents,
} from './lib/ast_4d.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const CODE_EXTS = new Set(['.js', '.mjs', '.ts', '.tsx', '.py']);
const IGNORE_DIRS = new Set(['.git', 'node_modules', '.venv', 'sealed']);

function resolveImportTarget(fromRelPath, specifier, rootDir) {
  const fromDir = dirname(resolve(rootDir, fromRelPath));
  const base = resolve(fromDir, specifier);
  const candidates = [base, `${base}.mjs`, `${base}.js`, `${base}.ts`, `${base}.tsx`];
  for (const c of candidates) {
    if (existsSync(c)) return relative(rootDir, c);
  }
  return null;
}

function walkCodeFiles(dirPath, rootDir, out = []) {
  if (!existsSync(dirPath)) return out;
  if (statSync(dirPath).isFile()) {
    if (CODE_EXTS.has(extname(dirPath))) out.push(relative(rootDir, dirPath));
    return out;
  }
  for (const entry of readdirSync(dirPath)) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dirPath, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkCodeFiles(full, rootDir, out);
    } else if (CODE_EXTS.has(extname(entry))) {
      out.push(relative(rootDir, full));
    }
  }
  return out;
}

function summarizeScan(fileReports, cyclesCount, violationsCount) {
  const allFns = fileReports.flatMap((r) => r.functions || []);
  const maxCognitive = allFns.reduce((m, f) => Math.max(m, f.cognitive || 0), 0);
  const maxParams = allFns.reduce((m, f) => Math.max(m, f.params || 0), 0);
  const maxFunctionLines = allFns.reduce((m, f) => Math.max(m, f.lines || 0), 0);
  const trampolineCount = fileReports.reduce((s, r) => s + (r.trampolineCount || 0), 0);
  const avgDepthRatio = fileReports.length
    ? Number((fileReports.reduce((s, r) => s + (r.depthRatio || 0), 0) / fileReports.length).toFixed(1))
    : 0;
  return {
    filesScanned: fileReports.length,
    cycles: cyclesCount,
    violationsCount,
    maxCognitive,
    maxParams,
    maxFunctionLines,
    trampolineCount,
    avgDepthRatio,
  };
}

export function compareRatchetBaseline(baseSummary, currSummary) {
  const deltas = {
    cycles: currSummary.cycles - baseSummary.cycles,
    violationsCount: currSummary.violationsCount - baseSummary.violationsCount,
    maxCognitive: currSummary.maxCognitive - baseSummary.maxCognitive,
    maxParams: currSummary.maxParams - baseSummary.maxParams,
    maxFunctionLines: currSummary.maxFunctionLines - baseSummary.maxFunctionLines,
    trampolineCount: currSummary.trampolineCount - baseSummary.trampolineCount,
    avgDepthRatio: Number((currSummary.avgDepthRatio - baseSummary.avgDepthRatio).toFixed(1)),
  };
  const regressions = [];
  if (deltas.cycles > 0) regressions.push(`cycles increased by +${deltas.cycles}`);
  if (deltas.violationsCount > 0) regressions.push(`violations increased by +${deltas.violationsCount}`);
  if (deltas.trampolineCount > 0) regressions.push(`shallow trampolines increased by +${deltas.trampolineCount}`);
  if (currSummary.maxCognitive > Math.max(baseSummary.maxCognitive, LIMITS.targetCognitive)) {
    regressions.push(`maxCognitive regressed (${baseSummary.maxCognitive} -> ${currSummary.maxCognitive})`);
  }
  if (currSummary.maxParams > Math.max(baseSummary.maxParams, LIMITS.maxParams)) {
    regressions.push(`maxParams regressed (${baseSummary.maxParams} -> ${currSummary.maxParams})`);
  }
  return { status: regressions.length === 0 ? 'PASS' : 'FAIL', deltas, regressions };
}

export function scanRepository4D(rootDir = REPO_ROOT, targetDirs = ['scripts', 'fixtures']) {
  const files = [];
  for (const d of targetDirs) {
    walkCodeFiles(resolve(rootDir, d), rootDir, files);
  }

  const fileReports = [];
  const adjacency = new Map();
  const violations = [];

  for (const relPath of files.sort()) {
    const content = readFileSync(resolve(rootDir, relPath), 'utf8');
    const ext = extname(relPath);
    const report = ext === '.py' ? analyzePySource(relPath, content) : analyzeTsSource(relPath, content);
    fileReports.push(report);
    violations.push(...report.violations);

    const edges = [];
    for (const spec of report.relativeImports) {
      const target = resolveImportTarget(relPath, spec, rootDir);
      if (target) edges.push(target);
    }
    adjacency.set(relPath, edges);
  }

  const cycles = findCircularComponents(adjacency);
  for (const cycle of cycles) {
    violations.push({
      file: cycle[0],
      rule: 'circular-dependency',
      message: `Circular import detected: ${cycle.join(' -> ')}`,
    });
  }

  const summary = summarizeScan(fileReports, cycles.length, violations.length);
  return {
    ok: violations.length === 0,
    filesScanned: fileReports.length,
    cycles: cycles.length,
    summary,
    violations,
    fileReports,
  };
}

function collectCandidateCssViolations(relStylePath, cssAnalysis, usesHidden, cssContent = '') {
  const violations = [];
  if (cssAnalysis.importantCount > 0) {
    violations.push({
      file: relStylePath,
      rule: 'css-no-important',
      message: `${relStylePath} has ${cssAnalysis.importantCount} !important declaration(s) (limit === 0)`,
    });
  }
  if (cssAnalysis.sameContextDuplicateSelectors > 0) {
    violations.push({
      file: relStylePath,
      rule: 'css-duplicate-selector',
      message: `${relStylePath} has ${cssAnalysis.sameContextDuplicateSelectors} same-context duplicate selector block(s): ${cssAnalysis.duplicateSelectors.join(', ')}`,
    });
  }
  if (usesHidden && !cssAnalysis.hasHiddenGuard) {
    violations.push({
      file: relStylePath,
      rule: 'css-hidden-guard',
      message: `${relStylePath} is missing [hidden][hidden] { display: none; } required when bundle uses [hidden]`,
    });
  }
  const usesMotion = /\b(transition|animation)\s*:/.test(cssContent);
  const hasReducedMotionGuard = /@media\s*\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)[\s\S]*?:root:root\s*\*/.test(
    cssContent,
  );
  if (usesMotion && !hasReducedMotionGuard) {
    violations.push({
      file: relStylePath,
      rule: 'css-reduced-motion-guard',
      message: `${relStylePath} declares transition/animation without @media (prefers-reduced-motion: reduce) { :root:root * ... }`,
    });
  }
  return violations;
}

function collectCandidateHtmlViolations(relHtmlPath, htmlContent) {
  const violations = [];
  const hasLang = /<html[^>]*\blang=["'][^"']+["']/i.test(htmlContent);
  const hasViewport = /<meta[^>]*name=["']viewport["']/i.test(htmlContent);
  const hasTitle = /<title>\s*\S[\s\S]*?<\/title>/i.test(htmlContent);
  if (!hasLang || !hasViewport || !hasTitle) {
    violations.push({
      file: relHtmlPath,
      rule: 'html-document-landmark-guard',
      message: `${relHtmlPath} must include <html lang="...">, <meta name="viewport">, and non-empty <title>`,
    });
  }
  return violations;
}

export function measureCandidate4D(candidateDir) {
  const cwdCandidate = resolve(process.cwd(), candidateDir);
  const absDir = existsSync(cwdCandidate) ? cwdCandidate : resolve(REPO_ROOT, candidateDir);
  const readOpt = (f) => (existsSync(resolve(absDir, f)) ? readFileSync(resolve(absDir, f), 'utf8') : '');
  const appContent = readOpt('app.js');
  const cssContent = readOpt('style.css');
  const htmlContent = readOpt('index.html');

  const jsAnalysis = analyzeTsSource(relative(REPO_ROOT, resolve(absDir, 'app.js')), appContent);
  const cssAnalysis = analyzeCssSource(cssContent);
  const htmlLines = htmlContent.split(/\r?\n/).length - (htmlContent.endsWith('\n') ? 1 : 0);
  const usesHidden = /(?<![-\w])hidden(?![-\w])/.test(htmlContent) || /\.hidden\b/.test(appContent);
  const violations = [
    ...jsAnalysis.violations,
    ...collectCandidateCssViolations(relative(REPO_ROOT, resolve(absDir, 'style.css')), cssAnalysis, usesHidden, cssContent),
    ...collectCandidateHtmlViolations(relative(REPO_ROOT, resolve(absDir, 'index.html')), htmlContent),
  ];
  if (!appContent.trim() || !cssContent.trim() || !htmlContent.trim()) {
    violations.push({
      file: relative(REPO_ROOT, absDir),
      rule: 'incomplete-bundle',
      message: 'Candidate bundle is missing non-empty index.html, style.css, or app.js',
    });
  }

  const fns = jsAnalysis.functions;
  const maxCognitive = fns.length ? Math.max(...fns.map((f) => f.cognitive)) : 0;
  const totalCognitive = fns.reduce((acc, f) => acc + f.cognitive, 0);
  return {
    ratchetPass: violations.length === 0,
    violations,
    js: {
      lines: jsAnalysis.lines,
      bytes: Buffer.byteLength(appContent, 'utf8'),
      runtimeExports: jsAnalysis.runtimeExports,
      depthRatio: jsAnalysis.depthRatio,
      functionCount: fns.length,
      maxFunctionLines: fns.length ? Math.max(...fns.map((f) => f.lines)) : 0,
      maxParams: fns.length ? Math.max(...fns.map((f) => f.params)) : 0,
      maxCognitiveComplexity: maxCognitive,
      totalCognitiveComplexity: totalCognitive,
      functionsOverTarget15: fns.filter((f) => f.cognitive > LIMITS.targetCognitive).length,
      functions: fns,
    },
    css: cssAnalysis,
    html: { lines: htmlLines, bytes: Buffer.byteLength(htmlContent, 'utf8') },
  };
}

function appendCssSelftests(results) {
  const cssMediaGreen = analyzeCssSource(
    '[hidden][hidden] { display: none; }\n.card { padding: 16px; }\n@media (max-width: 900px) { .card { padding: 8px; } }\n',
  );
  results.push({
    name: 'css-media-context-dup-green',
    ok: cssMediaGreen.sameContextDuplicateSelectors === 0 && cssMediaGreen.hasHiddenGuard,
  });

  const cssSameDupRed = analyzeCssSource('.card { padding: 16px; }\n.card { margin: 8px; }\n');
  results.push({
    name: 'css-same-context-dup-red',
    ok: cssSameDupRed.sameContextDuplicateSelectors === 1,
  });

  const cssImportantRed = analyzeCssSource('.card { display: flex !important; }\n');
  results.push({
    name: 'css-important-red',
    ok: cssImportantRed.importantCount === 1,
  });

  const missingHiddenGuard = collectCandidateCssViolations(
    'fake.css',
    cssSameDupRed,
    true,
    '.btn { transition: color 0.2s; }',
  );
  results.push({
    name: 'css-missing-hidden-and-motion-guard-red',
    ok:
      missingHiddenGuard.some((v) => v.rule === 'css-hidden-guard') &&
      missingHiddenGuard.some((v) => v.rule === 'css-reduced-motion-guard'),
  });

  const missingHtmlGuard = collectCandidateHtmlViolations('fake.html', '<html><body>Hi</body></html>');
  results.push({
    name: 'html-missing-landmark-guard-red',
    ok: missingHtmlGuard.some((v) => v.rule === 'html-document-landmark-guard'),
  });
}

function appendRatchetSelftests(results) {
  const trampolineRed = analyzeTsSource(
    'shallow-wrapper.js',
    'export function proxy(a, b, c) { return target(a, b, c); }\n',
  );
  results.push({
    name: 'shallow-trampoline-red',
    ok: trampolineRed.violations.some((v) => v.rule === 'shallow-trampoline'),
  });

  const baseSum = { cycles: 0, violationsCount: 2, maxCognitive: 18, maxParams: 5, maxFunctionLines: 50, trampolineCount: 0, avgDepthRatio: 45 };
  const greenCurr = { cycles: 0, violationsCount: 0, maxCognitive: 12, maxParams: 4, maxFunctionLines: 40, trampolineCount: 0, avgDepthRatio: 60 };
  const redCurr = { cycles: 1, violationsCount: 3, maxCognitive: 20, maxParams: 6, maxFunctionLines: 55, trampolineCount: 1, avgDepthRatio: 30 };
  results.push({
    name: 'ratchet-baseline-compare-green-and-red',
    ok: compareRatchetBaseline(baseSum, greenCurr).status === 'PASS' && compareRatchetBaseline(baseSum, redCurr).status === 'FAIL',
  });
}

function runSelftest() {
  const results = [];

  const live = scanRepository4D(REPO_ROOT, ['scripts']);
  results.push({ name: 'live-scripts-green', ok: live.ok, violations: live.violations });

  const bigFile = analyzeTsSource('fake-big.js', 'const x = 1;\n'.repeat(405));
  results.push({ name: 'oversized-file-red', ok: bigFile.violations.some((v) => v.rule === 'file-lines') });

  const deepAllowance = analyzeTsSource('fake-deep.js', '// @deep-module: justified\n' + 'const x = 1;\n'.repeat(450));
  results.push({ name: 'deep-module-allowance-green', ok: deepAllowance.violations.length === 0 });

  const wideDeep = analyzeTsSource(
    'fake-wide-deep.js',
    '// @deep-module: too wide\nexport const a=1, b=2, c=3, d=4, e=5, f=6;\n' + 'const x = 1;\n'.repeat(420),
  );
  results.push({
    name: 'deep-module-too-many-exports-red',
    ok: wideDeep.violations.some((v) => v.rule === 'deep-module-exports'),
  });

  appendCssSelftests(results);

  const bigFn = analyzeTsSource('fake-fn.js', `function huge() {\n${'  const a = 1;\n'.repeat(65)}}`);
  results.push({ name: 'oversized-function-red', ok: bigFn.violations.some((v) => v.rule === 'function-lines') });

  const manyParams = analyzeTsSource('fake-params.js', 'function wide(a, b, c, d, e, f) { return a + f; }');
  results.push({ name: 'excess-params-red', ok: manyParams.violations.some((v) => v.rule === 'max-params') });

  const nestedIfs =
    'function gnarly(x) {\n' +
    '  if (x > 1) { if (x > 2) { if (x > 3) { if (x > 4) { if (x > 5) { if (x > 6) { if (x > 7) { return 1; } } } } } } }\n' +
    '  return 0;\n}';
  const highCog = analyzeTsSource('fake-cog.js', nestedIfs);
  results.push({
    name: 'high-cognitive-red',
    ok: highCog.violations.some((v) => v.rule === 'cognitive-complexity'),
  });

  const pyRes = analyzePySource('fake.py', 'def bad(a, b, c, d, e, f):\n    return a\n');
  results.push({ name: 'python-params-red', ok: pyRes.violations.some((v) => v.rule === 'max-params') });

  const cycleGraph = new Map([
    ['a.mjs', ['b.mjs']],
    ['b.mjs', ['a.mjs']],
  ]);
  const cycles = findCircularComponents(cycleGraph);
  results.push({ name: 'circular-deps-red', ok: cycles.length === 1 });

  appendRatchetSelftests(results);

  const allPassed = results.every((r) => r.ok);
  console.log(JSON.stringify({ selftest: allPassed ? 'PASS' : 'FAIL', results }, null, 2));
  process.exit(allPassed ? 0 : 1);
}

function handleBaselineFlags(args, res) {
  const saveIdx = args.indexOf('--save-baseline');
  if (saveIdx !== -1 && args[saveIdx + 1]) {
    writeFileSync(resolve(args[saveIdx + 1]), JSON.stringify({ summary: res.summary, files: res.fileReports }, null, 2));
  }
  const cmpIdx = args.indexOf('--compare-baseline');
  if (cmpIdx !== -1 && args[cmpIdx + 1]) {
    const baseData = JSON.parse(readFileSync(resolve(args[cmpIdx + 1]), 'utf8'));
    const cmp = compareRatchetBaseline(baseData.summary || baseData, res.summary);
    console.log(JSON.stringify({ ratchetComparison: cmp, baseline: baseData.summary || baseData, current: res.summary }, null, 2));
    if (cmp.status !== 'PASS') process.exit(1);
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) {
    runSelftest();
    return;
  }

  const candIdx = args.indexOf('--measure-candidate');
  if (candIdx !== -1 && args[candIdx + 1]) {
    const metrics = measureCandidate4D(args[candIdx + 1]);
    console.log(JSON.stringify(metrics, null, 2));
    process.exit(metrics.ratchetPass ? 0 : 1);
  }

  const dirIdx = args.indexOf('--dir');
  const saveIdx = args.indexOf('--save-baseline');
  const cmpIdx = args.indexOf('--compare-baseline');
  const flagValueIndices = new Set([
    ...(dirIdx !== -1 ? [dirIdx + 1, dirIdx + 2] : []),
    ...(saveIdx !== -1 ? [saveIdx + 1] : []),
    ...(cmpIdx !== -1 ? [cmpIdx + 1] : []),
  ]);
  const posArgs = dirIdx === -1 ? args.filter((a, idx) => !a.startsWith('--') && !flagValueIndices.has(idx)) : [];
  const rootDir = dirIdx !== -1 && args[dirIdx + 1] ? resolve(args[dirIdx + 1]) : process.cwd();
  const subdirs =
    dirIdx !== -1 && args[dirIdx + 2] && !args[dirIdx + 2].startsWith('--')
      ? args[dirIdx + 2].split(',').filter(Boolean)
      : dirIdx !== -1
        ? ['.']
        : posArgs.length
          ? posArgs
          : ['.'];

  const res = scanRepository4D(rootDir, subdirs);
  handleBaselineFlags(args, res);
  if (!res.ok) {
    console.error('4D Ratchet check FAILED:');
    for (const v of res.violations) console.error(`  - [${v.rule}] ${v.message}`);
    process.exit(1);
  }
  console.log(`4D Ratchet check PASSED (${res.filesScanned} files scanned, ${res.cycles} cycles)`);
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]))) {
  main();
}
