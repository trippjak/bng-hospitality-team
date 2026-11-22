#!/usr/bin/env node
/**
 * blind-code-review/references/prepare-view.mjs — AST-verified comment-masked Stage A view builder.
 *
 * Usage:
 *   node prepare-view.mjs --out <outDir> [--root <repoRoot>] [--allow-dirty] [--git-diff [baseRef]] <files...>
 *   node prepare-view.mjs <config.json>
 *   node prepare-view.mjs --selftest
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import cp from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import {
  maskRangesWithSpaces,
  preparePythonFile,
  prepareCssFile,
  prepareHtmlFile,
  prepareYamlOrJsonFile,
} from './lib/file-maskers.mjs';

const require = createRequire(import.meta.url);

function globalNodeModules() {
  try {
    return cp.execFileSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
  } catch {
    return null;
  }
}

// Resolution order: BLIND_REVIEW_TS_URL, the skill's own resolution, the caller's project, the
// global npm root. No machine-specific paths: a miss is a named install error.
async function loadTypeScript() {
  if (process.env.BLIND_REVIEW_TS_URL) {
    return (await import(process.env.BLIND_REVIEW_TS_URL)).default;
  }
  const globalRoot = globalNodeModules();
  const candidates = ['typescript', `${process.cwd()}/node_modules/typescript`, globalRoot && `${globalRoot}/typescript`];
  for (const cand of candidates.filter(Boolean)) {
    try {
      return require(cand);
    } catch {
      // try next candidate
    }
  }
  throw new Error(
    'TypeScript compiler API not found. Install it where this tool can see it: `npm i -g typescript`, ' +
      'or run from a project with typescript in node_modules, or set BLIND_REVIEW_TS_URL to a typescript module URL.',
  );
}

const ts = await loadTypeScript();
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
const SUPPORTED_EXTS = new Set([
  '.js', '.mjs', '.cjs', '.jsx', '.ts', '.mts', '.tsx', '.py', '.css', '.html', '.yaml', '.yml', '.json',
]);

function scriptKindOf(filePath) {
  if (filePath.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (filePath.endsWith('.jsx')) return ts.ScriptKind.JSX;
  if (filePath.endsWith('.ts') || filePath.endsWith('.mts')) return ts.ScriptKind.TS;
  return ts.ScriptKind.JS;
}

function parseTs(filePath, text) {
  return ts.createSourceFile(filePath, text, ts.ScriptTarget.Latest, true, scriptKindOf(filePath));
}

function collectTokenLeaves(sf) {
  const result = [];
  function walk(node) {
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) return;
    if (node.kind <= ts.SyntaxKind.LastToken && node.kind !== ts.SyntaxKind.EndOfFileToken) {
      const start = node.getStart(sf);
      result.push({ kind: node.kind, start, end: node.end, text: sf.text.slice(start, node.end) });
      return;
    }
    for (const child of node.getChildren(sf)) walk(child);
  }
  walk(sf);
  return result.sort((a, b) => a.start - b.start);
}

function scanTriviaGap(original, cursor, gapEnd, relPath, directivesRetained) {
  const comments = [];
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    original,
    undefined,
    cursor,
    gapEnd - cursor,
  );
  for (let k = scanner.scan(); k !== ts.SyntaxKind.EndOfFileToken; k = scanner.scan()) {
    if (k === ts.SyntaxKind.SingleLineCommentTrivia || k === ts.SyntaxKind.MultiLineCommentTrivia) {
      comments.push({ start: scanner.getTokenPos(), end: scanner.getTextPos() });
    } else if (k === ts.SyntaxKind.ShebangTrivia) {
      directivesRetained.push(`${relPath}: shebang line 1`);
    } else if (k !== ts.SyntaxKind.WhitespaceTrivia && k !== ts.SyntaxKind.NewLineTrivia) {
      throw new Error(`${relPath}: unsupported trivia ${ts.SyntaxKind[k]} at ${scanner.getTokenPos()}`);
    }
  }
  return comments;
}

function collectExcludedStatementRanges(sf, depSelection) {
  if (!depSelection) return [];
  const excluded = [];
  for (const stmt of sf.statements) {
    const startPos = stmt.getStart(sf);
    const lineStart = sf.getLineAndCharacterOfPosition(startPos).line + 1;
    const lineEnd = sf.getLineAndCharacterOfPosition(stmt.end).line + 1;
    if (lineEnd < depSelection.from || lineStart > depSelection.to) {
      excluded.push({ start: startPos, end: stmt.end, lineStart, lineEnd });
    }
  }
  return excluded;
}

function collectStringLiteralsWithCommentSyntax(tokens, sf) {
  const stringKinds = new Set([
    ts.SyntaxKind.StringLiteral,
    ts.SyntaxKind.NoSubstitutionTemplateLiteral,
    ts.SyntaxKind.TemplateHead,
    ts.SyntaxKind.TemplateMiddle,
    ts.SyntaxKind.TemplateTail,
  ]);
  const lines = [];
  for (const tok of tokens) {
    if (stringKinds.has(tok.kind) && (/\/\*[\s\S]*?\*\//.test(tok.text) || /<!--[\s\S]*?-->/.test(tok.text))) {
      lines.push(sf.getLineAndCharacterOfPosition(tok.start).line + 1);
    }
  }
  return lines;
}

function prepareTsOrJsFile(relPath, original, depSelection, directivesRetained) {
  const sf = parseTs(relPath, original);
  if (sf.parseDiagnostics.length > 0) throw new Error(`${relPath}: original parse diagnostics`);
  const tokens = collectTokenLeaves(sf);
  const comments = [];
  let cursor = 0;

  for (const tok of [...tokens, { start: original.length, end: original.length }]) {
    if (tok.start < cursor) throw new Error(`${relPath}: overlapping AST tokens`);
    comments.push(...scanTriviaGap(original, cursor, tok.start, relPath, directivesRetained));
    cursor = tok.end;
  }

  const excluded = collectExcludedStatementRanges(sf, depSelection);
  const keptTokens = tokens.filter((t) => !excluded.some((r) => t.start >= r.start && t.end <= r.end));
  const stringCommentLines = collectStringLiteralsWithCommentSyntax(keptTokens, sf);

  const prepared = maskRangesWithSpaces(original, [...comments, ...excluded]);
  const preparedSf = parseTs(relPath, prepared);
  if (preparedSf.parseDiagnostics.length > 0) throw new Error(`${relPath}: prepared parse diagnostics`);

  const actualTokens = collectTokenLeaves(preparedSf);
  if (JSON.stringify(keptTokens) !== JSON.stringify(actualTokens)) {
    throw new Error(`${relPath}: non-comment token fidelity failed`);
  }

  return {
    prepared,
    meta: {
      kind: 'code',
      commentRanges: comments.length,
      excludedRanges: excluded.map((e) => [e.lineStart, e.lineEnd]),
      stringCommentLiteralsAtLines: stringCommentLines,
      tokenCount: actualTokens.length,
      tokenSha256: sha256(JSON.stringify(actualTokens)),
    },
  };
}

function dispatchSingleFileMasker(relPath, original, depSelection, directivesRetained) {
  const ext = path.extname(relPath).toLowerCase();
  if (ext === '.py') return preparePythonFile(relPath, original, directivesRetained);
  if (ext === '.css') return prepareCssFile(original);
  if (ext === '.html') {
    return prepareHtmlFile(relPath, original, (subPath, body) =>
      prepareTsOrJsFile(subPath, body, null, directivesRetained),
    );
  }
  if (ext === '.yaml' || ext === '.yml') return prepareYamlOrJsonFile(relPath, original, 'yaml');
  if (ext === '.json') return prepareYamlOrJsonFile(relPath, original, 'json');
  return prepareTsOrJsFile(relPath, original, depSelection, directivesRetained);
}

function writePreparedArtifact(outDir, relPath, original, res, manifestFiles) {
  const { prepared, meta } = res;
  if (prepared.length !== original.length || original.split('\n').length !== prepared.split('\n').length) {
    throw new Error(`${relPath}: line/length fidelity failed`);
  }
  const destination = path.join(outDir, 'view', relPath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, prepared);
  manifestFiles.push({
    source: relPath,
    prepared: path.relative(outDir, destination).replaceAll('\\', '/'),
    originalSha256: sha256(original),
    preparedSha256: sha256(prepared),
    ...meta,
  });
}

function runGit(root, gArgs) {
  try {
    return cp.execFileSync('git', gArgs, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function discoverGitDiffFiles(root, baseRefArg) {
  const base = baseRefArg || runGit(root, ['merge-base', 'HEAD', 'origin/main']) || 'HEAD~1';
  const committed = runGit(root, ['diff', '--name-only', `${base}...HEAD`]).split('\n').filter(Boolean);
  const working = runGit(root, ['status', '--porcelain'])
    .split('\n')
    .map((l) => l.trim().match(/^\S+\s+(?:.+ -> )?(.+)$/)?.[1]?.trim())
    .filter(Boolean);
  const all = [...new Set([...committed, ...working])];
  return all.filter((f) => SUPPORTED_EXTS.has(path.extname(f).toLowerCase()) && fs.existsSync(path.join(root, f)));
}

export function parseCliConfig(argv) {
  const args = argv.slice(2);
  if (args.length === 1 && args[0].endsWith('.json')) {
    const cfg = JSON.parse(fs.readFileSync(args[0], 'utf8'));
    return {
      root: process.env.BLIND_REVIEW_ROOT ?? process.cwd(),
      out: cfg.out,
      allowDirty: Boolean(cfg.allowDirty),
      code: cfg.code ?? [],
      deps: cfg.deps ?? {},
      yaml: cfg.yaml ?? [],
      json: cfg.json ?? [],
    };
  }
  const outIdx = args.indexOf('--out');
  const rootIdx = args.indexOf('--root');
  const diffIdx = args.indexOf('--git-diff');
  const allowDirty = args.includes('--allow-dirty') || diffIdx !== -1;
  const root =
    rootIdx !== -1 && args[rootIdx + 1]
      ? path.resolve(args[rootIdx + 1])
      : process.env.BLIND_REVIEW_ROOT ?? process.cwd();
  const skip = new Set([outIdx, outIdx + 1, rootIdx, rootIdx + 1]);
  let diffBase = null;
  if (diffIdx !== -1) {
    skip.add(diffIdx);
    if (args[diffIdx + 1] && !args[diffIdx + 1].startsWith('--')) {
      diffBase = args[diffIdx + 1];
      skip.add(diffIdx + 1);
    }
  }
  const explicitFiles = args.filter((a, i) => !skip.has(i) && !a.startsWith('--'));
  const files = diffIdx !== -1 ? [...new Set([...explicitFiles, ...discoverGitDiffFiles(root, diffBase)])] : explicitFiles;
  if (outIdx === -1 || !args[outIdx + 1] || files.length === 0) {
    throw new Error('Usage: node prepare-view.mjs --out <outDir> [--root <dir>] [--allow-dirty] [--git-diff [baseRef]] <files...> | <config.json>');
  }
  return { root, out: path.resolve(args[outIdx + 1]), allowDirty, code: files, deps: {}, yaml: [], json: [] };
}

function readGitMetadata(root, allowDirty) {
  const dirty = Boolean(runGit(root, ['status', '--porcelain']));
  if (dirty && !allowDirty) throw new Error('working tree dirty (pass --allow-dirty to prepare an in-flight view)');
  const head = runGit(root, ['rev-parse', 'HEAD']) || 'UNCOMMITTED';
  const base = runGit(root, ['merge-base', 'HEAD', 'origin/main']) || head;
  const changedFiles = base !== head ? runGit(root, ['diff', '--name-only', base, head]).split('\n').filter(Boolean) : [];
  return { base, head, dirty, changedFiles };
}

export function runPrepareView(cfg) {
  const gitMeta = readGitMetadata(cfg.root, cfg.allowDirty);
  const manifest = {
    base: gitMeta.base,
    head: gitMeta.head,
    dirtyWorkingTreeDisclosed: gitMeta.dirty,
    changedFiles: gitMeta.changedFiles,
    typescript: ts.version,
    status: 'INCOMPLETE',
    files: [],
    directivesRetained: [],
    method: 'AST token-leaf & trivia scanner masking for TS/JS/Py/CSS/HTML/YAML/JSON; exact byte/line length preserved.',
  };
  fs.mkdirSync(path.join(cfg.out, 'view'), { recursive: true });

  try {
    const allTargets = [
      ...cfg.code,
      ...Object.keys(cfg.deps),
      ...(cfg.yaml || []),
      ...(cfg.json || []),
    ];
    for (const relPath of [...new Set(allTargets)]) {
      const original = fs.readFileSync(path.join(cfg.root, relPath), 'utf8');
      const res = dispatchSingleFileMasker(relPath, original, cfg.deps?.[relPath], manifest.directivesRetained);
      writePreparedArtifact(cfg.out, relPath, original, res, manifest.files);
    }
    manifest.status = 'PREPARED';
  } catch (err) {
    manifest.error = String(err);
  }

  fs.writeFileSync(path.join(cfg.out, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function runSelftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blind-prep-test-'));
  try {
    fs.writeFileSync(
      path.join(tmp, 'sample.js'),
      '#!/usr/bin/env node\n// secret comment\nexport const pat = "/* kept in string */"; /* inline */\n',
    );
    fs.writeFileSync(
      path.join(tmp, 'sample.py'),
      '#!/usr/bin/env python3\n"""Module docstring secret"""\n# py comment\ndef mul(x, y):\n    """Func docstring secret"""\n    return x * y\n',
    );
    fs.writeFileSync(
      path.join(tmp, 'sample.css'),
      '/* theme comment */\n.btn::after { content: "/* keep */"; color: #111; /* inline css */ }\n',
    );
    fs.writeFileSync(
      path.join(tmp, 'sample.html'),
      '<!-- html secret -->\n<style>/* css secret */ .a{color:red}</style>\n<script>// js secret\nconst x = 1;</script>\n',
    );
    const manifest = runPrepareView({
      root: tmp,
      out: path.join(tmp, 'out'),
      allowDirty: true,
      code: ['sample.js', 'sample.py', 'sample.css', 'sample.html'],
      deps: {},
    });
    const jsView = fs.readFileSync(path.join(tmp, 'out/view/sample.js'), 'utf8');
    const pyView = fs.readFileSync(path.join(tmp, 'out/view/sample.py'), 'utf8');
    const cssView = fs.readFileSync(path.join(tmp, 'out/view/sample.css'), 'utf8');
    const htmlView = fs.readFileSync(path.join(tmp, 'out/view/sample.html'), 'utf8');
    const ok =
      manifest.status === 'PREPARED' &&
      !jsView.includes('secret comment') &&
      !jsView.includes('inline') &&
      jsView.includes('/* kept in string */') &&
      !pyView.includes('py comment') &&
      !pyView.includes('Module docstring secret') &&
      !pyView.includes('Func docstring secret') &&
      pyView.includes('def mul(x, y):') &&
      !cssView.includes('theme comment') &&
      cssView.includes('/* keep */') &&
      !htmlView.includes('html secret') &&
      !htmlView.includes('css secret') &&
      !htmlView.includes('js secret');
    console.log(JSON.stringify({ selftest: ok ? 'PASS' : 'FAIL', status: manifest.status, files: manifest.files.length }, null, 2));
    process.exitCode = ok ? 0 : 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1]))) {
  if (process.argv.includes('--selftest')) {
    runSelftest();
  } else {
    const manifest = runPrepareView(parseCliConfig(process.argv));
    console.log(JSON.stringify({ status: manifest.status, files: manifest.files.length, error: manifest.error }));
    if (manifest.status !== 'PREPARED') process.exitCode = 1;
  }
}
