// Core family profiles, config resolution, and git helpers for decisions-dir.mjs.
import { readFileSync, existsSync, statSync, realpathSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve, relative } from "node:path";

const LF = (s) => s.replace(/\r\n/g, "\n");
const B = (s) => Buffer.byteLength(s, "utf8");

export function die(msg) {
  console.error(msg);
  process.exit(1);
}

// One profile per id family. The asymmetries between D, I, and B are RULED, not stylistic (PDR-011 §3, D-177, D-012).
export const FAMILY_PROFILES = {
  D: {
    prefix: "D",
    defaults: { dir: "decisions/d", index: "decisions/DECISIONS.md" },
    label: "Decisions",
    statuses: new Set(["accepted", "superseded", "reverted", "never-minted"]),
    terminal: new Set(["superseded", "reverted"]),
    fmKeys: new Set(["id", "date", "status", "title", "supersedes", "superseded-by", "reverted-by", "structural"]),
    mutable: new Set(["status", "superseded-by", "reverted-by"]),
    statusNote: false,
    supersession: true,
    inline: false,
    requireStatus: false,
    flatNames: ["DECISIONS.md", "decisions/DECISIONS.md"],
    archiveDirs: ["decisions/archive", "archive"],
  },
  I: {
    prefix: "I",
    defaults: { dir: "improvements/i", index: "improvements/IMPROVEMENTS.md" },
    label: "Improvements",
    statuses: new Set(["proposed", "adopted", "declined", "never-minted"]),
    terminal: new Set(["adopted", "declined"]),
    fmKeys: new Set(["id", "date", "status", "title"]),
    mutable: new Set(["status", "date"]),
    statusNote: true,
    supersession: false,
    inline: true,
    requireStatus: true,
    flatNames: ["IMPROVEMENTS.md", "improvements/IMPROVEMENTS.md"],
    archiveDirs: ["improvements/archive", "archive"],
  },
  B: {
    prefix: "B",
    defaults: { dir: "blockers/b", index: "BLOCKERS.md" },
    label: "Blockers",
    statuses: new Set(["open", "resolved", "deferred", "never-minted"]),
    terminal: new Set(["resolved"]),
    fmKeys: new Set(["id", "date", "status", "title", "severity", "resolved-by"]),
    mutable: new Set(["status", "date", "resolved-by"]),
    statusNote: true,
    supersession: false,
    inline: false,
    requireStatus: false,
    h3: true,
    severity: true,
    columns: ["id", "date", "status", "severity", "title"],
    settledColumns: ["id", "date", "status", "severity", "resolved-by", "title"],
    flatNames: ["BLOCKERS.md"],
    archiveDirs: ["blockers", "archive"],
  },
};

export const FAM_STATE = {
  FAM: FAMILY_PROFILES.D,
  STATUSES: FAMILY_PROFILES.D.statuses,
  FM_KEYS: FAMILY_PROFILES.D.fmKeys,
  MUTABLE_KEYS: FAMILY_PROFILES.D.mutable,
  ID_RE: /^D-(\d{3,4})$/,
  FILE_RE: /^D-(\d{3,4})\.md$/,
  HEADING_RE: null,
  ROW_ID_RE: null,
  INLINE_RE: null,
  pad: (n) => (n >= 1000 ? String(n) : String(n).padStart(3, "0")),
  idOf: (n) => `${FAM_STATE.FAM.prefix}-${FAM_STATE.pad(n)}`,
};

export function setFamily(key) {
  const fam = FAMILY_PROFILES[key];
  if (!fam) die(`decisions-dir: unknown family "${key}" — known: ${Object.keys(FAMILY_PROFILES).join(", ")}`);
  FAM_STATE.FAM = fam;
  FAM_STATE.STATUSES = fam.statuses;
  FAM_STATE.FM_KEYS = fam.fmKeys;
  FAM_STATE.MUTABLE_KEYS = fam.mutable;
  FAM_STATE.ID_RE = new RegExp(`^${fam.prefix}-(\\d{3,4})$`);
  FAM_STATE.FILE_RE = new RegExp(`^${fam.prefix}-(\\d{3,4})\\.md$`);
  FAM_STATE.HEADING_RE = new RegExp(
    `^${fam.h3 ? "#{2,3}" : "##"}\\s+(?:~~)?(?:\\*\\*)?${fam.prefix}-(\\d{3,4})(?:\\*\\*)?${fam.inline ? "(?:~~)?" : ""}(?:\\s*\\[STRUCTURAL\\])?(?:(?:\\s*([—–:-])\\s*|\\s+)(.*?))?\\s*$`
  );
  FAM_STATE.ROW_ID_RE = new RegExp(`^(?:~~)?(?:\\*\\*)(?:~~)?\\s*${fam.prefix}-(\\d{3,4})\\s*(?:~~)?(?:\\*\\*)(?:~~)?$`);
  FAM_STATE.INLINE_RE = fam.inline
    ? new RegExp(`^(?:[-*]\\s+)?(?:~~)?\\*\\*(?:~~)?${fam.prefix}-(\\d{3,4})(?:~~)?\\*\\*(?:~~)?\\s*[—–-]\\s*(.*)$`)
    : null;
}
setFamily("D");

function findCoordDir(start) {
  let dir = resolve(start);
  for (;;) {
    const cand = join(dir, "coordination");
    if (existsSync(cand) && statSync(cand).isDirectory()) return realpathSync.native(cand);
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function loadFamily(coord, key) {
  const prof = FAMILY_PROFILES[key];
  const cfgPath = join(coord, ".doclint.json");
  let cfg = null;
  if (existsSync(cfgPath)) {
    try { cfg = JSON.parse(readFileSync(cfgPath, "utf8")); }
    catch (e) { return { error: `.doclint.json unreadable (${e.message})` }; }
  }
  const fam = (cfg && cfg.version === 3 && cfg.families && cfg.families[key]) || null;
  return {
    key,
    v3: !!(cfg && cfg.version === 3 && cfg.families),
    mode: fam && fam.mode ? fam.mode : "file",
    dir: join(coord, (fam && fam.dir) || prof.defaults.dir),
    index: join(coord, (fam && fam.index) || prof.defaults.index),
    archiveIndex: fam && fam.archiveIndex ? join(coord, fam.archiveIndex) : null,
  };
}

function validateDeclaredFamilies(coord) {
  const cfgPath = join(coord, ".doclint.json");
  if (!existsSync(cfgPath)) return;
  try {
    const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
    if (!cfg || cfg.version !== 3 || !cfg.families) return;
    for (const [k, f] of Object.entries(cfg.families)) {
      if (f && f.mode === "directory" && !Object.hasOwn(FAMILY_PROFILES, k)) {
        die(`decisions-dir: family "${k}" is declared directory-mode but this tool has no ${k} profile — it would go UNCHECKED. Keep it "file" until the tool learns it (add a FAMILY_PROFILES entry via PR).`);
      }
    }
  } catch { /* unreadable config is reported by loadFamily below */ }
}

function directoryFamilies(coord, only) {
  validateDeclaredFamilies(coord);
  const keys = only ? [only] : Object.keys(FAMILY_PROFILES);
  const out = [];
  for (const k of keys) {
    const fam = loadFamily(coord, k);
    if (fam.error) die(`decisions-dir: ${fam.error}`);
    if (fam.v3 && fam.mode === "directory") out.push(fam);
  }
  return out;
}

function requireDirectoryMode(coord, fam, sub) {
  if (fam.error) die(`decisions-dir ${sub}: ${fam.error}`);
  if (!fam.v3 || fam.mode !== "directory") {
    die(
      `decisions-dir ${sub}: the ${fam.key} family is not in directory mode.\n` +
      `  ${join(coord, ".doclint.json")} must declare {"version":3,"families":{"${fam.key}":{"mode":"directory",...}}}.\n` +
      `  A repo that has not opted in is untouched by v3 — run \`migrate\` to convert it first.`
    );
  }
}

export const configOps = { findCoordDir, loadFamily, directoryFamilies, requireDirectoryMode };

function gitText(args, cwd) {
  return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString();
}

function gitBlob(top, spec) {
  try {
    return LF(execFileSync("git", ["show", spec], { cwd: top, stdio: ["ignore", "pipe", "ignore"], maxBuffer: 64 * 1024 * 1024 }).toString("utf8"));
  } catch { return null; }
}

function relPosix(top, abs) {
  return relative(top, abs).replace(/\\/g, "/");
}

function addingCommitsByPath(top, familyDir) {
  const byPath = new Map();
  let raw = "";
  try {
    raw = gitText(["-c", "core.quotepath=false", "log", "--diff-filter=A", "--no-renames", "--name-only",
      "--format=%x00%H", "--", relPosix(top, familyDir)], top);
  } catch { return byPath; }
  let sha = "";
  for (const line of raw.split("\n")) {
    if (line.charCodeAt(0) === 0) { sha = line.slice(1).trim(); continue; }
    const p = line.trim();
    if (!p || !sha) continue;
    if (!byPath.has(p)) byPath.set(p, []);
    byPath.get(p).push(sha);
  }
  return byPath;
}

function repoTop(dir) {
  try { return gitText(["rev-parse", "--show-toplevel"], dir).trim(); } catch { return null; }
}

function migrationDate(top) {
  try { return gitText(["log", "-1", "--format=%ad", "--date=short"], top).trim() || "1970-01-01"; }
  catch { return "1970-01-01"; }
}

export const gitOps = { LF, B, gitText, gitBlob, addingCommitsByPath, repoTop, relPosix, migrationDate };
