// `migrate` subcommand orchestration, loss audit, and read-back verification for decisions-dir.mjs.
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { FAM_STATE, setFamily, die, configOps, gitOps } from "./ledger-core.mjs";
import { parseEntry, supersedesList } from "./ledger-entries.mjs";
import { extractEntries, readMeta, readArchiveIndex, applySupersessionRulings } from "./ledger-migrate-parse.mjs";

const { loadFamily } = configOps;
const { B, gitBlob, repoTop, relPosix, migrationDate } = gitOps;

function collectMigrateSources(coord, top, fam) {
  const { FAM } = FAM_STATE;
  const candidates = [fam.index, ...FAM.flatNames.map((f) => join(coord, ...f.split("/")))];
  for (const d of FAM.archiveDirs.map((a) => join(coord, ...a.split("/")))) {
    if (existsSync(d)) for (const f of readdirSync(d).sort()) if (f.endsWith(".md")) candidates.push(join(d, f));
  }
  const seenPath = new Set();
  const sources = [];
  for (const p of candidates) {
    const rel = relPosix(top, p);
    if (seenPath.has(rel) || !existsSync(p)) continue;
    seenPath.add(rel);
    sources.push({ rel, blob: gitBlob(top, `HEAD:${rel}`) });
  }
  if (!sources.length) die(`decisions-dir migrate: found no ${FAM.label.toUpperCase()} source under ${coord}`);
  return sources;
}

function auditSourceCoverage(rel, entries, lines, problems, notMigrated) {
  const covered = new Uint8Array(lines.length);
  for (const e of entries) {
    for (let i = e.start; i < e.end; i++) {
      if (covered[i]) problems.push(`${rel}:${i + 1}: line claimed by two entries — extraction is wrong, not the source`);
      covered[i] = 1;
    }
  }
  let run = null;
  for (let i = 0; i <= lines.length; i++) {
    const isGap = i < lines.length && !covered[i] && lines[i].trim() !== "" && !/^-{3,}$/.test(lines[i].trim());
    if (isGap && run === null) run = i;
    else if (!isGap && run !== null) {
      notMigrated.push({ rel, from: run + 1, to: i, sample: lines[run].slice(0, 78) });
      run = null;
    }
  }
}

function registerExtractedEntries(rel, blob, entries, byId, problems) {
  const { idOf } = FAM_STATE;
  for (const e of entries) {
    if (blob.split(e.body).length !== 2) {
      problems.push(`${idOf(e.n)} (${rel}): its text appears ${blob.split(e.body).length - 1}x in the source — cannot attribute it unambiguously`);
    }
    const prev = byId.get(e.n);
    if (!prev) byId.set(e.n, e);
    else if (B(e.body) > B(prev.body)) { e.dupOf = `${prev.source} (${B(prev.body)}B)`; byId.set(e.n, e); }
    else prev.dupOf = `${e.source} (${B(e.body)}B)`;
  }
}

function scanMigrateSources(sources) {
  const { idOf } = FAM_STATE;
  const byId = new Map();
  const problems = [], notMigrated = [], malformed = [];
  for (const s of sources) {
    if (s.blob === null) {
      problems.push(`${s.rel}: untracked in HEAD — §3.6.5 byte-verifies against the HEAD blob, so this file cannot be verified. Commit it or move it aside.`);
      continue;
    }
    const { entries, lines, malformedRows } = extractEntries(s.blob, s.rel);
    for (const r of malformedRows) {
      malformed.push(r);
      problems.push(`${idOf(r.n)} (${r.source}:${r.line + 1}): decision row cannot be split — ${r.why}. Not extracted, and not guessed at ("${r.sample}"). Fix the source row and re-run.`);
    }
    auditSourceCoverage(s.rel, entries, lines, problems, notMigrated);
    registerExtractedEntries(s.rel, s.blob, entries, byId, problems);
  }
  return { byId, problems, notMigrated, malformed };
}

function deriveBackPointers(metaOf, byId) {
  const { idOf } = FAM_STATE;
  const derived = new Map();
  for (const [n, meta] of metaOf) {
    if (meta.status !== "superseded" || !meta.supersededBy) continue;
    const t = Number((meta.supersededBy.match(/\d+/) || [])[0]);
    if (!byId.has(t)) continue;
    const list = derived.get(t) || new Set();
    list.add(idOf(n));
    derived.set(t, list);
  }
  return derived;
}

function deriveForwardStatusFlips(metaOf, byId, problems) {
  const { idOf } = FAM_STATE;
  const supersededByDerived = new Map();
  for (const [n, meta] of metaOf) {
    for (const s of supersedesList(meta)) {
      const t = Number((s.match(/\d+/) || [])[0]);
      if (t === n) { problems.push(`${idOf(n)} (${byId.get(n).source}): \`supersedes: ${s}\` names itself. Fix the source line, then re-run.`); continue; }
      const tm = metaOf.get(t) || null;
      if (tm && tm.status === "accepted") supersededByDerived.set(t, supersededByDerived.has(t) ? null : idOf(n));
    }
  }
  for (const [t, by] of supersededByDerived) {
    if (by === null) problems.push(`${idOf(t)}: named by more than one \`supersedes:\` while it still stands accepted — \`superseded-by\` takes one id. Set it by hand in the source, then re-run.`);
  }
  return supersededByDerived;
}

function deriveSupersessionMaps(byId, coord, top, problems) {
  const metaOf = new Map();
  for (const [n, e] of byId) {
    metaOf.set(n, e.kind === "row"
      ? { date: e.rowDate, status: "accepted", supersedes: null, supersededBy: null, revertedBy: null, structural: e.structural }
      : readMeta(e.body));
  }
  const idx = readArchiveIndex(coord, top, problems);
  applySupersessionRulings(metaOf, byId, idx.rulings, problems);
  return {
    metaOf,
    idx,
    derived: deriveBackPointers(metaOf, byId),
    supersededByDerived: deriveForwardStatusFlips(metaOf, byId, problems),
  };
}

function planGap(n, row, top, planned, problems) {
  const { idOf } = FAM_STATE;
  if (row && row.where === "reserved") {
    problems.push(`${idOf(n)}: ${row.rel} records this id as RESERVED — "${row.what.slice(0, 100)}". An open reservation may still mint, and an immutable stub would foreclose it. Resolve the claim that holds it (close or release its PR), then re-run.`);
    return;
  }
  if (row && row.where !== "never-minted") {
    problems.push(`${idOf(n)}: ${row.rel} says this id lives in \`${row.where}\`, but no scanned source contains it — a recorded entry is MISSING, not a gap. Recover it before migrating.`);
    return;
  }
  const body = row
    ? `Never minted. The v2 archive index (${row.rel}) recorded why:\n\n> ${row.what}\n\nCarried verbatim at migration. Check \`git log -S ${idOf(n)}\` before reusing this id.\n`
    : `No entry for this id exists in the v2 record (live log, archive snapshots, or the archive index).\nThe reason was never written down. Check \`git log -S ${idOf(n)}\` before reusing this id.\n`;
  planned.push({
    n, stub: true, carried: !!row,
    text: `---\nid: ${idOf(n)}\ndate: ${row && row.date ? row.date : migrationDate(top)}\nstatus: never-minted\ntitle: ${row ? "never minted — reason carried from the v2 archive index" : "gap carried over from the v2 log"}\n---\n` + body,
  });
}

function buildSinglePlannedEntry(n, e, ctx, planned, problems) {
  const { FAM, FM_KEYS, idOf } = FAM_STATE;
  const { metaOf, derived, supersededByDerived } = ctx;
  const meta = metaOf.get(n);
  if (!meta.date) {
    problems.push(`${idOf(n)} (${e.source}): no YYYY-MM-DD date in its first lines — frontmatter \`date\` cannot be derived. Add a date to the source entry, or migrate this one by hand.`);
    return;
  }
  if (meta.statusProblem) {
    problems.push(`${idOf(n)} (${e.source}): ${meta.statusProblem}`);
    return;
  }
  const sup = new Set(supersedesList(meta));
  for (const s of derived.get(n) || []) sup.add(s);
  const supersededBy = meta.status === "superseded" ? meta.supersededBy : (supersededByDerived.get(n) || null);
  const status = meta.status === "accepted" && supersededBy ? "superseded" : meta.status;
  let fm = `---\nid: ${idOf(n)}\ndate: ${meta.date}\nstatus: ${status}\ntitle: ${e.title || "(untitled)"}\n`;
  if (sup.size) fm += `supersedes: ${[...sup].sort().join(", ")}\n`;
  if (status === "superseded" && supersededBy) fm += `superseded-by: ${supersededBy}\n`;
  if (meta.status === "reverted" && meta.revertedBy) fm += `reverted-by: ${meta.revertedBy}\n`;
  if (meta.structural && FM_KEYS.has("structural")) fm += `structural: true\n`;
  if (FAM.severity) fm += `severity: ${meta.severity || "unstated"}\n`;
  fm += "---\n";
  planned.push({ n, entry: e, body: e.body, text: fm + e.body + (e.body.endsWith("\n") ? "" : "\n") });
}

function buildPlannedEntries(max, byId, top, ctx, problems) {
  const planned = [];
  const indexRows = ctx.idx.rows;
  for (let n = 1; n <= max; n++) {
    const e = byId.get(n);
    if (!e) planGap(n, indexRows.get(n), top, planned, problems);
    else buildSinglePlannedEntry(n, e, ctx, planned, problems);
  }
  for (const n of [...indexRows.keys()].sort((a, b) => a - b)) {
    if (n > max && !byId.has(n)) planGap(n, indexRows.get(n), top, planned, problems);
  }
  planned.sort((a, b) => a.n - b.n);
  return planned;
}

function printMigrationReport(planned, malformed, idx, notMigrated) {
  const { FAM, idOf } = FAM_STATE;
  for (const p of planned) {
    if (p.stub) { console.log(`${idOf(p.n)} GAP->stub ${p.carried ? "(reason carried from the archive index)" : "(no entry in any source)"}`); continue; }
    const dup = p.entry.dupOf ? ` [also in ${p.entry.dupOf} — longest body kept]` : "";
    const kindTag = p.entry.kind === "row" ? " [table-row]" : "";
    console.log(`${idOf(p.n)} OK (bytes=${B(p.body)}) ${p.entry.source}${kindTag}${dup}`);
  }
  console.log("");
  if (malformed.length) {
    console.log(`UNSPLITTABLE ${FAM.label.toUpperCase().replace(/S$/, "")} ROWS — each carries a ${FAM.prefix}-NNN id cell but cannot be split`);
    console.log("positionally; not extracted, and migration refuses until each is fixed by hand:");
    for (const r of malformed) console.log(`  ${idOf(r.n)}  ${r.source}:${r.line + 1}  ${r.why}\n      "${r.sample}"`);
    console.log("");
  }
  const bare = planned.filter((p) => !p.stub && p.entry.bare);
  if (bare.length) {
    console.log("SEPARATOR-LESS HEADINGS — captured by the loosest tolerance; confirm each is a real");
    console.log("entry, not a narrative heading that names an id:");
    for (const p of bare) console.log(`  ${idOf(p.n)}  ${p.entry.source}:${p.entry.line + 1}  "${p.entry.title.slice(0, 60)}"`);
    console.log("");
  }
  if (idx.files === 0 && planned.some((p) => p.stub && !p.carried)) {
    console.log(`NOTE: no archive index found (probed ${idx.probed.join(", ")}) — gap stubs could not`);
    console.log("consult recorded reasons. If this repo keeps its index elsewhere, move it into place");
    console.log("and re-run before --write.\n");
  }
  if (notMigrated.length) {
    console.log("NOT MIGRATED — source lines that belong to no entry (preamble, format rules, archive");
    console.log("pointer blocks). They stay in the source file; migrate emits entry files only.");
    for (const g of notMigrated) console.log(`  ${g.rel}:${g.from}-${g.to}  ${g.sample}`);
    console.log("");
  }
}

function writeAndVerifyMigration(coord, top, fam, planned) {
  const { idOf } = FAM_STATE;
  mkdirSync(fam.dir, { recursive: true });
  const collisions = planned.map((p) => join(fam.dir, `${idOf(p.n)}.md`)).filter((dest) => existsSync(dest));
  if (collisions.length) {
    console.log(`VERDICT: ${collisions.length} DESTINATION(S) ALREADY EXIST — nothing written.`);
    for (const c of collisions) console.log(`  - ${relPosix(top, c)} — refusing to overwrite a minted entry`);
    console.log("A minted entry is immutable. If this is a re-run, the previous run already emitted these;");
    console.log("if it is a genuine conflict, resolve it by hand — this tool will not adjudicate it.");
    process.exit(1);
  }
  const written = [], readbackFailures = [];
  for (const p of planned) {
    const dest = join(fam.dir, `${idOf(p.n)}.md`);
    writeFileSync(dest, p.text, "utf8");
    written.push(dest);
  }
  for (const p of planned) {
    if (p.stub) continue;
    const dest = join(fam.dir, `${idOf(p.n)}.md`);
    const back = parseEntry(readFileSync(dest, "utf8"));
    if (back.error) { readbackFailures.push(`${idOf(p.n)}: written file does not parse (${back.error})`); continue; }
    const want = p.body.endsWith("\n") ? p.body : p.body + "\n";
    if (back.body !== want) readbackFailures.push(`${idOf(p.n)}: body read back from disk is not byte-identical to the source slice`);
  }
  if (readbackFailures.length) {
    let removed = 0;
    for (const dest of written) { try { unlinkSync(dest); removed++; } catch { /* already gone */ } }
    console.log(`VERDICT: ${readbackFailures.length} WRITE VERIFICATION FAILURE(S) — ${removed} file(s) rolled back; the tree is as it was.`);
    for (const f of readbackFailures) console.log(`  - ${f}`);
    process.exit(1);
  }
  console.log(`VERDICT: ${planned.length} entries written to ${relPosix(top, fam.dir)} and verified byte-identical on read-back.`);
  console.log(`Next: \`decisions-dir.mjs index ${coord}\`, then \`check\` (both in the migration commit).`);
  process.exit(0);
}

export function cmdMigrate(coord, write, famKey) {
  setFamily(famKey);
  const fam = loadFamily(coord, famKey);
  if (fam.error) die(`decisions-dir migrate: ${fam.error}`);
  const top = repoTop(coord);
  if (!top) die("decisions-dir migrate: not a git repository — §3.6.5 verifies against the HEAD blob, which requires git.");
  const sources = collectMigrateSources(coord, top, fam);

  console.log(`decisions-dir migrate @ ${coord}   (${write ? "WRITE" : "DRY-RUN — pass --write to emit"})\n`);

  const { byId, problems, notMigrated, malformed } = scanMigrateSources(sources);
  const ids = [...byId.keys()].sort((a, b) => a - b);
  if (!ids.length) die(`decisions-dir migrate: no \`## ${FAM_STATE.FAM.prefix}-NNN\` entries found in any source.`);
  const max = ids[ids.length - 1];

  const supCtx = deriveSupersessionMaps(byId, coord, top, problems);
  const planned = buildPlannedEntries(max, byId, top, supCtx, problems);
  printMigrationReport(planned, malformed, supCtx.idx, notMigrated);

  if (problems.length) {
    console.log(`VERDICT: ${problems.length} PROBLEM(S) — nothing written (migration is all-or-nothing, §3.6.5)`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exit(1);
  }
  if (!write) {
    console.log(`VERDICT: ${planned.length} entries verify (${planned.filter((p) => p.stub).length} contiguity stubs). Re-run with --write to emit.`);
    console.log(`Next: \`decisions-dir.mjs index ${coord}\`, then \`check\`. The source file is left untouched —`);
    console.log("replacing it with the generated index is the pilot lane's commit, not this tool's.");
    process.exit(0);
  }
  writeAndVerifyMigration(coord, top, fam, planned);
}
