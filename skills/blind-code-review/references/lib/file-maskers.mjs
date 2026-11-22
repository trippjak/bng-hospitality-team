/**
 * blind-code-review/references/lib/file-maskers.mjs — Language-specific comment & docstring maskers.
 *
 * Preserves exact byte length and line numbers across:
 *   - Python (.py): # comments + module/class/function docstrings (interior characters space-masked)
 *   - CSS (.css): block comments outside quoted strings
 *   - HTML (.html): <!-- ... --> comments + inline <style> and <script> comment masking
 *   - YAML (.yaml/.yml) & JSON (.json "why" fields)
 */

import cp from 'node:child_process';

// Windows installs expose `python` or the `py` launcher, not `python3`; a missing launcher is a
// clear error, never a crash from spawnSync.
const PYTHON_LAUNCHERS = process.platform === 'win32'
  ? [['py', ['-3']], ['python', []], ['python3', []]]
  : [['python3', []], ['python', []]];

function runPython(script, input) {
  for (const [exe, prefix] of PYTHON_LAUNCHERS) {
    try {
      return cp.execFileSync(exe, [...prefix, '-c', script], { input, encoding: 'utf8' });
    } catch (err) {
      if (err && err.code === 'ENOENT') continue;
      throw err;
    }
  }
  throw new Error('No Python 3 interpreter found (tried python3, python, py -3)');
}

export function maskRangesWithSpaces(original, ranges) {
  const chars = original.split('');
  for (const r of ranges) {
    for (let i = r.start; i < r.end; i += 1) {
      if (chars[i] !== '\r' && chars[i] !== '\n') chars[i] = ' ';
    }
  }
  return chars.join('');
}

const PY_MASK_SCRIPT = `
import io, json, sys, tokenize, ast

src = sys.stdin.read()
lines = src.splitlines(True)
grid = [list(l) for l in lines]
retained = []
comment_count = 0
docstring_count = 0

for tok in tokenize.generate_tokens(io.StringIO(src).readline):
    if tok.type == tokenize.COMMENT:
        r, c = tok.start[0] - 1, tok.start[1]
        if r == 0 and tok.string.startswith("#!"):
            retained.append("shebang line 1")
            continue
        comment_count += 1
        for i in range(c, min(len(grid[r]), tok.end[1])):
            if grid[r][i] not in ("\\r", "\\n"):
                grid[r][i] = " "

tree = ast.parse(src)
doc_nodes = []
for node in ast.walk(tree):
    if isinstance(node, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
        if node.body and isinstance(node.body[0], ast.Expr):
            val = node.body[0].value
            if isinstance(val, ast.Constant) and isinstance(val.value, str):
                doc_nodes.append(val)

line_offsets = [0]
for l in lines:
    line_offsets.append(line_offsets[-1] + len(l))

def to_abs(lineno, col):
    return line_offsets[lineno - 1] + col

flat = list("".join("".join(row) for row in grid))
for dnode in doc_nodes:
    start = to_abs(dnode.lineno, dnode.col_offset)
    end = to_abs(dnode.end_lineno, dnode.end_col_offset)
    segment = src[start:end]
    q_idx = 0
    while q_idx < len(segment) and segment[q_idx] in "rRuUbBfF":
        q_idx += 1
    quote = segment[q_idx:q_idx+3] if segment[q_idx:q_idx+3] in ('"""', "'''") else segment[q_idx:q_idx+1]
    inner_start = start + q_idx + len(quote)
    inner_end = end - len(quote)
    if inner_end > inner_start:
        docstring_count += 1
        for pos in range(inner_start, inner_end):
            if flat[pos] not in ("\\r", "\\n"):
                flat[pos] = " "

masked = "".join(flat)

def scrub_docs(t):
    for n in ast.walk(t):
        if isinstance(n, (ast.Module, ast.ClassDef, ast.FunctionDef, ast.AsyncFunctionDef)):
            if n.body and isinstance(n.body[0], ast.Expr):
                v = n.body[0].value
                if isinstance(v, ast.Constant) and isinstance(v.value, str):
                    v.value = ""
    return ast.dump(t)

if scrub_docs(ast.parse(src)) != scrub_docs(ast.parse(masked)):
    raise RuntimeError("Python AST parity mismatch after comment/docstring masking")

print(json.dumps({
    "prepared": masked,
    "retained": retained,
    "commentRanges": comment_count,
    "docstringsMasked": docstring_count
}))
`;

export function preparePythonFile(relPath, original, directivesRetained) {
  const raw = runPython(PY_MASK_SCRIPT, original);
  const parsed = JSON.parse(raw);
  for (const r of parsed.retained) directivesRetained.push(`${relPath}: ${r}`);
  return {
    prepared: parsed.prepared,
    meta: {
      kind: 'python',
      commentRanges: parsed.commentRanges,
      docstringsMasked: parsed.docstringsMasked,
    },
  };
}

function advanceCssQuote(text, index, quoteChar) {
  let i = index + 1;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === quoteChar) return i + 1;
    i += 1;
  }
  return text.length;
}

export function prepareCssFile(original) {
  const ranges = [];
  let i = 0;
  while (i < original.length) {
    const ch = original[i];
    if (ch === '"' || ch === "'") {
      i = advanceCssQuote(original, i, ch);
      continue;
    }
    if (ch === '/' && original[i + 1] === '*') {
      const endIdx = original.indexOf('*/', i + 2);
      const closeEnd = endIdx === -1 ? original.length : endIdx + 2;
      ranges.push({ start: i, end: closeEnd });
      i = closeEnd;
      continue;
    }
    i += 1;
  }
  return {
    prepared: maskRangesWithSpaces(original, ranges),
    meta: { kind: 'css', commentRanges: ranges.length },
  };
}

export function prepareHtmlFile(relPath, original, maskJsFn) {
  const htmlComments = [];
  for (const m of original.matchAll(/<!--[\s\S]*?-->/g)) {
    htmlComments.push({ start: m.index, end: m.index + m[0].length });
  }
  let working = maskRangesWithSpaces(original, htmlComments);
  let styleComments = 0;
  let scriptComments = 0;

  working = working.replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_, open, body, close) => {
    const res = prepareCssFile(body);
    styleComments += res.meta.commentRanges;
    return `${open}${res.prepared}${close}`;
  });

  working = working.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/gi, (_, open, body, close) => {
    if (!body.trim()) return `${open}${body}${close}`;
    const res = maskJsFn(`${relPath}#inline-script.js`, body);
    scriptComments += res.meta.commentRanges;
    return `${open}${res.prepared}${close}`;
  });

  return {
    prepared: working,
    meta: {
      kind: 'html',
      commentRanges: htmlComments.length + styleComments + scriptComments,
    },
  };
}

export function prepareYamlOrJsonFile(relPath, original, kind) {
  if (kind === 'yaml') {
    const commentRanges = [];
    const lines = original.split('\n');
    let offset = 0;
    for (const line of lines) {
      if (/^\s*#/.test(line)) {
        commentRanges.push({ start: offset, end: offset + line.length });
      }
      offset += line.length + 1;
    }
    return {
      prepared: maskRangesWithSpaces(original, commentRanges),
      meta: { kind: 'yaml', commentRanges: commentRanges.length },
    };
  }
  const prepared = original.replace(
    /("why":\s*")((?:[^"\\]|\\.)*)(")/g,
    (_, a, b, c) => a + b.replace(/[^\\]/g, ' ').replace(/\\/g, ' ') + c,
  );
  const stripWhy = (s) => JSON.stringify(JSON.parse(s), (k, v) => (k === 'why' ? undefined : v));
  if (stripWhy(original) !== stripWhy(prepared)) throw new Error(`${relPath}: json fidelity failed`);
  return { prepared, meta: { kind: 'json', masked: 'why values' } };
}
