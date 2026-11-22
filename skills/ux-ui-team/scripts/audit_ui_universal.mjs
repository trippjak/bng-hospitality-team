#!/usr/bin/env node
/**
 * ux-ui-team/scripts/audit_ui_universal.mjs — Portable Headless Playwright + 4D UI Universal Auditor.
 *
 * Audits any local static directory or localhost URL against universal UX/UI + 4D invariants:
 *   node audit_ui_universal.mjs <candidateDir | http://127.0.0.1:PORT>
 *   node audit_ui_universal.mjs --selftest
 */

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { measureCandidate4D } from '../../ratchet-review/scripts/measure_4d.mjs';

const require = createRequire(import.meta.url);
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
};

const PW_CANDIDATES = [
  `${process.cwd()}/node_modules/playwright/index.mjs`,
  '/home/trippjak/.npm/_npx/9833c18b2d85bc59/node_modules/playwright-core/index.mjs',
  'playwright-core',
  'playwright',
  '/home/trippjak/code/pi-improvement-lab/node_modules/playwright',
  '/home/trippjak/code/social-intent-audit/platform/node_modules/playwright',
  'C:/Users/Owner/code/brand-workshop-harness/app/node_modules/playwright',
];

const CHROMIUM_BINS = [
  process.env.CHROMIUM_PATH,
  '/home/trippjak/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome',
  '/home/trippjak/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome',
  '/home/trippjak/.cache/ms-playwright/chromium-1169/chrome-linux/chrome',
].filter(Boolean);

async function loadPlaywrightChromium() {
  for (const cand of PW_CANDIDATES) {
    try {
      const mod = await import(cand);
      return mod.chromium ?? mod.default?.chromium;
    } catch {
      // try next path
    }
  }
  throw new Error('Unable to load Playwright chromium');
}

function findChromiumExecutable() {
  for (const bin of CHROMIUM_BINS) {
    if (fs.existsSync(bin)) return bin;
  }
  return undefined;
}

function startStaticLoopback(rootDir) {
  const absRoot = path.resolve(rootDir);
  const server = http.createServer((req, res) => {
    const rawUrl = (req.url || '/').split('?')[0];
    const clean = rawUrl === '/' ? '/index.html' : rawUrl;
    const filePath = path.resolve(absRoot, `.${clean}`);
    const rel = path.relative(absRoot, filePath);
    if (rel.startsWith('..') || path.isAbsolute(rel) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      res.writeHead(404).end('Not found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(fs.readFileSync(filePath));
  });
  return new Promise((resolvePromise) => {
    server.listen(0, '127.0.0.1', () => resolvePromise({ server, port: server.address().port }));
  });
}

async function probeDesktopInvariants(page) {
  return page.evaluate(() => {
    const hiddenBroken = Array.from(document.querySelectorAll('[hidden]')).filter(
      (el) => getComputedStyle(el).display !== 'none',
    ).length;
    const brInHeadings = document.querySelectorAll('h1 br, h2 br, h3 br').length;

    const svgs = Array.from(document.querySelectorAll('svg[viewBox]')).filter((s) => !s.closest('[hidden]'));
    const svgViewBoxOk = svgs.every((svg) => {
      const parts = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
      if (parts.length !== 4) return true;
      const [, , vw, vh] = parts;
      const children = Array.from(svg.querySelectorAll('text, rect'));
      return children.every((ch) => {
        const b = ch.getBBox();
        return b.width === 0 || (b.x >= -2 && b.x + b.width <= vw + 4 && b.y >= -2 && b.y + b.height <= vh + 4);
      });
    });

    const tbodies = Array.from(document.querySelectorAll('tbody')).filter((tb) => !tb.closest('[hidden]'));
    const tablesUniform = tbodies.every((tb) => {
      const rows = Array.from(tb.querySelectorAll('tr')).filter((r) => !r.hidden && r.getBoundingClientRect().height > 0);
      if (rows.length <= 1) return true;
      const hs = rows.map((r) => r.getBoundingClientRect().height);
      return Math.max(...hs) - Math.min(...hs) <= 1;
    });

    return {
      desktopNoOverflow: document.documentElement.scrollWidth <= 1440,
      hiddenOk: hiddenBroken === 0,
      headingsNoBr: brInHeadings === 0,
      svgViewBoxOk,
      tablesUniform,
    };
  });
}

async function probeDesktopChromeInvariants(page) {
  return page.evaluate(() => {
    const skipLinks = Array.from(document.querySelectorAll('a.skip, a.skip-link, [data-skip-link]')).filter(
      (el) => !el.closest('[hidden]') && document.activeElement !== el,
    );
    const skipOffscreenOk = skipLinks.every((el) => {
      const st = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return st.display === 'none' || st.opacity === '0' || st.clip !== 'auto' || r.bottom <= 0 || r.right <= 0;
    });

    const kpiCards = Array.from(document.querySelectorAll('.metrics article, .kpi-card, [data-kpi-card]')).filter(
      (c) => !c.closest('[hidden]'),
    );
    const kpiSubtextSeparated = kpiCards.every((card) => {
      const strong = card.querySelector('strong');
      const next = strong?.nextElementSibling;
      if (!strong || !next || next.tagName !== 'SPAN') return true;
      const sr = strong.getBoundingClientRect();
      const nr = next.getBoundingClientRect();
      return nr.top >= sr.bottom - 2 || nr.left - sr.right >= 6;
    });

    const filterForms = Array.from(document.querySelectorAll('form#filters, form[data-filter-bar]')).filter(
      (f) => !f.closest('[hidden]'),
    );
    const filterGridOk = filterForms.every((f) => {
      const divs = Array.from(f.children).filter((c) => c.tagName === 'DIV' && c.getBoundingClientRect().height > 0);
      if (divs.length < 3) return true;
      const rowTops = new Set(divs.map((d) => Math.round(d.getBoundingClientRect().top / 4)));
      return rowTops.size < divs.length;
    });

    return { skipOffscreenOk, kpiSubtextSeparated, filterGridOk };
  });
}

async function probeAccessibilityAndSurfaceInvariants(page) {
  return page.evaluate(() => {
    const fields = Array.from(document.querySelectorAll('input:not([type="hidden"]), select, textarea')).filter(
      (el) => !el.closest('[hidden]') && getComputedStyle(el).display !== 'none',
    );
    const formControlsLabeled = fields.every((el) => {
      const hasLabelEl = Boolean((el.labels && el.labels.length > 0) || el.closest('label'));
      const hasAria = Boolean((el.getAttribute('aria-label') || '').trim() || el.getAttribute('aria-labelledby'));
      return hasLabelEl || hasAria;
    });

    const buttons = Array.from(document.querySelectorAll('button'));
    const buttonsTypedAndNamed = buttons.every((btn) => {
      const hasType = btn.disabled || btn.hasAttribute('type');
      const hasName = Boolean(
        btn.textContent.trim() ||
          (btn.getAttribute('aria-label') || '').trim() ||
          btn.getAttribute('aria-labelledby') ||
          (btn.getAttribute('title') || '').trim(),
      );
      return hasType && hasName;
    });

    const headingsAndKpis = Array.from(
      document.querySelectorAll('h1, h2, h3, .kpi-value, .metrics strong'),
    ).filter((el) => !el.closest('[hidden]') && el.clientWidth > 0);
    const noUnintendedClipping = headingsAndKpis.every((el) => {
      const st = getComputedStyle(el);
      if (st.textOverflow === 'ellipsis' && el.getAttribute('title')) return true;
      return el.scrollWidth <= el.clientWidth + 2;
    });

    const dialogs = Array.from(document.querySelectorAll('dialog, [role="dialog"]'));
    const dialogsModalAndLabeled = dialogs.every((d) => {
      const modalOk = d.tagName === 'DIALOG' || d.getAttribute('aria-modal') === 'true';
      const labelOk = Boolean((d.getAttribute('aria-label') || '').trim() || d.getAttribute('aria-labelledby'));
      return modalOk && labelOk;
    });

    const tables = Array.from(document.querySelectorAll('table'));
    const tablesHaveHeaders = tables.every((t) => Boolean(t.querySelector('thead') && t.querySelector('th')));

    return { formControlsLabeled, buttonsTypedAndNamed, noUnintendedClipping, dialogsModalAndLabeled, tablesHaveHeaders };
  });
}

async function probeReducedMotionThemeAndPrint(page) {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const reducedMotionOk = await page.evaluate(() => {
    const nonSpatialProps = new Set([
      'none',
      'color',
      'background-color',
      'border-color',
      'outline-color',
      'opacity',
      'box-shadow',
      'fill',
      'stroke',
    ]);
    const els = Array.from(document.querySelectorAll('button, a, .tier-card, .deck-btn, .effect-btn')).slice(0, 20);
    return els.every((el) => {
      const st = getComputedStyle(el);
      if ((parseFloat(st.transitionDuration) || 0) <= 0.01) return true;
      const props = (st.transitionProperty || '').split(',').map((p) => p.trim());
      return st.animationName === 'none' && props.every((p) => nonSpatialProps.has(p));
    });
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  const themeToggleOk = await page.evaluate(() => {
    const btn = document.querySelector('[data-theme-toggle], #theme-toggle-btn');
    if (!btn) return true;
    const beforeBg = getComputedStyle(document.body).backgroundColor;
    btn.click();
    const afterBg = getComputedStyle(document.body).backgroundColor;
    const afterColor = getComputedStyle(document.body).color;
    btn.click();
    return beforeBg !== afterBg && afterBg !== afterColor;
  });

  await page.emulateMedia({ media: 'print' });
  const printOk = await page.evaluate(() => {
    const noPrintHidden = Array.from(document.querySelectorAll('.no-print, [data-no-print]')).every(
      (el) => getComputedStyle(el).display === 'none',
    );
    return noPrintHidden && document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1;
  });
  await page.emulateMedia({ media: 'screen' });

  return { reducedMotionOk, themeToggleOk, printOk };
}

async function probeMobileInvariants(page) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(100);
  return page.evaluate(() => {
    const controls = Array.from(document.querySelectorAll('button, input, select')).filter((el) => {
      if (el.closest('[hidden]')) return false;
      const st = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return st.display !== 'none' && st.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    });
    const touch44Ok = controls.every((c) => c.getBoundingClientRect().height >= 44);
    const badges = Array.from(
      document.querySelectorAll('.brand-badge, .deck-badge, .brand-emblem, [data-square-badge]'),
    ).filter((b) => !b.closest('[hidden]'));
    const badgesSquare = badges.every((b) => {
      const r = b.getBoundingClientRect();
      return Math.abs(r.width - r.height) <= 1;
    });
    const stickyCells = Array.from(document.querySelectorAll('th, td')).filter(
      (c) => !c.closest('[hidden]') && getComputedStyle(c).position === 'sticky',
    );
    const stickyOpaqueOk = stickyCells.every((c) => {
      const bg = getComputedStyle(c).backgroundColor;
      const rowBg = c.parentElement ? getComputedStyle(c.parentElement).backgroundColor : 'rgba(0, 0, 0, 0)';
      return (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') || (rowBg !== 'rgba(0, 0, 0, 0)' && rowBg !== 'transparent');
    });
    return {
      mobileNoOverflow: document.documentElement.scrollWidth <= 390,
      touch44Ok,
      badgesSquare,
      stickyOpaqueOk,
    };
  });
}

function buildAuditCheckList({ desktop, chrome, a11y, media, mobile, fourD, errors }) {
  return [
    { id: 'UNI-01-desktop-no-overflow', pass: desktop.desktopNoOverflow },
    { id: 'UNI-02-hidden-attribute-integrity', pass: desktop.hiddenOk },
    { id: 'UNI-03-headings-no-br-linebreaks', pass: desktop.headingsNoBr },
    { id: 'UNI-04-svg-viewbox-containment', pass: desktop.svgViewBoxOk },
    { id: 'UNI-05-uniform-table-row-heights', pass: desktop.tablesUniform },
    { id: 'UNI-06-reduced-motion-suppression', pass: media.reducedMotionOk },
    { id: 'UNI-07-theme-toggle-token-parity', pass: media.themeToggleOk },
    { id: 'UNI-08-print-media-clean-layout', pass: media.printOk },
    { id: 'UNI-09-mobile-390-no-overflow', pass: mobile.mobileNoOverflow },
    { id: 'UNI-10-mobile-44px-touch-targets', pass: mobile.touch44Ok },
    { id: 'UNI-11-mobile-un-squished-badges', pass: mobile.badgesSquare },
    { id: 'UNI-12-zero-external-network-and-console-errors', pass: errors.blockedUrls.length === 0 && errors.consoleErrors.length === 0 && errors.pageErrors.length === 0 },
    { id: 'UNI-13-four-d-code-css-html-ratchet', pass: Boolean(fourD.ratchetPass) },
    { id: 'UNI-14-skip-link-offscreen-when-unfocused', pass: chrome.skipOffscreenOk },
    { id: 'UNI-15-kpi-metric-value-subtext-separation', pass: chrome.kpiSubtextSeparated },
    { id: 'UNI-16-filter-form-multi-column-desktop', pass: chrome.filterGridOk },
    { id: 'UNI-17-form-controls-have-accessible-names', pass: a11y.formControlsLabeled },
    { id: 'UNI-18-buttons-explicit-type-and-name', pass: a11y.buttonsTypedAndNamed },
    { id: 'UNI-19-sticky-cells-opaque-background', pass: mobile.stickyOpaqueOk },
    { id: 'UNI-20-no-unintended-heading-kpi-clipping', pass: a11y.noUnintendedClipping },
    { id: 'UNI-21-dialogs-aria-modal-and-labeled', pass: a11y.dialogsModalAndLabeled },
    { id: 'UNI-22-tables-have-thead-and-headers', pass: a11y.tablesHaveHeaders },
  ];
}

export async function runUniversalUiAudit(target) {
  const isUrl = /^https?:\/\//i.test(target);
  const loop = isUrl ? null : await startStaticLoopback(target);
  const baseUrl = isUrl ? target : `http://127.0.0.1:${loop.port}/index.html`;
  const origin = new URL(baseUrl).origin;
  const errors = { blockedUrls: [], consoleErrors: [], pageErrors: [] };
  let browser = null;

  try {
    const chromium = await loadPlaywrightChromium();
    browser = await chromium.launch({ headless: true, executablePath: findChromiumExecutable() });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' });
    await ctx.route('**/*', (route) => {
      const u = route.request().url();
      if (u.startsWith(origin) || u.startsWith('data:')) return route.continue();
      errors.blockedUrls.push(u);
      return route.abort('blockedbyclient');
    });
    const page = await ctx.newPage();
    page.on('console', (m) => { if (m.type() === 'error') errors.consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => errors.pageErrors.push(String(e)));

    await page.goto(baseUrl, { waitUntil: 'networkidle' });
    const desktop = await probeDesktopInvariants(page);
    const chrome = await probeDesktopChromeInvariants(page);
    const a11y = await probeAccessibilityAndSurfaceInvariants(page);
    const media = await probeReducedMotionThemeAndPrint(page);
    const mobile = await probeMobileInvariants(page);
    const fourD = isUrl ? { ratchetPass: true } : measureCandidate4D(path.resolve(target));
    const checks = buildAuditCheckList({ desktop, chrome, a11y, media, mobile, fourD, errors });
    const passed = checks.filter((c) => c.pass).length;
    return { ok: passed === checks.length, passed, total: checks.length, checks, fourD, errors };
  } finally {
    if (browser) await browser.close();
    if (loop) loop.server.close();
  }
}

async function runSelftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-uni-audit-'));
  try {
    fs.writeFileSync(
      path.join(tmp, 'index.html'),
      '<!DOCTYPE html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"/><title>T</title><link rel="stylesheet" href="style.css"/></head><body><h1>Title</h1><button type="button" id="b">Action</button><div hidden>H</div><script src="app.js"></script></body></html>',
    );
    fs.writeFileSync(
      path.join(tmp, 'style.css'),
      '[hidden][hidden]{display:none;}button{min-height:44px;transition:opacity 0.1s;}@media(prefers-reduced-motion:reduce){:root:root *{transition-duration:0.001s;}}',
    );
    fs.writeFileSync(path.join(tmp, 'app.js'), 'document.getElementById("b").addEventListener("click", () => {});\n');
    const res = await runUniversalUiAudit(tmp);
    const failed = res.checks.filter((c) => !c.pass).map((c) => c.id);
    console.log(JSON.stringify({ selftest: res.ok ? 'PASS' : 'FAIL', passed: res.passed, total: res.total, failed, violations: res.fourD?.violations }, null, 2));
    process.exitCode = res.ok ? 0 : 1;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv[1] && fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(path.resolve(process.argv[1]))) {
  const arg = process.argv[2];
  const fail = (err) => {
    console.error(`FAIL: ${err && err.message ? err.message : err}`);
    process.exitCode = 1;
  };
  if (arg === '--selftest') {
    runSelftest().catch(fail);
  } else if (arg) {
    runUniversalUiAudit(arg).catch(fail).then((res) => {
      if (!res) return;
      console.log(`Universal UI Audit: ${res.passed}/${res.total} checks passed | 4D: ${res.fourD.ratchetPass ? 'PASS' : 'FAIL'}`);
      for (const c of res.checks) if (!c.pass) console.log(`  FAIL: ${c.id}`);
      process.exit(res.ok ? 0 : 1);
    });
  } else {
    console.error('Usage: node audit_ui_universal.mjs <candidateDir | url | --selftest>');
    process.exit(1);
  }
}
