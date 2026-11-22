#!/usr/bin/env node
// decisions-dir — doc-system v3: an id family as a directory of immutable per-entry files.
// Contract: PDR-001 §3.1 (entry file) · §3.2 (generated index) · §3.4 (CLI) · §3.6 (invariants),
// extended family-generic by PDR-011 §3 (business-club-ops, RATIFIED 2026-08-27, D-177): the same
// machinery serves any family declared `"mode": "directory"` in .doclint.json — D, I, and B.
//
// Usage:
//   node decisions-dir.mjs index   <root>              regenerate every directory-mode family's index
//   node decisions-dir.mjs check   <root>              five invariant checks over every directory-mode
//                                                      family; exit 1 on violation
//   node decisions-dir.mjs migrate <root> [--family I|B] [--write]
//                                                      v2 monolith -> per-entry files (dry-run default)

import { FAMILY_PROFILES, die, configOps } from "./lib/ledger-core.mjs";
import { cmdIndex, cmdCheck } from "./lib/ledger-check.mjs";
import { cmdMigrate } from "./lib/ledger-migrate.mjs";

const { findCoordDir } = configOps;

const [, , sub, rootArg, ...rest] = process.argv;
if (!sub || !["index", "check", "migrate"].includes(sub)) {
  console.error("usage: decisions-dir.mjs <index|check|migrate> [projectRoot] [--family D|I] [--write]");
  process.exit(2);
}

let root = null, write = false, famArg = null;
{
  const args = [rootArg, ...rest].filter((a) => a !== undefined);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--write") { write = true; continue; }
    if (a === "--family") {
      famArg = args[++i];
      if (!famArg || !Object.hasOwn(FAMILY_PROFILES, famArg)) {
        die(`decisions-dir: --family needs one of: ${Object.keys(FAMILY_PROFILES).join(", ")}`);
      }
      continue;
    }
    if (a.startsWith("--")) die(`decisions-dir: unknown flag ${a}`);
    if (root === null) root = a;
    else die(`decisions-dir: unexpected argument ${a}`);
  }
}
root = root || process.cwd();
const coord = findCoordDir(root);
if (!coord) die(`decisions-dir: no coordination/ dir found at or above ${root}`);

if (sub === "index") cmdIndex(coord, famArg);
else if (sub === "check") cmdCheck(coord, famArg);
else cmdMigrate(coord, write, famArg || "D");
