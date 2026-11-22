/**
 * scripts/lib/ast_4d.mjs — 4D Deep-Module AST + CSS analyzer (R-12).
 * @deep-module: cohesive TS/Python/CSS/Cycle 4D analyzer behind 5 runtime exports.
 */

import { execFileSync } from 'node:child_process';

// Windows installs expose `python` or the `py` launcher, not `python3`; a missing launcher is a
// clear error, never a crash from spawnSync.
const PYTHON_LAUNCHERS = process.platform === 'win32'
  ? [['py', ['-3']], ['python', []], ['python3', []]]
  : [['python3', []], ['python', []]];

function runPython(script, input) {
  for (const [exe, prefix] of PYTHON_LAUNCHERS) {
    try {
      return execFileSync(exe, [...prefix, '-c', script], { input, encoding: 'utf8' });
    } catch (err) {
      if (err && err.code === 'ENOENT') continue;
      throw err;
    }
  }
  throw new Error('No Python 3 interpreter found (tried python3, python, py -3)');
}
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function globalNodeModules() {
  try {
    return execFileSync('npm', ['root', '-g'], { encoding: 'utf8', shell: process.platform === 'win32' }).trim();
  } catch {
    return null;
  }
}

// Resolution order: FOURD_TS_MODULE, the skill's own resolution, the caller's project, the global
// npm root. No machine-specific paths: a miss is a named install error, not a silent fallback.
function loadTypeScript() {
  const candidates = [process.env.FOURD_TS_MODULE, 'typescript', `${process.cwd()}/node_modules/typescript`];
  for (const candidate of candidates.filter(Boolean)) {
    try {
      return require(candidate);
    } catch {
      // try next candidate
    }
  }
  const globalRoot = globalNodeModules();
  if (globalRoot) {
    try {
      return require(`${globalRoot}/typescript`);
    } catch {
      // fall through to the named error
    }
  }
  throw new Error(
    'TypeScript compiler API not found. Install it where this tool can see it: `npm i -g typescript`, ' +
      'or run from a project with typescript in node_modules, or set FOURD_TS_MODULE to a typescript module path.',
  );
}

const ts = loadTypeScript();

export const LIMITS = {
  maxFileLines: 400,
  deepModuleFileLines: 500,
  maxDeepModuleExports: 5,
  maxFunctionLines: 60,
  linearFunctionLines: 80,
  maxParams: 5,
  targetCognitive: 15,
  maxCognitive: 25,
};

function isFunctionNode(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isArrowFunction(node) ||
    ts.isFunctionExpression(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function getFunctionName(node, sf) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  if (node.parent && ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
    return node.parent.name.text;
  }
  const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
  return `<anon@${line + 1}>`;
}

function isNestingIncrementNode(node) {
  return (
    ts.isIfStatement(node) ||
    ts.isForStatement(node) ||
    ts.isForInStatement(node) ||
    ts.isForOfStatement(node) ||
    ts.isWhileStatement(node) ||
    ts.isDoStatement(node) ||
    ts.isSwitchStatement(node) ||
    ts.isCatchClause(node) ||
    ts.isConditionalExpression(node)
  );
}

function isElseIf(node) {
  return ts.isIfStatement(node) && node.parent && ts.isIfStatement(node.parent) && node.parent.elseStatement === node;
}

function computeTsCognitiveComplexity(fnNode) {
  let score = 0;
  function walk(node, depth) {
    let nextDepth = depth;
    if (isNestingIncrementNode(node)) {
      if (isElseIf(node)) {
        score += 1;
      } else {
        score += 1 + depth;
        nextDepth = depth + 1;
      }
    } else if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ||
        node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    ) {
      score += 1;
    }
    ts.forEachChild(node, (child) => {
      if (!isFunctionNode(child)) walk(child, nextDepth);
    });
  }
  if (fnNode.body) walk(fnNode.body, 0);
  return score;
}

function extractRelativeSpecifiers(sf) {
  const specs = [];
  ts.forEachChild(sf, (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specs.push(node.moduleSpecifier.text);
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      specs.push(node.moduleSpecifier.text);
    }
  });
  return specs.filter((s) => s.startsWith('.'));
}

function collectFunctionViolations(relPath, fn, lineCeiling) {
  const violations = [];
  if (fn.lines > lineCeiling) {
    violations.push({
      file: relPath,
      rule: 'function-lines',
      message: `${relPath}:${fn.startLine} function "${fn.name}" has ${fn.lines} lines (limit <= ${lineCeiling})`,
    });
  }
  if (fn.params > LIMITS.maxParams) {
    violations.push({
      file: relPath,
      rule: 'max-params',
      message: `${relPath}:${fn.startLine} function "${fn.name}" has ${fn.params} params (limit <= ${LIMITS.maxParams})`,
    });
  }
  if (fn.cognitive > LIMITS.maxCognitive) {
    violations.push({
      file: relPath,
      rule: 'cognitive-complexity',
      message: `${relPath}:${fn.startLine} function "${fn.name}" has cognitive complexity ${fn.cognitive} (cap <= ${LIMITS.maxCognitive})`,
    });
  }
  return violations;
}

function isPassThroughTrampoline(fnNode) {
  const params = fnNode.parameters ?? [];
  if (params.length < 2) return false;
  const paramNames = [];
  for (const p of params) {
    if (!ts.isIdentifier(p.name) || p.dotDotDotToken || p.initializer) return false;
    paramNames.push(p.name.text);
  }
  let expr = null;
  if (fnNode.body && ts.isBlock(fnNode.body)) {
    if (fnNode.body.statements.length !== 1) return false;
    const stmt = fnNode.body.statements[0];
    if (!ts.isReturnStatement(stmt) || !stmt.expression) return false;
    expr = stmt.expression;
  } else if (fnNode.body) {
    expr = fnNode.body;
  }
  if (!expr || !ts.isCallExpression(expr)) return false;
  if (expr.arguments.length !== paramNames.length) return false;
  return expr.arguments.every((arg, idx) => ts.isIdentifier(arg) && arg.text === paramNames[idx]);
}

function inspectTsFunctionNode(node, sf, relPath, lines) {
  const name = getFunctionName(node, sf);
  const startLine = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const endLine = sf.getLineAndCharacterOfPosition(node.getEnd()).line + 1;
  const fnLines = endLine - startLine + 1;
  const params = node.parameters ? node.parameters.length : 0;
  const cognitive = computeTsCognitiveComplexity(node);
  const trampoline = isPassThroughTrampoline(node);
  const preText = lines.slice(Math.max(0, startLine - 3), startLine).join('\n');
  const fnCeiling = /@linear:/i.test(preText) ? LIMITS.linearFunctionLines : LIMITS.maxFunctionLines;
  const metric = { name, startLine, endLine, lines: fnLines, params, cognitive, trampoline };
  return { metric, violations: collectFunctionViolations(relPath, metric, fnCeiling) };
}

function hasExportModifier(node) {
  if (!ts.canHaveModifiers(node)) return false;
  const mods = ts.getModifiers(node);
  return Boolean(mods && mods.some((m) => m.kind === ts.SyntaxKind.ExportKeyword));
}

function countStatementExports(node) {
  if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) return 0;
  if (ts.isExportAssignment(node)) return 1;
  if (ts.isExportDeclaration(node)) {
    if (node.isTypeOnly) return 0;
    if (node.exportClause && ts.isNamedExports(node.exportClause)) {
      return node.exportClause.elements.filter((el) => !el.isTypeOnly).length;
    }
    return 1;
  }
  if (!hasExportModifier(node)) return 0;
  if (ts.isVariableStatement(node)) return node.declarationList.declarations.length;
  return 1;
}

function countRuntimeExports(sf) {
  let count = 0;
  for (const stmt of sf.statements) count += countStatementExports(stmt);
  return count;
}

export function analyzeTsSource(relPath, content) {
  const lines = content.split(/\r?\n/);
  const lineCount = content.endsWith('\n') ? lines.length - 1 : lines.length;
  const headerText = lines.slice(0, 15).join('\n');
  const hasDeepModuleTag = /@deep-module:/i.test(headerText);
  const fileCeiling = hasDeepModuleTag ? LIMITS.deepModuleFileLines : LIMITS.maxFileLines;
  const violations = [];

  if (lineCount > fileCeiling) {
    violations.push({
      file: relPath,
      rule: 'file-lines',
      message: `${relPath} has ${lineCount} lines (limit <= ${fileCeiling})`,
    });
  }

  const sf = ts.createSourceFile(relPath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const runtimeExports = countRuntimeExports(sf);
  const depthRatio = Number((lineCount / Math.max(1, runtimeExports)).toFixed(1));

  if (hasDeepModuleTag && lineCount > LIMITS.maxFileLines && runtimeExports > LIMITS.maxDeepModuleExports) {
    violations.push({
      file: relPath,
      rule: 'deep-module-exports',
      message: `${relPath} uses @deep-module (${lineCount} lines) with ${runtimeExports} runtime exports (limit <= ${LIMITS.maxDeepModuleExports})`,
    });
  }

  const functions = [];
  function visit(node) {
    if (isFunctionNode(node)) {
      const inspected = inspectTsFunctionNode(node, sf, relPath, lines);
      functions.push(inspected.metric);
      violations.push(...inspected.violations);
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);

  const trampolines = functions.filter((f) => f.trampoline);
  if (trampolines.length >= 2 || (trampolines.length >= 1 && lineCount < 35 && runtimeExports >= 1)) {
    violations.push({
      file: relPath,
      rule: 'shallow-trampoline',
      message: `${relPath} contains ${trampolines.length} pass-through trampoline function(s) (${trampolines.map((t) => t.name).join(', ')}) — Ousterhout deletion test violation`,
    });
  }

  return {
    file: relPath,
    lines: lineCount,
    runtimeExports,
    depthRatio,
    trampolineCount: trampolines.length,
    functions,
    relativeImports: extractRelativeSpecifiers(sf),
    violations,
  };
}

const PY_AST_SCRIPT = `
import ast, json, sys
src = sys.stdin.read()
tree = ast.parse(src)
def cog(node, depth=0):
    total = 0
    for child in ast.iter_child_nodes(node):
        if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)): continue
        is_elif = isinstance(node, ast.If) and isinstance(child, ast.If) and child in node.orelse
        if is_elif: total += 1 + cog(child, depth)
        elif isinstance(child, (ast.If, ast.For, ast.AsyncFor, ast.While, ast.Try, ast.ExceptHandler, ast.IfExp)):
            total += 1 + depth + cog(child, depth + 1)
        elif isinstance(child, ast.BoolOp): total += max(1, len(child.values) - 1) + cog(child, depth)
        else: total += cog(child, depth)
    return total
fns = []
for n in ast.walk(tree):
    if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
        args = n.args
        pcount = len(args.posonlyargs) + len(args.args) + len(args.kwonlyargs)
        if pcount > 0 and args.args and args.args[0].arg in ('self', 'cls'): pcount -= 1
        flines = (n.end_lineno or n.lineno) - n.lineno + 1
        fns.append({"name": n.name, "startLine": n.lineno, "endLine": n.end_lineno or n.lineno, "lines": flines, "params": pcount, "cognitive": cog(n, 0)})
print(json.dumps(fns))
`;

export function analyzePySource(relPath, content) {
  const lines = content.split(/\r?\n/);
  const lineCount = content.endsWith('\n') ? lines.length - 1 : lines.length;
  const fileCeiling = /@deep-module:/i.test(content) ? LIMITS.deepModuleFileLines : LIMITS.maxFileLines;
  const violations = [];
  if (lineCount > fileCeiling) {
    violations.push({
      file: relPath,
      rule: 'file-lines',
      message: `${relPath} has ${lineCount} lines (limit <= ${fileCeiling})`,
    });
  }
  let functions = [];
  try {
    functions = JSON.parse(runPython(PY_AST_SCRIPT, content));
  } catch (err) {
    // One unparsable or unanalysable .py file is a finding on that file, never a scan abort.
    const unavailable = /No Python 3 interpreter/.test(String(err && err.message));
    violations.push({
      file: relPath,
      rule: unavailable ? 'python-unavailable' : 'python-parse-error',
      message: `${relPath}: ${unavailable ? err.message : 'Python AST analysis failed: ' + String(err && err.message).split('\n')[0]}`,
    });
  }
  for (const fn of functions) {
    violations.push(...collectFunctionViolations(relPath, fn, LIMITS.maxFunctionLines));
  }
  return {
    file: relPath,
    lines: lineCount,
    runtimeExports: functions.length,
    depthRatio: Number((lineCount / Math.max(1, functions.length)).toFixed(1)),
    functions,
    relativeImports: [],
    violations,
  };
}

export function findCircularComponents(adjacencyMap) {
  let index = 0;
  const indices = new Map();
  const lowlink = new Map();
  const stack = [];
  const onStack = new Set();
  const cycles = [];

  function strongConnect(v) {
    indices.set(v, index);
    lowlink.set(v, index);
    index += 1;
    stack.push(v);
    onStack.add(v);

    for (const w of adjacencyMap.get(v) ?? []) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlink.set(v, Math.min(lowlink.get(v), lowlink.get(w)));
      } else if (onStack.has(w)) {
        lowlink.set(v, Math.min(lowlink.get(v), indices.get(w)));
      }
    }

    if (lowlink.get(v) === indices.get(v)) {
      const scc = [];
      while (stack.length > 0) {
        const w = stack.pop();
        onStack.delete(w);
        scc.push(w);
        if (w === v) break;
      }
      if (scc.length > 1 || (adjacencyMap.get(v) ?? []).includes(v)) {
        cycles.push(scc.reverse());
      }
    }
  }

  for (const node of adjacencyMap.keys()) {
    if (!indices.has(node)) strongConnect(node);
  }
  return cycles;
}

function handleCssOpenBrace(rawHeader, stack, rules) {
  const header = rawHeader.trim().replace(/\s+/g, ' ');
  if (header.startsWith('@')) {
    stack.push(header);
    return;
  }
  if (header.length > 0) rules.push({ context: stack[stack.length - 1], header });
  stack.push('__rule__');
}

function extractCssRulesByContext(stripped) {
  const stack = ['root'];
  const rules = [];
  let buf = '';
  for (const ch of stripped) {
    if (ch === '{') {
      handleCssOpenBrace(buf, stack, rules);
      buf = '';
    } else if (ch === '}') {
      buf = '';
      if (stack.length > 1) stack.pop();
    } else {
      buf += ch;
    }
  }
  return rules.filter((r) => !r.context.toLowerCase().startsWith('@keyframes'));
}

export function analyzeCssSource(content) {
  const stripped = content.replace(/\/\*[\s\S]*?\*\//g, '');
  const lines = content.split(/\r?\n/);
  const lineCount = content.endsWith('\n') ? lines.length - 1 : lines.length;
  const mediaMatches = stripped.match(/@media\b/gi) ?? [];
  const importantMatches = stripped.match(/!important\b/gi) ?? [];
  const colorMatches =
    stripped.match(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)|hsla?\([^)]+\)/g) ?? [];
  const uniqueColors = new Set(colorMatches.map((c) => c.toLowerCase().replace(/\s+/g, '')));

  const rules = extractCssRulesByContext(stripped);
  const seenInContext = new Set();
  const duplicateSelectors = [];
  let selectorCount = 0;

  for (const rule of rules) {
    selectorCount += rule.header.split(',').filter((s) => s.trim().length > 0).length;
    const key = `${rule.context} :: ${rule.header}`;
    if (seenInContext.has(key)) {
      duplicateSelectors.push(key);
    } else {
      seenInContext.add(key);
    }
  }

  return {
    lines: lineCount,
    bytes: Buffer.byteLength(content, 'utf8'),
    ruleBlocks: rules.length,
    selectors: selectorCount,
    mediaQueries: mediaMatches.length,
    uniqueColors: uniqueColors.size,
    importantCount: importantMatches.length,
    hasHiddenGuard: /\[hidden\]\[hidden\]/.test(stripped),
    sameContextDuplicateSelectors: duplicateSelectors.length,
    duplicateSelectors,
  };
}
