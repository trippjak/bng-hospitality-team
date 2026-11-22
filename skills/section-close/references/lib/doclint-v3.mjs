// v3 informational reporters, growth ratchet (--write-ratchet), and per-file blob ceiling for doclint.mjs.
import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, relative } from "node:path";
import { metrics } from "./doclint-detectors.mjs";

// The hard per-file ceiling (PDR-011 §2.3): 51,200B is the measured point at which an external
// reviewer's read_file physically cannot read the file — a capability number, not a taste number.
const FILE_CEILING = 51200;
const lfBytes = (p) => metrics(p).bytes;

function reportV3Families(coord, isDir, famOf, flags) {
  for (const fid of ["D", "B", "I"]) {
    if (!isDir(fid)) continue;
    const fam = famOf(fid);
    const famDefault = fid === "D" ? "decisions/d" : fid === "I" ? "improvements/i" : null;
    if (!fam.dir && famDefault === null) {
      flags.push(`families.${fid} declares directory mode without a "dir" and no default exists for it — declare "dir" explicitly, or keep it "file".`);
      continue;
    }
    const dir = join(coord, fam.dir || famDefault);
    let n = 0, sum = 0;
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith(".md")) continue;
        n++;
        sum += Buffer.byteLength(readFileSync(join(dir, f), "utf8").replace(/\r\n/g, "\n"), "utf8");
      }
    }
    console.log(`${fid} family: directory mode — ${n} entries, ${sum}B in ${relative(coord, dir).replace(/\\/g, "/")}/ (UNCAPPED record; the cap above binds the projection)`);
  }
}

function reportDMintRate(coord, projectRoot, isDir, famOf) {
  if (!isDir("D")) return;
  const dirRel = relative(projectRoot, join(coord, famOf("D").dir || "decisions/d")).replace(/\\/g, "/");
  let minted = 0;
  try {
    const out = execFileSync("git", ["log", "--diff-filter=A", "--since=14.days", "--name-only", "--format=", "--", dirRel],
      { cwd: projectRoot, stdio: ["ignore", "pipe", "ignore"] }).toString();
    const seen = new Set();
    for (const raw of out.split("\n")) {
      const f = raw.trim();
      if (!/D-\d{3,4}\.md$/.test(f) || seen.has(f)) continue;
      seen.add(f);
      const abs = join(projectRoot, f);
      if (existsSync(abs) && /^status:\s*never-minted\s*$/m.test(readFileSync(abs, "utf8").replace(/\r\n/g, "\n"))) continue;
      minted++;
    }
  } catch { minted = null; }
  if (minted !== null) console.log(`D minted, trailing 14 days: ${minted}`);
}

function reportAlwaysLoadedRepo(projectRoot) {
  let repoAlways = 0;
  const alwaysParts = [];
  for (const f of ["CLAUDE.md", "INDEX.md"]) {
    const p = join(projectRoot, f);
    if (!existsSync(p)) continue;
    const b = Buffer.byteLength(readFileSync(p, "utf8").replace(/\r\n/g, "\n"), "utf8");
    repoAlways += b;
    alwaysParts.push(`${f} ${b}B`);
  }
  console.log(`always-loaded (repo): CLAUDE.md + INDEX.md = ${repoAlways}B${alwaysParts.length ? ` (${alwaysParts.join(" · ")})` : " (neither present)"} — informational; loaded on every session in this repo.`);
}

function seedRatchetBaseline(coord, ratchetPath, files, isDir, famOf) {
  const seed = {};
  for (const [, p] of files) if (existsSync(p)) seed[relative(coord, p).replace(/\\/g, "/")] = lfBytes(p);
  const impRel = isDir("I") ? (famOf("I").index || "improvements/IMPROVEMENTS.md") : "IMPROVEMENTS.md";
  const impPath = join(coord, impRel);
  if (existsSync(impPath)) seed[relative(coord, impPath).replace(/\\/g, "/")] = lfBytes(impPath);
  writeFileSync(ratchetPath, JSON.stringify(seed, null, 2) + "\n", "utf8");
  console.log(`ratchet: baseline CREATED over ${Object.keys(seed).length} measured file(s) (.doclint-ratchet.json) — commit it; edit the key set to taste.`);
}

function runGrowthRatchet(ctx) {
  const { coord, files, isDir, famOf, writeRatchet, flags } = ctx;
  const ratchetPath = join(coord, ".doclint-ratchet.json");
  if (!existsSync(ratchetPath)) {
    if (writeRatchet) seedRatchetBaseline(coord, ratchetPath, files, isDir, famOf);
    return;
  }
  let ratchet = null;
  try { ratchet = JSON.parse(readFileSync(ratchetPath, "utf8")); } catch { ratchet = null; }
  if (ratchet === null || typeof ratchet !== "object" || Array.isArray(ratchet)) {
    flags.push(".doclint-ratchet.json unreadable — ratchet skipped; fix or regenerate it (--write-ratchet).");
    return;
  }
  let grew = 0;
  const next = {};
  for (const [rel, prev] of Object.entries(ratchet)) {
    const p = join(coord, rel);
    if (!existsSync(p)) { flags.push(`ratchet tracks ${rel} but it does not exist — remove the key or restore the file.`); continue; }
    const cur = lfBytes(p);
    next[rel] = cur;
    if (Number.isFinite(prev) && cur > prev) {
      grew++;
      flags.push(`RATCHET: ${rel} grew ${prev}B -> ${cur}B — hold or shrink it, or re-baseline deliberately in this commit: doclint --write-ratchet (the raise is echoed, never silent).`);
    }
  }
  console.log(`ratchet: ${Object.keys(ratchet).length} file(s) tracked · ${grew} grew since baseline (.doclint-ratchet.json)`);
  if (writeRatchet) {
    writeFileSync(ratchetPath, JSON.stringify(next, null, 2) + "\n", "utf8");
    console.log(`ratchet: baseline REWRITTEN to current sizes (--write-ratchet) — commit it with the doc change it blesses.`);
  }
}

function readGitBlobSizes(coord, projectRoot) {
  const blobSizes = new Map();
  try {
    const gitTop = execFileSync("git", ["rev-parse", "--show-toplevel"], { cwd: projectRoot, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
    const coordRel = relative(gitTop, coord).replace(/\\/g, "/");
    const out = execFileSync("git", ["ls-tree", "-rl", "HEAD", "--", coordRel || "."], { cwd: gitTop, stdio: ["ignore", "pipe", "ignore"] }).toString();
    for (const line of out.split("\n")) {
      const m = line.match(/^\d+ blob [0-9a-f]+\s+(\d+)\t(.+)$/);
      if (m) blobSizes.set(m[2], Number(m[1]));
    }
    return { gitTop, blobSizes };
  } catch {
    return { gitTop: null, blobSizes };
  }
}

function walkCoordFiles(dir, out = []) {
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, f.name);
    if (f.isDirectory()) walkCoordFiles(p, out);
    else out.push(p);
  }
  return out;
}

function checkPerFileCeiling(coord, projectRoot, flags) {
  const { gitTop, blobSizes } = readGitBlobSizes(coord, projectRoot);
  let scanned = 0, largest = ["", 0];
  for (const p of walkCoordFiles(coord)) {
    const relTop = gitTop ? relative(gitTop, p).replace(/\\/g, "/") : null;
    const size = relTop !== null && blobSizes.has(relTop) ? blobSizes.get(relTop) : lfBytes(p);
    scanned++;
    const relC = relative(coord, p).replace(/\\/g, "/");
    if (size > largest[1]) largest = [relC, size];
    if (size > FILE_CEILING) {
      flags.push(`CEILING: coordination/${relC} is ${size}B — over the ${FILE_CEILING}B hard per-file ceiling, the measured point at which an external reviewer cannot read the file (PDR-011 §2.3). Relocate or migrate its contents; never trim prose to pass.`);
    }
  }
  console.log(`per-file ceiling: ${scanned} coordination/ file(s) scanned · largest ${largest[0]} ${largest[1]}B · hard cap ${FILE_CEILING}B (committed blob)`);
}

const ROUTED_RE = /(?:→|->)\s*`?(?:(?:coordination\/sprints\/)?cleanup-triage\.md|Issue\s+#\d+|[IDB]-\d{3,4})/i;

function hasUnroutedDeferred(rawSection) {
  const body = rawSection.replace(/<!--[\s\S]*?-->/g, "").trim();
  if (!body || /^_?none\.?_?$/i.test(body)) return false;
  const bullets = [...body.matchAll(/^\s*[-*]\s+(.+)$/gm)]
    .map((m) => m[1].trim())
    .filter((b) => b && !/^_?none\.?_?$/i.test(b) && !/^<finding>/.test(b));
  if (bullets.length > 0) {
    return bullets.some((b) => !ROUTED_RE.test(b) && !/^~~/.test(b));
  }
  return !ROUTED_RE.test(body);
}

function checkStrandedDeferred(coord, flags) {
  const sprintsDir = join(coord, "sprints");
  if (!existsSync(sprintsDir)) return;
  for (const f of readdirSync(sprintsDir).sort()) {
    if (!f.endsWith(".md") || f === "cleanup-triage.md") continue;
    const text = readFileSync(join(sprintsDir, f), "utf8").replace(/\r\n/g, "\n");
    if (/^- \[ \]\s+P5\b/m.test(text)) continue;
    const defMatch = text.match(/^## Deferred[^\n]*\n([\s\S]*?)(?=\n## |\n# |$(?![\s\S]))/m);
    if (!defMatch || !hasUnroutedDeferred(defMatch[1])) continue;
    flags.push(`G5: coordination/sprints/${f} has un-routed item(s) in \`## Deferred\` — route every deferred finding to the single intake (\`coordination/sprints/cleanup-triage.md\` or GitHub Issue) and annotate each bullet (\`→ cleanup-triage.md (<ID>)\` or \`→ Issue #<N>\`).`);
  }
}

export function runV3Reporters(ctx) {
  const { coord, files, isDir, famOf, writeRatchet, flags } = ctx;
  const projectRoot = dirname(coord);
  reportV3Families(coord, isDir, famOf, flags);
  reportDMintRate(coord, projectRoot, isDir, famOf);
  reportAlwaysLoadedRepo(projectRoot);
  runGrowthRatchet({ coord, files, isDir, famOf, writeRatchet, flags });
  checkPerFileCeiling(coord, projectRoot, flags);
  checkStrandedDeferred(coord, flags);
}
