// Semantic & reference detectors for doclint.mjs (extracted for 4D module depth).
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve, relative, isAbsolute } from "node:path";

export const MAX_LINE_BYTES = 600; // any line over this = mega-line pathology
const HANDOFF_DNNN_MAX = 20; // more D-NNN refs than this = breadcrumb-trail role collapse

// Flight-board wording rule (B-005 2026-07-27 double-build): HANDOFF describes next work as
// "X is claimable" or "X claimed — see PR #n", never an imperative "next: build X" — that is a
// standing instruction to every future session. Separator after "next" is required so noun
// uses ("the next build failed") don't trip it. Advisory like every flag here (exit 0).
const IMPERATIVE_NEXT = /\bnext(?:\s+(?:up|steps?|actions?))?\s*[:=—–-]+\s*(?:build|create|implement|add|ship|write|draft|wire|fix|deploy|migrate|refactor|do)\b/gi;

// GEN blocks are machine-owned scaffold output — quoted commit subjects, a generated decisions
// table, and doclint's own last verdict. They are EVIDENCE, never a human claim, and every
// semantic detector that has read them has produced a false positive: a merge-subject branch
// name tripping CLAIM_OPEN (P3 close, 2026-08-27), the GEN:doclint verdict re-flagging itself
// recursively (fixed by the fenced-content skip), and — measured on launchfulfillment
// 2026-09-01 — a commit subject "…CLAUDE.md/INDEX.md, design lane…" parsing as a PATHLIKE and
// BLOCKING the required Ledger-deep-checks gate, plus the generated decisions table inflating
// the D-NNN count past its cap (human layer 17 + GEN 3 → flagged at 24 against a limit of 20).
// So: strip GEN before every SEMANTIC detector. Size/cap/ratchet measurements deliberately do
// NOT strip — those bytes are real session cost and must stay counted. (cf-site-harness #42)
export const stripGen = (t) => t.replace(/<!-- GEN:[\s\S]*?<!-- \/GEN -->/g, "");

// v3 D-NNN placement (cf-site-harness#103, operator ruling 2026-09-24). Refs belong in §1/§4 and
// as §3 re-entry pointers, so the cap counts only the sections where they do NOT belong: State and
// Reflection. Matched by NAME, not number — numbering differs across repos (`## 2. State`,
// `## 2 · State`, fixtures with other orders). Returns null when neither heading exists, so the
// caller falls back to the whole-file count rather than silently passing an unrecognised file.
const DNNN_RE = /\bD-[A-Z]?\d{2,3}\b/g;
const CAPPED_SECTION_RE = /^##\s*(?:\d+(?:\.\d+)*\s*[.·:)\-–—]?\s*)?(?:Current\s+)?(State|Reflections?)\b/i;

function cappedSectionRefs(human) {
  const lines = human.split("\n");
  let inCapped = false, found = false, n = 0;
  for (const line of lines) {
    if (/^##\s/.test(line)) {
      inCapped = CAPPED_SECTION_RE.test(line);
      if (inCapped) found = true;
      continue;
    }
    if (inCapped) n += (line.match(DNNN_RE) || []).length;
  }
  return found ? n : null;
}

/* I-081 — ROADMAP §Shipped must read newest-first (D-170 Rule 1). Nothing checked it, and the close's
   own edit has a built-in off-by-one: archiving the oldest entry leaves its gap at the BOTTOM of the
   section, which is exactly where a new entry lands if you write it where the hole is. Observed on
   three consecutive launch-uk closes (PRs #309, #328, #331), caught all three times by a human
   re-reading the headings and never by anything here. Each was fixed before its commit, so git
   history holds no instance — the fixture reproduces the shape, it does not replay an artefact. It matters past tidiness: §Shipped is read
   top-down to reconstruct recent history, so a misplaced entry makes newer work look older than the
   work it supersedes. Dateless headings ("Earlier shipped work — archived") are skipped, not ordered. */
/* The dated headings of §Shipped, newest-first as written. Shared by both checks below so a change
   to what counts as an entry cannot drift between them. Dateless headings — the archive pointer,
   "Earlier shipped work — archived" — are not entries and are excluded here once. */
function shippedDated(text) {
  const sec = text.match(/^##\s.*\bShipped\b.*$([\s\S]*?)(?=^##\s|$(?![\s\S]))/im);
  if (!sec) return null;
  return [...sec[1].matchAll(/^###\s+(.*?)\s*$/gm)]
    .map((m) => ({ head: m[1], d: (m[1].match(/(\d{4}-\d{2}-\d{2})/) || [])[1] }))
    .filter((e) => e.d);
}

function shippedOutOfOrder(text) {
  const dated = shippedDated(text);
  if (dated === null) return null;
  for (let i = 1; i < dated.length; i++) {
    if (dated[i].d > dated[i - 1].d) return `"${dated[i].d}" appears after "${dated[i - 1].d}"`;
  }
  return null;
}

/* I-094 — the OTHER half of a count-and-order rule. launch-uk's D-170 Rule 1 says §Shipped holds the
   three most recent close entries and the fourth archives "mechanically, with no re-decision". D-222
   shipped the ORDER check; nothing graded the COUNT, so it drifted to FOUR entries — in correct date
   order, every gate green. Same family as the stated-rather-than-derived guards: the instrument
   measured something adjacent to the rule and reported clean.

   OPT-IN, deliberately. Newest-first is a property of any reverse-chronological section, so the order
   check is universal. A MAXIMUM is a policy choice: D-170 is launch-uk's ruling, and it appears in
   neither doc-thresholds.md nor SKILL.md. A repo asks for this by setting `thresholds.SHIPPED_ENTRIES`;
   unset means no check, so a repo that never ruled on it sees no change. */
function shippedOverCount(text, max) {
  if (!Number.isFinite(max) || max < 1) return null;
  const dated = shippedDated(text);
  if (dated === null) return null;
  return dated.length > max ? { have: dated.length, max } : null;
}

export function findCoordDir(start) {
  let dir = resolve(start);
  for (;;) {
    const cand = join(dir, "coordination");
    if (existsSync(cand) && statSync(cand).isDirectory()) return cand;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

export function metrics(path) {
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
// convention ("section-close: <section> cohesion sweep"); the colon keeps prose mentions from
// matching. The anchor is the "section-close:" substring and was NEVER the D-NNN prefix, which is
// why the 2026-08-26 title change (dropping the mandatory per-close D-NNN, PDR-001 §3.8) does not
// touch this. A regression assertion pins that.
// Returns null when git or enough close history is unavailable: streak check skips.
export function gitCloseSizes(coordDir, absPath, n) {
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

function checkHandoffSemantics(ctx) {
  const { m, v3, cap, baseCap, action, flags } = ctx;
  const human = stripGen(m.text); // semantic detectors read the HUMAN layer only
  const priorChains = (human.match(/\bprior\s+(`|worker|commit|[0-9a-f]{7})/gi) || []).length;
  const dnnnRefs = (human.match(DNNN_RE) || []).length;
  const impNext = human.match(IMPERATIVE_NEXT) || [];
  if (priorChains > 0) flags.push(`HANDOFF.md contains ${priorChains} "Prior ..." history chain(s) — snapshot/log role collapse; history belongs in git + DECISIONS.`);
  const cappedRefs = v3 ? cappedSectionRefs(human) : null; // v2 parity: whole-file count, unchanged
  if (cappedRefs !== null && cappedRefs > HANDOFF_DNNN_MAX) {
    flags.push(`HANDOFF.md has ${cappedRefs} D-NNN refs (>${HANDOFF_DNNN_MAX}) in §State + §Reflection — refs belong in §1/§4 and as §3 pointers (cf-site-harness#103); move them there.`);
  } else if (cappedRefs === null && dnnnRefs > HANDOFF_DNNN_MAX) {
    flags.push(`HANDOFF.md has ${dnnnRefs} D-NNN refs (>${HANDOFF_DNNN_MAX}) — breadcrumb-trail collapse; keep only pointers needed for re-entry.`);
  }
  if (impNext.length > 0) flags.push(`HANDOFF.md has ${impNext.length} imperative next-action(s) ("${impNext[0]} …") — flight-board wording rule (B-005); phrase unclaimed work as "X is claimable" or "X claimed — see PR #n".`);
  if (cap > baseCap) {
    const humanBytes = Buffer.byteLength(human, "utf8");
    if (humanBytes > baseCap) {
      flags.push(`HANDOFF.md human layer ${humanBytes}B over the ${baseCap}B base bound, which the raise to ${cap}B does not lift (generated: ${m.bytes - humanBytes}B) — the override covers GENERATED blocks, not prose; ${action}.`);
    }
  }
}

export function checkFileSemantics(ctx) {
  if (ctx.name === "HANDOFF") checkHandoffSemantics(ctx);
  if (ctx.name === "ROADMAP") {
    const bad = shippedOutOfOrder(ctx.m.text);
    if (bad) ctx.flags.push(`ROADMAP.md §Shipped is out of date order: ${bad} — newest first (D-170 Rule 1). Archiving the oldest entry leaves its gap at the BOTTOM; an entry written into that gap lands in the wrong slot.`);
    const over = shippedOverCount(ctx.m.text, ctx.shippedMax);
    if (over) ctx.flags.push(`ROADMAP.md §Shipped holds ${over.have} close entries (>${over.max}) — archive the oldest to the roadmap archive, mechanically (D-170 Rule 1). Dateless pointers do not count; this is the COUNT half of the rule whose ORDER half is checked above (I-094).`);
  }
}
