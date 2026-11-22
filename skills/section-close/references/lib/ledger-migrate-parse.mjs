// Entry extraction, metadata parsing, and archive-index oracle for `decisions-dir.mjs migrate`.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { FAM_STATE, gitOps } from "./ledger-core.mjs";
import { supersedesList } from "./ledger-entries.mjs";

const { LF, gitBlob, relPosix } = gitOps;
const ROW_TITLE_MAX = 90;
const DATE_RE = /(\d{4}-\d{2}-\d{2})/;
const SUPERSESSION_VERDICTS = new Set(["full", "partial", "none"]);

function decisionRowId(rawLine) {
  const line = rawLine.trim();
  if (!line.startsWith("|")) return null;
  const first = line.split("|")[1];
  if (first === undefined) return null;
  const m = first.trim().match(FAM_STATE.ROW_ID_RE);
  return m ? Number(m[1]) : null;
}

function parseTableRow(rawLine) {
  const line = rawLine.trim();
  const n = decisionRowId(line);
  if (n === null) return null;
  if (!line.endsWith("|")) return { n, why: "row does not end in `|` (trailing content after the last cell?)" };
  const cells = line.split("|");
  if (cells.length < 5) return { n, why: `row has ${Math.max(0, cells.length - 2)} cell(s); need at least an id, one body cell, and a date` };
  const dateCell = cells[cells.length - 2].trim();
  const dateM = dateCell.match(/^(\d{4}-\d{2}-\d{2})$/);
  if (!dateM) return { n, why: `last cell "${dateCell.slice(0, 40)}" is not a YYYY-MM-DD date` };
  const bodyMiddle = cells.slice(2, cells.length - 2).join("|");
  if (!bodyMiddle.trim()) return { n, why: "body cell is empty" };
  return { n, date: dateM[1], bodyMiddle };
}

function clampTitle(s) {
  const flat = s.replace(/\s+/g, " ").trim();
  if (flat.length <= ROW_TITLE_MAX) return flat;
  const cut = flat.slice(0, ROW_TITLE_MAX);
  const wsp = cut.lastIndexOf(" ");
  return (wsp > 40 ? cut.slice(0, wsp) : cut) + "…";
}

function titleFromRowBody(bodyMiddle) {
  let rest = bodyMiddle.replace(/^\s+/, "");
  let structural = false;
  const ownSpan = rest.match(/^\*\*\[STRUCTURAL\]\*\*\s*/);
  if (ownSpan) { structural = true; rest = rest.slice(ownSpan[0].length); }
  const lead = rest.match(/^\*\*(.+?)\*\*/);
  if (lead) {
    let t = lead[1].trim();
    const inSpan = t.match(/^\[STRUCTURAL\]\s*/);
    if (inSpan) { structural = true; t = t.slice(inSpan[0].length).trim(); }
    if (t) return { title: clampTitle(t), structural };
  }
  const flat = rest.replace(/\s+/g, " ").trim();
  return { title: flat ? clampTitle(flat) : "(untitled)", structural };
}

function isInlineEntryLine(line) {
  return /\*Status:/i.test(line) || /\*\((?:proposed|adopted|declined|expired|terminal)/i.test(line);
}

function classifyMigrateLine(line, lineIdx, sourceLabel) {
  const m = line.match(FAM_STATE.HEADING_RE);
  if (m) {
    return {
      found: {
        kind: "heading",
        n: Number(m[1]),
        title: (m[3] || "").replace(/(~~|\*\*)+$/g, "").replace(/^\[STRUCTURAL\]\s*/, "").trim(),
        bare: !!m[3] && !m[2],
        line: lineIdx,
      },
    };
  }
  if (FAM_STATE.INLINE_RE) {
    const im = line.match(FAM_STATE.INLINE_RE);
    if (im && isInlineEntryLine(line)) {
      const { title } = titleFromRowBody(im[2]);
      return { found: { kind: "inline", n: Number(im[1]), title, bare: false, line: lineIdx } };
    }
  }
  const row = parseTableRow(line);
  if (!row) return null;
  if (row.why) {
    return { malformed: { n: row.n, line: lineIdx, why: row.why, sample: line.slice(0, 96), source: sourceLabel } };
  }
  const { title, structural } = titleFromRowBody(row.bodyMiddle);
  return { found: { kind: "row", n: row.n, title, structural, rowDate: row.date, bodyMiddle: row.bodyMiddle, bare: false, line: lineIdx } };
}

function computeEntrySpans(found, lines, sourceLabel) {
  for (let k = 0; k < found.length; k++) {
    const item = found[k];
    if (item.kind === "row" || item.kind === "inline") {
      item.start = item.line;
      item.end = item.line + 1;
      item.body = item.kind === "row" ? item.bodyMiddle : lines[item.line];
      item.source = sourceLabel;
      continue;
    }
    const start = item.line;
    let end = k + 1 < found.length ? found[k + 1].line : lines.length;
    while (end > start + 1 && (lines[end - 1].trim() === "" || /^-{3,}$/.test(lines[end - 1].trim()))) end--;
    item.start = start;
    item.end = end;
    item.body = lines.slice(start, end).join("\n");
    item.source = sourceLabel;
  }
}

export function extractEntries(text, sourceLabel) {
  const lines = LF(text).split("\n");
  const found = [];
  const malformedRows = [];
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const f = lines[i].match(/^\s*(```+|~~~+)/);
    if (f) { fence = !fence ? f[1][0] : (f[1][0] === fence ? null : fence); continue; }
    if (fence) continue;
    const hit = classifyMigrateLine(lines[i], i, sourceLabel);
    if (!hit) continue;
    if (hit.found) found.push(hit.found);
    if (hit.malformed) malformedRows.push(hit.malformed);
  }
  computeEntrySpans(found, lines, sourceLabel);
  return { entries: found, lines, malformedRows };
}

function supersessionMentions(heading, rest) {
  const P = FAM_STATE.FAM.prefix;
  const ID = new RegExp(`${P}-\\d{3,4}`, "gi");
  const idsIn = (text) => (text.match(ID) || []).map((id) => id.toUpperCase());
  const plain = [], scoped = [];
  for (const m of heading.matchAll(new RegExp(`\\bsupersedes:?\\s*(${P}-\\d{3,4}[^)\\]\\n]*)`, "gi"))) {
    const tail = m[1];
    const qualifier = tail.replace(ID, "").replace(/\band\b|[,;&.]/gi, " ").replace(/\s+/g, " ").trim();
    for (const id of idsIn(tail)) {
      if (qualifier === "") plain.push(id);
      else scoped.push({ id, qualifier });
    }
  }
  const fieldList = new RegExp(`\\bsupersedes:\\s*(${P}-\\d{3,4}(?:\\s*(?:,|&|\\band\\b)\\s*${P}-\\d{3,4})*)`, "gi");
  for (const m of rest.matchAll(fieldList)) plain.push(...idsIn(m[1]));
  return { plain: [...new Set(plain)], scoped };
}

function resolveEntryStatus(all, body, head) {
  const { FAM, STATUSES } = FAM_STATE;
  if (FAM.severity) {
    const status = /^#{2,3}\s+~~/.test(all[0] || "") ? "resolved" : "open";
    const sev = body.match(/\*\*Severity:?\*\*:?\s*([^\n]*)/i);
    const severity = sev ? sev[1].split(/\s+[—–·-]\s+/)[0].replace(/[*_`]/g, "").trim().toLowerCase().slice(0, 40) || "unstated" : "unstated";
    return { status, statusProblem: null, severity };
  }
  const sm = head.match(/\bStatus:\s*([A-Za-z-]+)/i);
  if (sm && STATUSES.has(sm[1].toLowerCase())) {
    return { status: sm[1].toLowerCase(), statusProblem: null, severity: null };
  }
  if (!FAM.requireStatus) {
    return { status: "accepted", statusProblem: null, severity: null };
  }
  const statusProblem = sm
    ? `status token \`${sm[1]}\` maps to nothing in {${[...STATUSES].join(", ")}} — resolve it by hand (e.g. a partial adoption is a judgment call, not a migration guess)`
    : "no `Status:` line found — every entry in this family carries one, so its absence is a finding";
  return { status: "accepted", statusProblem, severity: null };
}

export function readMeta(body) {
  const { FAM, FM_KEYS } = FAM_STATE;
  const all = body.split("\n");
  const dateLineIdx = all.findIndex((l) => /^\*{0,2}\d{4}-\d{2}-\d{2}\*{0,2}\s+[•·]/.test(l));
  const head = all.slice(0, 4).concat(dateLineIdx >= 0 ? all.slice(dateLineIdx, dateLineIdx + 3) : []).join("\n");
  const date = dateLineIdx >= 0
    ? (all[dateLineIdx].match(DATE_RE) || [])[1]
    : (head.match(DATE_RE) || [])[1] || null;
  const { status, statusProblem, severity } = resolveEntryStatus(all, body, head);
  const P = FAM.prefix;
  const { plain, scoped } = FAM.supersession ? supersessionMentions(all[0] || "", head.split("\n").slice(1).join("\n")) : { plain: [], scoped: [] };
  const supersedes = plain.length ? plain.join(", ") : null;
  const supersededBy = FAM.supersession ? (head.match(new RegExp(`\\bsuperseded[-\\s]by:?\\s*(${P}-\\d{3,4})`, "i")) || [])[1] || null : null;
  const revertedBy = FAM.supersession ? (head.match(new RegExp(`\\breverted[-\\s]by:?\\s*(${P}-\\d{3,4})`, "i")) || [])[1] || null : null;
  const structural = FM_KEYS.has("structural") && /\[STRUCTURAL\]/i.test(head);
  return { date, status, statusProblem, supersedes, scopedSupersedes: scoped, supersededBy, revertedBy, structural, severity };
}

function parseArchiveIndexLine(line, rel, rows, rulings, problems) {
  const { FAM, idOf } = FAM_STATE;
  const m = line.match(new RegExp(`^\\|\\s*${FAM.prefix}-(\\d{3,4})\\s*\\|\\s*([^|]*?)\\s*\\|\\s*([^|]*?)\\s*\\|\\s*(.*?)\\s*\\|\\s*$`));
  if (m) {
    rows.set(Number(m[1]), { date: (m[2].match(DATE_RE) || [])[1] || null, where: m[3], what: m[4], rel });
    return;
  }
  const r = line.match(new RegExp(`^\\|\\s*supersession\\s*\\|\\s*${FAM.prefix}-(\\d{3,4})\\s*(?:→|->)\\s*${FAM.prefix}-(\\d{3,4})\\s*\\|\\s*([^|]*?)\\s*\\|\\s*(.*?)\\s*\\|\\s*$`, "i"));
  if (!r) return;
  const key = `${idOf(Number(r[1]))}>${idOf(Number(r[2]))}`;
  const verdict = r[3].toLowerCase();
  if (!SUPERSESSION_VERDICTS.has(verdict)) problems.push(`${rel}: supersession ruling ${key.replace(">", " → ")} has verdict \`${r[3]}\` — use one of ${[...SUPERSESSION_VERDICTS].join(", ")}.`);
  else if (!r[4]) problems.push(`${rel}: supersession ruling ${key.replace(">", " → ")} carries no reason — the ruling is the only record of why.`);
  else if (rulings.has(key)) problems.push(`${rel}: supersession ruling ${key.replace(">", " → ")} is recorded twice.`);
  else rulings.set(key, { verdict, why: r[4], rel, used: false });
}

export function readArchiveIndex(coord, top, problems) {
  const rows = new Map();
  const rulings = new Map();
  const probed = [...FAM_STATE.FAM.archiveDirs].reverse().map((d) => join(coord, ...d.split("/"), "INDEX.md"));
  let files = 0;
  for (const p of probed) {
    if (!existsSync(p)) continue;
    const rel = relPosix(top, p);
    const blob = gitBlob(top, `HEAD:${rel}`);
    if (blob === null) {
      problems.push(`${rel}: untracked in HEAD — the archive index informs gap stubs, so it must be verifiable like every other source. Commit it or move it aside.`);
      continue;
    }
    files++;
    let fence = null;
    for (const line of blob.split("\n")) {
      const f = line.match(/^\s*(```+|~~~+)/);
      if (f) { fence = !fence ? f[1][0] : (f[1][0] === fence ? null : fence); continue; }
      if (!fence) parseArchiveIndexLine(line, rel, rows, rulings, problems);
    }
  }
  return { rows, rulings, files, probed: probed.map((p) => relPosix(top, p)) };
}

export function applySupersessionRulings(metaOf, byId, rulings, problems) {
  const { idOf } = FAM_STATE;
  for (const [n, meta] of metaOf) {
    const successor = idOf(n);
    const edges = [];
    const rule = (target) => {
      const r = rulings.get(`${successor}>${target}`);
      if (r) r.used = true;
      return r;
    };
    for (const target of supersedesList(meta)) {
      const r = rule(target);
      if (!r || r.verdict === "full") edges.push(target);
    }
    for (const { id: target, qualifier } of meta.scopedSupersedes || []) {
      const r = rule(target);
      if (!r) problems.push(`${successor} (${byId.get(n).source}): its heading scopes the supersession of ${target} ("${qualifier}") — whether that retires the whole entry is a ruling. Add \`| supersession | ${successor} → ${target} | full, partial or none | why |\` to the archive index, then re-run.`);
      else if (r.verdict === "full") edges.push(target);
    }
    meta.supersedes = edges.length ? [...new Set(edges)].join(", ") : null;
  }
  for (const [key, r] of rulings) {
    if (!r.used) problems.push(`${r.rel}: supersession ruling ${key.replace(">", " → ")} matches no supersession in the source — a stale ruling would silently govern a future one.`);
  }
}
