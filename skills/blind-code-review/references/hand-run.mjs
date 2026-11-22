import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
const app = (process.env.BLIND_REVIEW_APP ?? 'C:/Users/Owner/code/brand-workshop-harness/app') + '/';
const wanted = process.argv.slice(2).map((s) => s.split(':'));
for (const [manifestPath, id] of wanted) {
  const manifest = JSON.parse(fs.readFileSync(app + manifestPath, 'utf8'));
  const m = manifest.mutations.find((x) => x.id === id);
  const file = app + m.file;
  const original = fs.readFileSync(file, 'utf8');
  if (original.split(m.find).length !== 2) throw new Error(`${manifestPath}:${id} needle not unique`);
  fs.writeFileSync(file, original.replace(m.find, m.replace));
  let out = '';
  try {
    const r = spawnSync('npx', ['vitest', 'run', manifest.test], { cwd: app, encoding: 'utf8', shell: true });
    out = `${r.stdout}${r.stderr}`;
  } finally {
    fs.writeFileSync(file, original);
  }
  const lines = out.split('\n').filter((l) => /×|AssertionError|expected|Error:/.test(l)).slice(0, 4);
  console.log(`--- ${manifestPath} [${id}] ${m.file}`);
  console.log(lines.map((l) => l.replace(/\u001b\[[0-9;]*m/g, '')).join('\n') || '(no failing line captured)');
}
