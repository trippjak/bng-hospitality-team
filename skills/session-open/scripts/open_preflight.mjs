#!/usr/bin/env node
/**
 * session-open/scripts/open_preflight.mjs — Zero-token deterministic preflight for /session-open.
 *
 * Executes Steps 1 (git state, claims, sprints), 1.5 (local git branch diff-stat),
 * 2 (doclint + v3 ledger check), 3 (HANDOFF commit staleness check),
 * 4 (format-agnostic IMPROVEMENTS.md & BLOCKERS.md extraction), and 5 (Read-Back draft).
 *
 * Usage:
 *   node open_preflight.mjs [projectRoot]
 *   node open_preflight.mjs --selftest
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import cp from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  extractProposedImprovements,
  extractOpenBlockers,
  inspectClaimsAndSprints,
  buildReadBackDraft,
} from './lib/preflight-extractors.mjs';

export { extractProposedImprovements, extractOpenBlockers };

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SECTION_CLOSE_REFS = path.resolve(__dirname, '../../section-close/references');

function runGit(cwd, args) {
  try {
    return cp.execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

function readJsonSafe(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function detectRepoMode(root) {
  const coordDir = path.join(root, 'coordination');
  if (fs.existsSync(coordDir) && fs.statSync(coordDir).isDirectory()) {
    const cfg = readJsonSafe(path.join(coordDir, '.doclint.json'));
    if (cfg?.version === 3) return { mode: 'v3-directory', config: cfg };
    const hasBlockers = fs.existsSync(path.join(coordDir, 'BLOCKERS.md'));
    const hasRoadmap = fs.existsSync(path.join(coordDir, 'ROADMAP.md'));
    const hasHandoff = fs.existsSync(path.join(coordDir, 'HANDOFF.md'));
    if (hasHandoff && !hasBlockers && !hasRoadmap) return { mode: 'v4-lite', config: {} };
    return { mode: 'v2-flat', config: {} };
  }
  const hasRootV4 = fs.existsSync(path.join(root, 'HANDOFF.md')) && fs.existsSync(path.join(root, 'DECISIONS.md'));
  return { mode: hasRootV4 ? 'v4-lite' : 'unstructured', config: {} };
}

function inspectGitState(root) {
  const branch = runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (!branch) return { initialized: false };
  const headSha = runGit(root, ['rev-parse', '--short', 'HEAD']) || 'none';
  const remotes = runGit(root, ['remote']) || '';
  const statusShort = runGit(root, ['status', '--short']) || '';
  const dirtyFiles = statusShort ? statusShort.split('\n').filter(Boolean) : [];
  const statusSb = runGit(root, ['status', '-sb'])?.split('\n')[0] || '';
  const recentCommits = (runGit(root, ['log', '--oneline', '-5']) || '').split('\n').filter(Boolean);

  return {
    initialized: true,
    branch,
    detached: branch === 'HEAD',
    headSha,
    hasRemote: Boolean(remotes.trim()),
    dirtyCount: dirtyFiles.length,
    dirtySample: dirtyFiles.slice(0, 10),
    aheadBehindHeader: statusSb,
    recentCommits,
  };
}

function inspectBranchCoordinationDiffs(root, gitState) {
  if (!gitState.initialized) return [];
  const rawBranches = runGit(root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads/']) || '';
  const branches = rawBranches.split('\n').filter((b) => b && b !== gitState.branch && b !== 'main' && b !== 'master');
  const baseRef = runGit(root, ['rev-parse', '--verify', 'main']) ? 'main' : 'HEAD';
  const alerts = [];

  for (const br of branches.slice(0, 15)) {
    const stat = runGit(root, ['diff', '--stat', baseRef, br, '--', 'coordination/']);
    if (stat) {
      alerts.push({
        branch: br,
        q15Warning: /DECISIONS|ROADMAP/.test(stat),
        summary: stat.split('\n').pop()?.trim() || 'touched coordination/',
      });
    }
  }
  return alerts;
}

function evaluateCommitsSinceAnchor(root, anchorSha) {
  const rawLog = runGit(root, ['log', '--oneline', `${anchorSha}..HEAD`]);
  if (rawLog === null) return { exists: true, anchorSha, status: 'UNKNOWN_SHA', unknownCommits: [] };
  const lines = rawLog.split('\n').filter(Boolean);
  const nonClose = lines.filter((line) => !/^[0-9a-f]+\s+(?:D-\d+\s+)?section-close:/i.test(line));
  return {
    exists: true,
    anchorSha,
    status: nonClose.length === 0 ? 'FRESH' : 'STALE',
    unknownCommitCount: nonClose.length,
    unknownCommits: nonClose.slice(0, 5),
  };
}

function checkHandoffStaleness(root) {
  const coordHandoff = path.join(root, 'coordination/HANDOFF.md');
  const rootHandoff = path.join(root, 'HANDOFF.md');
  const handoffPath = fs.existsSync(coordHandoff) ? coordHandoff : rootHandoff;
  if (!fs.existsSync(handoffPath)) return { exists: false, status: 'MISSING' };

  const text = fs.readFileSync(handoffPath, 'utf8');
  const commitMatch =
    text.match(/\*\*Commit:\*\*\s*`?([0-9a-f]{7,40})`?/i) ||
    text.match(/\bCommit:\s*`?([0-9a-f]{7,40})`?/i);

  const anchorSha = commitMatch ? commitMatch[1] : runGit(root, ['log', '-n', '1', '--grep=section-close:', '--format=%h']);
  if (!anchorSha) return { exists: true, status: 'UNANCHORED', unknownCommits: [] };
  return evaluateCommitsSinceAnchor(root, anchorSha);
}

function parseDoclintOutput(out) {
  const lines = out.split('\n');
  const vIdx = lines.findIndex((l) => l.includes('VERDICT:'));
  const verdictLine = vIdx >= 0 ? lines[vIdx] : '';
  const coldBootLine = lines.find((l) => l.includes('cold-boot READ')) || '';
  const flags = vIdx >= 0 ? lines.slice(vIdx + 1).map((l) => l.trim()).filter((l) => l.startsWith('- ')) : [];
  return { verdict: verdictLine.trim(), coldBoot: coldBootLine.trim(), flagCount: flags.length, flags };
}

function runDocGates(root, repoMode) {
  if (repoMode !== 'v2-flat' && repoMode !== 'v3-directory') return { applicable: false };
  const doclintScript = path.join(SECTION_CLOSE_REFS, 'doclint.mjs');
  const ledgerScript = path.join(SECTION_CLOSE_REFS, 'decisions-dir.mjs');
  let doclintSummary = null;
  let ledgerCheck = null;

  if (fs.existsSync(doclintScript)) {
    try {
      const out = cp.execFileSync(process.execPath, [doclintScript, root], { encoding: 'utf8' });
      doclintSummary = parseDoclintOutput(out);
    } catch (e) {
      doclintSummary = { error: String(e.message || e) };
    }
  }

  if (repoMode === 'v3-directory' && fs.existsSync(ledgerScript)) {
    try {
      const out = cp.execFileSync(process.execPath, [ledgerScript, 'check', root], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      ledgerCheck = { ok: true, verdict: out.split('\n').find((l) => l.includes('VERDICT:'))?.trim() || 'clean' };
    } catch (e) {
      ledgerCheck = { ok: false, error: (e.stdout || e.stderr || String(e)).toString().trim() };
    }
  }
  return { applicable: true, doclint: doclintSummary, ledgerCheck };
}

export function runOpenPreflight(projectRoot = process.cwd()) {
  const root = path.resolve(projectRoot);
  const { mode, config } = detectRepoMode(root);
  const git = inspectGitState(root);
  const claimsAndSprints = inspectClaimsAndSprints(root);
  const branchDiffs = inspectBranchCoordinationDiffs(root, git);
  const handoff = checkHandoffStaleness(root);
  const blockers = extractOpenBlockers(root, config);
  const improvements = extractProposedImprovements(root, config);
  const docGates = runDocGates(root, mode);
  const baseReport = {
    root,
    repoMode: mode,
    git,
    claimsAndSprints,
    branchDiffs,
    handoff,
    blockers,
    improvements,
    docGates,
  };
  return { ...baseReport, readBackDraft: buildReadBackDraft(baseReport) };
}

function runSelftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'session-open-preflight-'));
  try {
    fs.mkdirSync(path.join(tmp, 'coordination/improvements'), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'coordination/claims'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'coordination/claims/unit-a.lock.md'), '# Claim\n');
    fs.writeFileSync(path.join(tmp, 'coordination/HANDOFF.md'), '# HANDOFF\n**Updated:** 2026-10-29 · **Commit:** `deadbee`\n');
    fs.writeFileSync(
      path.join(tmp, 'coordination/BLOCKERS.md'),
      '## Active\n### B-001 — Open blocker\n*Status: open*\n## Resolved\n### B-002 — Old\n*Status: open*\n',
    );
    fs.writeFileSync(
      path.join(tmp, 'coordination/IMPROVEMENTS.md'),
      ['```markdown', '## I-000 — phantom', '*Status: proposed*', '```', '## I-001 — Real', '*Status: proposed*', '**I-002** — *Status: proposed*'].join('\n'),
    );
    const flatRes = extractProposedImprovements(tmp, {});
    const flatBlockers = extractOpenBlockers(tmp, {});
    const claims = inspectClaimsAndSprints(tmp);

    fs.writeFileSync(
      path.join(tmp, 'coordination/improvements/IMPROVEMENTS.md'),
      ['| id | date | status | title |', '|---|---|---|---|', '| I-010 | 2026-10-29 | proposed | Dir proposal |'].join('\n'),
    );
    const dirRes = extractProposedImprovements(tmp, { families: { I: { mode: 'directory', index: 'improvements/IMPROVEMENTS.md' } } });

    const v4Tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'session-open-v4-'));
    fs.writeFileSync(path.join(v4Tmp, 'HANDOFF.md'), '# Handoff\n');
    fs.writeFileSync(path.join(v4Tmp, 'DECISIONS.md'), '# Decisions\n');
    const v4Mode = detectRepoMode(v4Tmp).mode;
    fs.rmSync(v4Tmp, { recursive: true, force: true });

    const ok = flatRes.count === 2 && flatBlockers.count === 1 && claims.localClaims.length === 1 && dirRes.count === 1 && v4Mode === 'v4-lite';
    console.log(JSON.stringify({ selftest: ok ? 'PASS' : 'FAIL', flatCount: flatRes.count, blockers: flatBlockers.count, dirCount: dirRes.count, v4Mode }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1]))) {
  if (process.argv.includes('--selftest')) {
    runSelftest();
  } else {
    const target = process.argv[2] || process.cwd();
    console.log(JSON.stringify(runOpenPreflight(target), null, 2));
  }
}
