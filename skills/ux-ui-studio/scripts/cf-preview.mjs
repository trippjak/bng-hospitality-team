#!/usr/bin/env node
/**
 * cf-preview.mjs - Isolated Cloudflare Staging Preview token verification and upload wrapper.
 * Reads CLOUDFLARE_API_TOKEN_UI_STUDIO (never production tokens) and overrides CLOUDFLARE_API_TOKEN
 * only inside the wrangler child environment for non-production staging previews.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildSanitizedEnv, readWindowsUserEnvVar } from "./studio-preflight.mjs";

const TOKEN_ENV = "CLOUDFLARE_API_TOKEN_UI_STUDIO";
const DISALLOWED_ENVS = new Set(["prod", "production", "main", "live"]);

/** Resolve CLOUDFLARE_API_TOKEN_UI_STUDIO from process env or Windows HKCU\\Environment. */
export function resolveUiStudioCfToken(env = process.env) {
  return env[TOKEN_ENV] || readWindowsUserEnvVar(TOKEN_ENV);
}

/** Parse and validate subcommands and staging-only preview options. */
export function parsePreviewArgs(argv) {
  const cmd = argv[0];
  if (!cmd || cmd === "--help" || cmd === "-h") return { cmd: "help" };
  if (cmd !== "status" && cmd !== "preview") throw new Error(`Unknown command "${cmd}". Use status or preview.`);
  const opts = { cmd, envName: "staging", cwd: process.cwd(), workerName: "" };
  for (let i = 1; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[++i];
    if (v === undefined) throw new Error(`Missing value for ${k}`);
    if (k === "--cwd") opts.cwd = resolve(v);
    else if (k === "--env") opts.envName = v.trim();
    else if (k === "--name") opts.workerName = v.trim();
    else throw new Error(`Unknown flag ${k}`);
  }
  if (!opts.envName || DISALLOWED_ENVS.has(opts.envName.toLowerCase())) {
    throw new Error(`Disallowed --env "${opts.envName}". Isolated staging previews must target a non-production env.`);
  }
  return opts;
}

/** Verify token liveliness via Cloudflare API without ever returning the token value. */
export async function verifyCfTokenStatus(token) {
  if (!token) {
    return { status: "missing_token", tokenEnv: TOKEN_ENV, tokenStatus: "missing" };
  }
  const res = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  if (!res.ok || !data?.success) {
    throw new Error(`Cloudflare token verification failed: HTTP ${res.status}`);
  }
  return {
    status: "ok",
    tokenEnv: TOKEN_ENV,
    tokenStatus: data.result?.status || "unknown",
  };
}

function resolveNpxInvocation() {
  const npxCli = resolve(dirname(process.execPath), "node_modules", "npm", "bin", "npx-cli.js");
  if (existsSync(npxCli)) return { cmd: process.execPath, prefix: [npxCli] };
  return { cmd: "npx", prefix: [] };
}

function buildWranglerArgs(prefix, subArgs, opts) {
  const args = [...prefix, "wrangler", ...subArgs, "--env", opts.envName];
  if (opts.workerName) args.push("--name", opts.workerName);
  return args;
}

function invokeWrangler(cmd, args, cwd, env) {
  const res = spawnSync(cmd, args, { cwd, env, encoding: "utf8", shell: false });
  return {
    exitCode: res.status ?? 1,
    stdout: (res.stdout || "").trim(),
    stderr: (res.stderr || "").trim(),
  };
}

/** Upload an isolated Cloudflare Workers staging preview, bootstrapping missing envs once. */
export function runStagingPreview(opts, token) {
  if (!token) throw new Error(`${TOKEN_ENV} is required for staging preview uploads.`);
  if (!existsSync(opts.cwd)) throw new Error(`Preview working directory not found: ${opts.cwd}`);
  const { cmd, prefix } = resolveNpxInvocation();
  const childEnv = { ...buildSanitizedEnv(), CLOUDFLARE_API_TOKEN: token };
  const uploadArgs = buildWranglerArgs(prefix, ["versions", "upload"], opts);
  let res = invokeWrangler(cmd, uploadArgs, opts.cwd, childEnv);
  let bootstrapped = false;
  if (res.exitCode !== 0 && /does not yet exist/i.test(res.stderr)) {
    const deployArgs = buildWranglerArgs(prefix, ["deploy"], opts);
    const bootRes = invokeWrangler(cmd, deployArgs, opts.cwd, childEnv);
    if (bootRes.exitCode !== 0) {
      return {
        exitCode: bootRes.exitCode,
        cwd: opts.cwd,
        envName: opts.envName,
        workerName: opts.workerName || null,
        bootstrapped: false,
        stdout: bootRes.stdout,
        stderr: bootRes.stderr,
      };
    }
    bootstrapped = true;
    res = invokeWrangler(cmd, uploadArgs, opts.cwd, childEnv);
  }
  return {
    exitCode: res.exitCode,
    cwd: opts.cwd,
    envName: opts.envName,
    workerName: opts.workerName || null,
    bootstrapped,
    stdout: res.stdout,
    stderr: res.stderr,
  };
}

async function main() {
  const opts = parsePreviewArgs(process.argv.slice(2));
  if (opts.cmd === "help") {
    console.log("Usage: cf-preview.mjs <status|preview> [--cwd <dir>] [--env <staging>] [--name <worker-staging>]");
    return;
  }
  const token = resolveUiStudioCfToken();
  if (opts.cmd === "status") {
    console.log(JSON.stringify(await verifyCfTokenStatus(token), null, 2));
    return;
  }
  const out = runStagingPreview(opts, token);
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.exitCode);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(JSON.stringify({ status: "error", message: err.message }));
    process.exit(1);
  });
}
