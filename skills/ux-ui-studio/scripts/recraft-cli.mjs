#!/usr/bin/env node
/**
 * recraft-cli.mjs — Headless REST fallback for Recraft API v1 when RECRAFT_API_KEY is present.
 * Interactive Antigravity work defaults to the official Streamable HTTP MCP (ux-ui-studio-recraft);
 * use this CLI when RECRAFT_API_KEY developer units are funded for batch SVG/raster asset pipelines.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { readWindowsUserEnvVar } from "./studio-preflight.mjs";

const API_BASE = "https://external.api.recraft.ai/v1";
const PATH_PAIR_COUNTS = { M: 1, m: 1, L: 1, l: 1, T: 1, t: 1, Q: 2, q: 2, S: 2, s: 2, C: 3, c: 3 };
const NEXT_IMPLICIT_CMD = { M: "L", m: "l" };
const ZERO_ORIGIN = { cx: 0, cy: 0 };

function dieJson(code, payload) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(code);
}

export function parseFlags(argv) {
  const cmd = argv[0];
  if (!cmd || cmd === "--help" || cmd === "-h") {
    console.log("Usage: recraft-cli.mjs <status|generate|vectorize|remove-bg|normalize-svg> [--prompt ...] [--model ...] [--style ...] [--size ...] [--style-id ...] [--image <path>] [--in <svg>] [--out <path>] [--ink <#hex>] [--knockout <#hex|none>] [--pad <0.10>]");
    process.exit(0);
  }
  const opts = { cmd };
  for (let i = 1; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[++i];
    if (v === undefined) throw new Error(`Missing value for ${k}`);
    opts[k.replace(/^--/, "")] = v;
  }
  return opts;
}

/** Resolve RECRAFT_API_KEY from process env or persisted Windows HKCU\\Environment. */
export function resolveRecraftApiKey(env = process.env) {
  return env.RECRAFT_API_KEY || readWindowsUserEnvVar("RECRAFT_API_KEY");
}

function requireKey() {
  const key = resolveRecraftApiKey();
  if (!key) {
    dieJson(2, {
      status: "missing_recraft_api_key",
      message: "RECRAFT_API_KEY is unset in this process. Use the ux-ui-studio-recraft MCP tools over OAuth, or persist RECRAFT_API_KEY in Windows Environment Variables.",
    });
  }
  return key;
}

async function saveBinaryFromUrl(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Asset download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(resolve(outPath), buf);
  return { outPath: resolve(outPath), bytes: buf.byteLength };
}

async function requestRecraftJson(endpoint, key, init = {}) {
  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...(init.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `HTTP ${res.status}`);
  return data;
}

async function maybeSaveAsset(url, outPath) {
  if (!url || !outPath) return null;
  return saveBinaryFromUrl(url, outPath);
}

async function postFile(endpoint, key, imagePath) {
  const form = new FormData();
  const abs = resolve(imagePath);
  const blob = new Blob([readFileSync(abs)]);
  form.append("file", blob, basename(abs));
  return requestRecraftJson(endpoint, key, { method: "POST", body: form });
}

async function handleStatus(_opts, key) {
  const data = await requestRecraftJson("/users/me", key);
  return dieJson(0, { status: "ok", credits: data.credits ?? null });
}

async function handleGenerate(opts, key) {
  if (!opts.prompt) throw new Error("--prompt is required for generate");
  const body = {
    prompt: opts.prompt,
    model: opts.model || "recraftv4_vector",
    size: opts.size || "1024x1024",
  };
  if (opts.style) body.style = opts.style;
  if (opts["style-id"]) body.style_id = opts["style-id"];
  const data = await requestRecraftJson("/images/generations", key, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const url = data?.data?.[0]?.url;
  const saved = await maybeSaveAsset(url, opts.out);
  return dieJson(0, { status: "ok", model: body.model, url, saved });
}

async function handleImageTransform(opts, key) {
  if (!opts.image) throw new Error(`--image is required for ${opts.cmd}`);
  const endpoint = opts.cmd === "vectorize" ? "/images/vectorize" : "/images/removeBackground";
  const data = await postFile(endpoint, key, opts.image);
  const url = data?.image?.url || data?.data?.[0]?.url;
  const saved = await maybeSaveAsset(url, opts.out);
  return dieJson(0, { status: "ok", action: opts.cmd, url, saved });
}

function addBoxPoint(box, x, y) {
  if (x < box.minX) box.minX = x;
  if (x > box.maxX) box.maxX = x;
  if (y < box.minY) box.minY = y;
  if (y > box.maxY) box.maxY = y;
}

function mergeBox(target, child) {
  if (!Number.isFinite(child.minX)) return;
  addBoxPoint(target, child.minX, child.minY);
  addBoxPoint(target, child.maxX, child.maxY);
}

function stepPairCommand(nums, pos, ctx) {
  const needed = ctx.pairs * 2;
  if (pos + needed > nums.length) {
    throw new Error(`Malformed SVG path: expected ${needed} coordinates at index ${pos}`);
  }
  let nextPos = pos;
  for (let p = 0; p < ctx.pairs; p++) {
    ctx.state.cx = ctx.base.cx + nums[nextPos];
    ctx.state.cy = ctx.base.cy + nums[nextPos + 1];
    addBoxPoint(ctx.box, ctx.state.cx, ctx.state.cy);
    nextPos += 2;
  }
  return nextPos;
}

function stepPathCommand(cmd, nums, pos, state, box) {
  const upper = cmd.toUpperCase();
  if (upper === "Z") {
    state.cx = state.sx;
    state.cy = state.sy;
    return pos;
  }
  const base = cmd === cmd.toLowerCase() ? { cx: state.cx, cy: state.cy } : ZERO_ORIGIN;
  if (upper === "H" || upper === "V") {
    if (pos + 1 > nums.length) throw new Error(`Malformed SVG path: missing coordinate for ${cmd}`);
    if (upper === "H") state.cx = base.cx + nums[pos];
    else state.cy = base.cy + nums[pos];
    addBoxPoint(box, state.cx, state.cy);
    return pos + 1;
  }
  if (upper === "A") {
    if (pos + 7 > nums.length) throw new Error(`Malformed SVG path: insufficient arc coordinates for ${cmd}`);
    state.cx = base.cx + nums[pos + 5];
    state.cy = base.cy + nums[pos + 6];
    addBoxPoint(box, state.cx, state.cy);
    return pos + 7;
  }
  return stepPairCommand(nums, pos, { pairs: PATH_PAIR_COUNTS[cmd] || 1, base, state, box });
}

function measurePathBounds(dText, tx = 0, ty = 0) {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  const state = { cx: 0, cy: 0, sx: 0, sy: 0 };
  for (const [, rawCmd, segText] of (dText || "").matchAll(/([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g)) {
    const nums = (segText.match(/[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) || []).map(Number);
    if (rawCmd === "Z" || rawCmd === "z") {
      stepPathCommand(rawCmd, nums, 0, state, box);
      continue;
    }
    if (nums.length === 0) throw new Error(`Malformed SVG path: missing numbers for ${rawCmd}`);
    let active = rawCmd;
    let pos = 0;
    let first = true;
    while (pos < nums.length) {
      const nextPos = stepPathCommand(active, nums, pos, state, box);
      if (nextPos <= pos) throw new Error(`Malformed SVG path: non-advancing command ${active}`);
      pos = nextPos;
      if (first && (active === "M" || active === "m")) {
        state.sx = state.cx;
        state.sy = state.cy;
        active = NEXT_IMPLICIT_CMD[active];
      }
      first = false;
    }
  }
  if (!Number.isFinite(box.minX)) return box;
  return { minX: box.minX + tx, minY: box.minY + ty, maxX: box.maxX + tx, maxY: box.maxY + ty };
}

function parseHexColor(raw) {
  const hex = raw.length === 4 ? `${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}` : raw.slice(1);
  return [Number.parseInt(hex.slice(0, 2), 16), Number.parseInt(hex.slice(2, 4), 16), Number.parseInt(hex.slice(4, 6), 16)];
}

function parseFillBrightness(attrs) {
  const raw = /\bfill\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1]?.trim() || "";
  if (!raw || raw === "none" || raw === "transparent") return null;
  const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/i.exec(raw);
  if (rgb) {
    if (rgb[4] !== undefined && Number(rgb[4]) === 0) return null;
    return (0.299 * Number(rgb[1]) + 0.587 * Number(rgb[2]) + 0.114 * Number(rgb[3])) / 255;
  }
  if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(raw)) return null;
  const [r, g, b] = parseHexColor(raw);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

function isFullBackdrop(box, vbW, vbH, brightness) {
  if (brightness === null || brightness < 0.72 || !Number.isFinite(box.minX)) return false;
  return box.maxX - box.minX >= vbW * 0.94 && box.maxY - box.minY >= vbH * 0.94;
}

function applySquareViewBox(svgText, box, padRatio) {
  if (!Number.isFinite(box.minX)) return svgText;
  const span = Math.max(1, box.maxX - box.minX, box.maxY - box.minY);
  const side = Math.max(1, Math.round(span * (1 + 2 * padRatio)));
  const vx = Math.round((box.minX + box.maxX) / 2 - side / 2);
  const vy = Math.round((box.minY + box.maxY) / 2 - side / 2);
  const vbAttr = `viewBox="${vx} ${vy} ${side} ${side}"`;
  return /\bviewBox\s*=\s*["'][^"']*["']/i.test(svgText)
    ? svgText.replace(/\bviewBox\s*=\s*["'][^"']*["']/i, vbAttr)
    : svgText.replace(/<svg\b/i, `<svg ${vbAttr}`);
}

function stripSvgRectBackdrop(svgText, vb) {
  return svgText.replace(/<rect\b([^>]*?)(?:\s*\/>|>\s*<\/rect>)/gi, (full, attrs) => {
    const bw = Number.parseFloat(/\bwidth\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] || "0");
    const bh = Number.parseFloat(/\bheight\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1] || "0");
    const box = { minX: 0, minY: 0, maxX: /%/.test(attrs) ? vb[2] : bw, maxY: /%/.test(attrs) ? vb[3] : bh };
    return isFullBackdrop(box, vb[2], vb[3], parseFillBrightness(attrs)) ? "" : full;
  });
}

function hasUnsupportedCropTransform(svgText) {
  return /<(?:g|svg|use)\b[^>]*\btransform\s*=/i.test(svgText)
    || /\btransform\s*=\s*["'][^"']*\b(?:matrix|rotate|scale|skew[XY])\s*\(/i.test(svgText);
}

function rewriteSvgPath(attrs, selfClose, ctx) {
  const tr = /\btranslate\(\s*([-+]?\d*\.?\d+)(?:[,\s]+([-+]?\d*\.?\d+))?\s*\)/i.exec(attrs);
  const d = /\bd\s*=\s*["']([^"']*)["']/i.exec(attrs)?.[1] || "";
  const box = d ? measurePathBounds(d, tr ? Number(tr[1]) : 0, tr ? Number(tr[2] ?? 0) : 0) : null;
  const bright = parseFillBrightness(attrs);
  if (ctx.canCrop && box && isFullBackdrop(box, ctx.vb[2], ctx.vb[3], bright)) return "";
  if (box) mergeBox(ctx.allBox, box);
  if (bright !== null && bright < 0.5) {
    if (box) mergeBox(ctx.fgBox, box);
    return `<path${attrs.replace(/\bfill\s*=\s*["'][^"']*["']/i, `fill="${ctx.ink}"`)}${selfClose}>`;
  }
  if (bright !== null && bright >= 0.72) {
    return `<path${attrs.replace(/\bfill\s*=\s*["'][^"']*["']/i, `fill="${ctx.knockout}"`)}${selfClose}>`;
  }
  return `<path${attrs}${selfClose}>`;
}

export function normalizeRecraftSvg(svgText, { ink = "currentColor", knockout = "#ffffff", padRatio = 0.10 } = {}) {
  const vbMatch = /\bviewBox\s*=\s*["']\s*([-+]?\d*\.?\d+)[,\s]+([-+]?\d*\.?\d+)[,\s]+([-+]?\d*\.?\d+)[,\s]+([-+]?\d*\.?\d+)\s*["']/i.exec(svgText);
  const vb = vbMatch ? [Number(vbMatch[1]), Number(vbMatch[2]), Number(vbMatch[3]), Number(vbMatch[4])] : [0, 0, 1024, 1024];
  let out = svgText
    .replace(/<metadata\b[^>]*>[\s\S]*?<\/metadata>/gi, "")
    .replace(/\s+xmlns:c2pa\s*=\s*["'][^"']*["']/gi, "")
    .replace(/\s+preserveAspectRatio\s*=\s*["']none["']/gi, "");
  const canCrop = !hasUnsupportedCropTransform(out);
  if (canCrop) out = stripSvgRectBackdrop(out, vb);
  const ctx = {
    vb,
    ink,
    knockout,
    canCrop,
    fgBox: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    allBox: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
  };
  out = out.replace(/<path\b([^>]*?)\s*(\/?)>/gi, (_full, attrs, selfClose) => rewriteSvgPath(attrs, selfClose, ctx));
  const cleaned = out.replace(/\n{3,}/g, "\n\n").trim();
  if (!canCrop) return cleaned;
  const chosen = Number.isFinite(ctx.fgBox.minX) ? ctx.fgBox : ctx.allBox;
  return applySquareViewBox(cleaned, chosen, padRatio);
}

function handleNormalizeSvg(opts) {
  if (!opts.in) throw new Error("--in <svg> is required for normalize-svg");
  const inPath = resolve(opts.in);
  const outPath = resolve(opts.out || opts.in);
  const raw = readFileSync(inPath, "utf8");
  const padRaw = opts.pad !== undefined ? Number.parseFloat(opts.pad) : 0.10;
  const padRatio = Number.isFinite(padRaw) && padRaw >= 0 ? padRaw : 0.10;
  const normalized = normalizeRecraftSvg(raw, {
    ink: opts.ink || "currentColor",
    knockout: opts.knockout || "#ffffff",
    padRatio,
  });
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${normalized}\n`, "utf8");
  const vb = /\bviewBox\s*=\s*["']([^"']+)["']/i.exec(normalized)?.[1] || null;
  return dieJson(0, { status: "ok", action: "normalize-svg", inPath, outPath, viewBox: vb, bytesBefore: raw.length, bytesAfter: normalized.length });
}

const SUBCOMMANDS = {
  status: handleStatus,
  generate: handleGenerate,
  vectorize: handleImageTransform,
  "remove-bg": handleImageTransform,
};

async function main() {
  const opts = parseFlags(process.argv.slice(2));
  if (opts.cmd === "normalize-svg") return handleNormalizeSvg(opts);
  const handler = SUBCOMMANDS[opts.cmd];
  if (!handler) throw new Error(`Unknown subcommand: ${opts.cmd}`);
  const key = requireKey();
  return handler(opts, key);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((err) => {
    console.error(JSON.stringify({ status: "error", message: err.message }));
    process.exit(1);
  });
}
