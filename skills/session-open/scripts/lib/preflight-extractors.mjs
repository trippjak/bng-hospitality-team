/**
 * session-open/scripts/lib/preflight-extractors.mjs — Format-agnostic coordination extractors for /session-open.
 *
 * Extracts:
 *   1. Proposed I-NNN improvements (v2 flat + v3 directory index)
 *   2. Open B-NNN blockers (v2 flat + v3 directory index)
 *   3. Active local claims (coordination/claims/*.lock.md) & sprint/ratchet files (coordination/sprints/*.md)
 *   4. Deterministic Step 5 Read-Back summary lines
 */

import fs from 'node:fs';
import path from 'node:path';

function scanDirectoryIndexStatus(root, idxRel, idPrefix, targetStatus) {
  const idxPath = path.join(root, 'coordination', idxRel);
  if (!fs.existsSync(idxPath)) return { mode: 'directory', count: 0, items: [] };
  const lines = fs.readFileSync(idxPath, 'utf8').split(/\r?\n/);
  const rowRegex = new RegExp(`^\\|\\s*${idPrefix}-\\d+\\s*\\|\\s*[^|]+\\|\\s*${targetStatus}\\b`, 'i');
  const items = [];
  for (let i = 0; i < lines.length; i++) {
    if (rowRegex.test(lines[i])) {
      items.push({ line: i + 1, text: lines[i].trim().slice(0, 120) });
    }
  }
  return { mode: 'directory', count: items.length, items };
}

function scanFlatLinesOutsideFences(lines, onLine) {
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      continue;
    }
    if (!inFence) onLine(line, i + 1);
  }
}

export function extractProposedImprovements(root, config = {}) {
  const iFamily = config?.families?.I;
  if (iFamily?.mode === 'directory') {
    return scanDirectoryIndexStatus(root, iFamily.index || 'improvements/IMPROVEMENTS.md', 'I', 'proposed');
  }

  const flatPath = path.join(root, 'coordination/IMPROVEMENTS.md');
  if (!fs.existsSync(flatPath)) return { mode: 'absent', count: 0, items: [] };
  const lines = fs.readFileSync(flatPath, 'utf8').split(/\r?\n/);
  const items = [];
  let lastHeading = '';
  let lastHeadingLine = 0;

  scanFlatLinesOutsideFences(lines, (line, lineNum) => {
    if (/^(?:##\s+I-\d+|\*\*I-\d+\*\*)/.test(line)) {
      lastHeading = line.trim();
      lastHeadingLine = lineNum;
    }
    if (/Status:\s*proposed\b/i.test(line) && lastHeading) {
      items.push({ line: lastHeadingLine, text: lastHeading.slice(0, 110) });
      lastHeading = '';
    }
  });
  return { mode: 'flat', count: items.length, items };
}

export function extractOpenBlockers(root, config = {}) {
  const bFamily = config?.families?.B;
  if (bFamily?.mode === 'directory') {
    return scanDirectoryIndexStatus(root, bFamily.index || 'blockers/BLOCKERS.md', 'B', 'open');
  }

  const flatPath = path.join(root, 'coordination/BLOCKERS.md');
  if (!fs.existsSync(flatPath)) return { mode: 'absent', count: 0, items: [] };
  const lines = fs.readFileSync(flatPath, 'utf8').split(/\r?\n/);
  const items = [];
  let inResolvedSection = false;
  let lastHeading = '';
  let lastHeadingLine = 0;

  scanFlatLinesOutsideFences(lines, (line, lineNum) => {
    if (/^##\s+(?:Resolved|Closed|Archive)/i.test(line)) {
      inResolvedSection = true;
      lastHeading = '';
      return;
    }
    if (/^##\s+(?:Active|Open)\b/i.test(line)) {
      inResolvedSection = false;
      return;
    }
    if (inResolvedSection) return;
    if (/^(?:###?\s+B-\d+|\*\*B-\d+\*\*|\|\s*B-\d+\s*\|)/.test(line)) {
      if (/resolved|closed/i.test(line)) return;
      lastHeading = line.trim();
      lastHeadingLine = lineNum;
      if (line.startsWith('|') && /\|\s*open\s*\|/i.test(line)) {
        items.push({ line: lineNum, text: lastHeading.slice(0, 110) });
        lastHeading = '';
      }
    } else if (/Status:\s*open\b/i.test(line) && lastHeading) {
      items.push({ line: lastHeadingLine, text: lastHeading.slice(0, 110) });
      lastHeading = '';
    }
  });
  return { mode: 'flat', count: items.length, items };
}

export function inspectClaimsAndSprints(root) {
  const claimsDir = path.join(root, 'coordination/claims');
  const sprintsDir = path.join(root, 'coordination/sprints');
  const localClaims = fs.existsSync(claimsDir)
    ? fs.readdirSync(claimsDir).filter((f) => f.endsWith('.lock.md')).sort()
    : [];
  const activeSprints = fs.existsSync(sprintsDir)
    ? fs.readdirSync(sprintsDir).filter((f) => f.endsWith('.md')).sort()
    : [];
  return { localClaims, activeSprints };
}

export function buildReadBackDraft(report) {
  const g = report.git;
  const gitLine = g.initialized
    ? `${g.branch} @ ${g.headSha} (${g.dirtyCount} dirty)`
    : 'not a git repository';
  const claimsLine =
    report.claimsAndSprints.localClaims.length || report.branchDiffs.length
      ? `${report.claimsAndSprints.localClaims.length} local claim(s), ${report.branchDiffs.length} sibling branch diff(s)`
      : 'none';
  const handoffLine = `${report.handoff.status}${report.handoff.anchorSha ? ` (anchor ${report.handoff.anchorSha})` : ''}`;
  return [
    `- **Repo / branch:** \`${path.basename(report.root)}\` (\`${report.repoMode}\`) — ${gitLine}`,
    `- **In-flight claims & sibling branches:** ${claimsLine}`,
    `- **HANDOFF freshness:** ${handoffLine}`,
    `- **Open blockers:** ${report.blockers.count} open`,
    `- **Proposed improvements:** ${report.improvements.count} proposed`,
  ];
}
