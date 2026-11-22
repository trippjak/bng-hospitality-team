#!/usr/bin/env node
// Mutation proof harness for decisions-dir.mjs (PDR-001 §3.6) + handoff-scaffold.mjs (§3.7).
//
// Every proof runs against a COPY of a fixture in a throwaway git repo, initialised and committed
// here: `check`'s immutability and migrate's verification both read git blobs, so a fixture that
// is not committed is not checkable.
//
// Each §3.6 check is proven in BOTH directions — seeded violation goes red, fixed fixture goes
// green — because a guard with no reachable green state is a wall, and a guard with no reachable
// red is decoration. The red's REASON is asserted too: a red for the wrong reason is a fail, and
// the first red a new check fires is as likely to be the guard's own bug as a real finding.
//
// Usage: node run-tests.mjs   (exit 0 = every proof held)

import { execFileSync } from "node:child_process";
import { mkdtempSync, cpSync, rmSync, readFileSync, writeFileSync, unlinkSync, existsSync, readdirSync, symlinkSync, chmodSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REFS = dirname(HERE);
const TOOL = join(REFS, "decisions-dir.mjs");
const SCAFFOLD = join(REFS, "handoff-scaffold.mjs");

// Assembled at runtime: a literal closing marker sitting in this file would be a trap for any
// tool that scans the fixtures for block syntax.
const CLOSE_MARKER = "<!--" + " /GEN " + "-->";

let pass = 0, fail = 0, skip = 0;
const failures = [], skips = [];

function sh(cmd, args, cwd) {
  return execFileSync(cmd, args, { cwd, stdio: ["ignore", "pipe", "pipe"] }).toString();
}

// A repo with an identity and no inherited hooks/config, so results do not depend on the machine.
function stageFixture(which) {
  const dir = mkdtempSync(join(tmpdir(), "docv3-"));
  cpSync(join(HERE, which), dir, { recursive: true });
  sh("git", ["init", "-q", "-b", "main"], dir);
  sh("git", ["config", "user.email", "fixture@example.invalid"], dir);
  sh("git", ["config", "user.name", "fixture"], dir);
  sh("git", ["add", "-A"], dir);
  sh("git", ["commit", "-q", "-m", "fixture: initial commit"], dir);
  return dir;
}

function run(args, cwd, env) {
  try {
    const out = execFileSync("node", args, { cwd, stdio: ["ignore", "pipe", "pipe"], ...(env ? { env } : {}) });
    return { code: 0, out: out.toString() };
  } catch (e) {
    return { code: e.status ?? -1, out: (e.stdout ? e.stdout.toString() : "") + (e.stderr ? e.stderr.toString() : "") };
  }
}

function check(dir, env) { return run([TOOL, "check", dir], dir, env); }

// Cleanup is hygiene, not a proof. Windows AV holds handles on freshly-written .git objects past
// any reasonable retry window (observed: Bitdefender, >1s), and an EPERM here aborted the whole
// table mid-run — a leaked temp dir must never cost 100 assertions. Retry, then warn and move on.
function nuke(dir) {
  try { rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 150 }); }
  catch (e) { console.log(`  (cleanup deferred: ${dir} still held — ${e.code}; delete it later)`); }
}

function assert(label, cond, detail) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; failures.push(label); console.log(`  FAIL  ${label}${detail ? `\n        ${detail.replace(/\n/g, "\n        ")}` : ""}`); }
}

// The core proof shape. `seed` mutates a staged fixture; we assert the named check goes red for
// the REASON we expect, then assert the untouched fixture is green — so the red is attributable
// to the mutation and not to a fixture that was broken all along.
function mutation(name, checkName, seed, expectReason) {
  console.log(`\n[${name}]`);
  const clean = stageFixture("v3-fixture");
  const before = check(clean);
  assert(`${name}: clean fixture is GREEN (exit 0)`, before.code === 0, before.out);

  const dirty = stageFixture("v3-fixture");
  seed(dirty);
  const after = check(dirty);
  assert(`${name}: seeded violation is RED (exit 1)`, after.code === 1, after.out);

  const line = after.out.split("\n").find((l) => l.trim().startsWith(checkName));
  assert(`${name}: the RED is on the "${checkName}" check`, !!line && /FAIL/.test(line), `check line was: ${line || "<not found>"}`);
  assert(`${name}: the RED names the right reason`, expectReason.test(after.out),
    `expected /${expectReason.source}/ in:\n${after.out}`);

  // Every other check must stay green — a mutation that reds three checks is not a proof that
  // this one works.
  const otherFails = after.out.split("\n")
    .filter((l) => /^\s{2}\S+\s+FAIL/.test(l) && !l.trim().startsWith(checkName))
    .map((l) => l.trim().split(/\s+/)[0]);
  assert(`${name}: no OTHER check fired`, otherFails.length === 0, `also red: ${otherFails.join(", ")}`);

  nuke(clean);
  nuke(dirty);
}

const D = (dir, n) => join(dir, "coordination", "decisions", "d", `D-${n}.md`);
const IDX = (dir) => join(dir, "coordination", "decisions", "DECISIONS.md");

function commit(dir, msg) {
  sh("git", ["add", "-A"], dir);
  sh("git", ["commit", "-q", "-m", msg], dir);
}

console.log("=".repeat(78));
console.log("MUTATION TABLE — every PDR-001 §3.6 check, both directions");
console.log("=".repeat(78));

function withAliasedFixture(which, inspect) {
  const dir = stageFixture(which);
  const aliasParent = mkdtempSync(join(tmpdir(), "doc-alias-"));
  const alias = join(aliasParent, "repo");
  try {
    symlinkSync(dir, alias, process.platform === "win32" ? "junction" : "dir");
    inspect(dir, alias);
  } finally {
    if (existsSync(alias)) unlinkSync(alias);
    nuke(aliasParent);
    nuke(dir);
  }
}

withAliasedFixture("v2-fixture", (dir, alias) => {
  const physical = run([TOOL, "migrate", dir], dir);
  const linked = run([TOOL, "migrate", alias], dir);
  assert("aliased migration: physical root succeeds", physical.code === 0, physical.out);
  assert("aliased migration: linked root reads the same committed entries",
    linked.code === 0 && /^D-005 OK /m.test(linked.out), linked.out);
  const written = run([TOOL, "migrate", alias, "--write"], dir);
  assert("aliased migration: write verifies bytes",
    written.code === 0 && /verified byte-identical on read-back/.test(written.out), written.out);
});

withAliasedFixture("v3-fixture", (dir, alias) => {
  const clean = check(alias);
  assert("aliased check: committed entries are checked rather than skipped",
    clean.code === 0 && /8 committed entries vs their adding commit/.test(clean.out), clean.out);
  const entry = D(dir, "007");
  writeFileSync(entry, readFileSync(entry, "utf8").replace("severs supersession chains", "severs the chains"));
  const physical = check(dir);
  const linked = check(alias);
  assert("aliased immutability: physical mutation is rejected",
    physical.code === 1 && /body changed since it was minted/.test(physical.out), physical.out);
  assert("aliased immutability: linked mutation is rejected",
    linked.code === 1 && /body changed since it was minted/.test(linked.out), linked.out);
});

// 1. body edit after mint -> immutability
mutation("body edit after mint", "immutability", (dir) => {
  const p = D(dir, "007");
  writeFileSync(p, readFileSync(p, "utf8").replace("severs supersession chains", "severs the chains"), "utf8");
  commit(dir, "edit a minted body"); // committed, so this is the durable form of the violation
}, /D-007\.md: body changed since it was minted in [0-9a-f]{7} \(HEAD\)/);

// 1b. same class, caught one step earlier — uncommitted
mutation("body edit, uncommitted", "immutability", (dir) => {
  const p = D(dir, "008");
  writeFileSync(p, readFileSync(p, "utf8").replace("look identical", "look the same"), "utf8");
}, /D-008\.md: body changed since it was minted in [0-9a-f]{7} \(worktree\)/);

// 2. contiguity gap without a stub.
//    The index is REGENERATED after the deletion on purpose. Deleting a stub also stales the
//    index (never-minted ids are summarised there), so a naive seed reds two checks at once and
//    proves neither in isolation. Regenerating leaves exactly one thing wrong: the gap.
mutation("contiguity gap without stub", "contiguity", (dir) => {
  unlinkSync(D(dir, "004"));
  run([TOOL, "index", dir], dir);
  commit(dir, "delete a never-minted stub");
}, /D-004: no file — a gap needs a `status: never-minted` stub/);

// 3. stale index
mutation("stale index", "index-fresh", (dir) => {
  const p = IDX(dir);
  writeFileSync(p, readFileSync(p, "utf8").replace("| D-008 | 2026-08-24 | accepted |", "| D-008 | 2026-08-24 | superseded |"), "utf8");
  commit(dir, "hand-edit the generated index");
}, /DECISIONS\.md: drifted from its projection at line \d+/);

// 4. dangling superseded-by
mutation("dangling superseded-by", "supersession-refs", (dir) => {
  const p = D(dir, "002");
  writeFileSync(p, readFileSync(p, "utf8").replace("superseded-by: D-006", "superseded-by: D-099"), "utf8");
  // The index projects status, not the pointer, so it stays fresh; the reference is what breaks.
  commit(dir, "point at a decision that does not exist");
}, /D-002\.md: `superseded-by: D-099` names an entry that does not exist/);

// 5. migrate source mismatch — the HEAD blob is what §3.6.5 verifies against, so a source that
//    is not in HEAD cannot be byte-verified and migration must refuse rather than guess.
console.log("\n[migrate source mismatch]");
{
  const dir = stageFixture("v2-fixture");
  const ok = run([TOOL, "migrate", dir], dir);
  assert("migrate source mismatch: committed source DRY-RUNS clean (exit 0)", ok.code === 0, ok.out);

  const bad = stageFixture("v2-fixture");
  writeFileSync(join(bad, "coordination", "decisions", "archive", "2026-08-uncommitted.md"),
    "# Snapshot\n\n## D-009 — An entry that exists only in the worktree\n2026-08-25 • x • body\n", "utf8");
  const r = run([TOOL, "migrate", bad], bad);
  assert("migrate source mismatch: uncommitted source is RED (exit 1)", r.code === 1, r.out);
  assert("migrate source mismatch: the RED names HEAD-blob verification",
    /untracked in HEAD/.test(r.out), r.out);
  assert("migrate source mismatch: nothing was written",
    !existsSync(join(bad, "coordination", "decisions", "d")), "d/ was created despite the failure");
  nuke(dir);
  nuke(bad);
}

console.log("\n" + "=".repeat(78));
console.log("CLI CONTRACTS — PDR-001 §3.4");
console.log("=".repeat(78));

// index: entry count + byte count, and regeneration is byte-identical to the committed index.
console.log("\n[index]");
{
  const dir = stageFixture("v3-fixture");
  const before = readFileSync(IDX(dir), "utf8");
  const r = run([TOOL, "index", dir], dir);
  assert("index: exit 0", r.code === 0, r.out);
  assert("index: prints `index: 8 entries, <N> bytes`", /^index: 8 entries, \d+ bytes$/m.test(r.out), r.out);
  assert("index: committed index is byte-identical on regenerate",
    readFileSync(IDX(dir), "utf8") === before, "regenerating changed the committed index");
  nuke(dir);
}

// migrate --write: per-entry OK table, then check exits 0 on the result.
console.log("\n[migrate --write -> check]");
{
  const dir = stageFixture("v2-fixture");
  const dry = run([TOOL, "migrate", dir], dir);
  assert("migrate: dry-run does not write", !existsSync(join(dir, "coordination", "decisions", "d")), dry.out);
  assert("migrate: the fenced `## D-042` example is NOT extracted", !/D-042/.test(dry.out), dry.out);
  assert("migrate: the gap at D-002 becomes a stub", /^D-002 GAP->stub/m.test(dry.out), dry.out);
  assert("migrate: with no archive index, the run SAYS reasons were not consulted",
    /NOTE: no archive index found/.test(dry.out), dry.out);
  assert("migrate: D-004's full body is taken from the archive, not the live stub",
    /^D-004 OK \(bytes=\d+\) coordination\/decisions\/archive\/2026-07-decisions-snapshot\.md/m.test(dry.out), dry.out);
  assert("migrate: non-entry source regions are reported as NOT MIGRATED", /NOT MIGRATED/.test(dry.out), dry.out);

  const w = run([TOOL, "migrate", dir, "--write"], dir);
  assert("migrate --write: exit 0", w.code === 0, w.out);
  assert("migrate --write: per-entry OK table", (w.out.match(/^D-\d{3} OK \(bytes=\d+\)/gm) || []).length >= 5, w.out);
  assert("migrate --write: read-back verification is reported",
    /verified byte-identical on read-back/.test(w.out), w.out);

  // Body fidelity, checked against the SOURCE rather than against the tool's own slice.
  const src = readFileSync(join(dir, "coordination", "decisions", "DECISIONS.md"), "utf8").replace(/\r\n/g, "\n");
  const d005 = readFileSync(join(dir, "coordination", "decisions", "d", "D-005.md"), "utf8").replace(/\r\n/g, "\n");
  const body005 = d005.slice(d005.indexOf("\n---\n", 3) + 5).replace(/\n$/, "");
  assert("migrate --write: D-005's emitted body appears verbatim in the v2 source",
    src.includes(body005) && body005.startsWith("## D-005 —"), body005.slice(0, 120));

  // The target repo must declare v3 before check will run — that gate is itself the contract.
  const notOptedIn = run([TOOL, "check", dir], dir);
  assert("check: refuses on a repo that has not opted in", notOptedIn.code === 1 && /not in directory mode/.test(notOptedIn.out), notOptedIn.out);

  writeFileSync(join(dir, "coordination", ".doclint.json"), JSON.stringify({
    version: 3,
    families: { D: { mode: "directory", dir: "decisions/d", index: "decisions/DECISIONS.md" }, B: { mode: "file" }, I: { mode: "file" } },
    thresholds: {},
  }, null, 2) + "\n", "utf8");
  // The v2 source records supersession ONE WAY (D-003 names D-006; D-006 names nothing back).
  // Migration must write the reverse edge, or the bidirectionality arm reds legacy data with no
  // legal repair left — bodies are immutable the moment they are minted.
  const d006 = readFileSync(join(dir, "coordination", "decisions", "d", "D-006.md"), "utf8");
  assert("migrate --write: the missing back-pointer is derived onto D-006",
    /^supersedes: D-003$/m.test(d006), d006.slice(0, 200));
  assert("migrate --write: the derivation did not touch the body",
    d006.includes("## D-006 — The index is a projection, never a hand-maintained file"), d006.slice(0, 200));

  const idx = run([TOOL, "index", dir], dir);
  assert("migrate -> index: exit 0", idx.code === 0, idx.out);
  commit(dir, "migrate to directory mode");
  const post = check(dir);
  assert("migrate -> check: exit 0 on the migrated result", post.code === 0, post.out);
  nuke(dir);
}

// migrate + archive index: gap stubs must CARRY a reason the v2 record wrote down, and must
// refuse to stub over a live reservation or a recorded-but-missing entry. Proven against the
// business-club-ops defect (D-110/D-112/D-154 recorded reasons overwritten with "The reason was
// never written down."; D-151/D-152 reserved by an open claim).
console.log("\n[migrate: archive-index reasons carried into gap stubs]");
{
  const dir = stageFixture("v2-index-fixture");
  const dry = run([TOOL, "migrate", dir], dir);
  assert("index reasons: dry-run exit 0", dry.code === 0, dry.out);
  assert("index reasons: D-002's gap line says the reason is carried",
    /^D-002 GAP->stub \(reason carried from the archive index\)/m.test(dry.out), dry.out);
  assert("index reasons: D-003's gap line still says no entry in any source",
    /^D-003 GAP->stub \(no entry in any source\)/m.test(dry.out), dry.out);
  assert("colon heading: RocketFuel's D-NNN: form is extracted, not stubbed",
    /^D-004 OK \(bytes=\d+\) coordination\/decisions\/DECISIONS\.md/m.test(dry.out), dry.out);

  const w = run([TOOL, "migrate", dir, "--write"], dir);
  assert("index reasons: --write exit 0", w.code === 0, w.out);
  const carried = readFileSync(D(dir, "002"), "utf8");
  assert("index reasons: D-002 stub carries the recorded reason verbatim",
    carried.includes("Reserved by the P9 claim (PR #7); the lane completed with no decision minted"), carried);
  assert("index reasons: D-002 stub does NOT claim the reason was never written down",
    !carried.includes("The reason was never written down"), carried);
  assert("index reasons: D-002 stub's date is the index row's date, not the migration date",
    /^date: 2026-08-10$/m.test(carried), carried);
  assert("index reasons: D-002 stub names its source file",
    carried.includes("coordination/archive/INDEX.md"), carried);
  const plain = readFileSync(D(dir, "003"), "utf8");
  assert("index reasons: D-003 (no row) keeps the honest no-record stub",
    plain.includes("The reason was never written down"), plain);
  const colon = readFileSync(D(dir, "004"), "utf8").replace(/\r\n/g, "\n");
  const colonSource = readFileSync(join(dir, "coordination", "decisions", "DECISIONS.md"), "utf8").replace(/\r\n/g, "\n");
  const colonBody = colon.split("\n---\n").slice(1).join("\n---\n");
  assert("colon heading: the title excludes the separator",
    /^title: The RocketFuel-style colon-headed decision$/m.test(colon), colon);
  assert("colon heading: the emitted body is byte-identical to the v2 source",
    colonSource.includes(colonBody) && colonBody.startsWith("## D-004: The RocketFuel-style colon-headed decision"), colonBody);

  // The [STRUCTURAL] heading tolerance — the second defect the BCO probe surfaced: 30+ real
  // entries head `## D-NNN [STRUCTURAL] — title` (or tag after the dash) and every one was
  // silently becoming a false stub over a full recorded body.
  const preDash = readFileSync(D(dir, "005"), "utf8");
  assert("[STRUCTURAL] pre-dash: the entry is extracted, not stubbed",
    !preDash.includes("never-minted"), preDash);
  assert("[STRUCTURAL] pre-dash: frontmatter carries structural: true",
    /^structural: true$/m.test(preDash), preDash);
  assert("[STRUCTURAL] pre-dash: the tag is not in the title",
    /^title: The decision tagged before the dash$/m.test(preDash), preDash);
  const postDash = readFileSync(D(dir, "006"), "utf8");
  assert("[STRUCTURAL] post-dash: frontmatter carries structural: true",
    /^structural: true$/m.test(postDash), postDash);
  assert("[STRUCTURAL] post-dash: the tag is not in the title",
    /^title: The decision tagged after the dash$/m.test(postDash), postDash);

  // Separator-less heading (`## D-141 section-close: …` on BCO) — extracted, not stubbed,
  // and surfaced for human review as the loosest tolerance in the regex.
  const bare = readFileSync(D(dir, "007"), "utf8");
  assert("separator-less heading: the entry is extracted with its title",
    /^title: The separator-less decision$/m.test(bare), bare);
  assert("separator-less heading: the capture is surfaced for review in the migrate output",
    /SEPARATOR-LESS HEADINGS/.test(w.out) && /D-007 {2}/.test(w.out), w.out);
  // An unknown ALL-CAPS tag is NOT the [STRUCTURAL] flag: it stays in the title, preserved,
  // and does not set structural frontmatter.
  const tagged = readFileSync(D(dir, "009"), "utf8");
  assert("unknown tag: [RATIFIED] is preserved in the title, not silently stripped",
    /^title: \[RATIFIED\] — The unknown-tag decision$/m.test(tagged), tagged);
  assert("unknown tag: it does not set structural frontmatter",
    !/^structural: true$/m.test(tagged), tagged);
  // An index row ABOVE the highest extracted id still moves: D-010 (max is 9) gets its stub
  // with the recorded reason, extending the contiguous range.
  const above = readFileSync(D(dir, "010"), "utf8");
  assert("above-max index row: the stub is emitted with its carried reason",
    above.includes("Declared ahead of the range"), above);
  // The fenced documentation row must never mint: no D-099 file, and its reason nowhere.
  assert("fenced example row: no stub is minted from documentation",
    !existsSync(D(dir, "099")), "D-099.md exists");
  // Prefaced date line (`## D-031` on BCO opens with a correction blockquote) — the date is
  // found at its bullet line, not reported as underivable.
  const prefaced = readFileSync(D(dir, "008"), "utf8");
  assert("prefaced entry: the date is derived from the bullet line below the preface",
    /^date: 2026-08-24$/m.test(prefaced), prefaced);

  // A carried stub quotes prose that BEGINS "Reserved by…" (historically true v2 text). It is a
  // plain `never-minted` stub and check must stay green on it.
  writeFileSync(join(dir, "coordination", ".doclint.json"),
    '{"version":3,"families":{"D":{"mode":"directory"}}}', "utf8");
  run([TOOL, "index", dir], dir);
  commit(dir, "migrate to directory mode");
  const post = check(dir);
  assert("carried stub: check is green on the migrated result", post.code === 0, post.out);
  nuke(dir);
}

// Removal trace: two assertions here pinned the contiguity arm's `(N reserved)` count — that a
// blockquoted "Reserved by…" reason read as 0 and a body OPENING with the mark read as 1. Both
// removed with the machinery itself (D-192 §3). The summary no longer carries a reserved count,
// so a test asserting one would pin a string the tool cannot emit. The MIGRATE refusal below is
// the v2 INDEX-row mechanism, which D-192 did not rule on and which stays.
// The open-PR reservations below are a THIRD thing again, and deliberately worded so they cannot
// be mistaken for either: they live on a PR title, never on disk, so nothing is minted, nothing is
// immutable, and the exemption expires when the PR does. The assertion above still holds — the
// summary must never regrow a `(N reserved)` count.
console.log("\n[contiguity: a never-minted stub is counted however its body reads]");
{
  const dir = stageFixture("v3-fixture");
  const r = check(dir);
  assert("check is green and the summary carries no reserved count", r.code === 0, r.out);
  assert("the retired `(N reserved)` suffix is gone from the contiguity summary",
    !/reserved\)/.test(r.out), r.out);
  nuke(dir);
}

// A `gh` that answers with canned JSON and records the arguments it was handed. The point is to
// drive the SAME execFileSync("gh", ...) the tool uses in production: a fake injected below that
// call would prove the parser and nothing about whether the parser is ever reached.
function ghShim(prs, { fails = false } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ghshim-"));
  writeFileSync(join(dir, "prs.json"), JSON.stringify(prs), "utf8");
  const sep = process.platform === "win32" ? ";" : ":";
  if (process.platform === "win32") {
    writeFileSync(join(dir, "gh.cmd"),
      fails ? "@echo off\r\nexit /b 2\r\n"
            : '@echo off\r\n(for %%a in (%*) do @echo %%a) > "%~dp0args.txt"\r\ntype "%~dp0prs.json"\r\n', "utf8");
  } else {
    const f = join(dir, "gh");
    writeFileSync(f, fails ? "#!/bin/sh\nexit 2\n"
      : '#!/bin/sh\nprintf \'%s\\n\' "$@" > "$(dirname "$0")/args.txt"\nexec cat "$(dirname "$0")/prs.json"\n', "utf8");
    chmodSync(f, 0o755);
  }
  return { dir, args: join(dir, "args.txt"), env: { ...process.env, PATH: dir + sep + process.env.PATH } };
}

// Proving the fake is REACHABLE before anything leans on it. A shim the platform cannot execute
// would make every exemption test below pass for the wrong reason — the tool would simply fall
// back to "lookup did not run", and a green suite would assert nothing about the feature.
function shimReachable(sh) {
  try {
    return execFileSync("gh", ["pr", "list"], { cwd: sh.dir, env: sh.env, stdio: ["ignore", "pipe", "ignore"] })
      .toString().trim().startsWith("[");
  } catch { return false; }
}

// One gap, nothing else wrong: delete the never-minted stub and regenerate the index, exactly as
// the contiguity mutation does, so every assertion below is attributable to the reservation arm.
function stageGap() {
  const dir = stageFixture("v3-fixture");
  unlinkSync(D(dir, "004"));
  run([TOOL, "index", dir], dir);
  commit(dir, "delete a never-minted stub");
  return dir;
}

console.log("\n[contiguity: a gap an OPEN PR has reserved is not a hole (I-097)]");
{
  const probe = ghShim([]);
  const reachable = shimReachable(probe);
  nuke(probe.dir);
  if (!reachable) {
    // Visible, counted as neither pass nor fail. Silence here would read as coverage.
    console.log("  SKIP  gh shim is not executable on this platform — the reservation arm is UNPROVEN in this run");
    skip++; skips.push("reservation arm unproven: gh shim not executable");
  } else {
    // The two title shapes that reserved ids in the wild: launch-uk #354/#370 led with the id,
    // #366 said `reserves D-234` after a CLAIM prefix.
    for (const [label, title] of [
      ["a title that LEADS with the id", "D-004: platform partner directories closed as a link class (I-095)"],
      ["a CLAIM title that says `reserves`", "CLAIM: off-page link targets verified — reserves D-004"],
    ]) {
      const dir = stageGap();
      const sh = ghShim([{ number: 370, title }]);
      const r = check(dir, sh.env);
      assert(`reserved (${label}): the gap is GREEN`, r.code === 0, r.out);
      assert(`reserved (${label}): the summary names the id and its PR`,
        /contiguity\s+OK\s+.*reserved on an open PR: D-004 on #370/.test(r.out), r.out);
      nuke(sh.dir); nuke(dir);
    }

    // The exemption is scoped to OPEN PRs by the argument the tool passes gh. Nothing else in the
    // suite can see that argument, so a regression to `--state all` would otherwise go unnoticed
    // and start excusing ids whose PR merged without ever writing them.
    {
      const dir = stageGap();
      const sh = ghShim([{ number: 370, title: "D-004: in flight" }]);
      check(dir, sh.env);
      const args = existsSync(sh.args) ? readFileSync(sh.args, "utf8") : "";
      assert("the lookup asks gh for OPEN pull requests only",
        /(^|\n)--state\r?\n *open\r?(\n|$)/.test(args) || /--state\s+open/.test(args.replace(/\n/g, " ")), args || "<no args recorded>");
      nuke(sh.dir); nuke(dir);
    }

    // RED, three ways. Each is a title a careless matcher would accept.
    for (const [label, prs, why] of [
      ["a mid-title MENTION is not a claim", [{ number: 358, title: "section-close: a capture became one complete run (D-004, #354; #357) sweep" }],
        "citing an id that already merged must not excuse a hole where it should be"],
      ["`reserves nothing` reserves nothing", [{ number: 368, title: "CLAIM: spokesperson into off-page release copy — reserves nothing" }],
        "the ratified way to say a claim takes no id"],
      ["an open PR about a DIFFERENT id", [{ number: 371, title: "D-009: unrelated work in flight" }],
        "the exemption is per-id, not per-open-PR"],
    ]) {
      const dir = stageGap();
      const sh = ghShim(prs);
      const r = check(dir, sh.env);
      const line = r.out.split("\n").find((l) => l.trim().startsWith("contiguity"));
      assert(`still RED — ${label}`, r.code === 1 && !!line && /FAIL/.test(line), `${why}\n${r.out}`);
      assert(`still RED — ${label}: and it reads as a plain gap, not a failed lookup`,
        /D-004: no file/.test(r.out) && !/lookup did not run/.test(r.out), r.out);
      nuke(sh.dir); nuke(dir);
    }

    // An unusable gh must not quietly become "no reservations exist". The gap is reported exactly
    // as it was before this feature, and the message says the lookup is the part that is missing.
    {
      const dir = stageGap();
      const sh = ghShim([], { fails: true });
      const r = check(dir, sh.env);
      assert("gh unavailable: the gap is still RED", r.code === 1, r.out);
      assert("gh unavailable: the message says the LOOKUP did not run, not that nothing was reserved",
        /D-004: no file.*lookup did not run: `gh` unavailable/s.test(r.out), r.out);
      nuke(sh.dir); nuke(dir);
    }

    // The arm must not have swallowed the check it softens: a gap no open PR names is still a hole
    // even when the lookup succeeds and returns a full, plausible-looking list.
    {
      const dir = stageGap();
      const sh = ghShim([{ number: 370, title: "D-235: a real reservation for an id this fixture does not have" },
                         { number: 371, title: "CLAIM: unrelated — reserves nothing" }]);
      const r = check(dir, sh.env);
      assert("a successful lookup that names no claim leaves contiguity with its teeth", r.code === 1, r.out);
      nuke(sh.dir); nuke(dir);
    }
  }
}

console.log("\n[migrate: a RESERVED index row ABOVE the extracted range still refuses]");
{
  const dir = stageFixture("v2-index-fixture");
  const IDXA = join(dir, "coordination", "archive", "INDEX.md");
  writeFileSync(IDXA, readFileSync(IDXA, "utf8").replace(
    "\n\nA documentation example",
    "\n| D-012 | 2026-08-27 | reserved | Future claim held by an open PR. |\n\nA documentation example"), "utf8");
  commit(dir, "seed: a reservation for an id above the extracted range");
  const r = run([TOOL, "migrate", dir, "--write"], dir);
  assert("above-max reserved: migrate is RED (exit 1)", r.code === 1, r.out);
  assert("above-max reserved: the RED names D-012 as RESERVED", /D-012: .*RESERVED/.test(r.out), r.out);
  assert("above-max reserved: nothing was written",
    !existsSync(join(dir, "coordination", "decisions", "d")), "d/ was created despite the refusal");
  nuke(dir);
}

console.log("\n[migrate: a RESERVED index row refuses the stub]");
{
  const dir = stageFixture("v2-index-fixture");
  const IDXA = join(dir, "coordination", "archive", "INDEX.md");
  writeFileSync(IDXA, readFileSync(IDXA, "utf8").replace("| D-002 | 2026-08-10 | never-minted |", "| D-002 | 2026-08-10 | reserved |"), "utf8");
  commit(dir, "seed: the D-002 row is a live reservation");
  const r = run([TOOL, "migrate", dir, "--write"], dir);
  assert("reserved row: migrate is RED (exit 1)", r.code === 1, r.out);
  assert("reserved row: the RED names the reservation and the foreclosure",
    /D-002: .*RESERVED/.test(r.out) && /foreclose/.test(r.out), r.out);
  assert("reserved row: nothing was written",
    !existsSync(join(dir, "coordination", "decisions", "d")), "d/ was created despite the refusal");
  nuke(dir);
}

console.log("\n[migrate: an index row naming a location no source contains is a LOSS, not a gap]");
{
  const dir = stageFixture("v2-index-fixture");
  const IDXA = join(dir, "coordination", "archive", "INDEX.md");
  writeFileSync(IDXA, readFileSync(IDXA, "utf8").replace("| never-minted |", "| decisions/archive/2026-08-lost-snapshot.md |"), "utf8");
  commit(dir, "seed: the index claims D-002 lives in an archive that does not contain it");
  const r = run([TOOL, "migrate", dir, "--write"], dir);
  assert("missing entry: migrate is RED (exit 1)", r.code === 1, r.out);
  assert("missing entry: the RED says a recorded entry is MISSING, not a gap",
    /D-002: .*MISSING, not a gap/.test(r.out), r.out);
  assert("missing entry: nothing was written",
    !existsSync(join(dir, "coordination", "decisions", "d")), "d/ was created despite the refusal");
  nuke(dir);
}

console.log("\n[migrate: an untracked archive index is RED like any other unverifiable source]");
{
  const dir = stageFixture("v2-index-fixture");
  sh("git", ["rm", "-q", "--cached", "coordination/archive/INDEX.md"], dir);
  sh("git", ["commit", "-q", "-m", "seed: untrack the index while it stays on disk"], dir);
  const r = run([TOOL, "migrate", dir], dir);
  assert("untracked index: migrate is RED (exit 1)", r.code === 1, r.out);
  assert("untracked index: the RED names the index and HEAD verification",
    /INDEX\.md: untracked in HEAD/.test(r.out), r.out);
  nuke(dir);
}

console.log("\n" + "=".repeat(78));
console.log("BATCH-TABLE EXTRACTION — T0b: migrate learns the batch-table row shape");
console.log("=".repeat(78));

const MONOLITH = (dir) => join(dir, "coordination", "decisions", "archive", "DECISIONS-ARCHIVE-D001-D010.md");
function fixBatchTableFixture(dir) {
  writeFileSync(MONOLITH(dir), readFileSync(MONOLITH(dir), "utf8").replace("| not-a-date |", "| 2026-06-06 |"), "utf8");
  commit(dir, "fix the malformed date so --write can run");
}

// Row-shape re-verification, mirrored from the T0b brief's real-corpus command: every real
// decision row in the fixture ends in an ISO date except the one deliberately malformed row,
// which must be named and must halt the run rather than becoming a silent contiguity gap.
console.log("\n[batch-table: dry-run reports each row and refuses on the one bad date]");
{
  const dir = stageFixture("v2-batch-table-fixture");
  const dry = run([TOOL, "migrate", dir], dir);
  assert("batch-table: dry-run exits 1 (one malformed row present)", dry.code === 1, dry.out);
  assert("batch-table: 9 real rows extracted as [table-row], tagged by source",
    (dry.out.match(/^D-\d{3} OK \(bytes=\d+\) coordination\/decisions\/archive\/DECISIONS-ARCHIVE-D001-D010\.md \[table-row\]/gm) || []).length === 9,
    dry.out);
  assert("batch-table: the malformed row is named, not silently gapped",
    /UNSPLITTABLE DECISION ROWS/.test(dry.out) && /D-006\s+coordination[\\/].*:17\s+last cell "not-a-date" is not a YYYY-MM-DD date/.test(dry.out), dry.out);
  assert("batch-table: the malformed row halts the whole run (all-or-nothing)",
    /VERDICT: 1 PROBLEM\(S\) — nothing written/.test(dry.out), dry.out);
  assert("batch-table: the fenced D-099 documentation example is never captured", !/D-099/.test(dry.out), dry.out);
  assert("batch-table: rows sitting above the first batch heading extract the same as any other (D-001, D-003)",
    /^D-001 OK/m.test(dry.out) && /^D-003 OK/m.test(dry.out), dry.out);
  assert("batch-table: a row right after a batch heading with NO repeated header row still extracts",
    /^D-004 OK/m.test(dry.out), dry.out);
  assert("batch-table: a row after a batch heading that DOES repeat the header row still extracts",
    /^D-008 OK/m.test(dry.out), dry.out);
  nuke(dir);
}

// The extraction rule (id = first cell, date = LAST cell, body = everything between rejoined with
// `|`) proven against a 4-column row with an embedded pipe in plain prose (D-002) and a 3-column
// row with a doubled pipe from a JS `||` operator (D-007) — splitting on column COUNT would
// fragment both; splitting positionally reconstructs them byte-exact.
console.log("\n[batch-table: embedded pipes are preserved byte-exactly, not fragmented]");
{
  const dir = stageFixture("v2-batch-table-fixture");
  fixBatchTableFixture(dir);
  const w = run([TOOL, "migrate", dir, "--write"], dir);
  assert("batch-table: --write succeeds once the one malformed row is fixed", w.code === 0, w.out);
  assert("batch-table: 10 entries written and verified byte-identical on read-back",
    /verified byte-identical on read-back/.test(w.out), w.out);

  const src = readFileSync(MONOLITH(dir), "utf8").replace(/\r\n/g, "\n");
  const d002 = readFileSync(D(dir, "002"), "utf8").replace(/\r\n/g, "\n");
  const body002 = d002.slice(d002.indexOf("\n---\n", 3) + 5).replace(/\n$/, "");
  assert("batch-table: D-002's embedded `anchor|support|accent` pipes survive verbatim in the body",
    body002.includes("anchor|support|accent") && src.includes(body002), body002);

  const d007 = readFileSync(D(dir, "007"), "utf8").replace(/\r\n/g, "\n");
  const body007 = d007.slice(d007.indexOf("\n---\n", 3) + 5).replace(/\n$/, "");
  assert("batch-table: D-007's doubled `||` operator survives verbatim in the body",
    body007.includes("a || b") && src.includes(body007), body007);
  nuke(dir);
}

// Title derivation never invents: a leading bold span is quoted as the title verbatim; absent
// one, a mechanical truncation of the source text; the [STRUCTURAL] tag is read the same
// unambiguous way heading entries read it (a literal marker, never inferred from prose).
console.log("\n[batch-table: title derivation — bold headline, truncated fallback, [STRUCTURAL] tag]");
{
  const dir = stageFixture("v2-batch-table-fixture");
  fixBatchTableFixture(dir);
  run([TOOL, "migrate", dir, "--write"], dir);

  const d001 = readFileSync(D(dir, "001"), "utf8");
  assert("batch-table: [STRUCTURAL] tag sets structural: true and is stripped from the title",
    /^structural: true$/m.test(d001) && !/title:.*\[STRUCTURAL\]/.test(d001), d001);

  const d008 = readFileSync(D(dir, "008"), "utf8");
  assert("batch-table: a leading bold span becomes the title, verbatim",
    /^title: A clean bold headline for D-008\.$/m.test(d008), d008);

  const d009 = readFileSync(D(dir, "009"), "utf8");
  assert("batch-table: no leading bold span -> a truncated snippet, not an invented title",
    /^title: Second three-column-era row for the fixture, no leading bold headline this time so the…$/m.test(d009), d009);

  // Cross-model review (Opus 5) finding D2: the tag folded INSIDE the headline span occurs on 4
  // real corpus rows (D-016/D-060/D-062/D-140) and was BOTH losing `structural: true` and leaving
  // the literal tag in the title. Neither is repairable after mint — `structural` is outside
  // MUTABLE_KEYS and titles are immutable — so it had to be caught before P2 ran.
  const d010 = readFileSync(D(dir, "010"), "utf8");
  assert("batch-table: [STRUCTURAL] folded inside the headline span still sets structural: true",
    /^structural: true$/m.test(d010), d010);
  assert("batch-table: and the tag is stripped from the title, not left in it",
    /^title: The tag folded INSIDE the headline span, on a struck-through id\.$/m.test(d010), d010);
  nuke(dir);
}

// Cross-model review (Opus 5) finding D1 — the blocking one. A row carrying a DECORATED id that
// cannot be split positionally must halt the run by name. Returning `null` (indistinguishable from
// "not a decision row") dropped it into the anonymous NOT-MIGRATED bucket, made its id a
// contiguity gap, and then minted an immutable `never-minted` stub asserting a decision sitting in
// the source was never recorded — the I-039 silent-loss class reproduced inside the tool built to
// close it. Reproduced end-to-end on exit 0 with `--write` before the fix.
console.log("\n[batch-table: an unsplittable decision row halts by name, never becomes a false stub]");
{
  const SHAPES = [
    ["strikethrough id is EXTRACTED, not dropped", "| ~~**D-003**~~ | Retired but recorded. | Superseded operationally. | 2026-06-03 |", null],
    ["trailing content after the last cell", "| **D-003** | A row. | A rationale. | 2026-06-03 | <!-- checked -->", /does not end in/],
    ["too few cells to split", "| **D-003** | 2026-06-03 |", /need at least an id/],
    ["empty body cell", "| **D-003** || 2026-06-03 |", /body cell is empty/],
  ];
  for (const [label, row, expectWhy] of SHAPES) {
    const dir = stageFixture("v2-batch-table-fixture");
    fixBatchTableFixture(dir);
    // A source of its own, so the shape under test is the only thing that varies. D-004 keeps the
    // malformed D-003 inside the 1..max walk — outside it, the id never reaches planGap at all and
    // the false-stub path this test exists to pin would not be exercised.
    writeFileSync(join(dir, "coordination", "decisions", "archive", "SHAPE.md"),
      `# Shape\n\n| # | Decision | Rationale | Date |\n|---|---|---|---|\n${row}\n| **D-004** | A later row so D-003 sits inside 1..max. | Fine. | 2026-06-04 |\n`, "utf8");
    commit(dir, "seed: one adversarial row shape");
    const r = run([TOOL, "migrate", dir, "--write"], dir);
    const stub = join(dir, "coordination", "decisions", "d", "D-003.md");
    if (expectWhy === null) {
      assert(`unsplittable rows: ${label}`, r.code === 0 && existsSync(stub) &&
        !readFileSync(stub, "utf8").includes("never-minted"), r.out);
    } else {
      assert(`unsplittable rows: ${label} is RED (exit 1)`, r.code === 1, r.out);
      assert(`unsplittable rows: ${label} — the RED names D-003 and the reason`,
        /D-003.*cannot be split/.test(r.out) && expectWhy.test(r.out), r.out);
      assert(`unsplittable rows: ${label} — no false never-minted stub was written`,
        !existsSync(stub), "a stub was minted asserting a recorded decision was never recorded");
    }
    nuke(dir);
  }
}

// The other direction, and the reason the D1 fix could not simply recognise bare ids: the archive
// INDEX is itself a scanned source (the candidate sweep takes every `archive/*.md`) and its rows
// are shaped `| D-NNN | date | where | what |` with a BARE id. Treating those as decision rows —
// or as unsplittable decision rows — would halt every migration on any repo that keeps one. The
// existing v2-index-fixture must stay green, and this pins WHY.
console.log("\n[batch-table: a bare-id archive-INDEX row is not a decision row]");
{
  const dir = stageFixture("v2-index-fixture");
  const r = run([TOOL, "migrate", dir], dir);
  assert("bare-id rows: the archive index's own rows do not register as decision rows",
    r.code === 0 && !/cannot be split/.test(r.out), r.out);
  assert("bare-id rows: the index is still read for gap reasons, as before",
    /^D-002 GAP->stub \(reason carried from the archive index\)/m.test(r.out), r.out);
  nuke(dir);
}

// §3.6.5 binds the new source type exactly like any other: an uncommitted monolith cannot be
// byte-verified against a HEAD blob that does not exist, so it refuses rather than guesses.
console.log("\n[batch-table: an uncommitted monolith is RED like any other unverifiable source]");
{
  const dir = stageFixture("v2-batch-table-fixture");
  // A second, harmless tracked source with one real entry. Without it, this fixture's ONLY source
  // is the monolith, and untracking it hits a PRE-EXISTING short-circuit in cmdMigrate — `if
  // (!ids.length) die("no \`## D-NNN\` entries found in any source")` fires before `problems` is
  // ever printed whenever EVERY source is unverifiable (reproduced identically on a plain
  // heading-style v2-fixture with its sole DECISIONS.md untracked — nothing to do with table rows).
  // That is a real finding, noted on the PR and left unfixed as out of scope for T0b; this test
  // isolates what it IS scoped to prove — that a table-row source goes through the same HEAD-blob
  // gate as any other — by giving the run a second source so the normal `problems` path is taken.
  writeFileSync(join(dir, "coordination", "decisions", "DECISIONS.md"),
    "# Decisions Log\n\n## D-011 — filler entry so this repo has one other verifiable source\n2026-06-11 • x • filler\n", "utf8");
  commit(dir, "add a second, harmless tracked source");
  sh("git", ["rm", "-q", "--cached", "coordination/decisions/archive/DECISIONS-ARCHIVE-D001-D010.md"], dir);
  sh("git", ["commit", "-q", "-m", "seed: untrack the monolith while it stays on disk"], dir);
  const r = run([TOOL, "migrate", dir], dir);
  assert("batch-table: untracked monolith is RED (exit 1)", r.code === 1, r.out);
  assert("batch-table: the RED names HEAD-blob verification",
    /DECISIONS-ARCHIVE-D001-D010\.md: untracked in HEAD/.test(r.out), r.out);
  assert("batch-table: nothing was written", !existsSync(join(dir, "coordination", "decisions", "d")), r.out);
  nuke(dir);
}

// End to end: migrate -> index -> check converges clean on a fully table-row-sourced repo, proving
// the new extraction path composes with every existing §3.6 check unmodified.
console.log("\n[batch-table: migrate -> index -> check is green end to end]");
{
  const dir = stageFixture("v2-batch-table-fixture");
  fixBatchTableFixture(dir);
  run([TOOL, "migrate", dir, "--write"], dir);
  writeFileSync(join(dir, "coordination", ".doclint.json"), JSON.stringify({
    version: 3,
    families: { D: { mode: "directory", dir: "decisions/d", index: "decisions/DECISIONS.md" }, B: { mode: "file" }, I: { mode: "file" } },
    thresholds: {},
  }, null, 2) + "\n", "utf8");
  run([TOOL, "index", dir], dir);
  commit(dir, "migrate to directory mode");
  const post = check(dir);
  assert("batch-table: check is green on the migrated result (10 ids, D-001..D-010)",
    post.code === 0 && /10 ids, D-001\.\.D-010/.test(post.out), post.out);
  nuke(dir);
}

// handoff-scaffold: idempotence and byte-preservation outside GEN blocks.
console.log("\n[handoff-scaffold]");
{
  const dir = stageFixture("v3-fixture");
  const hp = join(dir, "coordination", "HANDOFF.md");
  const original = readFileSync(hp, "utf8");
  const r1 = run([SCAFFOLD, dir], dir);
  assert("scaffold: first run exits 0", r1.code === 0, r1.out);
  assert("scaffold: prints `HANDOFF: <before>B -> <after>B`", /^HANDOFF: \d+B -> \d+B/m.test(r1.out), r1.out);
  const after1 = readFileSync(hp, "utf8");
  const r2 = run([SCAFFOLD, dir], dir);
  const after2 = readFileSync(hp, "utf8");
  assert("scaffold: second consecutive run changes 0 bytes", after1 === after2,
    "second run altered the file — the generator is not idempotent");
  assert("scaffold: second run reports 0B changed", /0B changed/.test(r2.out), r2.out);

  // Everything outside the GEN blocks survives byte-for-byte.
  const strip = (t) => t.replace(/<!-- GEN:[a-z-]+ -->[\s\S]*?<!-- \/GEN -->/g, "<BLOCK>");
  assert("scaffold: every byte outside GEN blocks is preserved", strip(original) === strip(after1),
    "content outside the GEN blocks changed");
  assert("scaffold: block markers are preserved",
    (after1.match(/<!-- GEN:[a-z-]+ -->/g) || []).length === (original.match(/<!-- GEN:[a-z-]+ -->/g) || []).length, after1);

  // A hand edit inside a block is owned by the generator and must be overwritten.
  writeFileSync(hp, after1.replace("<!-- GEN:claims -->", "<!-- GEN:claims -->\nhand-written junk"), "utf8");
  run([SCAFFOLD, dir], dir);
  assert("scaffold: a hand edit inside a block is overwritten", !readFileSync(hp, "utf8").includes("hand-written junk"));

  // Missing markers = no-op with a notice, never an insertion.
  writeFileSync(hp, "# Handoff\n\nNo generated blocks here at all.\n", "utf8");
  const bare = readFileSync(hp, "utf8");
  const r3 = run([SCAFFOLD, dir], dir);
  assert("scaffold: no markers -> exit 0", r3.code === 0, r3.out);
  assert("scaffold: no markers -> file untouched", readFileSync(hp, "utf8") === bare, "the tool inserted blocks into a file that had none");
  assert("scaffold: no markers -> notice, not silence", /no GEN blocks/i.test(r3.out), r3.out);

  /* I-085 — only GEN:decisions projects something immutable; the other three snapshot state
     session-open re-runs before it reads the file. The tool does not refuse them (markers are
     opt-in per block and repos already carry them) but it must SAY SO, at the moment the stale
     copy is written. Both directions, because a notice that always fires is not a notice. */
  writeFileSync(hp, bare.replace(/$/, "\n<!-- GEN:decisions -->\n<!-- /GEN -->\n"), "utf8");
  const only = run([SCAFFOLD, dir], dir);
  assert("I-085: GEN:decisions alone draws no staleness note",
    only.code === 0 && !/snapshot mutable state/.test(only.out), only.out);

  for (const [blk, src] of [["state-delta", "git log"], ["claims", "open-PR state"], ["doclint", "a doclint run"]]) {
    writeFileSync(hp, bare.replace(/$/, `\n<!-- GEN:${blk} -->\n<!-- /GEN -->\n`), "utf8");
    const one = run([SCAFFOLD, dir], dir);
    assert(`I-085: GEN:${blk} draws the staleness note, naming ${src}`,
      one.code === 0 && /snapshot mutable state/.test(one.out) && one.out.includes(src), one.out);
  }
  nuke(dir);
}

// GEN:decisions is a VIEW inside HANDOFF's 8,000B always-read budget. A migration commit mints a
// whole history at once — on business-club-ops P1, 152 rows ballooned HANDOFF to 28,649B — so
// the block caps at 12 rows, newest first, older tail elided BY COUNT with a pointer to the
// generated index. Cap the view, never the log.
console.log("\n[handoff-scaffold: GEN:decisions caps at 12 rows, newest first]");
{
  const dir = stageFixture("v3-fixture");
  // Mint 15 more decisions in one commit — the migration-shaped event.
  for (let n = 9; n <= 23; n++) {
    const id = `D-${String(n).padStart(3, "0")}`;
    writeFileSync(join(dir, "coordination", "decisions", "d", `${id}.md`),
      `---\nid: ${id}\ndate: 2026-08-26\nstatus: accepted\ntitle: bulk mint ${n}\n---\nBody of ${id}.\n`, "utf8");
  }
  run([TOOL, "index", dir], dir);
  commit(dir, "bulk mint, migration-shaped");
  const r = run([SCAFFOLD, dir], dir);
  assert("decisions cap: scaffold exits 0", r.code === 0, r.out);
  const h = readFileSync(join(dir, "coordination", "HANDOFF.md"), "utf8");
  const blk = (h.match(/<!-- GEN:decisions -->([\s\S]*?)<!-- \/GEN -->/) || [])[1] || "";
  const dataRows = (blk.match(/^\| D-\d{3} \|/gm) || []).length;
  assert("decisions cap: at most 12 data rows render", dataRows === 12, `rows=${dataRows}\n${blk}`);
  assert("decisions cap: the NEWEST mint is shown", /\| D-023 \|/.test(blk), blk);
  assert("decisions cap: the elided tail is counted, with a pointer to the index",
    /…and \d+ earlier mint\(s\) this close — every row resolves in the generated index/.test(blk), blk);
  const h2before = readFileSync(join(dir, "coordination", "HANDOFF.md"), "utf8");
  run([SCAFFOLD, dir], dir);
  assert("decisions cap: still idempotent (second run byte-identical)",
    readFileSync(join(dir, "coordination", "HANDOFF.md"), "utf8") === h2before, "second run changed bytes");
  nuke(dir);
}

console.log("\n" + "=".repeat(78));
console.log("CROSS-MODEL REVIEW REGRESSIONS — every finding, pinned");
console.log("=".repeat(78));

// R1. THE SILENT HOLE. `--diff-filter=A -n 1` returns the MOST RECENT add, so deleting an entry
// in one commit and re-adding the same path with rewritten prose in the next made the file its
// own baseline: original === current, VERDICT: clean, on rewritten prose. That is precisely the
// I-039 class this tool exists to close. The fix compares against the FIRST add.
console.log("\n[R1: delete-then-re-add must not launder a rewrite]");
{
  const dir = stageFixture("v3-fixture");
  const p = D(dir, "007");
  const before = readFileSync(p, "utf8");
  unlinkSync(p);
  run([TOOL, "index", dir], dir);
  commit(dir, "remove D-007");
  writeFileSync(p, before.replace("severs supersession chains", "REWRITTEN — original only in old history"), "utf8");
  run([TOOL, "index", dir], dir);
  commit(dir, "re-add D-007 with different prose");
  const r = check(dir);
  assert("R1: the rewrite is caught (exit 1)", r.code === 1, r.out);
  assert("R1: caught by immutability, against the FIRST add", /D-007\.md: body changed since it was minted/.test(r.out), r.out);
  assert("R1: the red names the delete-and-re-add", /path added 2x — deleted and re-added/.test(r.out), r.out);
  assert("R1: the red gives the recovery command", /Original text: `git show [0-9a-f]{7}:/.test(r.out), r.out);
  nuke(dir);
}

// R2. A committed body edit printed the SAME finding twice (HEAD arm + worktree arm).
console.log("\n[R2: one edit, one finding]");
{
  const dir = stageFixture("v3-fixture");
  const p = D(dir, "008");
  writeFileSync(p, readFileSync(p, "utf8").replace("look identical", "look the same"), "utf8");
  commit(dir, "edit a minted body");
  const r = check(dir);
  const hits = (r.out.match(/D-008\.md: body changed/g) || []).length;
  assert("R2: a committed edit reports exactly once", hits === 1, `reported ${hits}x:\n${r.out}`);
  nuke(dir);
}

// R3. migrate's all-or-nothing was false on a re-run: non-colliding entries were written while
// the run exited 1, and the remediation it printed (`git checkout --`) cannot remove untracked
// files, so a half-migrated tree was left behind under a failure message.
console.log("\n[R3: migrate --write is genuinely all-or-nothing]");
{
  const dir = stageFixture("v2-fixture");
  const w1 = run([TOOL, "migrate", dir, "--write"], dir);
  assert("R3: first --write succeeds", w1.code === 0, w1.out);
  const dd = join(dir, "coordination", "decisions", "d");
  const after1 = readdirSync(dd).sort();
  commit(dir, "migrate");
  // Add a NEW entry to the source, then re-run: the old ids collide, the new one does not.
  const src = join(dir, "coordination", "decisions", "DECISIONS.md");
  writeFileSync(src, readFileSync(src, "utf8") +
    "\n## D-007 — An entry added after the first migration\n2026-08-25 • x • body\n", "utf8");
  commit(dir, "append D-007 to the v2 source");
  const w2 = run([TOOL, "migrate", dir, "--write"], dir);
  assert("R3: the re-run fails (exit 1)", w2.code === 1, w2.out);
  assert("R3: it says nothing was written", /nothing written/i.test(w2.out), w2.out);
  assert("R3: and NOTHING was written — no new file appeared",
    readdirSync(dd).sort().join(",") === after1.join(","),
    `before: ${after1.join(",")}\nafter:  ${readdirSync(dd).sort().join(",")}`);
  assert("R3: it does not advise `git checkout --`, which cannot remove untracked files",
    !/git checkout --/.test(w2.out), w2.out);
  nuke(dir);
}

// R4. A UTF-8 BOM (silently added by Windows editors) rejected a well-formed entry, and that one
// spurious red then SKIPPED index-fresh for every entry while printing the word "OK".
console.log("\n[R4: BOM tolerated; a skipped check never prints OK]");
{
  const dir = stageFixture("v3-fixture");
  const p = D(dir, "001");
  writeFileSync(p, "\uFEFF" + readFileSync(p, "utf8"), "utf8");
  const r = check(dir);
  assert("R4: a BOM'd entry still parses (exit 0)", r.code === 0, r.out);
  assert("R4: frontmatter-valid does not fire on it", !/does not start with a `---`/.test(r.out), r.out);

  // And the reporting fix: a genuinely skipped check must read SKIP, never OK.
  const d2 = stageFixture("v3-fixture");
  writeFileSync(D(d2, "001"), "this file has no frontmatter at all\n", "utf8");
  const r2 = check(d2);
  assert("R4: index-fresh reads SKIP, not OK, when it could not run", /index-fresh\s+SKIP/.test(r2.out), r2.out);
  assert("R4: the verdict says a check did not run", /DID NOT RUN/.test(r2.out) || /VIOLATION/.test(r2.out), r2.out);
  nuke(dir);
  nuke(d2);
}

// R5. A projected value containing block-marker syntax terminated the block early, so each render
// re-wrapped the orphan and the file grew forever. The loop refused correctly — but refusing is
// worse than not breaking.
console.log("\n[R5: marker syntax in projected content cannot break a block]");
{
  const dir = stageFixture("v3-fixture");
  writeFileSync(join(dir, "coordination", "decisions", "d", "D-009.md"),
    ["---", "id: D-009", "date: 2026-08-26", "status: accepted",
     "title: An entry whose title contains " + CLOSE_MARKER, "---",
     "## D-009 — marker in the title", "2026-08-26 - x - body", ""].join("\n"), "utf8");
  run([TOOL, "index", dir], dir);
  commit(dir, "mint a decision with marker syntax in its title");
  const r1 = run([SCAFFOLD, dir], dir);
  assert("R5: the scaffold converges (exit 0)", r1.code === 0, r1.out);
  const a = readFileSync(join(dir, "coordination", "HANDOFF.md"), "utf8");
  run([SCAFFOLD, dir], dir);
  assert("R5: and is still idempotent", readFileSync(join(dir, "coordination", "HANDOFF.md"), "utf8") === a);
  assert("R5: block markers are still balanced",
    (a.match(/<!-- GEN:[a-z-]+ -->/g) || []).length === (a.match(/<!-- \/GEN -->/g) || []).length, a);
  nuke(dir);
}

console.log("\n" + "=".repeat(78));
console.log("v2 PARITY — a repo that has not opted in must see byte-identical output");
console.log("=".repeat(78));
// `doclint-v2-baseline.mjs` is the pre-v3 script, frozen here as an ORACLE. Parity was proven by
// hand once; freezing it makes the proof re-runnable, so a future edit that quietly changes v2
// behaviour fails here instead of on somebody's unrelated repo. Both scripts run back-to-back on
// the same tree in the same second: doclint shells out to `gh`, so comparing a fresh run against
// a stored transcript would diff live PR state, not the code change.
{
  const BASE = join(HERE, "doclint-v2-baseline.mjs");
  const NEW = join(REFS, "doclint.mjs");
  const cases = [
    ["no .doclint.json at all", null],
    ["a v2-style config with an override", { thresholds: { DECISIONS: 60000 } }],
    ["a v2 config carrying the v3-only key", { version: 2, thresholds: { DECISIONS_INDEX: 99 } }],
    ["a config that is not valid JSON", "{ broken"],
  ];
  for (const [label, cfg] of cases) {
    const dir = mkdtempSync(join(tmpdir(), "parity-"));
    const c = join(dir, "coordination");
    execFileSync("node", ["-e", `require("fs").mkdirSync(${JSON.stringify(c)},{recursive:true})`]);
    writeFileSync(join(c, "HANDOFF.md"), "# Handoff\n\nCurrent state, one paragraph.\n", "utf8");
    writeFileSync(join(c, "BLOCKERS.md"), "# Blockers\n\nNone open.\n", "utf8");
    writeFileSync(join(c, "ROADMAP.md"), "# Roadmap\n\n## Active\n- a thing\n", "utf8");
    writeFileSync(join(c, "DECISIONS.md"), "# Decisions\n\n## D-001 — a decision\n2026-01-01 • x • why\n", "utf8");
    writeFileSync(join(c, "IMPROVEMENTS.md"), "# Improvements\n\n## I-001 — an idea\n", "utf8");
    if (cfg !== null) writeFileSync(join(c, ".doclint.json"), typeof cfg === "string" ? cfg : JSON.stringify(cfg), "utf8");
    const a = run([BASE, dir], dir);
    const b = run([NEW, dir], dir);
    assert(`v2 parity: ${label}`, a.out === b.out && a.code === b.code,
      a.out === b.out ? `exit ${a.code} vs ${b.code}` : diffFirst(a.out, b.out));
    nuke(dir);
  }
}

console.log("\n" + "=".repeat(78));
console.log("doclint v3 — gated additions");
console.log("=".repeat(78));
{
  const dir = stageFixture("v3-fixture");
  const r = run([join(REFS, "doclint.mjs"), dir], dir);
  assert("doclint v3: exit 0 (informational, always)", r.code === 0, r.out);
  assert("doclint v3: the index row is measured, not the record", /^DECISIONS_IDX\s+\d+/m.test(r.out), r.out);
  assert("doclint v3: the record is reported UNCAPPED", /D family: directory mode — 8 entries, \d+B .*UNCAPPED/.test(r.out), r.out);
  assert("doclint v3: mint-rate line is present in directory mode", /^D minted, trailing 14 days: \d+$/m.test(r.out), r.out);
  assert("doclint v3: always-loaded repo layer is reported",
    /^always-loaded \(repo\): CLAUDE\.md \+ INDEX\.md = \d+B/m.test(r.out), r.out);
  assert("doclint v3: no DECISIONS content-cap flag (the record is uncapped)",
    !/DECISIONS\.md \d+B over/.test(r.out), r.out);

  // The index cap is overridable, and an override is ECHOED — a silently-raised cap is worse
  // than no cap.
  const cfgP = join(dir, "coordination", ".doclint.json");
  const cfg = JSON.parse(readFileSync(cfgP, "utf8"));
  cfg.thresholds = { DECISIONS_INDEX: 500 };
  writeFileSync(cfgP, JSON.stringify(cfg, null, 2), "utf8");
  const r2 = run([join(REFS, "doclint.mjs"), dir], dir);
  assert("doclint v3: DECISIONS_INDEX override is honoured", /DECISIONS_IDX\s+\d+\s+\d+\s+\d+\s+\d+\s+OVER/.test(r2.out), r2.out);
  assert("doclint v3: the override is echoed", /DECISIONS_INDEX 48000->500/.test(r2.out), r2.out);
  assert("doclint v3: index breach says SHARD, never delete rows", /SHARD the generator.*never delete rows/.test(r2.out), r2.out);

  // The near-cap streak greps "section-close:" — the 2026-08-26 title change dropped the leading
  // D-NNN from close commits, so this asserts the anchor was never the D prefix.
  sh("git", ["commit", "-q", "--allow-empty", "-m", "section-close: fixture sweep"], dir);
  const found = sh("git", ["log", "-i", "--grep=section-close:", "-n", "1", "--format=%s"], dir).trim();
  assert("streak anchor: a D-NNN-less close commit is still matched by --grep=section-close:",
    found === "section-close: fixture sweep", `matched: ${found}`);
  nuke(dir);
}

// I-081. §Shipped is newest-first (D-170 Rule 1). The archive-and-insert move — drop the oldest
// entry, write the new one — lands the NEW entry in the gap the archived one left, i.e. LAST.
// That happened on three consecutive launch-uk closes (2026-09-21/22/23) and was caught all three
// times by reading the headings back, never by a check. Each was fixed before its commit, so git
// history holds no instance: the defect below is the observed shape, not a found artefact.
{
  console.log("\n[doclint ROADMAP: §Shipped date order (I-081)]");
  const dir = stageFixture("v3-fixture");
  const rp = join(dir, "coordination", "ROADMAP.md");
  // The shipped shape, copied from launch-uk: prose title, then a date RANGE ("2026-09-23/24")
  // near the end, then refs — not a bare leading date. A checker tuned to `### <iso> — …` reads
  // clean against the fixture and blind against the file it ships on.
  const A = "The oldest blocker closed, and two guards — 2026-09-23/24 (D-218..D-221; PRs #329-#332)";
  const B = "Two tools, and the funnel made falsifiable — 2026-09-22/23 (D-207..D-215; PRs #310-#327)";
  const C = "The operator answered D-198 — 2026-09-21 (D-205; PRs #306-#308)";
  const shipped = (...heads) =>
    "# Roadmap\n\n## Active\n- a thing\n\n## Shipped\n" +
    heads.map((h) => `### ${h}\nA pointer, not a retelling.\n`).join("\n") +
    "\n### Earlier shipped work — archived, three files\n";

  writeFileSync(rp, shipped(A, B, C), "utf8");
  const ok = run([join(REFS, "doclint.mjs"), dir], dir);
  assert("ROADMAP order: newest-first is silent (real heading shape, trailing dateless entry)",
    !/out of date order/.test(ok.out), ok.out);

  // The slip: newest entry written into the slot the archived (oldest) entry vacated.
  writeFileSync(rp, shipped(B, C, A), "utf8");
  const bad = run([join(REFS, "doclint.mjs"), dir], dir);
  assert("ROADMAP order: the archive-and-insert slip FLAGS",
    /ROADMAP\.md §Shipped is out of date order: "2026-09-23" appears after "2026-09-21"/.test(bad.out), bad.out);
  assert("ROADMAP order: the flag cites D-170 Rule 1", /D-170 Rule 1/.test(bad.out), bad.out);

  // Undated headings are legitimate (the fixture's own §Shipped carries none), so they must not
  // anchor an ordering claim — only dated ones do.
  writeFileSync(rp, "# Roadmap\n\n## Active\n- a thing\n\n## Shipped\n### Index projection\n### Five-check ledger\n", "utf8");
  const undated = run([join(REFS, "doclint.mjs"), dir], dir);
  assert("ROADMAP order: undated §Shipped headings are not ordered", !/out of date order/.test(undated.out), undated.out);

  // RED: the section anchor is load-bearing. Dates falling outside §Shipped are ordinary history.
  writeFileSync(rp, "# Roadmap\n\n## Active\n### 2026-09-21 — older\n### 2026-09-23 — newer\n\n## Shipped\n- flat\n", "utf8");
  const elsewhere = run([join(REFS, "doclint.mjs"), dir], dir);
  assert("ROADMAP order mutation: out-of-order dates OUTSIDE §Shipped are ignored",
    !/out of date order/.test(elsewhere.out), elsewhere.out);
  nuke(dir);
}

// I-094. D-170 Rule 1 is a COUNT rule and a DATE rule; D-222 shipped only the date half, and launch-uk
// drifted to four entries in correct order with every gate green. The count is OPT-IN because a
// maximum is a policy choice (D-170 is one repo's ruling, absent from doc-thresholds and SKILL.md)
// while newest-first is a property of any reverse-chronological section. So the unset case is the
// one that must stay silent — a check that fires on repos that never asked for it is worse than none.
{
  console.log("\n[doclint ROADMAP: §Shipped entry COUNT, opt-in (I-094)]");
  const dir = stageFixture("v3-fixture");
  const rp = join(dir, "coordination", "ROADMAP.md");
  const cfgP = join(dir, "coordination", ".doclint.json");
  const cfg = JSON.parse(readFileSync(cfgP, "utf8"));
  const four = "# Roadmap\n\n## Active\n- a thing\n\n## Shipped\n" +
    ["2026-10-02", "2026-10-01", "2026-09-30", "2026-09-29"]
      .map((d) => `### A close — ${d} (D-NNN)\nA pointer.\n`).join("\n") +
    "\n### Earlier shipped work — archived, three files\nA pointer, no date.\n";
  writeFileSync(rp, four, "utf8");

  const unset = run([join(REFS, "doclint.mjs"), dir], dir);
  assert("I-094: four entries with no SHIPPED_ENTRIES set draws NO count flag",
    !/close entries \(>/.test(unset.out), unset.out);

  writeFileSync(cfgP, JSON.stringify({ ...cfg, thresholds: { ...(cfg.thresholds || {}), SHIPPED_ENTRIES: 3 } }), "utf8");
  const over = run([join(REFS, "doclint.mjs"), dir], dir);
  assert("I-094: four entries against a max of 3 FLAGS, naming both numbers",
    /§Shipped holds 4 close entries \(>3\)/.test(over.out), over.out);
  assert("I-094: the override is echoed like every other threshold",
    /SHIPPED_ENTRIES off->3/.test(over.out), over.out);

  // the dateless archive pointer is not an entry — three dated + the pointer must pass at max 3
  writeFileSync(rp, four.replace("### A close — 2026-09-29 (D-NNN)\nA pointer.\n\n", ""), "utf8");
  const exact = run([join(REFS, "doclint.mjs"), dir], dir);
  assert("I-094: the dateless archive pointer does not count toward the max",
    !/close entries \(>/.test(exact.out), exact.out);

  writeFileSync(cfgP, JSON.stringify({ ...cfg, thresholds: { ...(cfg.thresholds || {}), SHIPPED_ENTRIES: 0 } }), "utf8");
  const bad = run([join(REFS, "doclint.mjs"), dir], dir);
  assert("I-094: a non-positive SHIPPED_ENTRIES is rejected, not silently treated as off",
    /SHIPPED_ENTRIES" is not a positive integer/.test(bad.out), bad.out);
  nuke(dir);
}

console.log("\n[I-053: the override covers GENERATED bytes, and the base still binds the prose]");
{
  const dir = stageFixture("v3-fixture");
  const hp = join(dir, "coordination", "HANDOFF.md");
  const cfgP = join(dir, "coordination", ".doclint.json");
  const cfg = JSON.parse(readFileSync(cfgP, "utf8"));

  /* Two layers built to known sizes, so each assertion below is about ONE of them. The GEN block
     is what the raise is granted for; the prose outside it is what the base still governs. */
  /* Wrapped at 100B a line, NOT one long run: a single 9,000B line trips the mega-line rule, which
     IS blocking, and the advisory assertion below then failed on a pathology this fixture invented
     rather than on the thing under test. */
  const fill = (ch, n) => Array.from({ length: Math.ceil(n / 100) }, () => ch.repeat(100)).join("\n");
  const gen = (n) => `<!-- GEN:state-delta -->\n${fill("g", n)}\n${CLOSE_MARKER}\n`;
  const prose = (n) => `# Handoff\n\n## 1. Blockers\nnone\n\n## 2. State\n${fill("p", n)}\n`;
  const setCap = (v) => writeFileSync(cfgP,
    JSON.stringify({ ...cfg, thresholds: { ...(cfg.thresholds || {}), HANDOFF: v } }), "utf8");
  const lint = () => run([join(REFS, "doclint.mjs"), dir], dir);
  const HUMAN_FLAG = /human layer \d+B over the 8000B base bound/;

  /* 1. No override: the check must be SILENT even on a file far over base, because the total
        check already owns that case. A second cap firing here would double-report one breach. */
  writeFileSync(hp, prose(9000) + gen(500), "utf8");
  const noOverride = lint();
  assert("I-053: with no override the human-layer check stays silent (the total check owns it)",
    !HUMAN_FLAG.test(noOverride.out), noOverride.out);
  assert("I-053: and the ordinary OVER flag still fires, so the breach is not lost",
    /HANDOFF\.md \d+B over 8000B threshold/.test(noOverride.out), noOverride.out);

  /* 2. Override + prose over base: the case the whole entry exists for. */
  setCap(12000);
  const breach = lint();
  assert("I-053: a raised cap does not lift the base bound on prose",
    HUMAN_FLAG.test(breach.out), breach.out);
  assert("I-053: the flag names the raise it does not lift, and the generated bytes it excluded",
    /which the raise to 12000B does not lift \(generated: \d+B\)/.test(breach.out), breach.out);

  /* 2b. ADVISORY, not blocking, and asserted because the classification is the judgement.
         Its remedy is RELOCATE, NEVER SHRINK; blocking would force the trim-to-pass the check
         exists to catch, which is why the near-cap streak is soft too. Drop it from SOFT_FLAGS
         and this goes red. */
  const gated = run([join(REFS, "doclint.mjs"), dir, "--gate"], dir);
  assert("I-053: the human-layer flag is ADVISORY — blocking it would force trim-to-pass",
    /GATE: 0 blocking/.test(gated.out) && HUMAN_FLAG.test(gated.out), gated.out);
  assert("I-053: and --gate still exits 0 on it, so a close is not stalled by an honest breach",
    gated.code === 0, `exit ${gated.code}\n${gated.out}`);

  /* 3. THE ONE THAT PROVES THE SUBTRACTION. Prose UNDER base, generated bytes large enough that
        the TOTAL is over base. Without stripping GEN this flags; with it, it must not. */
  writeFileSync(hp, prose(5000) + gen(5000), "utf8");
  const genHeavy = lint();
  assert("I-053: generated bytes do not count against the base bound",
    !HUMAN_FLAG.test(genHeavy.out), genHeavy.out);
  assert("I-053: precondition — that file IS over the base, so the test is not vacuous",
    /HANDOFF +(\d+)/.test(genHeavy.out) && Number(genHeavy.out.match(/HANDOFF +(\d+)/)[1]) > 8000,
    genHeavy.out);

  nuke(dir);
}

// cf-site-harness#103 (operator ruling 2026-09-24): in v3, D-NNN refs are capped only where they do
// not belong — §State and §Reflection. §3's re-entry pointers and §4's constraints are free. The
// heading shape is launch-uk's (`## 2. State — …`), not a tidied one: a checker tuned to a clean
// fixture is blind on the file it ships on (launch-uk D-222, second instance in two days).
{
  console.log("\n[doclint HANDOFF: D-NNN refs capped by PLACEMENT, v3 only (cf-site-harness#103)]");
  const dir = stageFixture("v3-fixture");
  const hp = join(dir, "coordination", "HANDOFF.md");
  const refs = (n, from) => Array.from({ length: n }, (_, i) => `\`D-${String(from + i).padStart(3, "0")}\``).join(" · ");
  const handoff = ({ s2 = 0, s3 = 0, s4 = 0, s5 = 0, state = "## 2. State — where we are", refl = "## 5. Reflection — what changed" } = {}) =>
    "# Current State\n\n## 1. Blockers & urgencies\n- none\n\n" +
    `${state}\n- live. ${refs(s2, 100)}\n\n` +
    `## 3. Next actions — re-entry map\n1. re-read ${refs(s3, 200)}\n\n` +
    `## 4. Watch out — constraints\n- do not ${refs(s4, 300)}\n\n` +
    `${refl}\n\nWhat changed. ${refs(s5, 400)}\n`;
  const DOCLINT_BIN = join(REFS, "doclint.mjs");
  const lint = () => run([DOCLINT_BIN, dir], dir).out;

  writeFileSync(hp, handoff({ s3: 25, s4: 12 }), "utf8");
  const free = lint();
  assert("refs placement: 37 refs in §3 + §4 do NOT flag (the launch-uk shape)", !/D-NNN refs/.test(free), free);

  writeFileSync(hp, handoff({ s2: 11, s5: 10 }), "utf8");
  const capped = lint();
  assert("refs placement: 21 refs across §State + §Reflection FLAG",
    /HANDOFF\.md has 21 D-NNN refs \(>20\) in §State \+ §Reflection/.test(capped), capped);

  writeFileSync(hp, handoff({ s2: 10, s5: 10, s3: 30 }), "utf8");
  const edge = lint();
  assert("refs placement: exactly 20 in the capped sections is silent, whatever §3 holds", !/D-NNN refs/.test(edge), edge);

  // The heading match is by NAME, so the other in-the-wild shape (`## 2 · State`) counts too.
  writeFileSync(hp, handoff({ s2: 11, s5: 10, state: "## 2 · State — where we are", refl: "## 5 · Reflection" }), "utf8");
  const dot = lint();
  assert("refs placement: the template's `## 2 · State` heading shape is recognised", /21 D-NNN refs \(>20\) in §State/.test(dot), dot);

  // The variants a first reading named as silent escapes (blind review, Stage A): with one heading
  // recognised, an unrecognised sibling would be uncounted rather than falling back.
  for (const [state, refl] of [["## 2 — State", "## 5. Reflection"], ["## 2.1 State", "## 5. Reflection"],
                               ["## 2. Current State", "## 5. Reflection"], ["## 2. State", "## 5 - Reflections"]]) {
    writeFileSync(hp, handoff({ s2: 11, s5: 10, state, refl }), "utf8");
    const v = lint();
    assert(`refs placement: \`${state}\` + \`${refl}\` both counted (21 flags)`, /21 D-NNN refs \(>20\) in §State/.test(v), v);
  }

  // RED: with neither heading present, the whole-file count applies — an unrecognised file gets
  // the old flag, never a silent pass.
  writeFileSync(hp, handoff({ s3: 25, state: "## 2. Where things stand", refl: "## 5. Looking back" }), "utf8");
  const fallback = lint();
  assert("refs placement mutation: no State/Reflection heading → whole-file count, old flag",
    /HANDOFF\.md has 25 D-NNN refs \(>20\) — breadcrumb-trail collapse/.test(fallback), fallback);

  // Still advisory: the new wording must stay inside SOFT_FLAGS or --gate would start blocking.
  // Compared against the same file without the flag, so the fixture's other flags cancel out.
  const gateCounts = (out) => (out.match(/GATE: (\d+) blocking · (\d+) advisory/) || []).slice(1).map(Number);
  writeFileSync(hp, handoff({}), "utf8");
  const quiet = run([DOCLINT_BIN, dir, "--gate"], dir);
  writeFileSync(hp, handoff({ s2: 11, s5: 10 }), "utf8");
  const loud = run([DOCLINT_BIN, dir, "--gate"], dir);
  const [qb, qa] = gateCounts(quiet.out), [lb, la] = gateCounts(loud.out);
  assert("refs placement: the new flag is advisory under --gate (advisory +1, blocking and exit code unchanged)",
    /D-NNN refs/.test(loud.out) && lb === qb && la === qa + 1 && loud.code === quiet.code, quiet.out + "\n---\n" + loud.out);
  nuke(dir);
}
{
  // v2 parity: a repo without `"version": 3` keeps the whole-file count byte-for-byte.
  console.log("\n[doclint HANDOFF: v2 keeps the whole-file D-NNN count (parity)]");
  const dir = stageFixture("v2-fixture");
  const hp = join(dir, "coordination", "HANDOFF.md");
  const many = Array.from({ length: 25 }, (_, i) => `D-${String(500 + i)}`).join(" ");
  writeFileSync(hp, `# Current State\n\n## 2. State\n- ok\n\n## 3. Next actions\n1. ${many}\n`, "utf8");
  const r = run([join(REFS, "doclint.mjs"), dir], dir);
  assert("refs placement: v2 still flags 25 refs in §3 with the original wording",
    /HANDOFF\.md has 25 D-NNN refs \(>20\) — breadcrumb-trail collapse/.test(r.out) && !/§State \+ §Reflection/.test(r.out), r.out);
  nuke(dir);
}

console.log("\n" + "=".repeat(78));
console.log("FAMILY-GENERIC DIRECTORY MODE — PDR-011: the I family, both directions");
console.log("=".repeat(78));

const I = (dir, n) => join(dir, "coordination", "improvements", "i", `I-${n}.md`);
const DOCLINT = join(REFS, "doclint.mjs");

// Like mutation(), but against the dual-family fixture: the red must land in the I family's
// section while the D family stays fully green — per-family key sets must not bleed (T0c brief
// done-check 1).
function mutationI(name, checkName, seed, expectReason) {
  console.log(`\n[${name}]`);
  const clean = stageFixture("v3-i-fixture");
  const before = check(clean);
  assert(`${name}: clean dual-family fixture is GREEN (exit 0)`, before.code === 0, before.out);
  const dirty = stageFixture("v3-i-fixture");
  seed(dirty);
  const after = check(dirty);
  assert(`${name}: seeded violation is RED (exit 1)`, after.code === 1, after.out);
  const iAt = after.out.indexOf("[I family");
  const iSection = iAt === -1 ? "" : after.out.slice(iAt);
  const line = iSection.split("\n").find((l) => l.trim().startsWith(checkName));
  assert(`${name}: the RED is on the I family's "${checkName}" check`, !!line && /FAIL/.test(line),
    `check line was: ${line || "<not found>"}\n${after.out}`);
  assert(`${name}: the RED names the right reason`, expectReason.test(after.out),
    `expected /${expectReason.source}/ in:\n${after.out}`);
  const dAt = after.out.indexOf("[D family");
  const dSection = dAt === -1 || iAt === -1 ? "" : after.out.slice(dAt, iAt);
  assert(`${name}: the D family stayed fully green`, dSection !== "" && !/FAIL/.test(dSection), dSection || after.out);
  // Same discipline as mutation(): a seed that reds two I checks at once proves neither.
  const otherFails = iSection.split("\n")
    .filter((l) => /^\s{2}\S+\s+FAIL/.test(l) && !l.trim().startsWith(checkName))
    .map((l) => l.trim().split(/\s+/)[0]);
  assert(`${name}: no OTHER I check fired`, otherFails.length === 0, `also red: ${otherFails.join(", ")}`);
  nuke(clean);
  nuke(dirty);
}

// I body edit after mint -> immutability, in the I section, D untouched.
mutationI("I body edit after mint", "immutability", (dir) => {
  const p = I(dir, "001");
  writeFileSync(p, readFileSync(p, "utf8").replace("one less write amplifier", "fewer write amplifiers"), "utf8");
  commit(dir, "edit a minted improvement body");
}, /I-001\.md: body changed since it was minted in [0-9a-f]{7}/);

// I title edit -> immutability (title is NOT in I's mutable set).
mutationI("I title edit after mint", "immutability", (dir) => {
  const p = I(dir, "002");
  writeFileSync(p, readFileSync(p, "utf8").replace(/^title: An adopted idea whose work became a decision$/m,
    "title: A retitled idea"), "utf8");
  run([TOOL, "index", dir], dir);
  commit(dir, "retitle a minted improvement");
}, /I-002\.md: frontmatter `title` changed since it was minted/);

// I bogus status token -> frontmatter-valid (the closed set holds, note or no note).
mutationI("I status outside the closed set", "frontmatter-valid", (dir) => {
  const p = I(dir, "001");
  writeFileSync(p, readFileSync(p, "utf8").replace(/^status: proposed$/m, "status: maybe-later"), "utf8");
  run([TOOL, "index", dir], dir);
  commit(dir, "invent a status");
}, /I-001\.md: status `maybe-later` is outside the closed set \{proposed, adopted, declined, never-minted\}/);

// A stub's status is exact: `never-minted — note` passes the token check but would render as a
// live minted row while vanishing from the contiguity stub count — so validation refuses it.
mutationI("noted never-minted stub", "frontmatter-valid", (dir) => {
  const p = I(dir, "003");
  writeFileSync(p, readFileSync(p, "utf8").replace(/^status: never-minted$/m, "status: never-minted — id skipped at mint"), "utf8");
  run([TOOL, "index", dir], dir);
  commit(dir, "note a stub's status");
}, /I-003\.md: `never-minted` carries no status note — the reason lives in the stub's body/);

// G4 (D-155): a `status: proposed` I-NNN older than 14 days vs the repo reference date fails
// `proposal-expiry`, and passes once expired or re-affirmed.
mutationI("I proposal older than 14 days (D-155)", "proposal-expiry", (dir) => {
  const hp = join(dir, "coordination", "HANDOFF.md");
  writeFileSync(hp, readFileSync(hp, "utf8") + "\n**Updated:** 2026-09-05\n", "utf8");
  commit(dir, "advance HANDOFF date past 14-day TTL for I-001");
}, /I-001\.md: `status: proposed` date `2026-08-14` is 22d old vs repo ref `2026-09-05` \(> 14d D-155 TTL\)/);

console.log("\n[I proposal-expiry: re-affirming date or expiring as D-155 restores GREEN]");
{
  const dir = stageFixture("v3-i-fixture");
  const hp = join(dir, "coordination", "HANDOFF.md");
  writeFileSync(hp, readFileSync(hp, "utf8") + "\n**Updated:** 2026-09-05\n", "utf8");
  const p = I(dir, "001");
  writeFileSync(p, readFileSync(p, "utf8").replace(/^date: 2026-08-14$/m, "date: 2026-09-05"), "utf8");
  run([TOOL, "index", dir], dir);
  commit(dir, "re-affirm I-001 by bumping date");
  const reaffirmed = check(dir);
  assert("proposal-expiry: re-affirmed proposal with current date is GREEN", reaffirmed.code === 0, reaffirmed.out);

  writeFileSync(p, readFileSync(p, "utf8")
    .replace(/^date: 2026-09-05$/m, "date: 2026-08-14")
    .replace(/^status: proposed$/m, "status: declined — expired, un-championed (D-155)"), "utf8");
  run([TOOL, "index", dir], dir);
  commit(dir, "expire I-001 as declined — expired, un-championed (D-155)");
  const expired = check(dir);
  assert("proposal-expiry: expired proposal flipped to declined (D-155) is GREEN", expired.code === 0, expired.out);
  nuke(dir);
}

// The LEGAL side of D-177 ruling 1: editing an I entry's status AND date (with the index
// regenerated in the same commit) is a clean bill — that is the expiry/re-affirmation move.
console.log("\n[I status+date edit is LEGAL (D-177 ruling 1)]");
{
  const dir = stageFixture("v3-i-fixture");
  const p = I(dir, "001");
  writeFileSync(p, readFileSync(p, "utf8")
    .replace(/^status: proposed$/m, "status: declined — expired, un-championed (D-155)")
    .replace(/^date: 2026-08-14$/m, "date: 2026-08-27"), "utf8");
  run([TOOL, "index", dir], dir);
  commit(dir, "expire an improvement: status+date flip, index in the same commit");
  const r = check(dir);
  assert("I mutable keys: status+date edit + regenerated index is GREEN", r.code === 0, r.out);
  assert("I mutable keys: the status note survives into the projection",
    readFileSync(join(dir, "coordination", "improvements", "IMPROVEMENTS.md"), "utf8").includes("declined — expired, un-championed (D-155)"),
    "the index does not carry the status note");
  nuke(dir);
}

// The key sets must not bleed the OTHER way: a D entry's date stays immutable even while I's is
// mutable in the same repo, same run.
console.log("\n[D date edit stays a violation in a dual-family repo]");
{
  const dir = stageFixture("v3-i-fixture");
  const p = join(dir, "coordination", "decisions", "d", "D-001.md");
  writeFileSync(p, readFileSync(p, "utf8").replace(/^date: 2026-08-20$/m, "date: 2026-08-27"), "utf8");
  run([TOOL, "index", dir], dir);
  commit(dir, "bump a decision's date");
  const r = check(dir);
  assert("D key set: a D date edit is RED (exit 1)", r.code === 1, r.out);
  assert("D key set: the RED is on D's immutability, naming `date`",
    /D-001\.md: frontmatter `date` changed since it was minted/.test(r.out), r.out);
  const iAt = r.out.indexOf("[I family");
  assert("D key set: the I family stayed fully green", iAt !== -1 && !/FAIL/.test(r.out.slice(iAt)), r.out);
  nuke(dir);
}

// index CLI over two families: one line each, and regeneration is byte-identical for both.
console.log("\n[dual-family index]");
{
  const dir = stageFixture("v3-i-fixture");
  const dBefore = readFileSync(IDX(dir), "utf8");
  const iBefore = readFileSync(join(dir, "coordination", "improvements", "IMPROVEMENTS.md"), "utf8");
  const r = run([TOOL, "index", dir], dir);
  assert("dual index: exit 0", r.code === 0, r.out);
  assert("dual index: prints one line per family", /^D index: 2 entries, \d+ bytes$/m.test(r.out) && /^I index: 4 entries, \d+ bytes$/m.test(r.out), r.out);
  assert("dual index: D regeneration is byte-identical", readFileSync(IDX(dir), "utf8") === dBefore, "D index changed");
  assert("dual index: I regeneration is byte-identical",
    readFileSync(join(dir, "coordination", "improvements", "IMPROVEMENTS.md"), "utf8") === iBefore, "I index changed");
  nuke(dir);
}

// migrate --family I: both wild formats extracted, archive text wins by length, the fenced
// example never mints, and the end state converges to a clean check.
console.log("\n[migrate --family I: heading + inline formats, archive bodies, end to end]");
{
  const dir = stageFixture("v2-i-fixture");
  const dry = run([TOOL, "migrate", dir, "--family", "I"], dir);
  assert("I migrate: dry-run exit 0", dry.code === 0, dry.out);
  assert("I migrate: heading-form entry extracted", /^I-001 OK \(bytes=\d+\) coordination\/IMPROVEMENTS\.md/m.test(dry.out), dry.out);
  assert("I migrate: bold-inline one-liner extracted", /^I-005 OK \(bytes=\d+\) coordination\/IMPROVEMENTS\.md/m.test(dry.out), dry.out);
  assert("I migrate: struck pointer loses to the archive's full text",
    /^I-004 OK \(bytes=\d+\) coordination\/archive\/2026-08-improvements-snapshot\.md \[also in coordination\/IMPROVEMENTS\.md \(\d+B\) — longest body kept\]/m.test(dry.out), dry.out);
  assert("I migrate: struck inline pointer loses to the archive too",
    /^I-006 OK \(bytes=\d+\) coordination\/archive\/2026-08-improvements-snapshot\.md/m.test(dry.out), dry.out);
  assert("I migrate: the gap becomes a stub", /^I-003 GAP->stub \(no entry in any source\)/m.test(dry.out), dry.out);
  assert("I migrate: the fenced I-099 template is never extracted", !/I-099/.test(dry.out), dry.out);

  const w = run([TOOL, "migrate", dir, "--family", "I", "--write"], dir);
  assert("I migrate --write: exit 0, read-back verified", w.code === 0 && /verified byte-identical on read-back/.test(w.out), w.out);
  const i002 = readFileSync(I(dir, "002"), "utf8");
  assert("I migrate: a decline with prose migrates as the bare token (nuance stays in the body)",
    /^status: declined$/m.test(i002) && i002.includes("the wrapper is the seam a later lane needs"), i002);
  const i004 = readFileSync(I(dir, "004"), "utf8");
  assert("I migrate: the archived adopted entry carries its archive body",
    /^status: adopted$/m.test(i004) && i004.includes("preserved verbatim"), i004);
  writeFileSync(join(dir, "coordination", ".doclint.json"), JSON.stringify({
    version: 3,
    families: { D: { mode: "file" }, B: { mode: "file" }, I: { mode: "directory", dir: "improvements/i", index: "improvements/IMPROVEMENTS.md" } },
    thresholds: {},
  }, null, 2) + "\n", "utf8");
  const idx = run([TOOL, "index", dir], dir);
  assert("I migrate -> index: exit 0", idx.code === 0, idx.out);
  commit(dir, "migrate I to directory mode");
  const post = check(dir);
  assert("I migrate -> check: green end to end (6 ids, I-001..I-006)",
    post.code === 0 && /6 ids, I-001\.\.I-006/.test(post.out), post.out);
  nuke(dir);
}

// An unmappable status token is a PROBLEM by id, never a silent default — a partial adoption is
// a judgment call, not a migration guess (the two real business-club-ops entries).
console.log("\n[migrate --family I: an unmappable status halts by name]");
{
  const dir = stageFixture("v2-i-fixture");
  const p = join(dir, "coordination", "IMPROVEMENTS.md");
  writeFileSync(p, readFileSync(p, "utf8") +
    "\n## I-007 — A partially adopted idea\n*Status: PARTIALLY ADOPTED 2026-08-23 -> D-099 · source: ad-hoc*\nHalf shipped, half proposed.\n", "utf8");
  commit(dir, "seed: a partial adoption");
  const r = run([TOOL, "migrate", dir, "--family", "I", "--write"], dir);
  assert("unmappable status: migrate is RED (exit 1)", r.code === 1, r.out);
  assert("unmappable status: the RED names I-007 and the token",
    /I-007 .*status token `PARTIALLY` maps to nothing/.test(r.out), r.out);
  assert("unmappable status: nothing was written",
    !existsSync(join(dir, "coordination", "improvements", "i")), "i/ was created despite the refusal");
  nuke(dir);
}

// The inline tolerance must NOT exist for D: a bold prose reference to a decision id stays prose.
console.log("\n[D migrate: a bold prose reference is not an entry]");
{
  const dir = stageFixture("v2-fixture");
  const p = join(dir, "coordination", "decisions", "DECISIONS.md");
  // In the PREAMBLE, before any heading — appended after the last heading it would be absorbed
  // into that entry's body span, which is correct extraction behaviour but proves nothing here.
  // The struck-id-only heading rides along: that tolerance is granted to the I corpus alone, and
  // for D it would mint a phantom accepted entry out of a tombstone pointer line.
  writeFileSync(p, readFileSync(p, "utf8")
    .replace("\n", "\nAlso **D-004** — see the archive snapshot for the palette reasoning.\n" +
      "\n## ~~D-100~~ moved to archive\n"), "utf8");
  commit(dir, "seed: a bold prose reference and a struck-id tombstone in the preamble");
  const r = run([TOOL, "migrate", dir], dir);
  assert("D inline: dry-run still exit 0", r.code === 0, r.out);
  // The preamble run widens to cover the seeded line (1-2) — proof it was claimed by NO entry.
  // NOT MIGRATED samples print only a run's first line, so the seeded text itself never appears.
  assert("D inline: the prose line lands in NOT MIGRATED, not in the entry set",
    /DECISIONS\.md:1-2 {2}# Decisions Log/.test(r.out), r.out);
  assert("D inline: extraction is otherwise undisturbed (D-004 still wins from the archive)",
    /^D-004 OK \(bytes=\d+\) coordination\/decisions\/archive\//m.test(r.out), r.out);
  assert("D tombstone: a struck-id-only heading does NOT mint a phantom entry or a gap walk to 100",
    !/D-100 (OK|GAP)/.test(r.out) && !/D-0[1-9]\d GAP/.test(r.out), r.out);
  nuke(dir);
}

// The inline discriminator: a bold I-id cross-reference INSIDE another entry's body has the
// entry shape but no lifecycle marker, and must stay prose — capturing it would truncate the
// enclosing entry's immutable record and mint a phantom competitor.
console.log("\n[I migrate: a bold cross-reference inside a body is not an entry]");
{
  const dir = stageFixture("v2-i-fixture");
  const p = join(dir, "coordination", "IMPROVEMENTS.md");
  writeFileSync(p, readFileSync(p, "utf8").replace(
    "Effort: S. Payoff: one less index to maintain on every write.",
    "Effort: S. Payoff: one less index to maintain on every write.\n" +
    "**I-002** — see the earlier proposal, which this extends.\n" +
    "The index is provably unused in every query plan."), "utf8");
  commit(dir, "seed: a bold cross-reference inside I-001's body");
  const w = run([TOOL, "migrate", dir, "--family", "I", "--write"], dir);
  assert("I cross-ref: migrate still succeeds", w.code === 0, w.out);
  const i001 = readFileSync(I(dir, "001"), "utf8");
  assert("I cross-ref: I-001's body is NOT truncated at the reference",
    i001.includes("see the earlier proposal") && i001.includes("provably unused"), i001);
  assert("I cross-ref: I-002's record is its own heading entry, not the one-liner",
    readFileSync(I(dir, "002"), "utf8").includes("One call site, zero logic"), w.out);
  nuke(dir);
}

// Flag position must not retarget the run, and flag validation must be own-property + closed.
console.log("\n[CLI: flag-first invocation still targets the given root]")
{
  const dir = stageFixture("v3-i-fixture");
  const r = run([TOOL, "check", "--family", "I", dir], dir);
  assert("flag-first: check --family I <root> targets <root> and is green",
    r.code === 0 && /improvements\/IMPROVEMENTS\.md matches regeneration/.test(r.out), r.out);
  const proto = run([TOOL, "check", dir, "--family", "toString"], dir);
  assert("prototype key: --family toString dies with the usage error, not a TypeError",
    proto.code === 1 && /--family needs one of: D, I/.test(proto.out) && !/TypeError/.test(proto.out), proto.out);
  const typo = run([TOOL, "check", dir, "--familly", "I"], dir);
  assert("unknown flag: a typo'd flag is an error, never a silent scope change",
    typo.code === 1 && /unknown flag --familly/.test(typo.out), typo.out);
  nuke(dir);
}

console.log("\n" + "=".repeat(78));
console.log("doclint — I directory mode, ratchet, ceiling (all v3-gated)");
console.log("=".repeat(78));
{
  const dir = stageFixture("v3-i-fixture");
  const r = run([DOCLINT, dir], dir);
  assert("doclint I: exit 0 (informational, always)", r.code === 0, r.out);
  assert("doclint I: the projection is measured as IMPROVEMENTS_IDX*", /^IMPROVEMENTS_IDX\*\s+\d+/m.test(r.out), r.out);
  assert("doclint I: the flat-file row is gone in directory mode", !/^IMPROVEMENTS\*\s/m.test(r.out), r.out);
  assert("doclint I: the record is reported UNCAPPED",
    /I family: directory mode — 4 entries, \d+B in improvements\/i\/ .*UNCAPPED/.test(r.out), r.out);

  const cfgP = join(dir, "coordination", ".doclint.json");
  const cfg = JSON.parse(readFileSync(cfgP, "utf8"));
  cfg.thresholds = { IMPROVEMENTS_INDEX: 300 };
  writeFileSync(cfgP, JSON.stringify(cfg, null, 2), "utf8");
  const r2 = run([DOCLINT, dir], dir);
  assert("doclint I: IMPROVEMENTS_INDEX override is honoured (OVER)", /IMPROVEMENTS_IDX\*\s+\d+\s+\d+\s+\d+\s+\d+\s+OVER/.test(r2.out), r2.out);
  assert("doclint I: the override is echoed", /IMPROVEMENTS_INDEX 8000->300/.test(r2.out), r2.out);
  assert("doclint I: an index breach says SHARD the generator, never delete rows",
    /IMPROVEMENTS index \d+B over 300B cap -> SHARD the generator/.test(r2.out), r2.out);
  nuke(dir);
}

console.log("\n[doclint ratchet: growth is red, hold is green, re-baseline is echoed]");
{
  const dir = stageFixture("v3-i-fixture");
  const seedR = run([DOCLINT, dir, "--write-ratchet"], dir);
  assert("ratchet: --write-ratchet with no baseline CREATES one", /baseline CREATED over \d+ measured file\(s\)/.test(seedR.out), seedR.out);
  assert("ratchet: the baseline file exists", existsSync(join(dir, "coordination", ".doclint-ratchet.json")), "no .doclint-ratchet.json");
  const hold = run([DOCLINT, dir], dir);
  assert("ratchet: holding steady is green (0 grew)", /ratchet: \d+ file\(s\) tracked · 0 grew/.test(hold.out) && !/RATCHET:/.test(hold.out), hold.out);
  const hp = join(dir, "coordination", "HANDOFF.md");
  writeFileSync(hp, readFileSync(hp, "utf8") + "\nA new paragraph that grows the file.\n", "utf8");
  const grew = run([DOCLINT, dir], dir);
  assert("ratchet: growth flags RATCHET with before -> after bytes", /RATCHET: HANDOFF\.md grew \d+B -> \d+B/.test(grew.out), grew.out);
  assert("ratchet: doclint still exits 0 (advisory; section-close's ACK gate enforces)", grew.code === 0, grew.out);
  const rb = run([DOCLINT, dir, "--write-ratchet"], dir);
  assert("ratchet: re-baseline is echoed as REWRITTEN", /baseline REWRITTEN to current sizes/.test(rb.out), rb.out);
  const after = run([DOCLINT, dir], dir);
  assert("ratchet: after re-baseline the flag clears (reachable green)", !/RATCHET:/.test(after.out), after.out);
  nuke(dir);
}

console.log("\n[doclint ceiling: 51,200B hard per-file cap, committed blob first]");
{
  const dir = stageFixture("v3-i-fixture");
  const clean = run([DOCLINT, dir], dir);
  assert("ceiling: the scan line reports files and the largest", /per-file ceiling: \d+ coordination\/ file\(s\) scanned · largest \S+ \d+B · hard cap 51200B/.test(clean.out), clean.out);
  assert("ceiling: no flag on a small fixture", !/CEILING:/.test(clean.out), clean.out);
  const big = join(dir, "coordination", "BIG.md");
  writeFileSync(big, "x".repeat(51201) + "\n", "utf8");
  const untracked = run([DOCLINT, dir], dir);
  assert("ceiling: an UNTRACKED oversized file still flags (worktree fallback)",
    /CEILING: coordination\/BIG\.md is \d+B — over the 51200B hard per-file ceiling/.test(untracked.out), untracked.out);
  commit(dir, "commit the oversized file");
  const tracked = run([DOCLINT, dir], dir);
  assert("ceiling: the committed oversized file flags (blob measurement)", /CEILING: coordination\/BIG\.md/.test(tracked.out), tracked.out);
  assert("ceiling: doclint still exits 0", tracked.code === 0, tracked.out);
  unlinkSync(big);
  commit(dir, "remove the oversized file");
  const gone = run([DOCLINT, dir], dir);
  assert("ceiling: removing the file clears the flag (reachable green)", !/CEILING:/.test(gone.out), gone.out);
  nuke(dir);
}

console.log("\n[doclint G5: checkStrandedDeferred flags un-routed ## Deferred bullets even after an intro paragraph]");
{
  const dir = stageFixture("v3-i-fixture");
  const sprintsDir = join(dir, "coordination", "sprints");
  execFileSync("node", ["-e", `require("fs").mkdirSync(${JSON.stringify(sprintsDir)},{recursive:true})`]);
  const runFile = join(sprintsDir, "ratchet-sample.md");

  // 1. In-flight run (P5 unchecked): scratchpad bullets are allowed without flag.
  writeFileSync(runFile, [
    "# Ratchet run — sample",
    "## Gates",
    "- [ ] P5 ratchet report emitted",
    "## Deferred (found mid-run, NOT this run)",
    "Introductory sentence explaining the scratchpad.",
    "",
    "- Unrouted item while still in P1-P4",
  ].join("\n") + "\n", "utf8");
  const inFlight = run([DOCLINT, dir], dir);
  assert("G5 deferred: in-flight run (P5 unchecked) does not flag", !/G5:/.test(inFlight.out), inFlight.out);

  // 2. Completed run (P5 checked) with intro paragraph + un-routed bullet -> FLAGS (and blocks --gate).
  writeFileSync(runFile, [
    "# Ratchet run — sample",
    "## Gates",
    "- [x] P5 ratchet report emitted",
    "## Deferred (found mid-run, NOT this run)",
    "Introductory sentence explaining the scratchpad.",
    "",
    "- Routed item → cleanup-triage.md (CT-01)",
    "- Stranded item after intro paragraph with no destination",
  ].join("\n") + "\n", "utf8");
  const stranded = run([DOCLINT, dir, "--gate"], dir);
  assert("G5 deferred: completed run with intro paragraph + un-routed bullet FLAGS and blocks --gate",
    stranded.code === 1 && /G5: coordination\/sprints\/ratchet-sample\.md has un-routed item\(s\) in `## Deferred`/.test(stranded.out),
    stranded.out);

  // 3. Completed run once every bullet is annotated with its single-intake destination -> GREEN.
  writeFileSync(runFile, [
    "# Ratchet run — sample",
    "## Gates",
    "- [x] P5 ratchet report emitted",
    "## Deferred (found mid-run, NOT this run)",
    "Introductory sentence explaining the scratchpad.",
    "",
    "- Routed item → cleanup-triage.md (CT-01)",
    "- Second item routed to GitHub Issue → Issue #42",
  ].join("\n") + "\n", "utf8");
  const routed = run([DOCLINT, dir, "--gate"], dir);
  assert("G5 deferred: completed run with all bullets routed is GREEN (exit 0)",
    routed.code === 0 && !/G5:/.test(routed.out), routed.out);
  nuke(dir);
}

function diffFirst(a, b) {
  const x = a.split("\n"), y = b.split("\n");
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    if (x[i] !== y[i]) return `line ${i + 1}:\n  v2: ${x[i]}\n  v3: ${y[i]}`;
  }
  return "outputs differ in length only";
}

console.log("\n[contiguity ceiling: anchored on the MERGE BASE, not the working state (I-126)]");
{
  const dir = stageFixture("v3-i-fixture");
  // The fixture's single commit is on `main`, so a branch is required for a merge base to
  // exist at all. Without one, HEAD IS the base and this whole arm is inert by design.
  sh("git", ["checkout", "-q", "-b", "feature"], dir);

  // GREEN first. An untouched branch must still pass, or the anchor is a wall: every PR would
  // red on a ceiling nobody moved.
  const untouched = check(dir);
  assert("ceiling: an untouched branch still passes", untouched.code === 0, untouched.out);

  // Adding the next id must also pass — the ceiling is a FLOOR, not an equality test.
  writeFileSync(I(dir, "005"), readFileSync(I(dir, "004"), "utf8").replace(/I-004/g, "I-005"), "utf8");
  run([TOOL, "index", dir], dir);
  commit(dir, "mint I-005");
  const grew = check(dir);
  assert("ceiling: minting the next id passes (floor, not equality)", grew.code === 0, grew.out);

  // Deleting an entry MINTED ON THIS BRANCH is legitimate — from the base it never existed,
  // and the net effect on main is nothing. Asserted so nobody "fixes" the floor into a rule
  // that forbids abandoning a mint mid-PR.
  unlinkSync(I(dir, "005"));
  run([TOOL, "index", dir], dir);
  commit(dir, "abandon the mint made on this branch");
  const abandoned = check(dir);
  assert("ceiling: abandoning an id minted on the same branch is allowed", abandoned.code === 0, abandoned.out);

  nuke(dir);
}

{
  // The attack itself, on its own fixture so it cannot pass for a neighbouring reason: delete
  // the highest entry THAT EXISTS AT THE BASELINE, and regenerate the index. Before I-126 the
  // ceiling fell to I-003 with it, the gap loop never reached I-004, and index-fresh passed
  // because the projection matched the reduced record set — green on both guards, measured.
  const dir = stageFixture("v3-i-fixture");
  sh("git", ["checkout", "-q", "-b", "feature"], dir);
  unlinkSync(I(dir, "004"));
  run([TOOL, "index", dir], dir);
  commit(dir, "delete the highest baseline entry and regenerate the index");

  const raided = check(dir);
  assert("ceiling: deleting the highest BASELINE entry + regenerating the index is caught", raided.code === 1, raided.out);
  // Red for the RIGHT reason: the contiguity arm naming I-004, not some unrelated arm.
  assert("ceiling: the violation names the vanished id and its arm", /I-004/.test(raided.out) && /contiguity/.test(raided.out), raided.out);
  nuke(dir);
}

console.log("\n[doclint --gate: the CI arm, default-deny severity]");
{
  const dir = stageFixture("v3-i-fixture");

  // The GREEN path first. A gate with no reachable green is a wall, and the wall is what a
  // team routes around — so this assertion is the load-bearing one, not the failure below.
  const clean = run([DOCLINT, dir, "--gate"], dir);
  assert("gate: a clean fixture passes and says so", clean.code === 0 && /GATE: 0 blocking/.test(clean.out), clean.out);

  // Without --gate the script stays a reporter, whatever it found. Session-close depends on it.
  const big = join(dir, "coordination", "BIG.md");
  writeFileSync(big, "x".repeat(51201) + "\n", "utf8");
  const reporter = run([DOCLINT, dir], dir);
  assert("gate: absent --gate, a hard breach still exits 0 (reporter mode intact)",
    reporter.code === 0 && !/GATE:/.test(reporter.out), reporter.out);

  // A hard breach blocks.
  const gated = run([DOCLINT, dir, "--gate"], dir);
  assert("gate: a hard breach exits 1", gated.code === 1, gated.out);
  assert("gate: the blocking count is reported, not just the exit code", /GATE: [1-9]\d* blocking/.test(gated.out), gated.out);
  unlinkSync(big);

  // DEFAULT-DENY, proven rather than asserted in a comment: a flag the soft list does not
  // name must block. An unknown flag is the case that decides whether this gate erodes — if
  // new flags defaulted to advisory, the gate would quietly stop gating as the linter grows.
  const dead = join(dir, "coordination", "HANDOFF.md");
  const handoff = readFileSync(dead, "utf8");
  writeFileSync(dead, handoff + "\n\nSee [gone](coordination/NO-SUCH-FILE.md).\n", "utf8");
  const deadRef = run([DOCLINT, dir, "--gate"], dir);
  assert("gate: a dead always-read reference blocks (default-deny)", deadRef.code === 1, deadRef.out);
  writeFileSync(dead, handoff, "utf8");

  // NOT asserted here, deliberately: `doclint.mjs --gate` with no root argument. It reads
  // "--gate" as the root, and `findCoordDir` resolves that to <cwd>/--gate and walks UP to
  // <cwd>, finding the same coordination/ dir — so the behaviour is identical either way. A
  // guard was written for it, then deleted along with the arg-parsing change it protected,
  // because a mutation reverting that change killed nothing. A test that cannot fail is the
  // defect this block exists to prevent, not one to ship inside it.
  nuke(dir);
}

// ---------------------------------------------------------------- split projection (B-030/D-219)
//
// The I index reached its 20,000 B cap. D-219 ruled that a v3 RECORD cannot be archived — moving an
// entry file out of `i/` satisfies the cap and turns contiguity RED — so only the PROJECTION may be
// sharded. `archiveIndex` opts a family into two pages: live rows and settled rows, every file
// staying exactly where it was. These proofs pin the three properties that make that safe.

const ARCHIVE_REL = "improvements/IMPROVEMENTS-archive.md";
const livePath = (dir) => join(dir, "coordination", "improvements", "IMPROVEMENTS.md");
const archivePath = (dir) => join(dir, "coordination", "improvements", "IMPROVEMENTS-archive.md");
const rowIds = (s) => (s.match(/^\| (I-\d{3,4}) \|/gm) || []).map((r) => r.replace(/^\| /, "").replace(/ \|$/, ""));

function stageSplitFixture() {
  const dir = stageFixture("v3-i-fixture");
  const cfgPath = join(dir, "coordination", ".doclint.json");
  const cfg = JSON.parse(readFileSync(cfgPath, "utf8"));
  cfg.families.I.archiveIndex = ARCHIVE_REL;
  writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  run([TOOL, "index", dir], dir);
  commit(dir, "opt the I family into a split projection");
  return dir;
}

{
  console.log("\n[split projection: terminal rows shard to a settled page (B-030 / D-219)]");
  const dir = stageSplitFixture();
  const live = readFileSync(livePath(dir), "utf8");
  const arch = existsSync(archivePath(dir)) ? readFileSync(archivePath(dir), "utf8") : "";
  assert("split: the settled page is written", arch !== "", "no settled page emitted");
  assert("split: a proposed row stays LIVE",
    /^\| I-001 \|/m.test(live) && !/^\| I-001 \|/m.test(arch), `live:\n${live}\nsettled:\n${arch}`);
  assert("split: an adopted row moves to the settled page",
    /^\| I-002 \|/m.test(arch) && !/^\| I-002 \|/m.test(live), `live:\n${live}\nsettled:\n${arch}`);
  // The discriminating member. I-004's status is `declined — expired, un-championed (D-155)`. A
  // partition comparing the RAW status never equals `declined`, so it leaves I-004 live forever —
  // and stays green on I-002, the row that CANNOT tell the two folds apart. Pick the slice that
  // disagrees: this assertion is what makes statusToken() load-bearing rather than decorative.
  assert("split: a terminal row carrying a status NOTE also moves (the fold, not the raw string)",
    /^\| I-004 \|/m.test(arch) && !/^\| I-004 \|/m.test(live), `live:\n${live}\nsettled:\n${arch}`);
  assert("split: the never-minted stub line stays on the live page (contiguity bookkeeping)",
    /never-minted id\(s\)/.test(live) && !/never-minted id\(s\)/.test(arch), `live:\n${live}\nsettled:\n${arch}`);
  const all = [...rowIds(live), ...rowIds(arch)].sort();
  assert("split: the partition is lossless and disjoint (every minted id on exactly one page)",
    all.length === 3 && new Set(all).size === 3 && all.join(",") === "I-001,I-002,I-004",
    `live=${rowIds(live)} settled=${rowIds(arch)}`);
  // The record is untouched — that is the whole distinction D-219 draws, so assert it rather than
  // trusting it: a shard that quietly moved a file would pass every row assertion above.
  assert("split: all four entry FILES stay in i/ (the record has no archive)",
    ["001", "002", "003", "004"].every((n) => existsSync(I(dir, n))));
  const unsplit = stageFixture("v3-i-fixture");
  assert("split: the live page is smaller than the unsplit projection (the point of the shard)",
    Buffer.byteLength(live, "utf8") < Buffer.byteLength(readFileSync(livePath(unsplit), "utf8"), "utf8"));
  nuke(unsplit);
  const green = check(dir);
  assert("split: the split fixture is GREEN (reachable green, not just a wall)", green.code === 0, green.out);
  assert("split: index-fresh reports BOTH pages, not just the live one",
    /IMPROVEMENTS\.md matches regeneration[\s\S]*IMPROVEMENTS-archive\.md matches regeneration/.test(green.out), green.out);
  nuke(dir);
}

{
  // The requirement B-030 names explicitly: an index-fresh that checked only the live half would
  // let the settled page rot behind a green check.
  console.log("\n[split projection: the settled page is VERIFIED, not merely written]");
  const dir = stageSplitFixture();
  const p = archivePath(dir);
  writeFileSync(p, readFileSync(p, "utf8").replace("| I-002 |", "| I-902 |"), "utf8");
  commit(dir, "hand-edit the settled index");
  const after = check(dir);
  assert("settled rot: a hand edit to the settled page is RED (exit 1)", after.code === 1, after.out);
  assert("settled rot: the RED names the settled page", /IMPROVEMENTS-archive\.md:/.test(after.out), after.out);
  const iAt = after.out.indexOf("[I family");
  const iSection = iAt === -1 ? "" : after.out.slice(iAt);
  const line = iSection.split("\n").find((l) => l.trim().startsWith("index-fresh"));
  assert("settled rot: the RED is on the I family's index-fresh check", !!line && /FAIL/.test(line), line || after.out);
  const dAt = after.out.indexOf("[D family");
  const dSection = dAt === -1 || iAt === -1 ? "" : after.out.slice(dAt, iAt);
  assert("settled rot: the D family stayed green", dSection !== "" && !/FAIL/.test(dSection), dSection || after.out);
  nuke(dir);
}

{
  console.log("\n[split projection: a deleted settled page cannot pass]");
  const dir = stageSplitFixture();
  unlinkSync(archivePath(dir));
  commit(dir, "delete the settled index");
  const after = check(dir);
  assert("settled missing: RED (exit 1)", after.code === 1, after.out);
  assert("settled missing: the RED says the settled page does not exist",
    /IMPROVEMENTS-archive\.md: the generated index \(settled\) does not exist/.test(after.out), after.out);
  nuke(dir);
}

{
  // The rollout safety property: this tool is shared across repos, and only one of them has a cap
  // breach. A family that did not declare `archiveIndex` must render what it rendered before.
  console.log("\n[split projection: a family that did NOT opt in is untouched]");
  const dir = stageFixture("v3-i-fixture");
  const before = readFileSync(livePath(dir), "utf8");
  const r = run([TOOL, "index", dir], dir);
  assert("opt-out: regenerating an un-opted family is byte-identical",
    before === readFileSync(livePath(dir), "utf8"));
  assert("opt-out: no settled page is created", !existsSync(archivePath(dir)));
  assert("opt-out: the per-family index line keeps its pinned shape", /I index: 4 entries, \d+ bytes/.test(r.out), r.out);
  assert("opt-out: an un-opted fixture stays GREEN", check(dir).code === 0);
  nuke(dir);
}


// ---- glossary-lint (doc-thresholds §Process glossary) --------------------------------------------
// Same shape as the ledger proofs: the clean fixture is GREEN, each seeded rot mode goes RED for
// the named reason. The fixture carries every resolution surface the tool reads.
const GLOSSARY_TOOL = join(REFS, "glossary-lint.mjs");
const gl = (dir) => run([GLOSSARY_TOOL, dir], dir);
const glossaryPath = (dir) => join(dir, "coordination", "GLOSSARY.md");
function glossaryMutation(name, seed, expectReason) {
  console.log(`\n[glossary-lint: ${name}]`);
  const clean = stageFixture("v3-glossary-fixture");
  const before = gl(clean);
  assert(`${name}: clean glossary fixture is GREEN (exit 0)`, before.code === 0, before.out);
  nuke(clean);
  const dirty = stageFixture("v3-glossary-fixture");
  seed(dirty);
  const after = gl(dirty);
  assert(`${name}: mutated fixture is RED (exit 1)`, after.code === 1, after.out);
  assert(`${name}: the RED names the right reason`, expectReason.test(after.out), after.out);
  nuke(dirty);
}
const appendGlossary = (dir, line) => writeFileSync(glossaryPath(dir), readFileSync(glossaryPath(dir), "utf8") + line + "\n");
glossaryMutation("dead id", (d) => appendGlossary(d, "- **ghost** — points nowhere → D-099"), /D-099, which resolves neither live nor in the archive INDEX/);
glossaryMutation("dead blocker id", (d) => appendGlossary(d, "- **ghost blocker** — points nowhere → B-099"), /B-099, which resolves neither/);
glossaryMutation("dead path", (d) => appendGlossary(d, "- **ghost path** — points at nothing → `coordination/NOPE.md`"), /coordination\/NOPE\.md`, which does not exist/);
glossaryMutation("PDR with no docs/pdr", (d) => appendGlossary(d, "- **ghost pdr** — no pdr dir here → PDR-001"), /no docs\/pdr\/PDR-001-\*\.md exists/);
glossaryMutation("continuation line", (d) => appendGlossary(d, "  and a second line of reasoning under the last entry"), /entries are ONE line/);
glossaryMutation("duplicate term", (d) => appendGlossary(d, "- **Ledger** — defined twice → D-001"), /duplicate term "Ledger"/);
glossaryMutation("byte cap", (d) => appendGlossary(d, "- **bloat** — " + "x".repeat(8000) + " → D-001"), /against the 8000B cap/);
glossaryMutation("empty glossary", (d) => writeFileSync(glossaryPath(d), "# Glossary\n\n> nothing here\n"), /no entries found/);
glossaryMutation("missing file", (d) => rmSync(glossaryPath(d)), /GLOSSARY\.md does not exist/);
{
  console.log("\n[glossary-lint: the fixture exercises every resolution surface]");
  const dir = stageFixture("v3-glossary-fixture");
  const r = gl(dir);
  assert("surfaces: 4 terms counted (dir-mode D, BLOCKERS.md B, blockers/ B, path)", /4 terms/.test(r.out), r.out);
  nuke(dir);
}


// ---- B family: directory mode (claude-config D-012) ------------------------------------------------
// Same proof shape as D and I: clean fixture GREEN, each seeded violation RED on the named check.
const bPath = (dir, n) => join(dir, "coordination", "blockers", "b", `B-${n}.md`);
function bMutation(name, checkName, seed, expectReason) {
  console.log(`\n[B family: ${name}]`);
  const clean = stageFixture("v3-b-fixture");
  const before = check(clean);
  assert(`${name}: clean B fixture is GREEN (exit 0)`, before.code === 0, before.out);
  nuke(clean);
  const dirty = stageFixture("v3-b-fixture");
  seed(dirty);
  const after = check(dirty);
  assert(`${name}: mutated fixture is RED (exit 1)`, after.code === 1, after.out);
  // Dual-family output: scope the line search to the B block, or the D family's OK line wins.
  const bOut = after.out.slice(Math.max(0, after.out.indexOf("[B family")));
  const line = bOut.split("\n").find((l) => l.trim().startsWith(checkName));
  assert(`${name}: the RED is on "${checkName}"`, !!line && /FAIL/.test(line), line || after.out);
  assert(`${name}: the RED names the right reason`, expectReason.test(after.out), after.out);
  nuke(dirty);
}
bMutation("severity is required", "frontmatter-valid", (d) => writeFileSync(bPath(d, "002"), readFileSync(bPath(d, "002"), "utf8").replace(/^severity: medium\n/m, "")), /missing required frontmatter key `severity`/);
bMutation("status outside the B set", "frontmatter-valid", (d) => writeFileSync(bPath(d, "002"), readFileSync(bPath(d, "002"), "utf8").replace(/^status: open$/m, "status: accepted")), /outside the closed set \{open, resolved, deferred, never-minted\}/);
bMutation("body edit after mint", "immutability", (d) => writeFileSync(bPath(d, "002"), readFileSync(bPath(d, "002"), "utf8").replace("a completions probe", "a completions probe (edited)")), /immutable outside \{status, date, resolved-by\}/);
bMutation("severity edit after mint", "immutability", (d) => writeFileSync(bPath(d, "002"), readFileSync(bPath(d, "002"), "utf8").replace(/^severity: medium$/m, "severity: low")), /immutable outside/);
bMutation("stale resolved-by on settled page", "index-fresh", (d) => {
  const resPath = join(d, "coordination", "blockers", "RESOLVED.md");
  writeFileSync(resPath, readFileSync(resPath, "utf8").replace("| high | D-001 |", "| high | D-999 |"));
}, /blockers\/RESOLVED\.md: drifted from its projection/);
{
  console.log("\n[B family: status + date + resolved-by are the mutable keys (resolution is a status flip)]");
  const dir = stageFixture("v3-b-fixture");
  writeFileSync(bPath(dir, "002"), readFileSync(bPath(dir, "002"), "utf8").replace(/^status: open$/m, "status: resolved — D-001\nresolved-by: D-001").replace(/^date: 2026-08-25$/m, "date: 2026-08-27"));
  run([TOOL, "index", dir], dir);
  const r = check(dir);
  const liveText = readFileSync(join(dir, "coordination", "BLOCKERS.md"), "utf8");
  const settledText = readFileSync(join(dir, "coordination", "blockers", "RESOLVED.md"), "utf8");
  assert("resolve: flipping status + date + resolved-by is LEGAL", r.code === 0, r.out);
  assert("resolve: the row moved to the settled page", /\| B-002 \|/.test(settledText) && !/\| B-002 \|/.test(liveText));
  assert("resolve: deferred stays LIVE (unresolved never leaves the always-read page)", /\| B-003 \| [^|]+ \| deferred/.test(liveText));
  assert("index: live BLOCKERS.md stays 5 columns (no dead resolved-by column)", /\| id \| date \| status \| severity \| title \|/.test(liveText) && !/resolved-by/.test(liveText), liveText);
  assert("index: settled RESOLVED.md projects resolved-by as a 6th column", /\| id \| date \| status \| severity \| resolved-by \| title \|/.test(settledText) && /\| B-002 \| 2026-08-27 \| resolved — D-001 \| medium \| D-001 \|/.test(settledText), settledText);
  nuke(dir);
}
{
  console.log("\n[B family: migrate — flat BLOCKERS.md + a hand-relocated body, strike → resolved, severity from the body]");
  const dir = stageFixture("v2-b-fixture");
  const dry = run([TOOL, "migrate", dir, "--family", "B"], dir);
  assert("migrate B: dry run verifies 5 entries (4 headings + the carried stub)", /5 entries verify/.test(dry.out), dry.out);
  assert("migrate B: dry run writes nothing", !existsSync(bPath(dir, "001")));
  const wr = run([TOOL, "migrate", dir, "--family", "B", "--write"], dir);
  assert("migrate B: --write emits and verifies byte-identical", wr.code === 0 && /5 entries written/.test(wr.out), wr.out);
  const fm = (n) => readFileSync(bPath(dir, n), "utf8").split("---")[1];
  assert("migrate B: struck heading → resolved", /status: resolved/.test(fm("004")), fm("004"));
  assert("migrate B: unstruck heading → open", /status: open/.test(fm("001")) && /status: open/.test(fm("002")), fm("001"));
  assert("migrate B: severity token from the body (`LOW · …` → low)", /severity: low/.test(fm("003")) && /severity: high/.test(fm("001")), fm("003"));
  assert("migrate B: the hand-relocated blockers/B-002.md is a source", /blockers\/B-002\.md/.test(wr.out), wr.out);
  // Defensive read: under the D-013 mutation B-005 is never planned, and a throw here would
  // red the suite for the wrong reason — the neighbouring arm, not the assertion text.
  const stub005 = existsSync(bPath(dir, "005")) ? readFileSync(bPath(dir, "005"), "utf8") : "";
  assert("D-013: the stub carries its reason from the SHARED archive/INDEX.md, verbatim",
    /reserved for the intake blocker; the claim PR closed unmerged/.test(stub005), stub005);
  assert("D-013: the stub takes the index row's date, not the migration date",
    /^date: 2026-08-29$/m.test(stub005), stub005);
  assert("D-013: rows for other families in the shared index are ignored (prefix filtering)",
    !/D-002/.test(wr.out), wr.out);
  run([TOOL, "index", dir], dir);
  sh("git", ["add", "-A"], dir); sh("git", ["commit", "-q", "-m", "migrate B"], dir);
  const r = check(dir);
  assert("migrate B: migrate → index → check is GREEN end to end", r.code === 0, r.out);
  nuke(dir);
}

{
  console.log("\n[B family: a shared-index row pointing at a real location REFUSES (D-013)]");
  const dir = stageFixture("v2-b-fixture");
  const idx = join(dir, "coordination", "archive", "INDEX.md");
  // `where` names a location rather than `never-minted`: the index says this entry EXISTS. No
  // scanned source holds it, so it is a lost record, not a gap — and a stub would paper over it.
  writeFileSync(idx, readFileSync(idx, "utf8") +
    "| B-006 | 2026-08-30 | archive/2026-08-blockers-snapshot.md | the loader dropped rows |\n");
  sh("git", ["add", "-A"], dir);
  sh("git", ["commit", "-q", "-m", "record B-006 as archived"], dir);
  const lost = run([TOOL, "migrate", dir, "--family", "B"], dir);
  assert("D-013: an id the shared index says LIVES somewhere, absent from every source, is refused",
    lost.code !== 0 && lost.out.includes("B-006") && lost.out.includes("MISSING, not a gap"), lost.out);
  assert("D-013: that refusal writes nothing (migration stays all-or-nothing)",
    !existsSync(bPath(dir, "006")));
  nuke(dir);
}
{
  console.log("\n[B family: RED — the shared archive dir is load-bearing for B (D-013 mutation)]");
  const dir = stageFixture("v2-b-fixture");
  // Move the index out of every dir B sweeps. Under D-012's `archiveDirs: ["blockers"]` this was
  // the PERMANENT state for any repo keeping one index for all three families.
  sh("git", ["mv", "coordination/archive/INDEX.md", "coordination/ARCHIVE-INDEX.md"], dir);
  sh("git", ["commit", "-q", "-m", "move the index out of every swept dir"], dir);
  const blind = run([TOOL, "migrate", dir, "--family", "B"], dir);
  assert("D-013 mutation: outside the swept dirs the recorded id is not known at all",
    /4 entries verify/.test(blind.out) && !blind.out.includes("B-005"), blind.out);
  nuke(dir);
}


console.log("\n" + "=".repeat(78));
console.log("doclint — HANDOFF semantic detectors and the PR-claims clause scope");
console.log("=".repeat(78));
// A bare coordination dir is enough: these detectors read HANDOFF text and, for PR claims, a PR
// state table. `DOCLINT_PR_STATE_JSON` stands in for `gh pr list` so the clause parser is proven
// without a GitHub remote — the fixture repos have none, and the live check skips silently there.
function stageDoclintDir(handoff) {
  const dir = mkdtempSync(join(tmpdir(), "doclint-"));
  const c = join(dir, "coordination");
  execFileSync("node", ["-e", `require("fs").mkdirSync(${JSON.stringify(c)},{recursive:true})`]);
  writeFileSync(join(c, "HANDOFF.md"), handoff, "utf8");
  writeFileSync(join(c, "BLOCKERS.md"), "# Blockers\n\nNone open.\n", "utf8");
  writeFileSync(join(c, "ROADMAP.md"), "# Roadmap\n\n## Active\n- a thing\n", "utf8");
  writeFileSync(join(c, "DECISIONS.md"), "# Decisions\n\n## D-001 — a decision\n2026-01-01 • x • why\n", "utf8");
  return dir;
}
const doclintFlags = (out) => (out.match(/^  - .*$/gm) || []).join("\n");

{
  console.log("\n[HANDOFF: semantic detectors skip machine-owned GEN blocks (cf-site-harness #42)]");
  // Quoted commit subjects and a generated decisions table — exactly what handoff-scaffold writes.
  const genBody = [
    "- 1a2b3c4 prior commit suppressed them; prior doc commits carried the rest",
    ...Array.from({ length: 25 }, (_, i) => `| D-${String(i + 1).padStart(3, "0")} | 2026-09-01 | a ruling |`),
  ].join("\n");
  const human = "# Handoff\n\nCurrent state, one paragraph. See D-001 for the ruling.\n\n";
  const inside = human + "<!-- GEN:state-delta -->\n" + genBody + "\n" + CLOSE_MARKER + "\n";
  const outside = human + genBody + "\n";

  const dirIn = stageDoclintDir(inside);
  const rIn = run([DOCLINT, dirIn], dirIn);
  assert("GEN: a 'prior commit' subject inside GEN:state-delta is NOT a history chain",
    !/history chain/.test(rIn.out), doclintFlags(rIn.out));
  assert("GEN: D-NNN rows inside a GEN block do NOT count toward the breadcrumb cap",
    !/D-NNN refs \(>/.test(rIn.out), doclintFlags(rIn.out));
  nuke(dirIn);

  const dirOut = stageDoclintDir(outside);
  const rOut = run([DOCLINT, dirOut], dirOut);
  assert("GEN mutation: the same text OUTSIDE a GEN block still trips the history-chain detector",
    /contains 1 "Prior \.\.\." history chain/.test(rOut.out), doclintFlags(rOut.out));
  assert("GEN mutation: the same D-NNN rows OUTSIDE a GEN block still breach the breadcrumb cap",
    /has 26 D-NNN refs \(>20\)/.test(rOut.out), doclintFlags(rOut.out));
  nuke(dirOut);
}

{
  console.log("\n[PR claims: a clause ends at '.' + closing emphasis (cf-site-harness #75)]");
  const stateFile = join(tmpdir(), `doclint-prstate-${process.pid}.json`);
  writeFileSync(stateFile, JSON.stringify([
    { number: 78, state: "MERGED", isDraft: false },
    { number: 79, state: "MERGED", isDraft: false },
    { number: 80, state: "CLOSED", isDraft: false },
    { number: 81, state: "MERGED", isDraft: false },
  ]), "utf8");
  const handoff = [
    "# Handoff",
    "",
    "- **No rulings pending.** PR #78 (afk container sandbox) merged `0a8424e` after a clean scan-bypass on its tree.",
    "- PR #79 is still open beside its merge.",
    "- PR #80 was closed unmerged; nothing pending there.",
    "- _Still pending._ PR #81 is awaiting review.",
    "",
  ].join("\n");
  const dir = stageDoclintDir(handoff);
  const env = { ...process.env, DOCLINT_PR_STATE_JSON: stateFile };
  const r = (() => {
    try {
      return { code: 0, out: execFileSync("node", [DOCLINT, dir], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] }).toString() };
    } catch (e) {
      return { code: e.status ?? -1, out: (e.stdout ? e.stdout.toString() : "") + (e.stderr ? e.stderr.toString() : "") };
    }
  })();
  assert("PR claims: the stand-in state table was consumed (4 refs checked, not skipped)",
    /PR claims: 4 checked/.test(r.out), r.out);
  assert("PR claims: 'pending.**' before '#78 … merged `sha`' is a clause boundary — the true sentence does not flag",
    !/claims PR #78/.test(r.out), doclintFlags(r.out));
  assert("PR claims: 'PR #79 is still open' beside a merged PR still flags",
    /claims PR #79 is open\/pending but it is MERGED/.test(r.out), doclintFlags(r.out));
  assert("PR claims: 'was closed unmerged' stays a resolved narrative",
    !/claims PR #80/.test(r.out), doclintFlags(r.out));
  assert("PR claims: 'pending._' (underscore emphasis) is also a boundary, and the next clause's own 'awaiting' still flags #81",
    /claims PR #81 is open\/pending but it is MERGED — "PR #81 is awaiting review/.test(r.out), doclintFlags(r.out));
  nuke(dir);
  unlinkSync(stateFile);
}

{
  console.log("\n[--gate: a skipped PR-claims check is said out loud, not folded into green]");
  const dir = stageDoclintDir("# Handoff\n\nCurrent state. PR #5 is open.\n");
  const env = { ...process.env };
  delete env.DOCLINT_PR_STATE_JSON;
  // No GitHub remote in a staged dir: `gh pr list` fails and the check skips.
  const r = (() => {
    try {
      return { code: 0, out: execFileSync("node", [DOCLINT, dir, "--gate"], { cwd: dir, env, stdio: ["ignore", "pipe", "pipe"] }).toString() };
    } catch (e) {
      return { code: e.status ?? -1, out: (e.stdout ? e.stdout.toString() : "") + (e.stderr ? e.stderr.toString() : "") };
    }
  })();
  assert("--gate: the GATE line itself names the skipped PR-claims check",
    /^GATE: .*PR claims NOT verified \(gh unavailable\)/m.test(r.out), r.out);
  assert("--gate: a skipped check does not block (advisory, exit 0)", r.code === 0, r.out);
  // A state table that arrives but does not parse is ALSO an unverified check.
  const broken = join(tmpdir(), `doclint-prstate-broken-${process.pid}.json`);
  writeFileSync(broken, "{ broken", "utf8");
  const rb = (() => {
    try {
      return { code: 0, out: execFileSync("node", [DOCLINT, dir, "--gate"], { cwd: dir, env: { ...env, DOCLINT_PR_STATE_JSON: broken }, stdio: ["ignore", "pipe", "pipe"] }).toString() };
    } catch (e) {
      return { code: e.status ?? -1, out: (e.stdout ? e.stdout.toString() : "") + (e.stderr ? e.stderr.toString() : "") };
    }
  })();
  assert("--gate: an unparseable state table still says PR claims NOT verified",
    /^GATE: .*PR claims NOT verified \(gh unavailable\)/m.test(rb.out), rb.out);
  unlinkSync(broken);
  nuke(dir);
}

// cf-site-harness #51: a `supersedes:` edge whose target still stands `accepted` passed green —
// the migrator's default output for a successor that names its target one way.
mutation("one-sided supersession (successor names an accepted target)", "supersession-refs", (dir) => {
  const p = D(dir, "002");
  writeFileSync(p, readFileSync(p, "utf8").replace("status: superseded\n", "status: accepted\n").replace("superseded-by: D-006\n", ""), "utf8");
  run([TOOL, "index", dir], dir);
  commit(dir, "reopen D-002 while D-006 still claims to supersede it");
}, /D-006\.md: `supersedes: D-002` but D-002 is `accepted`, not `superseded`/);

console.log("\n[#51 migrate: a successor's `supersedes` flips its silent target at the mint]");
{
  const dir = stageFixture("v2-fixture");
  const src = join(dir, "coordination", "decisions", "DECISIONS.md");
  writeFileSync(src, readFileSync(src, "utf8").replace("Status: accepted · Regenerating", "Status: accepted · supersedes: D-005 · Regenerating"), "utf8");
  commit(dir, "D-006 supersedes D-005; D-005 says nothing back");
  const w = run([TOOL, "migrate", dir, "--write"], dir);
  assert("#51 migrate --write: exit 0", w.code === 0, w.out);
  const d005 = readFileSync(join(dir, "coordination", "decisions", "d", "D-005.md"), "utf8");
  const d006 = readFileSync(join(dir, "coordination", "decisions", "d", "D-006.md"), "utf8");
  assert("#51 migrate: the silent target lands `status: superseded`", /^status: superseded$/m.test(d005), d005.slice(0, 200));
  assert("#51 migrate: the silent target carries the back-pointer", /^superseded-by: D-006$/m.test(d005), d005.slice(0, 200));
  assert("#51 migrate: the successor keeps both forward edges", /^supersedes: D-003, D-005$/m.test(d006), d006.slice(0, 200));
  writeFileSync(join(dir, "coordination", ".doclint.json"), JSON.stringify({
    version: 3,
    families: { D: { mode: "directory", dir: "decisions/d", index: "decisions/DECISIONS.md" }, B: { mode: "file" }, I: { mode: "file" } },
    thresholds: {},
  }, null, 2) + "\n", "utf8");
  run([TOOL, "index", dir], dir);
  commit(dir, "migrate to directory mode");
  const post = check(dir);
  assert("#51 migrate -> check: the derived pair is GREEN from both ends", post.code === 0, post.out);
  nuke(dir);
}

console.log("\n[#51 migrate: two successors naming one silent target is refused, not guessed]");
{
  const dir = stageFixture("v2-fixture");
  const src = join(dir, "coordination", "decisions", "DECISIONS.md");
  writeFileSync(src, readFileSync(src, "utf8")
    .replace("Status: accepted · Regenerating", "Status: accepted · supersedes: D-001 · Regenerating")
    .replace("coordination/PROCESS.md • Moving", "coordination/PROCESS.md • supersedes: D-001 · Moving"), "utf8");
  commit(dir, "D-005 and D-006 both claim D-001");
  const r = run([TOOL, "migrate", dir, "--write"], dir);
  assert("#51 ambiguity: migrate refuses and names the contested target",
    r.code !== 0 && /D-001: named by more than one `supersedes:`/.test(r.out), r.out);
  assert("#51 ambiguity: nothing is written", !existsSync(join(dir, "coordination", "decisions", "d", "D-001.md")));
  nuke(dir);
}

// Stage B (PR #119) probe A: a prose "superseded by" on an entry whose own Status is accepted
// must stay narrative — only a derived pointer may flip the status.
console.log("\n[#51 migrate: a prose mention of \"superseded by\" does not retire an accepted entry]");
{
  const dir = stageFixture("v2-fixture");
  const src = join(dir, "coordination", "decisions", "DECISIONS.md");
  writeFileSync(src, readFileSync(src, "utf8").replace(
    "coordination/PROCESS.md • Moving", "coordination/PROCESS.md • (partially superseded by D-006 for the log-format clause) Moving"), "utf8");
  commit(dir, "D-005 mentions D-006 in prose");
  const w = run([TOOL, "migrate", dir, "--write"], dir);
  assert("#51 prose: migrate --write exit 0", w.code === 0, w.out);
  const d005 = readFileSync(join(dir, "coordination", "decisions", "d", "D-005.md"), "utf8");
  assert("#51 prose: the entry stays accepted", /^status: accepted$/m.test(d005), d005.slice(0, 200));
  assert("#51 prose: no back-pointer is invented", !/^superseded-by:/m.test(d005), d005.slice(0, 200));
  nuke(dir);
}

// Stage A (blind-03): the same prose mention must not BLOCK derivation either — when a real
// successor names the entry, the derived pointer wins over the narrative one.
console.log("\n[#51 migrate: a prose mention does not block a real successor's derived pointer]");
{
  const dir = stageFixture("v2-fixture");
  const src = join(dir, "coordination", "decisions", "DECISIONS.md");
  writeFileSync(src, readFileSync(src, "utf8")
    .replace("coordination/PROCESS.md • Moving", "coordination/PROCESS.md • (partially superseded by D-001 in spirit) Moving")
    .replace("Status: accepted · Regenerating", "Status: accepted · supersedes: D-005 · Regenerating"), "utf8");
  commit(dir, "D-005 mentions D-001 in prose; D-006 really supersedes D-005");
  const w = run([TOOL, "migrate", dir, "--write"], dir);
  assert("#51 prose+namer: migrate --write exit 0", w.code === 0, w.out);
  const d005 = readFileSync(join(dir, "coordination", "decisions", "d", "D-005.md"), "utf8");
  assert("#51 prose+namer: the derived pointer names the real successor", /^superseded-by: D-006$/m.test(d005), d005.slice(0, 200));
  assert("#51 prose+namer: the status follows the derived pointer", /^status: superseded$/m.test(d005), d005.slice(0, 200));
  nuke(dir);
}

console.log("\n[#51 migrate: an entry that supersedes itself is refused]");
{
  const dir = stageFixture("v2-fixture");
  const src = join(dir, "coordination", "decisions", "DECISIONS.md");
  writeFileSync(src, readFileSync(src, "utf8").replace(
    "coordination/PROCESS.md • Moving", "coordination/PROCESS.md • supersedes: D-005 · Moving"), "utf8");
  commit(dir, "D-005 supersedes itself");
  const r = run([TOOL, "migrate", dir, "--write"], dir);
  assert("#51 self: migrate refuses and names the entry", r.code !== 0 && /D-005 \(.*\): `supersedes: D-005` names itself/.test(r.out), r.out);
  assert("#51 self: nothing is written", !existsSync(join(dir, "coordination", "decisions", "d", "D-005.md")));
  nuke(dir);
}

// rocketfuel-rebuild D-147 / D-127: opening prose that QUOTES another entry's supersession
// manufactured an edge, and a heading that scopes one ("supersedes D-112 hub row") retired the
// whole target. Body edges need the field form; scoped heading edges need a ruling.
console.log("\n[migrate: supersession needs the field form below the heading; scoped headings need a ruling]");
{
  const editSource = (dir, from, to) => {
    const src = join(dir, "coordination", "decisions", "DECISIONS.md");
    const text = readFileSync(src, "utf8");
    if (text.split(from).length !== 2) throw new Error(`fixture anchor not found exactly once: ${from}`);
    writeFileSync(src, text.replace(from, to), "utf8");
  };
  const stage = (heading, row) => {
    const dir = stageFixture("v2-fixture");
    const title = "## D-006 — The index is a projection, never a hand-maintained file";
    editSource(dir, title, title + heading);
    if (row) writeFileSync(join(dir, "coordination", "decisions", "archive", "INDEX.md"),
      `# Archive index\n\n| Kind | Edge | Verdict | Why |\n|---|---|---|---|\n${row}\n`, "utf8");
    commit(dir, "stage supersession case");
    return dir;
  };
  const optIn = (dir) => writeFileSync(join(dir, "coordination", ".doclint.json"), JSON.stringify({
    version: 3,
    families: { D: { mode: "directory", dir: "decisions/d", index: "decisions/DECISIONS.md" }, B: { mode: "file" }, I: { mode: "file" } },
    thresholds: {},
  }, null, 2) + "\n", "utf8");
  const d001 = (dir) => readFileSync(join(dir, "coordination", "decisions", "d", "D-001.md"), "utf8");
  const d006 = (dir) => readFileSync(join(dir, "coordination", "decisions", "d", "D-006.md"), "utf8");

  {
    const dir = stageFixture("v2-fixture");
    editSource(dir, "coordination/PROCESS.md • Moving", "coordination/PROCESS.md • the reversal that supersedes D-001 for launch · Moving");
    commit(dir, "D-005 quotes a supersession in prose");
    const w = run([TOOL, "migrate", dir, "--write"], dir);
    assert("prose: a colon-less body mention migrates (exit 0)", w.code === 0, w.out);
    assert("prose: the quoted target stays accepted", /^status: accepted$/m.test(d001(dir)), d001(dir).slice(0, 200));
    nuke(dir);
  }
  {
    const dir = stage(" (supersedes D-001)", null);
    const w = run([TOOL, "migrate", dir, "--write"], dir);
    assert("unscoped heading: migrate --write exit 0", w.code === 0, w.out);
    assert("unscoped heading: the target flips to superseded", /^superseded-by: D-006$/m.test(d001(dir)), d001(dir).slice(0, 200));
    nuke(dir);
  }
  const d004 = (dir) => readFileSync(join(dir, "coordination", "decisions", "d", "D-004.md"), "utf8");
  for (const [label, heading] of [["comma", " (supersedes D-001, D-004)"], ["and", " (supersedes D-001 and D-004)."]]) {
    const dir = stage(heading, null);
    const w = run([TOOL, "migrate", dir, "--write"], dir);
    assert(`heading list (${label}): migrate --write exit 0`, w.code === 0, w.out);
    assert(`heading list (${label}): the first target flips`, /^superseded-by: D-006$/m.test(d001(dir)), d001(dir).slice(0, 200));
    assert(`heading list (${label}): the second target flips too`, /^superseded-by: D-006$/m.test(d004(dir)), d004(dir).slice(0, 200));
    nuke(dir);
  }
  {
    const dir = stageFixture("v2-fixture");
    editSource(dir, "Status: accepted · Regenerating", "Status: accepted · supersedes: D-001, D-004 · Regenerating");
    commit(dir, "D-006 field form names two targets");
    const w = run([TOOL, "migrate", dir, "--write"], dir);
    assert("field list: migrate --write exit 0", w.code === 0, w.out);
    assert("field list: both targets flip", /^superseded-by: D-006$/m.test(d001(dir)) && /^superseded-by: D-006$/m.test(d004(dir)), d004(dir).slice(0, 200));
    nuke(dir);
  }
  {
    const dir = stage(" (supersedes D-001, D-004 layout clauses)", null);
    const r = run([TOOL, "migrate", dir, "--write"], dir);
    assert("scoped heading list: every named target needs a ruling",
      r.code !== 0 && /scopes the supersession of D-001 \("layout clauses"\)/.test(r.out) && /scopes the supersession of D-004 \("layout clauses"\)/.test(r.out), r.out);
    nuke(dir);
  }
  {
    const dir = stage(" (supersedes D-001 layout clause)", null);
    const r = run([TOOL, "migrate", dir, "--write"], dir);
    assert("scoped heading, no ruling: refused with the row to add",
      r.code !== 0 && /D-006 .*scopes the supersession of D-001 \("layout clause"\).*\| supersession \| D-006 → D-001 \|/.test(r.out), r.out);
    assert("scoped heading, no ruling: nothing is written", !existsSync(join(dir, "coordination", "decisions", "d", "D-001.md")));
    nuke(dir);
  }
  {
    const dir = stage(" (supersedes D-001 layout clause)", "| supersession | D-006 → D-001 | partial | only the layout clause |");
    const w = run([TOOL, "migrate", dir, "--write"], dir);
    assert("scoped heading, partial: migrate --write exit 0", w.code === 0, w.out);
    assert("scoped heading, partial: the target stays accepted", /^status: accepted$/m.test(d001(dir)), d001(dir).slice(0, 200));
    assert("scoped heading, partial: the successor carries no edge", !/^supersedes:.*D-001/m.test(d006(dir)), d006(dir).slice(0, 300));
    optIn(dir);
    run([TOOL, "index", dir], dir);
    commit(dir, "migrate");
    const c = check(dir);
    assert("scoped heading, partial: check is green", c.code === 0, c.out);
    nuke(dir);
  }
  {
    const dir = stage(" (supersedes D-001 layout clause)", "| supersession | D-006 → D-001 | full | the clause was the whole decision |");
    const w = run([TOOL, "migrate", dir, "--write"], dir);
    assert("scoped heading, full: migrate --write exit 0", w.code === 0, w.out);
    assert("scoped heading, full: the target flips with a back-pointer", /^superseded-by: D-006$/m.test(d001(dir)), d001(dir).slice(0, 200));
    optIn(dir);
    run([TOOL, "index", dir], dir);
    commit(dir, "migrate");
    const c = check(dir);
    assert("scoped heading, full: check is green from both ends", c.code === 0, c.out);
    nuke(dir);
  }
  {
    const dir = stage("", "| supersession | D-006 → D-001 | full | left over from an edit |");
    const r = run([TOOL, "migrate", dir, "--write"], dir);
    assert("stale ruling: refused", r.code !== 0 && /supersession ruling D-006 → D-001 matches no supersession/.test(r.out), r.out);
    nuke(dir);
  }
  {
    const dir = stage(" (supersedes D-001 layout clause)", "| supersession | D-006 → D-001 | maybe | unsure |");
    const r = run([TOOL, "migrate", dir, "--write"], dir);
    assert("unknown verdict: refused", r.code !== 0 && /has verdict `maybe`/.test(r.out), r.out);
    nuke(dir);
  }
}

// cf-site-harness #65 / #67: a YAML-quoted title projected its quotes into the row, and the
// index header claimed "newest first" over rows sorted by id.
console.log("\n[#65/#67 index: quoted titles project by value; the header names the real order]");
{
  const dir = stageFixture("v3-fixture");
  const p6 = D(dir, "006"), p8 = D(dir, "008");
  writeFileSync(p6, readFileSync(p6, "utf8").replace(
    "title: Caps bind projections and the always-read tier, never the record",
    'title: "Caps bind projections and the always-read tier, never the record"'), "utf8");
  writeFileSync(p8, readFileSync(p8, "utf8").replace(
    "title: The filesystem is the ledger; id resolution is file existence",
    "title: 'The filesystem is the ledger; id resolution is file existence'"), "utf8");
  writeFileSync(D(dir, "009"), '---\nid: D-009\ndate: 2026-08-25\nstatus: accepted\ntitle: "[STRUCTURAL] a \\"quoted\\" word"\n---\n## D-009 — a quoted title\n2026-08-25 • x • y\n', "utf8");
  const idx = run([TOOL, "index", dir], dir);
  assert("#65 index: exit 0", idx.code === 0, idx.out);
  const out = readFileSync(IDX(dir), "utf8");
  assert("#65 index: a double-quoted title renders by value",
    out.includes("| D-006 | 2026-08-20 | accepted | Caps bind projections and the always-read tier, never the record |"), out);
  assert("#65 index: a single-quoted title renders by value",
    out.includes("| accepted | The filesystem is the ledger; id resolution is file existence |"), out);
  assert("#65 index: an escaped inner quote is unescaped",
    out.includes('| D-009 | 2026-08-25 | accepted | [STRUCTURAL] a "quoted" word |'), out);
  assert("#65 index: no row starts with a quote", !/\| ["']/.test(out), out);
  assert("#67 index: the header says what the sort does", /entries · newest id first ·/.test(out) && !/· newest first ·/.test(out), out.split("\n")[1]);
  commit(dir, "quote two titles, add D-009");
  const post = check(dir);
  assert("#65 check: quoting an immutable title is not an edit (parsed value unchanged)", post.code === 0, post.out);
  nuke(dir);
}

console.log("\n" + "=".repeat(78));
console.log(`${pass} passed, ${fail} failed` + (skip ? `, ${skip} skipped` : ""));
if (fail) { for (const f of failures) console.log(`  - ${f}`); }
if (skip) { for (const s of skips) console.log(`  - SKIP ${s}`); }
console.log("=".repeat(78));
process.exit(fail ? 1 : 0);
