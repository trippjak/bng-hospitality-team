// Dead-reference and GitHub PR-claim checkers for doclint.mjs.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, isAbsolute } from "node:path";
import { stripGen } from "./doclint-detectors.mjs";

const HOME = process.env.HOME || process.env.USERPROFILE || "";
const PATHLIKE = /(?:[\w.~-]+\/)+[\w.-]+\.(?:ts|tsx|js|mjs|md|ps1|json|toml|css|html)\b/g;
const PLACEHOLDER = /YYYY|MMM?\b|NNN|<[^>]+>|\bQN\b/; // template shape, not a claim (P-027)

// PR-state claim check (P-027): any "#N" in the docs is a claim about a pull request's state.
// One `gh` call resolves all of them. Catches the close-ordering falsehood (P-024) and orphaned
// reservations (P-028). Skips silently with no gh / no remote / not a GitHub repo.
const PR_REF = /(?:^|[\s(\[])#(\d{1,4})\b/g;
const CLAIM_OPEN = /\b(open|unmerged|draft|awaiting|in flight|not yet on main|pending)\b/i;
// A resolved narrative is not a live claim: "#14 was closed unmerged" is TRUE about a closed PR.
const RESOLVED_PAST =
  /\b(?:was|were|has been|have been|had been|is now|are now)\s+(?:\w+\s+){0,2}(?:closed|merged|landed|resolved|superseded|recovered)\b|\bclosed unmerged\b|\bsince (?:merged|closed)\b|\bthat PR closed\b|\bMerge pull request #\d/i;

function resolveToken(tok, coord, projectRoot, citingPath, trackedPaths) {
  const cand = tok.startsWith("~/") ? join(HOME, tok.slice(2))
             : isAbsolute(tok)      ? tok
             : join(projectRoot, tok);
  const rel = tok.replace(/^\.\//, "");
  return existsSync(cand)
    || existsSync(join(coord, tok))
    || existsSync(join(dirname(citingPath), tok))
    || trackedPaths.some((f) => f === rel || f.endsWith("/" + rel));
}

// Dead-reference pass (P-020.2): path-like tokens in the always-read tier must resolve.
// Deterministic, zero LLM tokens. Outdated refs survive years when nothing checks them
// (EMSE 2023). Skips URLs (preceded by //) and bare D-NNN anchors (append-only ID space).
export function checkDeadRefs(coord, handoff, blockers, flags) {
  const projectRoot = dirname(coord);
  let refsChecked = 0, refsDead = 0, refsPlaceholder = 0;
  let trackedPaths = [];
  try {
    trackedPaths = execFileSync("git", ["ls-files"], { cwd: projectRoot, stdio: ["ignore", "pipe", "ignore"] })
      .toString().split("\n").filter(Boolean);
  } catch { /* not a git repo — the suffix arm simply never matches */ }
  for (const [name, path] of [["HANDOFF", handoff], ["BLOCKERS", blockers]]) {
    if (!existsSync(path)) continue;
    const text = stripGen(readFileSync(path, "utf8")); // a quoted commit subject is not a path claim
    const seen = new Set();
    for (const m of text.matchAll(PATHLIKE)) {
      const tok = m[0];
      if (seen.has(tok) || text.slice(Math.max(0, m.index - 8), m.index).includes("//")) continue;
      seen.add(tok);
      if (PLACEHOLDER.test(tok)) { refsPlaceholder++; continue; }
      refsChecked++;
      if (!resolveToken(tok, coord, projectRoot, path, trackedPaths)) {
        refsDead++;
        flags.push(`${name}.md dead reference: ${tok} — fix the path or strike the claim.`);
      }
    }
  }
  return { refsChecked, refsDead, refsPlaceholder };
}

function clauseAt(line, idx) {
  const D = /[;·—]|\.[*_`]*\s/g;
  let start = 0, end = line.length, m;
  while ((m = D.exec(line)) !== null) {
    if (m.index < idx) start = m.index + m[0].length;
    else { end = m.index; break; }
  }
  return line.slice(start, end);
}

function scanPrFile(name, path, prState, stale, flags) {
  if (!existsSync(path)) return { checked: 0, staleCount: 0 };
  let fence = null, checked = 0, staleCount = 0;
  const lines = readFileSync(path, "utf8").split("\n");
  lines.forEach((line, lineIdx) => {
    const f = line.match(/^\s*(```+|~~~+)/);
    if (f) { fence = !fence ? f[1][0] : (f[1][0] === fence ? null : fence); return; }
    if (fence) return;
    for (const m of line.matchAll(PR_REF)) {
      const n = Number(m[1]);
      const st = prState.get(n);
      if (st === undefined) continue;
      checked++;
      if (st === "OPEN" || st === "OPEN/draft") continue;
      const scope = clauseAt(line, m.index);
      if (CLAIM_OPEN.test(scope) && !RESOLVED_PAST.test(scope)) {
        staleCount++;
        stale.push({ path, name, lineIdx, idx: m.index, len: m[0].length, n, st });
        flags.push(`${name}.md claims PR #${n} is open/pending but it is ${st} — "${scope.trim().slice(0, 70)}"`);
      }
    }
  });
  return { checked, staleCount };
}

function applyPrClaimFixes(stale) {
  const stamp = new Date().toISOString().slice(0, 10);
  for (const path of [...new Set(stale.map((s) => s.path))]) {
    const raw = readFileSync(path, "utf8");
    const crlf = raw.includes("\r\n");
    const lines = raw.replace(/\r\n/g, "\n").split("\n");
    const edits = stale.filter((s) => s.path === path).sort((a, b) => b.lineIdx - a.lineIdx || b.idx - a.idx);
    for (const e of edits) {
      const line = lines[e.lineIdx];
      const at = e.idx + e.len;
      const verb = e.st === "MERGED" ? "merged" : "closed";
      const marker = ` (has since ${verb}, recorded ${stamp})`;
      lines[e.lineIdx] = line.slice(0, at) + marker + line.slice(at);
      console.log(`--fix-pr-claims: ${e.name}.md:${e.lineIdx + 1} — PR #${e.n} is ${e.st}; annotated the reference`);
    }
    const out = lines.join("\n");
    writeFileSync(path, crlf ? out.replace(/\n/g, "\r\n") : out);
  }
  console.log(`--fix-pr-claims: ${stale.length} claim(s) annotated — REVIEW the diff and commit it with the change it unblocks.`);
}

export function checkPrClaims(ctx) {
  const { coord, handoff, blockers, roadmap, decisionsPath, fixPrClaims, flags } = ctx;
  const projectRoot = dirname(coord);
  let prLine = "PR claims: skipped (no gh / no GitHub remote)";
  let prSkipped = true;
  try {
    const stateFile = process.env.DOCLINT_PR_STATE_JSON;
    const out = stateFile ? readFileSync(stateFile, "utf8") : execFileSync("gh", ["pr", "list", "--state", "all", "--limit", "200",
      "--json", "number,state,isDraft"], { cwd: projectRoot, stdio: ["ignore", "pipe", "ignore"] }).toString();
    const prState = new Map(JSON.parse(out).map((p) => [p.number, p.isDraft && p.state === "OPEN" ? "OPEN/draft" : p.state]));
    prSkipped = false;
    const prFiles = [["HANDOFF", handoff], ["BLOCKERS", blockers], ["ROADMAP", roadmap],
      ["DECISIONS", decisionsPath], ["PROCESS", join(coord, "PROCESS.md")],
      ["INDEX", join(projectRoot, "INDEX.md")], ["CLAUDE", join(projectRoot, "CLAUDE.md")]];
    const stale = [];
    let prChecked = 0, prStale = 0;
    for (const [name, p] of prFiles) {
      const r = scanPrFile(name, p, prState, stale, flags);
      prChecked += r.checked;
      prStale += r.staleCount;
    }
    prLine = `PR claims: ${prChecked} checked · ${prStale} contradicted by GitHub`;
    if (fixPrClaims && stale.length) applyPrClaimFixes(stale);
    else if (stale.length) console.log(`PR claims: clear these mechanically with \`doclint <root> --fix-pr-claims\` rather than by hand-editing prose.`);
  } catch { /* no gh, no remote, not a GitHub repo — check skips */ }
  return { prLine, prSkipped };
}
