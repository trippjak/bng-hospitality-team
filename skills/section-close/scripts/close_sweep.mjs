#!/usr/bin/env node
/**
 * section-close/scripts/close_sweep.mjs — Deterministic Section-Close Preflight & Verification Gate.
 *
 * Replaces multi-step manual shell discovery in Step 1 (Inventory + Bucket C Safe-Clean + Q14
 * satellite doc scan) and Step 4 (doclint.mjs + decisions-dir.mjs check + glossary-lint.mjs +
 * v4-lite line caps) with a single zero-LLM-token JSON report, plus optional --fix-safe auto-clean.
 *
 * Usage:
 *   node close_sweep.mjs [projectRoot] [--base <gitRef>] [--fix-safe]
 *   node close_sweep.mjs --selftest
 */

import { existsSync, readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REFS_DIR = resolve(__dirname, '..', 'references');
const DOCLINT_PATH = join(REFS_DIR, 'doclint.mjs');
const DECISIONS_DIR_PATH = join(REFS_DIR, 'decisions-dir.mjs');
const GLOSSARY_LINT_PATH = join(REFS_DIR, 'glossary-lint.mjs');

const CANONICAL_COORD_ROOT_FILES = new Set([
  'HANDOFF.md', 'ROADMAP.md', 'BLOCKERS.md', 'DECISIONS.md', 'IMPROVEMENTS.md',
  'GLOSSARY.md', 'WORKFLOW.md', 'RETROSPECTIVE.md', 'PROCESS.md',
]);
const CANONICAL_COORD_DIRS = new Set([
  'decisions', 'improvements', 'blockers', 'archive', 'specs', 'pdrs', 'reviews', 'claims', 'sprints',
]);

function runGit(cwd, args) {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function isV3Config(cfgPath) {
  if (!existsSync(cfgPath)) return false;
  try {
    const cfg = JSON.parse(readFileSync(cfgPath, 'utf8'));
    return Boolean(cfg && cfg.version === 3 && cfg.families);
  } catch {
    return false;
  }
}

function detectRepoMode(root, coordDir) {
  if (existsSync(coordDir)) {
    if (isV3Config(join(coordDir, '.doclint.json'))) return 'v3-directory';
    const hasBlockers = existsSync(join(coordDir, 'BLOCKERS.md'));
    const hasRoadmap = existsSync(join(coordDir, 'ROADMAP.md'));
    const hasHandoff = existsSync(join(coordDir, 'HANDOFF.md'));
    if (hasHandoff && !hasBlockers && !hasRoadmap) return 'v4-lite';
    return hasHandoff ? 'v2-flat' : 'unstructured';
  }
  const hasRootV4 = existsSync(join(root, 'HANDOFF.md')) && existsSync(join(root, 'DECISIONS.md'));
  return hasRootV4 ? 'v4-lite' : 'unstructured';
}

function collectChangedFiles(root, baseRef) {
  const base = baseRef || runGit(root, ['merge-base', 'HEAD', 'origin/main']) || 'HEAD~1';
  const committed = runGit(root, ['diff', '--name-only', `${base}...HEAD`]) || '';
  const working = runGit(root, ['status', '--porcelain']) || '';
  const files = new Set(committed.split('\n').map((s) => s.trim()).filter(Boolean));
  for (const line of working.split('\n')) {
    const m = line.trim().match(/^\S+\s+(?:.+ -> )?(.+)$/);
    if (m) files.add(m[1].trim());
  }
  return [...files].sort();
}

function scanSingleFileBucketC(root, relPath) {
  const abs = join(root, relPath);
  if (!existsSync(abs)) return [];
  const ext = extname(relPath);
  if (!['.js', '.mjs', '.ts', '.tsx', '.css', '.html'].includes(ext)) return [];
  let text = '';
  try { text = readFileSync(abs, 'utf8'); } catch { return []; }
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const findings = [];
  let trailingWsLines = 0;
  for (let i = 0; i < lines.length; i++) {
    if (/[ \t]+$/.test(lines[i])) trailingWsLines++;
    if (/\b(?:console\.debug|debugger)\b/.test(lines[i])) {
      findings.push({ file: relPath, line: i + 1, kind: 'debug-statement', sample: lines[i].trim().slice(0, 80) });
    }
  }
  if (trailingWsLines > 0) {
    findings.push({ file: relPath, line: 1, kind: 'trailing-whitespace', count: trailingWsLines });
  }
  if (ext === '.css') {
    for (const m of text.matchAll(/([^{};]+\{\s*\})/g)) {
      findings.push({ file: relPath, line: 1, kind: 'empty-css-rule', sample: m[1].replace(/\s+/g, ' ').trim() });
    }
  }
  return findings;
}

function scanSatelliteDocsQ14(coordDir) {
  if (!existsSync(coordDir)) return [];
  const satellites = [];
  for (const entry of readdirSync(coordDir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) {
      if (!CANONICAL_COORD_DIRS.has(entry.name)) satellites.push(`coordination/${entry.name}/`);
    } else if (entry.name.endsWith('.md') && !CANONICAL_COORD_ROOT_FILES.has(entry.name)) {
      satellites.push(`coordination/${entry.name}`);
    }
  }
  return satellites;
}

function checkV4LiteCaps(root, coordDir) {
  const dir = existsSync(coordDir) ? coordDir : root;
  const handoffPath = join(dir, 'HANDOFF.md');
  const decisionsPath = join(dir, 'DECISIONS.md');
  const flags = [];
  const mdFiles = readdirSync(dir).filter((f) => f.endsWith('.md'));
  if (mdFiles.length > 4) flags.push(`v4-lite has ${mdFiles.length} .md files (cap <= 4)`);
  if (existsSync(handoffPath)) {
    const lines = readFileSync(handoffPath, 'utf8').replace(/\r\n/g, '\n').split('\n').length;
    if (lines > 80) flags.push(`v4-lite HANDOFF.md has ${lines} lines (cap <= 80)`);
  }
  if (existsSync(decisionsPath)) {
    const text = readFileSync(decisionsPath, 'utf8').replace(/\r\n/g, '\n');
    for (const m of text.matchAll(/^##\s+(D-\d+[^\n]*)\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/gm)) {
      const bodyLines = m[2].trim().split('\n').length + 1;
      if (bodyLines > 10) flags.push(`v4-lite DECISIONS.md entry "${m[1].slice(0, 40)}" is ${bodyLines} lines (cap <= 10)`);
    }
  }
  return { ok: flags.length === 0, fileCount: mdFiles.length, flags };
}

function runSubTool(scriptPath, args, cwd) {
  if (!existsSync(scriptPath)) return { ran: false, ok: true, out: '' };
  try {
    const out = execFileSync(process.execPath, [scriptPath, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ran: true, ok: true, out };
  } catch (err) {
    const out = `${err.stdout || ''}\n${err.stderr || ''}`.trim();
    return { ran: true, ok: false, out };
  }
}

export function applySafeBucketCRemediation(root, bucketCFindings, repoMode) {
  const strippedFiles = [];
  for (const item of bucketCFindings) {
    if (item.kind !== 'trailing-whitespace') continue;
    if (item.file.startsWith('runs/') || item.file.startsWith('sealed/')) continue;
    const abs = join(root, item.file);
    if (!existsSync(abs)) continue;
    const original = readFileSync(abs, 'utf8');
    const cleaned = original.replace(/[ \t]+$/gm, '');
    if (cleaned !== original) {
      writeFileSync(abs, cleaned, 'utf8');
      strippedFiles.push(item.file);
    }
  }
  let rebuiltLedger = false;
  if (repoMode === 'v3-directory') {
    const buildRes = runSubTool(DECISIONS_DIR_PATH, ['index', root], root);
    rebuiltLedger = buildRes.ok;
  }
  return { strippedFiles, rebuiltLedger };
}

function collectBlockingIssues(checks) {
  const { doclintRaw, doclintGate, doclintVerdict, ledgerCheck, glossaryLint, v4LiteCheck, satelliteDocsQ14 } = checks;
  const issues = [];
  if (!doclintRaw.ok) issues.push(`doclint --gate failed (${doclintGate || doclintVerdict})`);
  if (!ledgerCheck.ok) issues.push('decisions-dir.mjs check failed');
  if (!glossaryLint.ok) issues.push('glossary-lint.mjs failed');
  if (v4LiteCheck && !v4LiteCheck.ok) issues.push(...v4LiteCheck.flags);
  if (satelliteDocsQ14.length > 0) issues.push(`Q14 satellite docs in coordination/: ${satelliteDocsQ14.join(', ')}`);
  return issues;
}

export function runCloseSweep(projectRoot = process.cwd(), baseRef = null, fixSafe = false) {
  const root = resolve(projectRoot);
  const coordDir = join(root, 'coordination');
  const repoMode = detectRepoMode(root, coordDir);
  const changedFiles = collectChangedFiles(root, baseRef);
  let bucketCSafeClean = changedFiles.flatMap((f) => scanSingleFileBucketC(root, f));
  let autoFixed = null;
  if (fixSafe) {
    autoFixed = applySafeBucketCRemediation(root, bucketCSafeClean, repoMode);
    bucketCSafeClean = changedFiles.flatMap((f) => scanSingleFileBucketC(root, f));
  }
  const satelliteDocsQ14 = scanSatelliteDocsQ14(coordDir);

  const shouldRunDoclint = repoMode === 'v2-flat' || repoMode === 'v3-directory';
  const doclintRaw = shouldRunDoclint ? runSubTool(DOCLINT_PATH, [root, '--gate'], root) : { ran: false, ok: true, out: '' };
  const doclintVerdict = (doclintRaw.out.match(/^VERDICT:\s*(.+)$/m) || [])[1] || 'SKIPPED';
  const doclintGate = (doclintRaw.out.match(/^GATE:\s*(.+)$/m) || [])[1] || null;
  const doclintFlags = doclintRaw.out.split('\n').filter((l) => l.startsWith('  - ')).map((l) => l.slice(4).trim());

  const ledgerCheck = repoMode === 'v3-directory' ? runSubTool(DECISIONS_DIR_PATH, ['check', root], root) : { ran: false, ok: true, out: '' };
  const glossaryLint = existsSync(join(coordDir, 'GLOSSARY.md')) ? runSubTool(GLOSSARY_LINT_PATH, [root], root) : { ran: false, ok: true, out: '' };
  const v4LiteCheck = repoMode === 'v4-lite' ? checkV4LiteCaps(root, coordDir) : null;
  const blockingIssues = collectBlockingIssues({
    doclintRaw,
    doclintGate,
    doclintVerdict,
    ledgerCheck,
    glossaryLint,
    v4LiteCheck,
    satelliteDocsQ14,
  });

  return {
    status: blockingIssues.length === 0 ? 'READY' : 'ACTION_REQUIRED',
    root,
    repoMode,
    changedFileCount: changedFiles.length,
    changedFiles: changedFiles.slice(0, 40),
    autoFixed,
    bucketCSafeClean,
    satelliteDocsQ14,
    doclint: { ran: doclintRaw.ran, ok: doclintRaw.ok, verdict: doclintVerdict, gate: doclintGate, flags: doclintFlags },
    ledgerCheck: { ran: ledgerCheck.ran, ok: ledgerCheck.ok },
    glossaryLint: { ran: glossaryLint.ran, ok: glossaryLint.ok },
    v4LiteCheck,
    blockingIssues,
  };
}

function runSelftest() {
  const tmp = mkdtempSync(join(tmpdir(), 'close-sweep-test-'));
  try {
    mkdirSync(join(tmp, 'coordination'), { recursive: true });
    writeFileSync(join(tmp, 'coordination', 'HANDOFF.md'), '# Handoff\n\n## State\nClean state.\n');
    writeFileSync(join(tmp, 'coordination', 'SATELLITE_NOTES.md'), '# Unindexed scratch doc\n');
    writeFileSync(join(tmp, 'dirty.js'), 'const a = 1;   \n');
    const r1 = runCloseSweep(tmp);
    const fixRes = applySafeBucketCRemediation(tmp, scanSingleFileBucketC(tmp, 'dirty.js'), 'v4-lite');
    const checks = [
      { name: 'detects-v4-lite', ok: r1.repoMode === 'v4-lite' },
      { name: 'detects-q14-satellite', ok: r1.satelliteDocsQ14.includes('coordination/SATELLITE_NOTES.md') },
      { name: 'blocks-on-q14-satellite', ok: r1.status === 'ACTION_REQUIRED' },
      { name: 'fix-safe-strips-trailing-ws', ok: fixRes.strippedFiles.includes('dirty.js') && readFileSync(join(tmp, 'dirty.js'), 'utf8') === 'const a = 1;\n' },
    ];
    rmSync(join(tmp, 'coordination', 'SATELLITE_NOTES.md'));
    const r2 = runCloseSweep(tmp);
    checks.push({ name: 'ready-after-satellite-clean', ok: r2.status === 'READY' });
    const allOk = checks.every((c) => c.ok);
    console.log(JSON.stringify({ selftest: allOk ? 'PASS' : 'FAIL', checks }, null, 2));
    process.exitCode = allOk ? 0 : 1;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--selftest')) {
    runSelftest();
    return;
  }
  const fixSafe = args.includes('--fix-safe');
  const baseIdx = args.indexOf('--base');
  const baseRef = baseIdx !== -1 ? args[baseIdx + 1] : null;
  const posRoot = args.find((a, idx) => !a.startsWith('--') && (baseIdx === -1 || idx !== baseIdx + 1));
  const report = runCloseSweep(posRoot || process.cwd(), baseRef, fixSafe);
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(resolve(process.argv[1]))) {
  main();
}
