#!/usr/bin/env node
/**
 * blind-code-review/scripts/prepare_stage_a.mjs — Canonical scripts/ entrypoint for Stage A view builder.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runPrepareView, parseCliConfig, runSelftest } from '../references/prepare-view.mjs';

export { runPrepareView, parseCliConfig, runSelftest };

if (process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1]))) {
  if (process.argv.includes('--selftest')) {
    runSelftest();
  } else {
    const manifest = runPrepareView(parseCliConfig(process.argv));
    console.log(JSON.stringify({ status: manifest.status, files: manifest.files.length, error: manifest.error }));
    if (manifest.status !== 'PREPARED') process.exitCode = 1;
  }
}
