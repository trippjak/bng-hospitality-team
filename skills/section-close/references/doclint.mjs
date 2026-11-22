#!/usr/bin/env node
// doc-system v2/v3 lint — deterministic, zero-LLM-token threshold enforcement for section-close.
// Usage: node doclint.mjs [projectRoot]   (defaults to cwd; walks up to find coordination/)
// Exit code is always 0 unless --gate is passed with blocking flags.
//
// Thresholds are BYTE-based (tokens ~ bytes/4). Line counts are reported but not enforced:
// the 2026-06 audit showed line thresholds defeated by mega-lines (11.6KB single-line HANDOFF).
// Teeth (Q13): every line >600B is counted into the mega-line flag; a file >90% of cap is NEAR,
// and NEAR across consecutive section-close commits (git-detected) flags the archive decision.

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_LINE_BYTES,
  findCoordDir,
  metrics,
  gitCloseSizes,
  checkFileSemantics,
} from "./lib/doclint-detectors.mjs";
import { checkDeadRefs, checkPrClaims } from "./lib/doclint-refs-prs.mjs";
import { runV3Reporters } from "./lib/doclint-v3.mjs";

const THRESHOLDS = {
  HANDOFF: 8000, // ~2K tokens. Breach => rewrite-in-place (snapshot accreting history)
  DECISIONS: 48000, // ~12K tokens. Breach => archive oldest ~100 entries, leave stubs
  ROADMAP: 24000, // ~6K tokens.  Breach => archive shipped sections
  BLOCKERS: 8000, // ~2K tokens. Breach => triage signal, NEVER auto-archive
  IMPROVEMENTS: 8000, // ~2K tokens. Breach => triage-tail. Override per project in .doclint.json.
};

/* The PRE-OVERRIDE values. `THRESHOLDS` is mutated in place when a project raises a cap, so a check
   that needs the original bound cannot read it back afterwards. (I-053) */
const BASE_THRESHOLDS = Object.freeze({ ...THRESHOLDS });
const ALWAYS_READ_BUDGET = 20000; // ~5K tokens: HANDOFF + BLOCKERS, the real cold-boot read
const FOUR_FILE_BUDGET = 88000;   // ~22K tokens: total doc weight (was COLD_BOOT_BUDGET)
const NEAR_CAP_RATIO = 0.9; // status NEAR above this fraction of the (effective) threshold
const STREAK_CLOSES = 2; // NEAR at this many consecutive closes = flag: archive, don't trim (Q13)
const ACTIONS = { HANDOFF: "rewrite-in-place", DECISIONS: "archive oldest entries", ROADMAP: "archive shipped", BLOCKERS: "TRIAGE (never archive unresolved)" };

const root = process.argv[2] || process.cwd();
const coord = findCoordDir(root);
if (!coord) {
  console.log(`doclint: no coordination/ dir found at or above ${root}`);
  console.log("VERDICT: NO-COORD (nothing linted — wrong project root?)");
  process.exit(0);
}

// v3 GATE (PDR-001 §3.3). Read the config ONCE, early, for feature detection only — no flags are
// pushed here. Flag ORDER is part of the output, and v2 parity is a hard contract.
let rawCfg = null;
{
  const p = join(coord, ".doclint.json");
  if (existsSync(p)) { try { rawCfg = JSON.parse(readFileSync(p, "utf8")); } catch { rawCfg = null; } }
}
const v3 = !!(rawCfg && rawCfg.version === 3 && rawCfg.families);
const famOf = (id) => (v3 && rawCfg.families[id]) || null;
const isDir = (id) => { const f = famOf(id); return !!(f && f.mode === "directory"); };

const DECISIONS_INDEX_CAP_DEFAULT = 48000;
let decIndexCap = DECISIONS_INDEX_CAP_DEFAULT;
const IMPROVEMENTS_INDEX_CAP_DEFAULT = 8000;
let impIndexCap = IMPROVEMENTS_INDEX_CAP_DEFAULT;

const handoff = join(coord, "HANDOFF.md");
const roadmap = join(coord, "ROADMAP.md");
const decA = join(coord, "DECISIONS.md");
const decB = join(coord, "decisions", "DECISIONS.md");
const decisionsPath = isDir("D") ? join(coord, famOf("D").index || "decisions/DECISIONS.md")
  : existsSync(decB) ? decB : decA;
const blockers = isDir("B") ? join(coord, famOf("B").index || "BLOCKERS.md") : join(coord, "BLOCKERS.md");

const files = [
  ["HANDOFF", handoff],
  [isDir("D") ? "DECISIONS_IDX" : "DECISIONS", decisionsPath],
  ["ROADMAP", roadmap],
  ["BLOCKERS", blockers],
];

const capOf = (name) => (name === "DECISIONS_IDX" ? decIndexCap : THRESHOLDS[name]);
const actionOf = (name) => (name === "DECISIONS_IDX"
  ? "SHARD the generator (rows for past years -> DECISIONS-YYYY.md); never delete rows"
  : ACTIONS[name]);

const flags = [];
if (!isDir("D") && existsSync(decA) && existsSync(decB)) {
  flags.push("DECISIONS exists at BOTH coordination/ and coordination/decisions/ — consolidate (subdirectory copy is canonical here).");
}

let coldBoot = FOUR_FILE_BUDGET;
let shippedMax = null;
const overrides = [];
const cfgPath = join(coord, ".doclint.json");
if (existsSync(cfgPath)) {
  try {
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    for (const [k, v] of Object.entries(cfg.thresholds || {})) {
      if (v3 && k === "DECISIONS_INDEX") {
        if (!Number.isFinite(v) || v <= 0) { flags.push(`.doclint.json threshold "${k}" is not a positive number — ignored.`); continue; }
        overrides.push(`${k} ${decIndexCap}->${v}`);
        decIndexCap = v;
        continue;
      }
      if (v3 && k === "IMPROVEMENTS_INDEX") {
        if (!Number.isFinite(v) || v <= 0) { flags.push(`.doclint.json threshold "${k}" is not a positive number — ignored.`); continue; }
        overrides.push(`${k} ${impIndexCap}->${v}`);
        impIndexCap = v;
        continue;
      }
      if (k === "SHIPPED_ENTRIES") {
        if (!Number.isFinite(v) || v < 1) { flags.push(`.doclint.json threshold "${k}" is not a positive integer — ignored.`); continue; }
        overrides.push(`${k} off->${v}`);
        shippedMax = v;
        continue;
      }
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
  if (name === "HANDOFF" || name === "BLOCKERS") alwaysReadBytes += m.bytes;
  let status = "ok";
  if (m.bytes > capOf(name)) {
    status = "OVER";
    flags.push(`${name}.md ${m.bytes}B over ${capOf(name)}B threshold -> ${actionOf(name)}`);
  } else if (m.bytes > capOf(name) * NEAR_CAP_RATIO) {
    status = "NEAR";
    const past = gitCloseSizes(coord, path, STREAK_CLOSES - 1);
    if (past !== null && past.every((b) => b !== null && b > capOf(name) * NEAR_CAP_RATIO)) {
      flags.push(`${name}.md near-cap streak: >${Math.round(NEAR_CAP_RATIO * 100)}% of ${capOf(name)}B cap at ${STREAK_CLOSES}+ consecutive closes — make the archive decision now (${actionOf(name)}); trimming back under the cap is the gaming this check exists to catch.`);
    }
  }
  if (m.megaLines > 0) {
    status += "+MEGALINE";
    flags.push(`${name}.md has ${m.megaLines} mega-line(s) over ${MAX_LINE_BYTES}B (max ${m.maxLine}B) — run-on entries; break into structured multi-line entries.`);
  }
  checkFileSemantics({ name, m, v3, cap: capOf(name), baseCap: BASE_THRESHOLDS.HANDOFF, action: actionOf(name), shippedMax, flags });
  rows.push({ name, bytes: m.bytes, tokens: m.tokens, lines: m.lines, maxLine: m.maxLine, status });
}

// Optional fifth file: IMPROVEMENTS.md (session-open-only, excluded from cold-boot sum).
if (isDir("I")) {
  const p = join(coord, famOf("I").index || "improvements/IMPROVEMENTS.md");
  if (!existsSync(p)) {
    rows.push({ name: "IMPROVEMENTS_IDX*", bytes: "-", tokens: "-", lines: "-", maxLine: "-", status: "MISSING" });
    flags.push(`IMPROVEMENTS index missing at ${p} — run \`decisions-dir.mjs index\` (family I).`);
  } else {
    const m = metrics(p);
    let status = m.bytes > impIndexCap ? "OVER" : m.bytes > impIndexCap * NEAR_CAP_RATIO ? "NEAR" : "ok";
    if (m.megaLines > 0) status += "+MEGALINE";
    rows.push({ name: "IMPROVEMENTS_IDX*", bytes: m.bytes, tokens: m.tokens, lines: m.lines, maxLine: m.maxLine, status });
    if (m.bytes > impIndexCap) flags.push(`IMPROVEMENTS index ${m.bytes}B over ${impIndexCap}B cap -> SHARD the generator (rows for terminal entries -> an archive index page); never delete rows.`);
    if (m.megaLines > 0) flags.push(`IMPROVEMENTS index has ${m.megaLines} mega-line(s) over ${MAX_LINE_BYTES}B (max ${m.maxLine}B) — an index row that long means a title needs the clamp; fix the generator input, never the generated file.`);
  }
  const flat = join(coord, "IMPROVEMENTS.md");
  if (existsSync(flat)) {
    flags.push(`IMPROVEMENTS.md still exists at coordination/ root while the I family is in directory mode — a stale pre-migration copy nothing measures. Delete it (the record lives in ${famOf("I").dir || "improvements/i"}/).`);
  }
  if (overrides.some((o) => o.startsWith("IMPROVEMENTS "))) {
    flags.push(`.doclint.json threshold "IMPROVEMENTS" has NO effect in I-directory mode — the projection is capped by "IMPROVEMENTS_INDEX" (currently ${impIndexCap}B). Move the override to that key or drop it.`);
  }
} else {
  const improvementsPath = join(coord, "IMPROVEMENTS.md");
  if (existsSync(improvementsPath)) {
    const m = metrics(improvementsPath);
    const iCap = THRESHOLDS.IMPROVEMENTS;
    let status = m.bytes > iCap ? "OVER" : m.bytes > iCap * NEAR_CAP_RATIO ? "NEAR" : "ok";
    if (m.megaLines > 0) status += "+MEGALINE";
    rows.push({ name: "IMPROVEMENTS*", bytes: m.bytes, tokens: m.tokens, lines: m.lines, maxLine: m.maxLine, status });
    if (m.bytes > iCap) flags.push(`IMPROVEMENTS.md ${m.bytes}B over ${iCap}B cap -> queue triage-tail (decline/expire oldest entries) at next section-close.`);
    if (m.megaLines > 0) flags.push(`IMPROVEMENTS.md has ${m.megaLines} mega-line(s) over ${MAX_LINE_BYTES}B (max ${m.maxLine}B) — break into structured multi-line entries.`);
  }
}

const { refsChecked, refsDead, refsPlaceholder } = checkDeadRefs(coord, handoff, blockers, flags);
const { prLine, prSkipped } = checkPrClaims({
  coord,
  handoff,
  blockers,
  roadmap,
  decisionsPath,
  fixPrClaims: process.argv.includes("--fix-pr-claims"),
  flags,
});

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

if (v3) {
  runV3Reporters({ coord, files, isDir, famOf, writeRatchet: process.argv.includes("--write-ratchet"), flags });
}
if (!v3 && process.argv.includes("--write-ratchet")) {
  console.log(`--write-ratchet: v3 repos only — no baseline written (coordination/.doclint.json has no "version": 3).`);
}
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

const SOFT_FLAGS = [
  /near-cap streak/,
  /D-NNN refs \(>/,
  /imperative next-action/,
  /has NO effect in I-directory mode/,
  /human layer \d+B over the/,
];
if (process.argv.includes("--gate")) {
  const hard = flags.filter((f) => !SOFT_FLAGS.some((re) => re.test(f)));
  const skipped = prSkipped ? " · PR claims NOT verified (gh unavailable)" : "";
  console.log(`GATE: ${hard.length} blocking · ${flags.length - hard.length} advisory${skipped}`);
  if (hard.length > 0) process.exit(1);
}
