#!/usr/bin/env node
// handoff-scaffold — doc-system v3 Phase 2: HANDOFF.md becomes a scaffold.
// Contract: PDR-001 §3.7.  Usage: node handoff-scaffold.mjs [projectRoot]
//
// Generated mechanical sections live inside GEN blocks; everything outside them is the judgment
// layer and survives regeneration BYTE-FOR-BYTE. Four blocks are owned here:
//
//   <!-- GEN:decisions -->    entries minted since the last close   IMMUTABLE — recommended
//   <!-- GEN:state-delta -->  commits since the last close          snapshot of `git log`
//   <!-- GEN:claims -->       open draft PRs (the flight board)     snapshot of PR state
//   <!-- GEN:doclint -->      the current doclint verdict           snapshot of a check
//
// I-085 — only `decisions` projects something IMMUTABLE: a minted ledger entry cannot change. The
// other three snapshot MUTABLE state that `session-open` regenerates in steps 1 and 1.5 before it
// ever reads this file, so they are a stale copy of a command's output sitting in the tier read
// first. `claims` is the one that can do harm: a stale "the flight board is clear" is exactly the
// read that causes a double-build (B-005), and on 2026-09-25/26 a merged PR twice presented as open
// long enough to change what a session did. launch-uk dropped all three at its D-226 and kept
// `decisions`. This tool does not force that — markers are opt-in per block and removing generators
// would rewrite HANDOFFs in repos that still carry them — but it no longer recommends all four, and
// it says so at the end of every run that regenerates one.
//
// Missing markers are a NO-OP with a notice, never an insertion: a repo that has not adopted the
// scaffold must not have structure imposed on it by a tool run for some other reason.
//
// IDEMPOTENCE IS BY CONSTRUCTION, NOT BY LUCK. The doclint block is self-referential — it reports
// a verdict computed from file sizes, and this file is one of those files, so writing the block
// changes the number the block reports. Rendering once would therefore produce a file that a
// second run would change, which is exactly what §3.7's done-check forbids. Instead we iterate to
// a FIXED POINT: write, re-measure, re-render, until a render returns its own input. That state
// is idempotent by definition. If no fixed point is reached (a file oscillating across a cap
// boundary), the original is restored and the run FAILS LOUDLY — a tool that silently emits a
// non-idempotent file is worse than one that refuses.

import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve, relative } from "node:path";

const LF = (s) => s.replace(/\r\n/g, "\n");
const B = (s) => Buffer.byteLength(s, "utf8");
const HERE = dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"));

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

function tryRun(cmd, args, cwd) {
  try { return execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 32 * 1024 * 1024 }).toString(); }
  catch { return null; }
}

const root = process.argv[2] || process.cwd();
const coord = findCoordDir(root);
if (!coord) { console.error(`handoff-scaffold: no coordination/ dir found at or above ${root}`); process.exit(1); }
const projectRoot = dirname(coord);
const handoffPath = join(coord, "HANDOFF.md");
if (!existsSync(handoffPath)) { console.error(`handoff-scaffold: ${handoffPath} does not exist`); process.exit(1); }

const BLOCK_RE = /(<!-- GEN:([a-z-]+) -->)([\s\S]*?)(<!-- \/GEN -->)/g;
const CLOSE = "<!-- /GEN -->";
// HTML-escaped, deliberately VISIBLE in source. A zero-width space would read identically here
// and be invisible to every reviewer — the same class of trap as a literal control byte.
const CLOSE_SAFE = "&lt;!-- /GEN --&gt;";

const original = readFileSync(handoffPath, "utf8");
const originalBytes = B(LF(original));
const present = [...LF(original).matchAll(BLOCK_RE)].map((m) => m[2]);
if (present.length === 0) {
  // No-op, loudly. The file is not rewritten at all — not even re-encoded.
  console.log(`handoff-scaffold @ ${handoffPath}`);
  console.log("no GEN blocks found — nothing generated, file untouched.");
  console.log("Adopt it by pasting the GEN:decisions marker pair from PDR-001 §3.7 into HANDOFF.md.");
  console.log("The other three blocks snapshot mutable state session-open already re-runs (I-085) — take them only deliberately.");
  console.log(`HANDOFF: ${originalBytes}B -> ${originalBytes}B (0B changed)`);
  process.exit(0);
}

// ---------------------------------------------------------------- context (read once)

// The ceremony's commit convention is the boundary marker: "section-close:" in the subject.
// That substring is what doclint's near-cap streak detection greps too, so both stay anchored to
// the same convention — and it survives the 2026-08-26 title change that dropped the leading
// D-NNN, because the anchor was never the D prefix.
const lastClose = (tryRun("git", ["log", "-i", "--grep=section-close:", "-n", "1", "--format=%H"], projectRoot) || "").trim();
const range = lastClose ? `${lastClose}..HEAD` : null;

function block_stateDelta() {
  const log = tryRun("git", ["log", "--oneline", "--no-decorate", "-n", "40", ...(range ? [range] : [])], projectRoot);
  if (log === null) return "_not a git repository — no state delta._";
  const lines = log.split("\n").filter(Boolean);
  if (!lines.length) return lastClose ? "_no commits since the last section-close._" : "_no commits._";
  const head = lines.slice(0, 20).map((l) => `- ${l}`);
  if (lines.length > 20) head.push(`- …and ${lines.length - 20} more (\`git log ${range || "HEAD"}\`).`);
  return (lastClose ? `Since the last section-close (\`${lastClose.slice(0, 7)}\`):\n\n` : "Recent commits:\n\n") + head.join("\n");
}

function block_claims() {
  const out = tryRun("gh", ["pr", "list", "--state", "open", "--limit", "50", "--json", "number,title,isDraft,headRefName"], projectRoot);
  if (out === null) return "_claims: skipped (no gh, or no GitHub remote)._";
  let prs;
  try { prs = JSON.parse(out); } catch { return "_claims: skipped (unreadable gh output)._"; }
  const drafts = prs.filter((p) => p.isDraft).sort((a, b) => a.number - b.number);
  if (!drafts.length) return "_no open draft PRs — the flight board is clear._";
  return drafts.map((p) => `- **#${p.number}** \`${p.headRefName}\` — ${p.title}`).join("\n");
}

function readDecisionsDirectoryConfig() {
  const cfgPath = join(coord, ".doclint.json");
  if (!existsSync(cfgPath)) return null;
  try {
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    return cfg.version === 3 && cfg.families?.D?.mode === "directory" ? cfg.families.D : null;
  } catch {
    return null;
  }
}

function collectMintedDecisionRows(files) {
  const rows = [];
  for (const f of files) {
    const abs = join(projectRoot, f);
    if (!existsSync(abs)) continue;
    const t = LF(readFileSync(abs, "utf8"));
    const get = (k) => (t.match(new RegExp(`^${k}:\\s*(.*)$`, "m")) || [])[1] || "";
    if (get("status") === "never-minted") continue;
    rows.push(`| ${get("id")} | ${get("date")} | ${get("status")} | ${get("title").replace(/\|/g, "\\|")} |`);
  }
  return rows;
}

function block_decisions() {
  const fam = readDecisionsDirectoryConfig();
  if (!fam) return "_D family is not in directory mode — decisions are not projected here._";
  const dirRel = relative(projectRoot, join(coord, fam.dir || "decisions/d")).replace(/\\/g, "/");
  const added = range
    ? (tryRun("git", ["diff", "--name-only", "--diff-filter=A", range, "--", dirRel], projectRoot) || "")
    : (tryRun("git", ["ls-files", "--", dirRel], projectRoot) || "");
  const files = added.split("\n").filter((f) => /D-\d{3,4}\.md$/.test(f)).sort();
  if (!files.length) return lastClose ? "_no decisions minted since the last section-close._" : "_no decisions._";
  const rows = collectMintedDecisionRows(files);
  if (!rows.length) return "_no decisions minted since the last section-close._";
  const CAP = 12;
  rows.reverse();
  const shown = rows.slice(0, CAP);
  const table = ["| id | date | status | title |", "|---|---|---|---|", ...shown].join("\n");
  const idxRel = relative(projectRoot, join(coord, fam.index || "decisions/DECISIONS.md")).replace(/\\/g, "/");
  return rows.length > CAP
    ? `${table}\n\n…and ${rows.length - CAP} earlier mint(s) this close — every row resolves in the generated index (\`${idxRel}\`).`
    : table;
}

function block_doclint() {
  const out = tryRun("node", [join(HERE, "doclint.mjs"), projectRoot], projectRoot);
  if (out === null) return "_doclint: could not run._";
  const lines = out.split("\n");
  const vi = lines.findIndex((l) => l.startsWith("VERDICT:"));
  if (vi === -1) return "_doclint: no verdict line._";
  const kept = [lines[vi], ...lines.slice(vi + 1).filter((l) => l.startsWith("  - ")).slice(0, 12)];
  return "```\n" + kept.join("\n").replace(/\s+$/, "") + "\n```";
}

const RENDERERS = {
  "state-delta": block_stateDelta,
  "claims": block_claims,
  "decisions": block_decisions,
  "doclint": block_doclint,
};

// ---------------------------------------------------------------- fixed point

function render(text) {
  return text.replace(BLOCK_RE, (whole, open, name, _inner, close) => {
    const fn = RENDERERS[name];
    // An unrecognised block name is left EXACTLY as it was. "Unrecognised" must never be
    // rendered as "empty" — that is how a second reader inherits the first one's blind spot.
    if (!fn) return whole;
    // Neutralize any closing marker the generated content happens to contain — a decision title
    // holding the literal `<!-- /GEN -->` would otherwise terminate the block early, and each
    // render would re-wrap the orphaned fragment, growing the file forever with no fixed point.
    // Caught by an adversarial probe; the loop below refused correctly, but refusing is worse
    // than not breaking.
    const body = fn().replace(/\s+$/, "").split(CLOSE).join(CLOSE_SAFE);
    return `${open}\n${body}\n${close}`;
  });
}

const unknown = present.filter((n) => !RENDERERS[n]);
let text = LF(original);
let converged = false;
for (let i = 0; i < 6; i++) {
  writeFileSync(handoffPath, text, "utf8"); // doclint measures what is on disk, so put it there
  const next = render(text);
  if (next === text) { converged = true; break; }
  text = next;
}

console.log(`handoff-scaffold @ ${handoffPath}`);
if (!converged) {
  writeFileSync(handoffPath, original, "utf8");
  console.error("FAILED: no fixed point after 6 renders — a generated block keeps changing its own input.");
  console.error("The original file has been restored; nothing was left half-written.");
  console.error("Two known causes, and the output above tells you which:");
  console.error("  · OSCILLATING — the size flips between two values: a file is sitting exactly on a doclint");
  console.error("    cap boundary, so the doclint block grows, trips the cap, shrinks, clears it. Fix the breach.");
  console.error("  · GROWING — the size climbs every pass: generated content is being re-wrapped each render.");
  console.error("    Check whether a projected value (a decision title, a commit subject) contains block-marker");
  console.error("    syntax. Marker text is neutralized on the way in, so this should not happen — if it does,");
  console.error("    the neutralization missed a form and that is the bug, not your document.");
  process.exit(1);
}

const finalBytes = B(text);
const delta = finalBytes - originalBytes;
console.log(`blocks: ${present.filter((n) => RENDERERS[n]).join(", ") || "none recognised"}` +
  (unknown.length ? ` · left untouched (unrecognised): ${unknown.join(", ")}` : ""));
console.log(`HANDOFF: ${originalBytes}B -> ${finalBytes}B (${delta === 0 ? "0B changed" : (delta > 0 ? "+" : "") + delta + "B"})`);

/* I-085 — say it where the operator is looking, at the moment the stale copy is written. Not a
   failure: a repo may keep these deliberately, and this tool does not get to overrule that. */
const MUTABLE = { "state-delta": "git log", claims: "open-PR state", doclint: "a doclint run" };
const carried = present.filter((n) => RENDERERS[n] && MUTABLE[n]);
if (carried.length) {
  console.log(`note: ${carried.map((n) => `${n} (${MUTABLE[n]})`).join(", ")} snapshot mutable state —`);
  console.log(`      session-open re-runs each before it reads HANDOFF, so these age between closes (I-085).`);
}
process.exit(0);
