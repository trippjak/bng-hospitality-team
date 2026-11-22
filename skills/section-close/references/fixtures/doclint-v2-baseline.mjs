#!/usr/bin/env node
// doc-system v2 lint — deterministic, zero-LLM-token threshold enforcement for section-close.
// Usage: node doclint.mjs [projectRoot]   (defaults to cwd; walks up to find coordination/)
// Exit code is always 0 — output is informational; the skill decides what to do with flags.
//
// Thresholds are BYTE-based (tokens ~ bytes/4). Line counts are reported but not enforced:
// the 2026-06 audit showed line thresholds defeated by mega-lines (11.6KB single-line HANDOFF).
// Teeth (Q13): every line >600B is counted into the mega-line flag; a file >90% of cap is NEAR,
// and NEAR across consecutive section-close commits (git-detected) flags the archive decision.

import { readFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve, relative, isAbsolute } from "node:path";

const THRESHOLDS = {
  HANDOFF: 8000, // ~2K tokens. Breach => rewrite-in-place (snapshot accreting history)
  DECISIONS: 48000, // ~12K tokens. Breach => archive oldest ~100 entries, leave stubs
  ROADMAP: 24000, // ~6K tokens.  Breach => archive shipped sections
  BLOCKERS: 8000, // ~2K tokens. Breach => triage signal, NEVER auto-archive
  // IMPROVEMENTS lives here for the OVERRIDE mechanism only — it is NOT in the `files` list, so it
  // never joins the four-file sum or the always-read tier. It was hardcoded until 2026-08-25, which
  // meant the one file whose right size varies most by project was the one cap nobody could tune:
  // an 8,000 B ceiling presumes a TRIAGED backlog, and a project holding 44 open proposals cannot
  // meet it in any honest form (brand-workshop-harness D-206; business-club-ops had already set
  // 24,000 for the same file by its own D-055, which is what surfaced the inconsistency).
  IMPROVEMENTS: 8000, // ~2K tokens. Breach => triage-tail. Override per project in .doclint.json.
};
const MAX_LINE_BYTES = 600; // any line over this = mega-line pathology
// Two budgets, because the tier model (doc-thresholds.md §The tier model) splits the files:
// ALWAYS_READ is what a fresh session literally loads; FOUR_FILE is total doc weight, useful as a
// growth signal but NOT "what a session pays" — DECISIONS + ROADMAP are grep-only and were 80% of
// the old single headline on business-club-ops (56,691 of 70,800 B, 2026-08-16). P-027.
const ALWAYS_READ_BUDGET = 20000; // ~5K tokens: HANDOFF + BLOCKERS, the real cold-boot read
const FOUR_FILE_BUDGET = 88000;   // ~22K tokens: total doc weight (was COLD_BOOT_BUDGET)
const HANDOFF_DNNN_MAX = 20; // more D-NNN refs than this = breadcrumb-trail role collapse

// Flight-board wording rule (B-005 2026-07-27 double-build): HANDOFF describes next work as
// "X is claimable" or "X claimed — see PR #n", never an imperative "next: build X" — that is a
// standing instruction to every future session. Separator after "next" is required so noun
// uses ("the next build failed") don't trip it. Advisory like every flag here (exit 0).
const IMPERATIVE_NEXT = /\bnext(?:\s+(?:up|steps?|actions?))?\s*[:=—–-]+\s*(?:build|create|implement|add|ship|write|draft|wire|fix|deploy|migrate|refactor|do)\b/gi;

const NEAR_CAP_RATIO = 0.9; // status NEAR above this fraction of the (effective) threshold
const STREAK_CLOSES = 2; // NEAR at this many consecutive closes = flag: archive, don't trim (Q13)
const ACTIONS = { HANDOFF: "rewrite-in-place", DECISIONS: "archive oldest entries", ROADMAP: "archive shipped", BLOCKERS: "TRIAGE (never archive unresolved)" };

function findCoordDir(start) {
  let dir = resolve(start);
  for (;;) {
    const cand = join(dir, "coordination");
    if (existsSync(cand) && statSync(cand).isDirectory()) return cand;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function metrics(path) {
  const buf = readFileSync(path);
  // LF-NORMALIZED, and that is load-bearing (2026-08-25). This measured raw worktree bytes while
  // gitCloseSizes() below reads git BLOB sizes — so on a CRLF checkout the current reading was
  // compared against LF history, apples to oranges, and every cap was platform-dependent: the same
  // file reads ~1B/line larger on Windows than on CI. A 110-line HANDOFF flipped from 7,910B (ok)
  // to 8,020B (OVER) purely by being checked out, which would have sent someone trimming prose to
  // fix a breach that does not exist in the blob. Normalizing makes the number mean the same thing
  // on every machine, and makes it the number git actually stores.
  const text = buf.toString("utf8").replace(/\r\n/g, "\n");
  const bytes = Buffer.byteLength(text, "utf8");
  const lines = text.split("\n");
  let maxLine = 0;
  let megaLines = 0;
  for (const l of lines) {
    const b = Buffer.byteLength(l, "utf8");
    if (b > maxLine) maxLine = b;
    if (b > MAX_LINE_BYTES) megaLines++;
  }
  return { bytes, tokens: Math.round(bytes / 4), lines: lines.length, maxLine, megaLines, text };
}

// Near-cap streak support (Q13): file sizes at the last N section-close commits, read from git
// (shared across machines, no state file — doclint stays a pure reader of the working tree).
// Close commits are identified by "section-close:" in the message — the ceremony's commit
// convention ("D-NNN section-close: …"); the colon keeps prose mentions from matching.
// Returns null when git or enough close history is unavailable: streak check skips.
function gitCloseSizes(coordDir, absPath, n) {
  try {
    const git = (args, cwd) => execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const top = git(["rev-parse", "--show-toplevel"], coordDir);
    const shas = git(["log", "-i", "--grep=section-close:", "-n", String(n), "--format=%H"], top).split("\n").filter(Boolean);
    if (shas.length < n) return null;
    const rel = relative(top, absPath).replace(/\\/g, "/");
    return shas.map((sha) => {
      try { return parseInt(git(["cat-file", "-s", `${sha}:${rel}`], top), 10); } catch { return null; }
    });
  } catch { return null; }
}

const root = process.argv[2] || process.cwd();
const coord = findCoordDir(root);
if (!coord) {
  console.log(`doclint: no coordination/ dir found at or above ${root}`);
  console.log('VERDICT: NO-COORD (nothing linted — wrong project root?)');
  process.exit(0);
}

// Resolve the four files. DECISIONS may live at coordination/DECISIONS.md or
// coordination/decisions/DECISIONS.md (both observed in the wild — check both).
const handoff = join(coord, "HANDOFF.md");
const roadmap = join(coord, "ROADMAP.md");
const blockers = join(coord, "BLOCKERS.md");
const decA = join(coord, "DECISIONS.md");
const decB = join(coord, "decisions", "DECISIONS.md");
const decisionsPath = existsSync(decB) ? decB : decA;

const files = [
  ["HANDOFF", handoff],
  ["DECISIONS", decisionsPath],
  ["ROADMAP", roadmap],
  ["BLOCKERS", blockers],
];

const flags = [];
if (existsSync(decA) && existsSync(decB)) {
  flags.push("DECISIONS exists at BOTH coordination/ and coordination/decisions/ — consolidate (subdirectory copy is canonical here).");
}

// Optional per-project overrides: coordination/.doclint.json
//   { "thresholds": { "DECISIONS": 56000 }, "coldBootBudget": 96000 }
// Projects differ in decision volume, and a single global cap either starves the busy ones or
// lets the quiet ones rot. Absent or unreadable file = defaults unchanged, so this is opt-in.
// Overrides are ECHOED in the output: a silently-raised cap is worse than no cap.
let coldBoot = FOUR_FILE_BUDGET; // .doclint.json's coldBootBudget override targets the four-file total
const overrides = [];
const cfgPath = join(coord, ".doclint.json");
if (existsSync(cfgPath)) {
  try {
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    for (const [k, v] of Object.entries(cfg.thresholds || {})) {
      if (!(k in THRESHOLDS)) { flags.push(`.doclint.json overrides unknown threshold "${k}" — ignored.`); continue; }
      if (!Number.isFinite(v) || v <= 0) { flags.push(`.doclint.json threshold "${k}" is not a positive number — ignored.`); continue; }
      overrides.push(`${k} ${THRESHOLDS[k]}->${v}`);
      THRESHOLDS[k] = v;
    }
    if (cfg.coldBootBudget !== undefined) {
      if (Number.isFinite(cfg.coldBootBudget) && cfg.coldBootBudget > 0) {
        overrides.push(`coldBoot ${coldBoot}->${cfg.coldBootBudget}`);
        coldBoot = cfg.coldBootBudget;
      } else flags.push(".doclint.json coldBootBudget is not a positive number — ignored.");
    }
  } catch (e) {
    flags.push(`.doclint.json unreadable (${e.message}) — using default thresholds.`);
  }
}

let sumBytes = 0, alwaysReadBytes = 0;
const rows = [];
for (const [name, path] of files) {
  if (!existsSync(path)) {
    rows.push({ name, bytes: "-", tokens: "-", lines: "-", maxLine: "-", status: "MISSING" });
    flags.push(`${name}.md missing at ${path}`);
    continue;
  }
  const m = metrics(path);
  sumBytes += m.bytes;
  if (name === "HANDOFF" || name === "BLOCKERS") alwaysReadBytes += m.bytes; // always-read tier (P-027)
  let status = "ok";
  if (m.bytes > THRESHOLDS[name]) {
    status = "OVER";
    flags.push(`${name}.md ${m.bytes}B over ${THRESHOLDS[name]}B threshold -> ${ACTIONS[name]}`);
  } else if (m.bytes > THRESHOLDS[name] * NEAR_CAP_RATIO) {
    // Riding just under the cap across closes is threshold-gaming (files observed trimmed to
    // within 70B of caps). A single near-cap run is status-only; the streak forces the action.
    status = "NEAR";
    const past = gitCloseSizes(coord, path, STREAK_CLOSES - 1);
    if (past !== null && past.every((b) => b !== null && b > THRESHOLDS[name] * NEAR_CAP_RATIO)) {
      flags.push(`${name}.md near-cap streak: >${Math.round(NEAR_CAP_RATIO * 100)}% of ${THRESHOLDS[name]}B cap at ${STREAK_CLOSES}+ consecutive closes — make the archive decision now (${ACTIONS[name]}); trimming back under the cap is the gaming this check exists to catch.`);
    }
  }
  if (m.megaLines > 0) {
    status += "+MEGALINE";
    flags.push(`${name}.md has ${m.megaLines} mega-line(s) over ${MAX_LINE_BYTES}B (max ${m.maxLine}B) — run-on entries; break into structured multi-line entries.`);
  }
  if (name === "HANDOFF") {
    const priorChains = (m.text.match(/\bprior\s+(`|worker|commit|[0-9a-f]{7})/gi) || []).length;
    const dnnnRefs = (m.text.match(/\bD-[A-Z]?\d{2,3}\b/g) || []).length;
    const impNext = m.text.match(IMPERATIVE_NEXT) || [];
    if (priorChains > 0) flags.push(`HANDOFF.md contains ${priorChains} "Prior ..." history chain(s) — snapshot/log role collapse; history belongs in git + DECISIONS.`);
    if (dnnnRefs > HANDOFF_DNNN_MAX) flags.push(`HANDOFF.md has ${dnnnRefs} D-NNN refs (>${HANDOFF_DNNN_MAX}) — breadcrumb-trail collapse; keep only pointers needed for re-entry.`);
    if (impNext.length > 0) flags.push(`HANDOFF.md has ${impNext.length} imperative next-action(s) ("${impNext[0]} …") — flight-board wording rule (B-005); phrase unclaimed work as "X is claimable" or "X claimed — see PR #n".`);
  }
  rows.push({ name, bytes: m.bytes, tokens: m.tokens, lines: m.lines, maxLine: m.maxLine, status });
}

// Optional fifth file: IMPROVEMENTS.md — read only at session-open, so it carries its own cap
// (default 8KB, overridable in .doclint.json like any other) and is EXCLUDED from the cold-boot
// sum (see session-open SKILL.md for the contract).
const improvementsPath = join(coord, "IMPROVEMENTS.md");
if (existsSync(improvementsPath)) {
  const m = metrics(improvementsPath);
  const iCap = THRESHOLDS.IMPROVEMENTS; // post-override: .doclint.json has already been applied
  let status = m.bytes > iCap ? "OVER" : m.bytes > iCap * NEAR_CAP_RATIO ? "NEAR" : "ok";
  if (m.megaLines > 0) status += "+MEGALINE";
  rows.push({ name: "IMPROVEMENTS*", bytes: m.bytes, tokens: m.tokens, lines: m.lines, maxLine: m.maxLine, status });
  if (m.bytes > iCap) flags.push(`IMPROVEMENTS.md ${m.bytes}B over ${iCap}B cap -> queue triage-tail (decline/expire oldest entries) at next section-close.`);
  if (m.megaLines > 0) flags.push(`IMPROVEMENTS.md has ${m.megaLines} mega-line(s) over ${MAX_LINE_BYTES}B (max ${m.maxLine}B) — break into structured multi-line entries.`);
}

// Dead-reference pass (P-020.2): path-like tokens in the always-read tier must resolve.
// Deterministic, zero LLM tokens. Outdated refs survive years when nothing checks them
// (EMSE 2023). Skips URLs (preceded by //) and bare D-NNN anchors (append-only ID space).
const HOME = process.env.HOME || process.env.USERPROFILE || "";
const projectRoot = dirname(coord);
let refsChecked = 0, refsDead = 0, refsPlaceholder = 0;
const PATHLIKE = /(?:[\w.~-]+\/)+[\w.-]+\.(?:ts|tsx|js|mjs|md|ps1|json|toml|css|html)\b/g;
const PLACEHOLDER = /YYYY|MMM?\b|NNN|<[^>]+>|\bQN\b/; // template shape, not a claim (P-027)
// Tracked-path suffix index: resolves documentation shorthand ("render/shell.ts" ->
// "src/routes/render/shell.ts") generally, without hardcoding any project's layout. One call.
let trackedPaths = [];
try {
  trackedPaths = execFileSync("git", ["ls-files"], { cwd: projectRoot, stdio: ["ignore", "pipe", "ignore"] })
    .toString().split("\n").filter(Boolean);
} catch { /* not a git repo — the suffix arm simply never matches */ }
for (const [name, path] of [["HANDOFF", handoff], ["BLOCKERS", blockers]]) {
  if (!existsSync(path)) continue;
  const text = readFileSync(path, "utf8");
  const seen = new Set();
  for (const m of text.matchAll(PATHLIKE)) {
    const tok = m[0];
    if (seen.has(tok)) continue;
    if (text.slice(Math.max(0, m.index - 8), m.index).includes("//")) continue; // URL
    seen.add(tok);
    if (PLACEHOLDER.test(tok)) { refsPlaceholder++; continue; }
    refsChecked++;
    // NEVER test the bare token: existsSync on a relative path resolves against the CALLER's cwd,
    // which made the dead-ref verdict depend on where the shell was invoked from (P-027 §B).
    const cand = tok.startsWith("~/") ? join(HOME, tok.slice(2))
               : isAbsolute(tok)      ? tok
               : join(projectRoot, tok);
    const rel = tok.replace(/^\.\//, "");
    const ok = existsSync(cand)
      || existsSync(join(coord, tok))
      || existsSync(join(dirname(path), tok))                       // relative to the CITING file
      || trackedPaths.some((f) => f === rel || f.endsWith("/" + rel)); // documentation shorthand
    if (!ok) { refsDead++; flags.push(`${name}.md dead reference: ${tok} — fix the path or strike the claim.`); }
  }
}

// PR-state claim check (P-027): any "#N" in the docs is a claim about a pull request's state.
// One `gh` call resolves all of them. Catches the close-ordering falsehood (P-024) and orphaned
// reservations (P-028). Skips silently with no gh / no remote / not a GitHub repo.
const PR_REF = /(?:^|[\s(\[])#(\d{1,4})\b/g;
const CLAIM_OPEN = /\b(open|unmerged|draft|awaiting|in flight|not yet on main|pending)\b/i;
// A resolved narrative is not a live claim: "#14 was closed unmerged" is TRUE about a closed PR.
const RESOLVED_PAST =
  /\b(?:was|were|has been|have been|had been|is now|are now)\s+(?:\w+\s+){0,2}(?:closed|merged|landed|resolved|superseded|recovered)\b|\bclosed unmerged\b|\bsince (?:merged|closed)\b|\bthat PR closed\b/i;
// Scope the claim test to the CLAUSE containing this #N, not the whole line. These docs are full
// of mega-lines; line-wide matching let one true clause about a closed PR contaminate every other
// #N beside it (measured: 6 false positives on correct docs before this fix).
function clauseAt(line, idx) {
  const D = /[;·—]|\.\s/g;
  let start = 0, end = line.length, m;
  while ((m = D.exec(line)) !== null) {
    if (m.index < idx) start = m.index + m[0].length;
    else { end = m.index; break; }
  }
  return line.slice(start, end);
}
let prLine = "PR claims: skipped (no gh / no GitHub remote)";
try {
  const out = execFileSync("gh", ["pr", "list", "--state", "all", "--limit", "200",
    "--json", "number,state,isDraft"], { cwd: projectRoot, stdio: ["ignore", "pipe", "ignore"] }).toString();
  const prState = new Map(JSON.parse(out).map((p) => [p.number, p.isDraft && p.state === "OPEN" ? "OPEN/draft" : p.state]));
  const prFiles = [["HANDOFF", handoff], ["BLOCKERS", blockers], ["ROADMAP", roadmap],
    ["DECISIONS", decisionsPath], ["PROCESS", join(coord, "PROCESS.md")],
    ["INDEX", join(projectRoot, "INDEX.md")], ["CLAUDE", join(projectRoot, "CLAUDE.md")]];
  let prChecked = 0, prStale = 0;
  for (const [name, p] of prFiles) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      for (const m of line.matchAll(PR_REF)) {
        const n = Number(m[1]);
        const st = prState.get(n);
        if (st === undefined) continue; // an issue or a section number, not a PR
        prChecked++;
        if (st === "OPEN" || st === "OPEN/draft") continue;
        const scope = clauseAt(line, m.index);
        if (CLAIM_OPEN.test(scope) && !RESOLVED_PAST.test(scope)) {
          prStale++;
          flags.push(`${name}.md claims PR #${n} is open/pending but it is ${st} — "${scope.trim().slice(0, 70)}"`);
        }
      }
    }
  }
  prLine = `PR claims: ${prChecked} checked · ${prStale} contradicted by GitHub`;
} catch { /* no gh, no remote, not a GitHub repo — check skips */ }

console.log(`doclint @ ${coord}`);
console.log("file       bytes    ~tokens  lines  maxline  status   (* = session-open-only, excluded from cold-boot)");
for (const r of rows) {
  console.log(
    `${r.name.padEnd(13)} ${String(r.bytes).padStart(7)}  ${String(r.tokens).padStart(7)}  ${String(r.lines).padStart(5)}  ${String(r.maxLine).padStart(7)}  ${r.status}`
  );
}
console.log(`cold-boot READ (HANDOFF+BLOCKERS, always-read tier): ${alwaysReadBytes}B (~${Math.round(alwaysReadBytes / 4)} tokens) — budget ${ALWAYS_READ_BUDGET}B`);
console.log(`four-file total (adds DECISIONS+ROADMAP, grep-only — growth signal, NOT session cost): ${sumBytes}B (~${Math.round(sumBytes / 4)} tokens) — budget ${coldBoot}B`);
console.log(`note: the always-loaded global layer (~/.claude/CLAUDE.md + rules/ + memory index + repo CLAUDE.md/INDEX.md) is NOT measured here and was ~42KB on the reference project — the always-read number above is the marginal doc cost, not the total.`);
console.log(`refs (always-read tier): ${refsChecked} resolved-or-dead · ${refsDead} dead · ${refsPlaceholder} template placeholders skipped — EXISTENCE ONLY: a live path proves nothing about the claim attached to it`);
console.log(prLine);
if (overrides.length) console.log(`project overrides (coordination/.doclint.json): ${overrides.join(" · ")}`);
if (alwaysReadBytes > ALWAYS_READ_BUDGET) flags.push(`Always-read tier ${alwaysReadBytes}B over ${ALWAYS_READ_BUDGET}B — a fresh session overpays before doing any work.`);
if (sumBytes > coldBoot) flags.push(`Four-file total ${sumBytes}B over ${coldBoot}B — docs are outgrowing the grep-on-demand model.`);

if (flags.length === 0) {
  console.log("VERDICT: CLEAN");
} else {
  console.log(`VERDICT: ${flags.length} FLAG(S)`);
  for (const f of flags) console.log(`  - ${f}`);
}
