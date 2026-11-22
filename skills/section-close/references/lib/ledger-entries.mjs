// Entry file parsing, status-token folding, and index projection for decisions-dir.mjs.
import { readFileSync, existsSync, readdirSync } from "node:fs";
import { join, dirname, basename, relative } from "node:path";
import { FAMILY_PROFILES, FAM_STATE, gitOps } from "./ledger-core.mjs";

const { LF } = gitOps;

export function supersedesList(fm) {
  return String(fm.supersedes || "").split(/[,\s]+/).filter(Boolean);
}

function unquotedScalar(v) {
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) return v.slice(1, -1).replace(/\\"/g, '"');
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  return v;
}

export function parseEntry(raw) {
  const t = LF(raw).replace(/^\uFEFF/, "");
  if (!t.startsWith("---\n")) return { error: "does not start with a `---` frontmatter fence" };
  const end = t.indexOf("\n---\n", 3);
  if (end === -1) return { error: "frontmatter fence is never closed by a `---` line" };
  const fmText = t.slice(4, end + 1);
  const body = t.slice(end + 5);
  const fm = {};
  for (const line of fmText.split("\n")) {
    if (!line.trim()) continue;
    const m = line.match(/^([A-Za-z][A-Za-z0-9-]*):\s*(.*)$/);
    if (!m) return { error: `frontmatter line is not \`key: value\` -> ${line.slice(0, 60)}` };
    if (m[1] in fm) return { error: `duplicate frontmatter key \`${m[1]}\`` };
    fm[m[1]] = m[2].trim();
  }
  if (typeof fm.title === "string") fm.title = unquotedScalar(fm.title);
  return { fm, body, fmText };
}

export function loadEntries(dir) {
  if (!existsSync(dir)) return { error: `entry directory ${dir} does not exist` };
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    if (!name.endsWith(".md")) continue;
    const m = name.match(FAM_STATE.FILE_RE);
    const abs = join(dir, name);
    const parsed = parseEntry(readFileSync(abs, "utf8"));
    out.push({ name, abs, n: m ? Number(m[1]) : null, filenameOk: !!m, ...parsed });
  }
  return { entries: out };
}

export function statusToken(status) {
  const s = String(status == null ? "" : status);
  return FAM_STATE.FAM.statusNote ? s.split(" — ")[0].trim() : s;
}

const DEFAULT_COLUMNS = ["id", "date", "status", "title"];

function renderIndexTable(rows, cols) {
  const esc = (s) => String(s == null ? "" : s).replace(/\|/g, "\\|");
  let t = `| ${cols.join(" | ")} |\n|${cols.map(() => "---").join("|")}|\n`;
  for (const e of rows) t += `| ${cols.map((k) => esc(e.fm[k])).join(" | ")} |\n`;
  return t;
}

function renderStubFooter(stubs, leaf) {
  if (!stubs.length) return "";
  return (
    `\n${stubs.length} never-minted id(s) — contiguity stubs, reasons in \`${leaf}/\`: ` +
    stubs.map((e) => e.fm.id).sort().join(", ") + ".\n"
  );
}

export function renderIndex(entries, fam) {
  const minted = entries.filter((e) => e.fm && e.fm.status !== "never-minted");
  const stubs = entries.filter((e) => e.fm && e.fm.status === "never-minted");
  const rows = minted.slice().sort((a, b) => b.n - a.n);
  const leaf = basename(fam.dir);
  const prof = FAMILY_PROFILES[fam.key];
  const liveCols = prof.columns || DEFAULT_COLUMNS;
  const settledCols = prof.settledColumns || liveCols;

  if (!fam.archiveIndex) {
    const out =
      `# ${prof.label} index — GENERATED, do not edit\n` +
      `> Regenerate: \`decisions-dir.mjs index .\` (section-close/references — SETUP.md carries the path). ${entries.length} entries · newest id first ·\n` +
      `> bodies in \`${leaf}/\`. Hand edits are overwritten and flagged by \`check\`.\n\n` +
      renderIndexTable(rows, liveCols) +
      renderStubFooter(stubs, leaf);
    return { main: out, archive: null };
  }

  const live = rows.filter((e) => !prof.terminal.has(statusToken(e.fm.status)));
  const settled = rows.filter((e) => prof.terminal.has(statusToken(e.fm.status)));
  const linkTo = (from, to) => relative(dirname(from), to).replace(/\\/g, "/");
  const settledWord = [...prof.terminal].join(", ");

  const main =
    `# ${prof.label} index — GENERATED, do not edit\n` +
    `> Regenerate: \`decisions-dir.mjs index .\` (section-close/references — SETUP.md carries the path). ${entries.length} entries · newest id first ·\n` +
    `> bodies in \`${leaf}/\`. Hand edits are overwritten and flagged by \`check\`.\n` +
    `> Live rows only (${live.length}). ${settled.length} settled row(s) — ${settledWord} — are projected to\n` +
    `> \`${linkTo(fam.index, fam.archiveIndex)}\`, which \`check\` verifies too.\n\n` +
    renderIndexTable(live, liveCols) +
    renderStubFooter(stubs, leaf);

  const archive =
    `# ${prof.label} index — settled rows — GENERATED, do not edit\n` +
    `> Regenerate: \`decisions-dir.mjs index .\` (section-close/references — SETUP.md carries the path). ${settled.length} settled entries · newest id first ·\n` +
    `> Live rows are on \`${linkTo(fam.archiveIndex, fam.index)}\`.\n` +
    `> This page is a PROJECTION, not an archive of records (D-219): every id below still has\n` +
    `> its file in \`${leaf}/\`, and moving one there would break contiguity, not shrink anything.\n\n` +
    renderIndexTable(settled, settledCols);

  return { main, archive };
}
