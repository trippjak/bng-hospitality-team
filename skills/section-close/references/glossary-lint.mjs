#!/usr/bin/env node
/**
 * glossary-lint — the enforcement half of coordination/GLOSSARY.md, the PROCESS glossary.
 *
 * Contract: doc-thresholds.md §Process glossary. Origin: business-club-ops D-143 (from I-090),
 * ported to brand-workshop-harness as D-204, canonicalised here (claude-config D-011) because
 * two vendored copies had already drifted — the exact rot this script exists to catch in docs.
 *
 * Usage:  node glossary-lint.mjs [projectRoot]        exit 0 clean · exit 1 on any FAIL
 *
 * WHY THIS EXISTS
 *
 * A hand-kept glossary rots faster than the docs it describes, and a stale glossary is worse
 * than none because it reads as authoritative. A doc whose promise is checked nowhere is a
 * comment. The glossary's promise is narrow —
 *
 *     EVERY TERM IS ONE LINE, AND EVERY POINTER RESOLVES.
 *
 * It deliberately does NOT check that definitions are *correct* — correctness lives with the
 * owner the pointer names, which is the whole design: the glossary resolves vocabulary, it
 * never explains it. A definition drifting from its owner is caught by the reader landing on
 * the owner, not by this script.
 *
 * WHY IT IS NOT GAMEABLE
 *
 *   - Point a term at a deleted/renamed file      -> path does not exist            -> FAIL
 *   - Point at an id that never resolves           -> not live, not in archive INDEX -> FAIL
 *   - Let an entry grow a reasoning paragraph      -> continuation line              -> FAIL
 *   - Define the same term twice (drift's midwife) -> duplicate                      -> FAIL
 *   - Let the file become a second PROCESS.md      -> byte cap                       -> FAIL
 *   - Wire the gate with no file / no entries      -> silent-success guard           -> FAIL
 *
 * REPO-AGNOSTIC BY CONSTRUCTION. The vendored copies hardcoded `coordination/archive/INDEX.md`
 * and `docs/pdr/` and threw when either was absent, so they could only run where they were
 * written. Here every resolution surface is read from the repo's own `.doclint.json` families
 * (same contract as doclint/decisions-dir) or probed optionally:
 *
 *   D-NNN / I-NNN  directory mode -> `<dir>/<id>.md` exists      (the filesystem IS the ledger)
 *                  file mode      -> `## <id>` or `- **<id>**` heads an entry in the family's file
 *   B-NNN          `blockers/<id>.md` exists, OR heads an entry / table row in BLOCKERS.md
 *   any id         a row in `coordination/archive/INDEX.md`, if that file exists
 *   PDR-NNN        a `docs/pdr/PDR-NNN-*.md` file
 *   `path`         exists relative to the project root
 *
 * Zero LLM tokens. Wired as a gate beside doclint --gate and decisions-dir check.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";

const root = resolve(process.argv[2] || process.cwd());
const coord = join(root, "coordination");
const GLOSSARY = join(coord, "GLOSSARY.md");
const BYTE_CAP = 8000; // same figure as the one-screen files; a glossary near it is explaining, not pointing

const fails = [];
const readOpt = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");

if (!existsSync(GLOSSARY)) {
  console.log(`glossary-lint @ ${GLOSSARY}`);
  console.log("VERDICT: 1 FAIL(S)");
  console.log("  - coordination/GLOSSARY.md does not exist — a wired gate with no file is a misconfiguration, not a pass (doc-thresholds.md §Process glossary)");
  process.exit(1);
}

const raw = readFileSync(GLOSSARY, "utf8");
// Measured on LF-normalized content: raw bytes differ between a CRLF worktree and CI's LF
// checkout, and a guard that is green on one and red on the other is platform-locked.
const bytes = Buffer.byteLength(raw.replace(/\r\n/g, "\n"));
if (bytes > BYTE_CAP) {
  fails.push(`file is ${bytes}B against the ${BYTE_CAP}B cap — a glossary this size is explaining, not pointing; move the prose to its owner`);
}

// ---- resolution surfaces, from the repo's own config -------------------------------------------
let families = {};
try {
  const cfg = JSON.parse(readFileSync(join(coord, ".doclint.json"), "utf8"));
  if (cfg && cfg.version === 3 && cfg.families) families = cfg.families;
} catch { /* v2 or absent: every family resolves in file mode below */ }

const FILE_DEFAULT = { D: "DECISIONS.md", I: "IMPROVEMENTS.md", B: "BLOCKERS.md" };
const DIR_DEFAULT = { D: "decisions/d", I: "improvements/i", B: "blockers/b" };
const isDir = (f) => !!(families[f] && families[f].mode === "directory");
const dirOf = (f) => join(coord, (families[f] && families[f].dir) || DIR_DEFAULT[f]);
const fileTextOf = (f) => {
  // file mode: the family's flat file; directory mode: its generated index (a projection, but a
  // row there means the entry exists — the stub/struck-pointer forms the migration preserved).
  const idx = families[f] && families[f].index;
  const candidates = [idx && join(coord, idx), join(coord, "decisions", FILE_DEFAULT[f]), join(coord, FILE_DEFAULT[f])].filter(Boolean);
  return candidates.map(readOpt).join("\n");
};
const archiveText = readOpt(join(coord, "archive", "INDEX.md"));
const PDR_DIR = join(root, "docs", "pdr");
const pdrFiles = existsSync(PDR_DIR) ? readdirSync(PDR_DIR) : [];
const blockersText = readOpt(join(coord, "BLOCKERS.md"));

const headsEntry = (text, id) =>
  new RegExp(`^(## |### |- \\*\\*|\\*\\*|\\| )${id}\\b`, "m").test(text);

function idResolves(id) {
  const fam = id[0];
  if (fam === "B") {
    if (isDir("B") && existsSync(join(dirOf("B"), `${id}.md`))) return true; // directory mode (D-012)
    if (existsSync(join(coord, "blockers", `${id}.md`))) return true; // hand-rolled split
    if (headsEntry(blockersText, id)) return true;
  } else {
    if (isDir(fam) && existsSync(join(dirOf(fam), `${id}.md`))) return true;
    if (headsEntry(fileTextOf(fam), id)) return true;
  }
  return new RegExp(`^\\| ${id} \\|`, "m").test(archiveText);
}

// ---- the file itself --------------------------------------------------------------------------
const lines = raw.split(/\r?\n/);
const seen = new Map();
let entries = 0;
let prevWasEntry = false;

function validateOwnerPointer(n, term, owner) {
  const idRef = /^([DBI]-\d{3})$/.exec(owner);
  if (idRef) {
    if (!idResolves(idRef[1])) fails.push(`line ${n}: "${term}" points at ${idRef[1]}, which resolves neither live nor in the archive INDEX`);
    return;
  }
  const pdrRef = /^(PDR-\d{3})$/.exec(owner);
  if (pdrRef) {
    if (!pdrFiles.some((f) => f.startsWith(`${pdrRef[1]}-`))) fails.push(`line ${n}: "${term}" points at ${pdrRef[1]}, but no docs/pdr/${pdrRef[1]}-*.md exists`);
    return;
  }
  const pathRef = /^`([^`]+)`$/.exec(owner);
  if (pathRef) {
    if (!existsSync(resolve(root, pathRef[1]))) fails.push(`line ${n}: "${term}" points at \`${pathRef[1]}\`, which does not exist`);
    return;
  }
  fails.push(`line ${n}: "${term}" owner "${owner}" is neither an id (D/B/I-NNN), a PDR-NNN, nor a backticked path`);
}

lines.forEach((line, i) => {
  const n = i + 1;
  const isEntry = line.startsWith("- ");
  const isStructural = line === "" || line.startsWith("#") || line.startsWith(">");

  if (!isEntry && !isStructural) {
    const hint = prevWasEntry ? "entries are ONE line; move the overflow to the owner the pointer names" : "unrecognized line shape";
    fails.push(`line ${n}: not an entry, heading, blank or quote — ${hint}: "${line.slice(0, 60)}"`);
  }
  prevWasEntry = isEntry;
  if (!isEntry) return;
  entries++;

  const m = /^- \*\*(.+?)\*\* — .+ → (.+)$/.exec(line);
  if (!m) {
    fails.push(`line ${n}: entry does not match "- **term** — definition → owner"`);
    return;
  }
  const [, term, owner] = m;
  const key = term.toLowerCase();
  if (seen.has(key)) fails.push(`line ${n}: duplicate term "${term}" (first at line ${seen.get(key)}) — two definitions is how wording drifts`);
  else seen.set(key, n);

  validateOwnerPointer(n, term, owner);
});

if (entries === 0) fails.push("no entries found — an empty glossary passing would be the silent-success failure this script exists to prevent");

console.log(`glossary-lint @ ${GLOSSARY}`);
console.log(`  ${entries} terms · ${bytes}B / ${BYTE_CAP}B cap`);
if (fails.length) {
  console.log(`\nVERDICT: ${fails.length} FAIL(S)`);
  for (const f of fails) console.log(`  - ${f}`);
  process.exit(1);
}
console.log("VERDICT: every term is one line and every pointer resolves.");
