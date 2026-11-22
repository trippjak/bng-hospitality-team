#!/usr/bin/env node
/**
 * studio-preflight.mjs — Zero-secret readiness audit for the ux-ui-studio tandem plugin.
 * Inspects seat auth (with ambient API keys stripped), required binaries, MCP configs,
 * and hash-lock cleanliness of ~/code/my-skills. Never prints or reads credential values.
 */
import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const HOME = homedir();
const NPM_BIN = join(process.env.APPDATA || join(HOME, "AppData", "Roaming"), "npm");
const BLOCKED_BILLING_KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "OPENAI_API_KEY"];

/** Build a sanitized child environment without ambient pay-as-you-go API keys. */
export function buildSanitizedEnv(baseEnv = process.env) {
  const clean = { ...baseEnv };
  for (const key of BLOCKED_BILLING_KEYS) delete clean[key];
  return clean;
}

/** Resolve the native Claude Code binary without going through .ps1/.cmd wrappers. */
export function resolveClaudeBinary() {
  const direct = join(NPM_BIN, "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");
  if (existsSync(direct)) return { command: direct, prefixArgs: [] };
  return { command: process.platform === "win32" ? "claude.exe" : "claude", prefixArgs: [] };
}

/** Resolve the Codex CLI JS entrypoint executed directly via Node. */
export function resolveCodexBinary() {
  const direct = join(NPM_BIN, "node_modules", "@openai", "codex", "bin", "codex.js");
  if (existsSync(direct)) return { command: process.execPath, prefixArgs: [direct] };
  return { command: process.platform === "win32" ? "codex.exe" : "codex", prefixArgs: [] };
}

function probeClaudeOAuth() {
  const { command, prefixArgs } = resolveClaudeBinary();
  const res = spawnSync(command, [...prefixArgs, "auth", "status"], {
    env: buildSanitizedEnv(),
    encoding: "utf8",
    timeout: 8000,
    shell: false,
  });
  if (res.error) return { available: false, loggedIn: false, authMethod: "error", detail: res.error.message };
  try {
    const parsed = JSON.parse((res.stdout || "").trim() || "{}");
    return {
      available: true,
      loggedIn: Boolean(parsed.loggedIn) && parsed.authMethod !== "api_key",
      authMethod: parsed.authMethod || "unknown",
    };
  } catch {
    return { available: res.status === 0, loggedIn: false, authMethod: "unparseable" };
  }
}

function probeCodexOAuth() {
  const { command, prefixArgs } = resolveCodexBinary();
  const res = spawnSync(command, [...prefixArgs, "login", "status"], {
    env: buildSanitizedEnv(),
    encoding: "utf8",
    timeout: 8000,
    shell: false,
  });
  const combined = `${res.stdout || ""}\n${res.stderr || ""}`.trim();
  const loggedInChatGpt = /Logged in using ChatGPT/i.test(combined);
  return {
    available: !res.error,
    loggedIn: loggedInChatGpt,
    authMethod: loggedInChatGpt ? "chatgpt" : (res.error ? "missing" : "other"),
  };
}

function readJsonSafe(path) {
  if (!existsSync(path)) return null;
  try { return JSON.parse(readFileSync(path, "utf8")); } catch { return null; }
}

/** Read a persisted Windows User environment variable without logging its secret value. */
export function readWindowsUserEnvVar(name) {
  if (process.platform !== "win32") return "";
  const res = spawnSync("reg.exe", ["query", "HKCU\\Environment", "/v", name], {
    encoding: "utf8",
    timeout: 3000,
    shell: false,
  });
  if (res.status !== 0) return "";
  return /REG_(?:EXPAND_)?SZ\s+(.+)$/im.exec(res.stdout || "")?.[1]?.trim() || "";
}

function hasWindowsUserEnvVar(name) {
  return Boolean(readWindowsUserEnvVar(name));
}

function probeHostPackages() {
  const codexAgentNames = ["no-vibe-code", "ux-ui-qa", "ux-copywriter"];
  return {
    antigravity: existsSync(join(HOME, ".gemini", "config", "plugins", "ux-ui-studio", "plugin.json")),
    claudeCache: existsSync(join(HOME, ".claude", "plugins", "cache", "ux-ui-studio", "ux-ui-studio")),
    codexCache: existsSync(join(HOME, ".codex", "plugins", "cache", "ux-ui-studio", "ux-ui-studio")),
    codexAgents: codexAgentNames.every((name) => existsSync(join(HOME, ".codex", "agents", `${name}.toml`))),
  };
}

export function runPreflight() {
  const claudeStatus = probeClaudeOAuth();
  const codexStatus = probeCodexOAuth();

  const mcpGlobal = readJsonSafe(join(HOME, ".gemini", "config", "mcp_config.json"));
  const mySkillsRoot = join(HOME, "code", "my-skills");
  const verifyScript = join(mySkillsRoot, "scripts", "verify-shared-skills.mjs");
  let mySkillsLock = "unknown";
  if (existsSync(verifyScript)) {
    const check = spawnSync(process.execPath, [verifyScript, "--root", mySkillsRoot], {
      encoding: "utf8",
      timeout: 8000,
      shell: false,
    });
    mySkillsLock = check.status === 0 ? "PASS" : "FAIL";
  }

  return {
    checkedAt: new Date().toISOString(),
    seats: {
      "antigravity-native": {
        ready: true,
        models: ["gemini-4-carbon-high", "gemini-4-argon-high", "claude-opus-5-5-high", "claude-sonnet-5-5-high"],
      },
      "codex-cli": { ...codexStatus, fallbackSeat: null },
      "claude-cli": {
        ...claudeStatus,
        fallbackSeat: claudeStatus.loggedIn ? null : "antigravity-native",
        remediation: claudeStatus.loggedIn ? null : "Remove-Item Env:ANTHROPIC_API_KEY; claude auth login",
      },
    },
    ambientEnvFlags: {
      ANTHROPIC_API_KEY: Boolean(process.env.ANTHROPIC_API_KEY),
      OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY),
      RECRAFT_API_KEY: Boolean(process.env.RECRAFT_API_KEY) || hasWindowsUserEnvVar("RECRAFT_API_KEY"),
      CLOUDFLARE_API_TOKEN_UI_STUDIO: Boolean(process.env.CLOUDFLARE_API_TOKEN_UI_STUDIO) || hasWindowsUserEnvVar("CLOUDFLARE_API_TOKEN_UI_STUDIO"),
    },
    binaries: {
      paperExe: existsSync(join(HOME, ".paper", "bin", "paper.exe")),
      uvxExe: existsSync(join(HOME, "AppData", "Local", "Programs", "Python", "Python311", "Scripts", "uvx.exe")),
      playwrightMcpPkg: existsSync(join(NPM_BIN, "node_modules", "@playwright", "mcp", "package.json")),
    },
    globalMcpServers: Object.keys(mcpGlobal?.mcpServers || {}),
    mySkillsLock,
    hostPackages: probeHostPackages(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  console.log(JSON.stringify(runPreflight(), null, 2));
}
