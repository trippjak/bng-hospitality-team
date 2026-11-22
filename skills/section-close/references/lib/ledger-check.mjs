// `index` and `check` subcommands and five-invariant family verifier for decisions-dir.mjs.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, relative } from "node:path";
import { FAM_STATE, setFamily, die, configOps, gitOps } from "./ledger-core.mjs";
import { parseEntry, loadEntries, supersedesList, statusToken, renderIndex } from "./ledger-entries.mjs";

const { loadFamily, directoryFamilies, requireDirectoryMode } = configOps;
const { LF, B, gitText, gitBlob, addingCommitsByPath, repoTop, relPosix } = gitOps;

let prCache = null;
function openPrs(cwd) {
  if (prCache) return prCache;
  try {
    const out = execFileSync("gh", ["pr", "list", "--state", "open", "--limit", "200", "--json", "number,title"],
      { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString();
    const parsed = JSON.parse(out);
    prCache = { ok: Array.isArray(parsed), prs: Array.isArray(parsed) ? parsed : [] };
  } catch {
    prCache = { ok: false, prs: [] };
  }
  return prCache;
}

function reservedIds(cwd, prefix) {
  const { ok, prs } = openPrs(cwd);
  const byN = new Map();
  if (!ok) return { ok, byN };
  const lead = new RegExp(`^\\s*${prefix}-(\\d{3,4})\\b`);
  const any = new RegExp(`\\b${prefix}-(\\d{3,4})\\b`, "g");
  for (const pr of prs) {
    const title = String(pr.title || "");
    const claim = (n) => { if (!byN.has(n)) byN.set(n, pr.number); };
    const m = title.match(lead);
    if (m) claim(Number(m[1]));
    const at = title.search(/\breserves\b/i);
    if (at !== -1) for (const x of title.slice(at).matchAll(any)) claim(Number(x[1]));
  }
  return { ok, byN };
}

function baselineMaxId(top, dirAbs, prefix) {
  if (!top) return 0;
  for (const ref of ["origin/main", "main", "origin/master", "master"]) {
    try {
      const base = gitText(["merge-base", "HEAD", ref], top).trim();
      const head = gitText(["rev-parse", "HEAD"], top).trim();
      if (!base || base === head) continue;
      const listing = gitText(["ls-tree", "--name-only", `${base}:${relPosix(top, dirAbs)}`], top);
      const re = new RegExp(`^${prefix}-(\\d{3,4})\\.md$`);
      const ns = listing.split("\n").map((s) => re.exec(s.trim())).filter(Boolean).map((m) => Number(m[1]));
      return ns.length ? Math.max(...ns) : 0;
    } catch { /* ref missing, or the dir did not exist at base — try the next */ }
  }
  return 0;
}

function checkContiguity(entries, coord, fam, top) {
  const { FAM, idOf } = FAM_STATE;
  const v = [];
  const byN = new Map();
  for (const e of entries) {
    if (!e.filenameOk) { v.push(`${e.name}: filename is not \`${FAM.prefix}-NNN.md\` (3–4 digits)`); continue; }
    if (byN.has(e.n)) v.push(`${idOf(e.n)}: two files claim this id (${byN.get(e.n).name}, ${e.name})`);
    else byN.set(e.n, e);
  }
  const ns = [...byN.keys()].sort((a, b) => a - b);
  const max = Math.max(ns.length ? ns[ns.length - 1] : 0, baselineMaxId(top, fam.dir, fam.key));
  let stubs = 0, res = null;
  const reserved = [];
  for (let n = 1; n <= max; n++) {
    const e = byN.get(n);
    if (!e) {
      if (res === null) res = reservedIds(top || coord, FAM.prefix);
      const pr = res.byN.get(n);
      if (pr !== undefined) { reserved.push(`${idOf(n)} on #${pr}`); continue; }
      v.push(`${idOf(n)}: no file — a gap needs a \`status: never-minted\` stub saying why, or the id was deleted` +
        (res.ok ? "" : " (no open PR named it, but the lookup did not run: `gh` unavailable)"));
      continue;
    }
    if (e.fm && e.fm.status === "never-minted") stubs++;
  }
  const note = max === 0 ? "no entries" :
    `${ns.length} ids, ${idOf(1)}..${idOf(max)}, ${stubs} never-minted` +
    (reserved.length ? `, reserved on an open PR: ${reserved.join(", ")}` : "");
  return { name: "contiguity", violations: v, note, skipped: false };
}

function validateStatusField(e, fm, v) {
  const { FAM, STATUSES } = FAM_STATE;
  if (!fm.status) return;
  const token = statusToken(fm.status);
  if (!STATUSES.has(token)) {
    v.push(`${e.name}: status \`${fm.status}\` is outside the closed set {${[...STATUSES].join(", ")}}${FAM.statusNote ? " (a trailing ` — note` after the token is allowed)" : ""}`);
  } else if (FAM.statusNote && token === "never-minted" && fm.status !== "never-minted") {
    v.push(`${e.name}: \`never-minted\` carries no status note — the reason lives in the stub's body`);
  }
}

function validateSingleFrontmatter(e, v) {
  const { FAM, FM_KEYS, ID_RE, idOf } = FAM_STATE;
  if (e.error) { v.push(`${e.name}: ${e.error}`); return; }
  const fm = e.fm;
  for (const k of Object.keys(fm)) {
    if (!FM_KEYS.has(k)) v.push(`${e.name}: unknown frontmatter key \`${k}\` — the key set is closed (PDR-001 §3.1)`);
  }
  for (const k of ["id", "date", "status", "title"]) {
    if (!fm[k]) v.push(`${e.name}: missing required frontmatter key \`${k}\``);
  }
  if (fm.id && !ID_RE.test(fm.id)) v.push(`${e.name}: id \`${fm.id}\` is not \`${FAM.prefix}-NNN\``);
  if (fm.id && e.filenameOk && fm.id !== idOf(e.n)) v.push(`${e.name}: frontmatter id \`${fm.id}\` disagrees with the filename`);
  if (fm.date && !/^\d{4}-\d{2}-\d{2}$/.test(fm.date)) v.push(`${e.name}: date \`${fm.date}\` is not YYYY-MM-DD`);
  validateStatusField(e, fm, v);
  if (fm.structural && !/^(true|false)$/.test(fm.structural)) v.push(`${e.name}: structural must be true|false`);
  if (FAM.severity && fm.status !== "never-minted" && !fm.severity) {
    v.push(`${e.name}: missing required frontmatter key \`severity\` — the triage column; write \`unstated\` rather than omit it`);
  }
  if (fm.status !== "never-minted" && !(e.body || "").trim()) v.push(`${e.name}: body is empty`);
}

function checkFrontmatterValid(entries) {
  const v = [];
  for (const e of entries) validateSingleFrontmatter(e, v);
  return { name: "frontmatter-valid", violations: v, note: `${entries.length} files`, skipped: false };
}

function immutableDiff(original, current) {
  const a = parseEntry(original), b = parseEntry(current);
  if (a.error || b.error) return original === current ? null : "file content";
  if (a.body !== b.body) return "body";
  const keys = new Set([...Object.keys(a.fm), ...Object.keys(b.fm)]);
  const changed = [];
  for (const k of keys) {
    if (FAM_STATE.MUTABLE_KEYS.has(k)) continue;
    if (a.fm[k] !== b.fm[k]) changed.push(`\`${k}\``);
  }
  return changed.length ? `frontmatter ${changed.join(", ")}` : null;
}

function compareEntrySnapshots(e, top, rel, adds, v) {
  const addSha = adds[adds.length - 1] || "";
  if (!addSha) return false;
  const original = gitBlob(top, `${addSha}:${rel}`);
  if (original === null) return false;
  const head = gitBlob(top, `HEAD:${rel}`);
  const work = LF(readFileSync(e.abs, "utf8"));
  let reported = null;
  for (const [label, current] of [["HEAD", head], ["worktree", work]]) {
    if (current === null || current === original) continue;
    const diff = immutableDiff(original, current);
    if (!diff || (reported === diff && label === "worktree" && head !== null && work === head)) continue;
    reported = diff;
    v.push(`${e.name}: ${diff} changed since it was minted in ${addSha.slice(0, 7)} (${label})` +
      `${adds.length > 1 ? ` [path added ${adds.length}x — deleted and re-added]` : ""}` +
      ` — a minted entry is immutable outside {${[...FAM_STATE.MUTABLE_KEYS].join(", ")}}. ` +
      `Original text: \`git show ${addSha.slice(0, 7)}:${rel}\``);
  }
  return true;
}

function checkImmutability(entries, fam, top) {
  if (!top) return { name: "immutability", violations: [], note: "not a git repository — nothing to compare against", skipped: true };
  const v = [];
  let compared = 0, skipped = 0;
  const addsByPath = addingCommitsByPath(top, fam.dir);
  for (const e of entries) {
    if (e.error || !e.filenameOk) { skipped++; continue; }
    const rel = relPosix(top, e.abs);
    if (compareEntrySnapshots(e, top, rel, addsByPath.get(rel) || [], v)) compared++;
    else skipped++;
  }
  const note = `${compared} committed entries vs their adding commit${skipped ? `, ${skipped} skipped (uncommitted or unparseable)` : ""}`;
  return { name: "immutability", violations: v, note, skipped: false };
}

function validateEntrySupersession(e, byId, have, v) {
  const fm = e.fm;
  for (const [statusVal, key] of [["superseded", "superseded-by"], ["reverted", "reverted-by"]]) {
    if (fm.status === statusVal) {
      if (!fm[key]) v.push(`${e.name}: status \`${statusVal}\` requires \`${key}\``);
      else if (!have.has(fm[key])) v.push(`${e.name}: \`${key}: ${fm[key]}\` names an entry that does not exist`);
    } else if (fm[key]) {
      v.push(`${e.name}: has \`${key}\` but status is \`${fm.status}\`, not \`${statusVal}\``);
    }
  }
  for (const s of supersedesList(fm)) {
    if (!have.has(s)) { v.push(`${e.name}: \`supersedes: ${s}\` names an entry that does not exist`); continue; }
    const target = byId.get(s);
    if (target.fm && target.fm.status !== "superseded") {
      v.push(`${e.name}: \`supersedes: ${s}\` but ${s} is \`${target.fm.status}\`, not \`superseded\` — supersession must resolve from both ends`);
    }
  }
  if (fm.status === "superseded" && fm["superseded-by"] && have.has(fm["superseded-by"])) {
    const target = byId.get(fm["superseded-by"]);
    if (target && target.fm && !supersedesList(target.fm).includes(fm.id)) {
      v.push(`${e.name}: ${fm["superseded-by"]} does not carry \`supersedes: ${fm.id}\` — supersession must resolve from both ends`);
    }
  }
}

function checkSupersessionRefs(entries) {
  const { idOf } = FAM_STATE;
  const v = [];
  const byId = new Map(entries.filter((e) => e.filenameOk).map((e) => [idOf(e.n), e]));
  const have = new Set(byId.keys());
  let sup = 0, rev = 0;
  for (const e of entries) {
    if (e.error || !e.fm) continue;
    if (e.fm.status === "superseded") sup++;
    if (e.fm.status === "reverted") rev++;
    validateEntrySupersession(e, byId, have, v);
  }
  return { name: "supersession-refs", violations: v, note: `${sup} superseded, ${rev} reverted`, skipped: false };
}

function describeDrift(want, got) {
  const w = want.split("\n"), g = got.split("\n");
  for (let i = 0; i < Math.max(w.length, g.length); i++) {
    if (w[i] !== g[i]) {
      return `drifted from its projection at line ${i + 1} (expected \`${(w[i] ?? "<eof>").slice(0, 60)}\`, found \`${(g[i] ?? "<eof>").slice(0, 60)}\`)`;
    }
  }
  return "drifted from its projection";
}

function checkIndexFresh(entries, coord, fam) {
  if (entries.some((e) => e.error || !e.filenameOk)) {
    return { name: "index-fresh", violations: [], note: "entries do not parse, so the projection is undefined", skipped: true };
  }
  const v = [], ok = [];
  const want = renderIndex(entries, fam);
  const pages = [{ path: fam.index, text: want.main, label: "" }];
  if (want.archive !== null) pages.push({ path: fam.archiveIndex, text: want.archive, label: " (settled)" });
  for (const p of pages) {
    const rel = relPosix(coord, p.path);
    if (!existsSync(p.path)) {
      v.push(`${rel}: the generated index${p.label} does not exist — run \`decisions-dir.mjs index\``);
      continue;
    }
    const got = LF(readFileSync(p.path, "utf8"));
    if (p.text !== got) v.push(`${rel}: ${describeDrift(p.text, got)} — regenerate it in the same commit as the mint`);
    else ok.push(`${rel} matches regeneration (${B(p.text)}B)`);
  }
  return { name: "index-fresh", violations: v, note: v.length ? "" : ok.join(" · "), skipped: false };
}

function collectFamilyDates(coord) {
  const dates = [];
  for (const k of ["D", "B", "I"]) {
    const f = loadFamily(coord, k);
    if (!f || f.error || !existsSync(f.dir)) continue;
    for (const e of loadEntries(f.dir).entries || []) {
      if (e.fm && e.fm.status !== "never-minted" && /^\d{4}-\d{2}-\d{2}$/.test(e.fm.date)) dates.push(e.fm.date);
    }
  }
  return dates;
}

function repoRefDate(coord) {
  const envDate = process.env.DOCLINT_TODAY;
  if (envDate && /^\d{4}-\d{2}-\d{2}$/.test(envDate)) return envDate;
  const dates = collectFamilyDates(coord);
  const handoffPath = join(coord, "HANDOFF.md");
  if (existsSync(handoffPath)) {
    for (const m of readFileSync(handoffPath, "utf8").matchAll(/\b(20\d\d-\d\d-\d\d)\b/g)) dates.push(m[1]);
  }
  dates.sort();
  return dates.length ? dates[dates.length - 1] : null;
}

function checkProposalExpiry(entries, coord) {
  const ref = repoRefDate(coord);
  const v = [];
  const dayMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
  let proposed = 0;
  for (const e of entries) {
    if (e.error || !e.fm || statusToken(e.fm.status) !== "proposed") continue;
    proposed++;
    if (!ref || !/^\d{4}-\d{2}-\d{2}$/.test(e.fm.date)) continue;
    const ageDays = Math.round((dayMs(ref) - dayMs(e.fm.date)) / 86400000);
    if (ageDays > 14) {
      v.push(`${e.name}: \`status: proposed\` date \`${e.fm.date}\` is ${ageDays}d old vs repo ref \`${ref}\` (> 14d D-155 TTL) — adopt, re-affirm by bumping \`date\`, or expire as \`declined — expired, un-championed (D-155)\``);
    }
  }
  const note = ref ? `${proposed} proposed, ref ${ref} (14d TTL)` : "no reference date";
  return { name: "proposal-expiry", violations: v, note, skipped: false };
}

export function checkFamily(coord, fam) {
  const loaded = loadEntries(fam.dir);
  if (loaded.error) die(`decisions-dir check: ${loaded.error}`);
  const entries = loaded.entries;
  const top = repoTop(coord);
  const rows = [
    checkContiguity(entries, coord, fam, top),
    checkFrontmatterValid(entries),
    checkImmutability(entries, fam, top),
    checkSupersessionRefs(entries),
    checkIndexFresh(entries, coord, fam),
  ];
  if (fam.key === "I" || FAM_STATE.FAM.prefix === "I") rows.push(checkProposalExpiry(entries, coord));
  return rows;
}

export function cmdIndex(coord, only) {
  const fams = directoryFamilies(coord, only);
  if (!fams.length) requireDirectoryMode(coord, loadFamily(coord, only || "D"), "index");
  const planned = [];
  for (const fam of fams) {
    setFamily(fam.key);
    const loaded = loadEntries(fam.dir);
    if (loaded.error) die(`decisions-dir index: ${loaded.error}`);
    const bad = loaded.entries.filter((e) => e.error || !e.filenameOk);
    if (bad.length) {
      console.error(`decisions-dir index: cannot project ${fam.key} — fix these first (\`check\` explains); nothing written:`);
      for (const e of bad) console.error(`  - ${e.name}: ${e.error || `filename is not ${fam.key}-NNN.md`}`);
      process.exit(1);
    }
    planned.push({ fam, count: loaded.entries.length, proj: renderIndex(loaded.entries, fam) });
  }
  for (const p of planned) {
    mkdirSync(dirname(p.fam.index), { recursive: true });
    writeFileSync(p.fam.index, p.proj.main, "utf8");
    const tag = planned.length > 1 ? `${p.fam.key} ` : "";
    console.log(`${tag}index: ${p.count} entries, ${B(p.proj.main)} bytes`);
    if (p.proj.archive !== null) {
      mkdirSync(dirname(p.fam.archiveIndex), { recursive: true });
      writeFileSync(p.fam.archiveIndex, p.proj.archive, "utf8");
      console.log(`${tag}index (settled): ${relPosix(coord, p.fam.archiveIndex)}, ${B(p.proj.archive)} bytes`);
    }
  }
  process.exit(0);
}

function printCheckRow(r, famKey, multi, skips) {
  const verdict = r.violations.length ? `FAIL (${r.violations.length})` : r.skipped ? "SKIP" : "OK";
  console.log(`  ${r.name.padEnd(18)} ${verdict.padEnd(9)} ${r.note || ""}`.trimEnd());
  for (const x of r.violations) console.log(`      - ${x}`);
  if (r.skipped) skips.push(multi ? `${famKey}:${r.name}` : r.name);
  return r.violations.length;
}

export function cmdCheck(coord, only) {
  const fams = directoryFamilies(coord, only);
  if (!fams.length) requireDirectoryMode(coord, loadFamily(coord, only || "D"), "check");
  console.log(`decisions-dir check @ ${coord}`);
  let total = 0;
  const skips = [];
  const multi = fams.length > 1;
  for (const fam of fams) {
    setFamily(fam.key);
    if (multi) console.log(`  [${fam.key} family — ${relative(coord, fam.dir).replace(/\\/g, "/")}/]`);
    for (const r of checkFamily(coord, fam)) total += printCheckRow(r, fam.key, multi, skips);
  }
  if (total === 0 && skips.length) console.log(`VERDICT: no violations, but ${skips.length} check(s) DID NOT RUN: ${skips.join(", ")} — this is not a clean bill.`);
  else if (total === 0) console.log("VERDICT: clean — every minted entry resolves, unedited, and the index is its projection.");
  else console.log(`VERDICT: ${total} VIOLATION(S)`);
  process.exit(total === 0 ? 0 : 1);
}
