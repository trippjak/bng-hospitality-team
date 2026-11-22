#!/usr/bin/env node
/**
 * seat-dispatch.mjs — Subscription-strict CLI dispatcher for external UX/UI Model Seats.
 * Strips ambient API keys (ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, OPENAI_API_KEY) by default,
 * passes prompts cleanly via stdin, and blocks unsigned OAuth loudly rather than billing API keys.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildSanitizedEnv, resolveClaudeBinary, resolveCodexBinary } from "./studio-preflight.mjs";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const MEASURE_UI_SCRIPT = resolve(SCRIPT_DIR, "..", "..", "ui-ratchet", "scripts", "measure-ui-ratchet.mjs");
const VALID_GATES = new Set(["no-vibe-code", "ux-ui-qa"]);
const VALID_AGENTS = new Set(["no-vibe-code", "ux-ui-qa", "ux-copywriter"]);

const USAGE = `Usage:
  seat-dispatch.mjs --seat <codex-cli|claude-cli> (--prompt <text> | --prompt-file <path> | --gate <no-vibe-code|ux-ui-qa> | --agent <ux-copywriter|no-vibe-code|ux-ui-qa>)
    [--evidence-file <path>] [--target <dir>] [--brand-tokens <path>] [--cwd <dir>] [--model <id>]
    [--sandbox <read-only|workspace-write>] [--output <path>] [--image <path>]...
    [--no-tools] [--allow-api-billing] [--dry-run]`;

const BOOL_FLAGS = {
  "--allow-api-billing": "allowApiBilling",
  "--dry-run": "dryRun",
  "--no-tools": "noTools",
};

const VALUE_FLAGS = {
  "--seat": (opts, v) => { opts.seat = v; },
  "--gate": (opts, v) => { opts.gate = v; },
  "--agent": (opts, v) => { opts.agent = v; },
  "--evidence-file": (opts, v) => { opts.evidenceFile = resolve(v); },
  "--target": (opts, v) => { opts.target = resolve(v); },
  "--brand-tokens": (opts, v) => { opts.brandTokensPath = resolve(v); },
  "--prompt": (opts, v) => { opts.prompt = v; },
  "--prompt-file": (opts, v) => { opts.promptFile = v; },
  "--cwd": (opts, v) => { opts.cwd = resolve(v); },
  "--model": (opts, v) => { opts.model = v; },
  "--sandbox": (opts, v) => { opts.sandbox = v; },
  "--output": (opts, v) => { opts.output = resolve(v); },
  "--image": (opts, v) => { opts.images.push(resolve(v)); },
};

function validateAgentFlags(opts) {
  if (opts.gate && !VALID_GATES.has(opts.gate)) {
    throw new Error(`Invalid --gate "${opts.gate}". Use "no-vibe-code" or "ux-ui-qa".`);
  }
  if (opts.agent && !VALID_AGENTS.has(opts.agent)) {
    throw new Error(`Invalid --agent "${opts.agent}". Use "ux-copywriter", "no-vibe-code", or "ux-ui-qa".`);
  }
  if (opts.gate && opts.agent && opts.gate !== opts.agent) {
    throw new Error("Conflicting --gate and --agent values.");
  }
  return opts.agent || opts.gate;
}

function resolveDefaultPrompt(activeAgent) {
  return activeAgent === "ux-copywriter"
    ? "Run mode: audit on the provided target and return concise before/after UI copy rewrites."
    : "Execute pass_type: single on the provided target and evidence.";
}

function validateParsedArgs(opts) {
  if (!["codex-cli", "claude-cli"].includes(opts.seat)) {
    throw new Error(`Invalid --seat "${opts.seat}". Use "codex-cli" or "claude-cli".`);
  }
  const activeAgent = validateAgentFlags(opts);
  if (!["read-only", "workspace-write"].includes(opts.sandbox)) {
    throw new Error(`Invalid --sandbox "${opts.sandbox}". Use "read-only" or "workspace-write".`);
  }
  if (opts.promptFile) opts.prompt = readFileSync(resolve(opts.promptFile), "utf8");
  if (activeAgent && !opts.prompt.trim()) opts.prompt = resolveDefaultPrompt(activeAgent);
  if (!opts.prompt.trim()) throw new Error("Provide a non-empty --prompt, --prompt-file, --gate, or --agent.");
  return opts;
}

export function parseArgs(argv) {
  const opts = {
    seat: "",
    gate: "",
    agent: "",
    evidenceFile: "",
    target: "",
    brandTokensPath: "",
    prompt: "",
    promptFile: "",
    cwd: process.cwd(),
    model: "",
    sandbox: "read-only",
    output: "",
    images: [],
    noTools: false,
    allowApiBilling: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--help" || flag === "-h") { console.log(USAGE); process.exit(0); }
    if (BOOL_FLAGS[flag]) { opts[BOOL_FLAGS[flag]] = true; continue; }
    const setter = VALUE_FLAGS[flag];
    if (!setter) throw new Error(`Unknown flag: ${flag}`);
    const val = argv[++i];
    if (val === undefined) throw new Error(`Missing value for ${flag}`);
    setter(opts, val);
  }
  return validateParsedArgs(opts);
}

function loadAgentPrompt(agentName) {
  const agentPath = resolve(SCRIPT_DIR, "..", "..", "..", "agents", `${agentName}.md`);
  if (!existsSync(agentPath)) throw new Error(`Missing subagent definition: ${agentPath}`);
  return readFileSync(agentPath, "utf8").replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
}

function collectGateEvidenceJson(opts) {
  if (!opts.evidenceFile && !opts.target) return "";
  if (opts.dryRun) return '{"dryRunEvidence":true}';
  if (opts.evidenceFile) {
    const evPath = resolve(opts.evidenceFile);
    if (!existsSync(evPath)) throw new Error(`Evidence file not found: ${evPath}`);
    return readFileSync(evPath, "utf8").trim();
  }
  const args = [MEASURE_UI_SCRIPT, opts.target, "--evidence"];
  if (opts.brandTokensPath) args.push("--brand-tokens", opts.brandTokensPath);
  const res = spawnSync(process.execPath, args, { encoding: "utf8", timeout: 30000, shell: false });
  if (res.error) throw res.error;
  return (res.stdout || "").trim();
}

function formatTargetContext(opts) {
  const lines = [];
  if (opts.target) lines.push(`targetDir: ${opts.target}`);
  if (opts.evidenceFile) lines.push(`evidenceFile: ${opts.evidenceFile}`);
  if (opts.brandTokensPath) lines.push(`brandTokensPath: ${opts.brandTokensPath}`);
  return lines.length ? `[Target Context]\n${lines.join("\n")}` : "";
}

function composeEffectivePrompt(opts) {
  const activeAgent = opts.agent || opts.gate;
  if (!activeAgent) return opts.prompt;
  const sections = [loadAgentPrompt(activeAgent)];
  const targetContext = formatTargetContext(opts);
  if (targetContext) sections.push(targetContext);
  const evidenceJson = collectGateEvidenceJson(opts);
  if (evidenceJson) sections.push(`[Pre-Computed Classifier Evidence]\n${evidenceJson}`);
  sections.push(`[Task Brief]\n${opts.prompt}`);
  return sections.join("\n\n");
}

export function buildDispatchSpec(opts, baseEnv = process.env) {
  const env = opts.allowApiBilling ? { ...baseEnv } : buildSanitizedEnv(baseEnv);
  const images = opts.images || [];
  let stdinPrompt = composeEffectivePrompt(opts);

  if (opts.seat === "codex-cli") {
    const { command, prefixArgs } = resolveCodexBinary();
    const args = [
      ...prefixArgs,
      "exec",
      "-c",
      'forced_login_method="chatgpt"',
      "--ephemeral",
      "--skip-git-repo-check",
      "-s",
      opts.sandbox,
      "-C",
      opts.cwd,
    ];
    for (const img of images) args.push("-i", img);
    if (opts.model) args.push("-m", opts.model);
    if (opts.output) args.push("-o", opts.output);
    args.push("-"); // read prompt from stdin safely
    return { command, args, env, usesStdin: true, stdinPrompt };
  }

  const { command, prefixArgs } = resolveClaudeBinary();
  const args = [...prefixArgs, "-p", "--output-format", "json"];
  if (images.length > 0) {
    args.push("--tools", "Read", "--allowedTools", "Read", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}');
    for (const dir of new Set(images.map((p) => dirname(p)))) args.push("--add-dir", dir);
    stdinPrompt = `Inspect these rendered UI screenshots first via the Read tool:\n${images.map((p) => `- ${p}`).join("\n")}\n\n${stdinPrompt}`;
  } else {
    if (opts.sandbox === "read-only" && !opts.noTools) args.push("--permission-mode", "plan");
    if (opts.noTools) args.push("--tools", "", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}');
  }
  if (opts.model) args.push("--model", opts.model);
  return { command, args, env, usesStdin: true, stdinPrompt };
}

function checkClaudeSubscription(env) {
  const { command, prefixArgs } = resolveClaudeBinary();
  const probe = spawnSync(command, [...prefixArgs, "auth", "status"], {
    env,
    encoding: "utf8",
    timeout: 8000,
    shell: false,
  });
  try {
    const parsed = JSON.parse((probe.stdout || "").trim() || "{}");
    return Boolean(parsed.loggedIn) && parsed.authMethod !== "api_key";
  } catch {
    return false;
  }
}

function buildDryRunResponse(opts, spec) {
  return {
    status: 0,
    payload: {
      dryRun: true,
      seat: opts.seat,
      gate: opts.gate || null,
      agent: opts.agent || opts.gate || null,
      sandbox: opts.sandbox,
      cwd: opts.cwd,
      strippedBillingKeys: !opts.allowApiBilling,
      envHasAnthropicKey: Boolean(spec.env.ANTHROPIC_API_KEY),
      envHasOpenAiKey: Boolean(spec.env.OPENAI_API_KEY),
      promptBytes: Buffer.byteLength(spec.stdinPrompt || "", "utf8"),
      command: spec.command,
      args: spec.args,
    },
  };
}

function buildUnsignedClaudeResponse() {
  return {
    status: 2,
    payload: {
      status: "blocked_oauth_missing",
      seat: "claude-cli",
      fallbackSeat: "antigravity-native",
      recommendedModels: ["claude-opus-5-5-high", "claude-sonnet-5-5-high"],
      remediation: "Remove-Item Env:ANTHROPIC_API_KEY -ErrorAction SilentlyContinue; claude auth login",
    },
  };
}

function parseClaudeEnvelope(rawText) {
  if (!rawText.startsWith("{")) return { output: rawText, claudeMeta: null };
  try {
    const parsed = JSON.parse(rawText);
    if (typeof parsed.result !== "string") return { output: rawText, claudeMeta: null };
    return {
      output: parsed.result,
      claudeMeta: {
        sessionId: parsed.session_id || null,
        models: Object.keys(parsed.modelUsage || {}),
        durationMs: parsed.duration_ms ?? null,
      },
    };
  } catch {
    return { output: rawText, claudeMeta: null };
  }
}

function unwrapSeatStdout(seat, rawStdout, tempOutFile) {
  let finalMessage = (rawStdout || "").trim();
  if (tempOutFile && existsSync(tempOutFile)) {
    const captured = readFileSync(tempOutFile, "utf8").trim();
    if (captured) finalMessage = captured;
  }
  if (seat === "claude-cli") return parseClaudeEnvelope(finalMessage);
  return { output: finalMessage, claudeMeta: null };
}

function spawnSeatProcess(opts, spec) {
  let tempOutDir = "";
  let tempOutFile = "";
  const execArgs = [...spec.args];
  if (opts.seat === "codex-cli" && !opts.output) {
    tempOutDir = mkdtempSync(join(tmpdir(), "ux-ui-studio-codex-"));
    tempOutFile = join(tempOutDir, "last-message.txt");
    execArgs.splice(execArgs.length - 1, 0, "-o", tempOutFile);
  }

  try {
    const res = spawnSync(spec.command, execArgs, {
      cwd: opts.cwd,
      env: spec.env,
      input: spec.stdinPrompt ?? opts.prompt,
      encoding: "utf8",
      timeout: 300000,
      shell: false,
    });
    const { output, claudeMeta } = unwrapSeatStdout(opts.seat, res.stdout, tempOutFile);
    if (opts.seat === "claude-cli" && opts.output && res.status === 0) {
      writeFileSync(opts.output, output, "utf8");
    }
    return {
      status: res.status ?? 1,
      payload: {
        seat: opts.seat,
        gate: opts.gate || null,
        agent: opts.agent || opts.gate || null,
        exitCode: res.status ?? 1,
        billingMode: opts.allowApiBilling ? "explicit-api-key" : "subscription-enforced",
        output,
        ...(claudeMeta ? { claudeMeta } : {}),
        stderr: res.status === 0 ? "" : (res.stderr || "").trim(),
      },
    };
  } finally {
    if (tempOutDir) rmSync(tempOutDir, { recursive: true, force: true });
  }
}

export function runDispatch(opts) {
  const spec = buildDispatchSpec(opts);
  if (opts.dryRun) return buildDryRunResponse(opts, spec);
  const needsClaudeOAuth = opts.seat === "claude-cli" && !opts.allowApiBilling;
  if (needsClaudeOAuth && !checkClaudeSubscription(spec.env)) {
    return buildUnsignedClaudeResponse();
  }
  return spawnSeatProcess(opts, spec);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const opts = parseArgs(process.argv.slice(2));
    const { status, payload } = runDispatch(opts);
    console.log(JSON.stringify(payload, null, 2));
    process.exit(status);
  } catch (err) {
    console.error(JSON.stringify({ status: "error", message: err.message }));
    process.exit(1);
  }
}
