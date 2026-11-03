#!/usr/bin/env node
// smoke.mjs: a quick check that a built OpenRoots page loads and every view renders without errors.
//
//   node tools/smoke.mjs dist/index.html
//   node tools/smoke.mjs dist/index.html --fresh        load every route in a fresh page instead of one after another
//   node tools/smoke.mjs dist/index.html --wait 400     wait longer (milliseconds) after each route, default 250
//   node tools/smoke.mjs dist/index.html --routes "#boom,#persoon/7"   check only these routes
//   node tools/smoke.mjs dist/index.html --dump "#persoon/8"           also print the text of that route (for a look at what renders)
//
// It opens the file in jsdom (a simulated browser), runs the page's scripts, visits every route
// (#boom, #overzicht, #kaart, #register, #voortgang, #uitleg, #updates, #contact, #persoon/1, #persoon/2)
// and reports, per route, whether the main area has content. It also reports every uncaught error and
// every console.error call. The exit code is 1 when there is any error or any route stays empty, else 0.
//
// jsdom is not a dependency of the repository. This script looks for it in this order:
//   1. the folder named by the environment variable OPENROOTS_JSDOM (a folder that contains
//      node_modules/jsdom, or the node_modules folder itself, or the jsdom package folder);
//   2. a normal `import 'jsdom'`, which works after `npm install jsdom` in this folder or above it.
//
// What it cannot do: jsdom has no layout, so it cannot judge how a page looks. Browsers features the page
// needs (matchMedia, IntersectionObserver, ResizeObserver, scrollTo, canvas text measuring) are replaced by
// small stand-ins below. Messages from jsdom about unimplemented features are listed as warnings, not errors.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const args = process.argv.slice(2);
const flag = (k) => args.includes('--' + k);
const opt = (k, d) => (args.includes('--' + k) ? args[args.indexOf('--' + k) + 1] : d);
const positional = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && ['--wait', '--routes', '--dump'].includes(args[i - 1])));
const file = positional[0];
if (!file) { console.error('Usage: node tools/smoke.mjs <built.html> [--fresh] [--wait ms] [--routes "#boom,#persoon/1"]'); process.exit(2); }
if (!fs.existsSync(file)) { console.error('File not found: ' + file); process.exit(2); }

// ---------- find jsdom ----------
function loadJsdom() {
  const hint = process.env.OPENROOTS_JSDOM;
  const tries = [];
  if (hint) {
    const base = path.resolve(hint);
    tries.push(path.join(base, 'noop.js'));                 // folder that contains node_modules, or node_modules itself
    tries.push(path.join(base, 'node_modules', 'noop.js'));
    tries.push(path.join(path.dirname(base), 'noop.js'));   // the jsdom package folder itself
  }
  for (const t of tries) {
    try { return createRequire(t)('jsdom'); } catch (e) { /* try the next place */ }
  }
  try { return createRequire(import.meta.url)('jsdom'); } catch (e) { /* fall through */ }
  console.error('Could not load jsdom. Run `npm install jsdom` here, or set OPENROOTS_JSDOM to the folder that holds node_modules/jsdom.');
  process.exit(2);
}
const { JSDOM, VirtualConsole } = loadJsdom();

// ---------- routes ----------
const DEFAULT_ROUTES = ['#boom', '#overzicht', '#kaart', '#register', '#voortgang', '#uitleg', '#updates', '#contact', '#persoon/1', '#persoon/2'];
const routes = opt('routes', '') ? opt('routes', '').split(',').map((s) => s.trim()).filter(Boolean) : DEFAULT_ROUTES;
const WAIT = Number(opt('wait', 250));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const html = fs.readFileSync(file, 'utf8');

// ---------- one simulated page ----------
function openPage() {
  const errors = [];
  const warnings = [];
  const seen = new Set();
  const add = (list, where, msg) => { const key = where + '|' + msg; if (seen.has(key)) return; seen.add(key); list.push({ where, msg }); };

  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => {
    const msg = String((e && (e.detail && e.detail.stack ? e.detail.stack.split('\n')[0] : e.message)) || e);
    if (/Not implemented/i.test(msg)) add(warnings, 'jsdom', msg.slice(0, 200));
    else add(errors, 'uncaught', msg.slice(0, 400));
  });
  vc.on('error', (...a) => add(errors, 'console.error', a.map(String).join(' ').slice(0, 400)));
  vc.on('warn', (...a) => add(warnings, 'console.warn', a.map(String).join(' ').slice(0, 200)));

  const dom = new JSDOM(html, {
    url: 'https://example.test/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(w) {
      // matchMedia: nothing matches, so the page picks the small-screen layout
      w.matchMedia = (q) => ({ matches: false, media: q, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent() { return false; } });
      // IntersectionObserver: report every observed element as visible, shortly after observe()
      w.IntersectionObserver = class {
        constructor(cb) { this.cb = cb; this.t = new Set(); }
        observe(el) { this.t.add(el); w.setTimeout(() => { if (this.t.has(el)) this.cb([{ target: el, isIntersecting: true, intersectionRatio: 1 }], this); }, 0); }
        unobserve(el) { this.t.delete(el); }
        disconnect() { this.t.clear(); }
        takeRecords() { return []; }
      };
      w.ResizeObserver = class { constructor(cb) { this.cb = cb; } observe() {} unobserve() {} disconnect() {} };
      w.scrollTo = () => {};
      w.Element.prototype.scrollIntoView = function () {};
      w.Element.prototype.setPointerCapture = function () {};
      w.Element.prototype.releasePointerCapture = function () {};
      // SVG measuring and canvas text measuring have no meaning without layout; give plausible numbers
      if (w.SVGElement) w.SVGElement.prototype.getBBox = function () { return { x: 0, y: 0, width: 40, height: 12 }; };
      w.HTMLCanvasElement.prototype.getContext = function () {
        return { font: '', measureText: (t) => ({ width: String(t).length * 6, fontBoundingBoxAscent: 10, fontBoundingBoxDescent: 3 }), fillText() {}, clearRect() {}, fillRect() {}, beginPath() {}, arc() {}, fill() {}, stroke() {} };
      };
      if (!w.requestAnimationFrame) w.requestAnimationFrame = (cb) => w.setTimeout(() => cb(Date.now()), 16);
      w.addEventListener('error', (e) => add(errors, 'uncaught', String(e.message || e.error || e).slice(0, 400)));
      w.addEventListener('unhandledrejection', (e) => add(errors, 'unhandled rejection', String(e.reason && e.reason.stack ? e.reason.stack.split('\n')[0] : e.reason).slice(0, 400)));
    },
  });
  return { dom, errors, warnings };
}

// What the page shows for a route: the visible view inside <main id="hoofd"> or the open person card.
function inspect(win, route) {
  const doc = win.document;
  const info = { route, view: null, chars: 0, children: 0, note: '' };
  if (route.startsWith('#persoon/')) {
    const card = doc.getElementById('persoon'), body = doc.getElementById('persoon-inhoud');
    info.view = 'persoon';
    info.chars = body ? body.textContent.trim().length : 0;
    info.children = body ? body.childElementCount : 0;
    if (!card || card.hidden) info.note = 'person card is hidden';
    return info;
  }
  const main = doc.getElementById('hoofd') || doc.querySelector('main');
  if (!main) { info.note = 'no main element (#hoofd)'; return info; }
  const visible = Array.from(main.querySelectorAll('.weergave')).filter((s) => !s.hidden);
  if (!visible.length) { info.note = 'no visible view'; return info; }
  const el = visible[0];
  info.view = el.dataset.weergave || el.id || '?';
  info.chars = el.textContent.trim().length;
  info.children = el.childElementCount;
  const want = route.replace(/^#/, '').split('/')[0];
  if (info.view !== want) info.note = 'shows "' + info.view + '" instead';
  return info;
}

async function visit(win, route) {
  win.location.hash = route;
  win.dispatchEvent(new win.HashChangeEvent('hashchange'));
  await sleep(WAIT);
  // On a small screen the sections of a person card start closed and fill when opened. Open them all,
  // so that their code runs too.
  if (route.startsWith('#persoon/')) {
    win.document.querySelectorAll('#persoon-inhoud .sectie-kop button[aria-expanded="false"]').forEach((b) => b.click());
    await sleep(20);
  }
  const info = inspect(win, route);
  if (opt('dump', '') === route) {
    const doc = win.document;
    const el = route.startsWith('#persoon/') ? doc.getElementById('persoon-inhoud') : Array.from(doc.querySelectorAll('#hoofd .weergave')).find((x) => !x.hidden);
    console.log('--- text of ' + route + ' ---');
    console.log(el ? el.textContent.replace(/\s+/g, ' ').trim() : '(nothing)');
    console.log('---');
  }
  return info;
}

// ---------- run ----------
const results = [];
let allErrors = [];
let allWarnings = [];
const t0 = Date.now();

if (flag('fresh')) {
  for (const r of routes) {
    const page = openPage();
    await sleep(WAIT);
    page.dom.window.location.hash = r;
    const info = await visit(page.dom.window, r);
    results.push({ ...info, errors: page.errors.length });
    allErrors = allErrors.concat(page.errors.map((e) => ({ ...e, route: r })));
    allWarnings = allWarnings.concat(page.warnings);
    page.dom.window.close();
  }
} else {
  const page = openPage();
  await sleep(WAIT);
  const loadCount = page.errors.length;
  for (const e of page.errors) allErrors.push({ ...e, route: '(load)' });
  for (const r of routes) {
    const before = page.errors.length;
    const info = await visit(page.dom.window, r);
    results.push({ ...info, errors: page.errors.length - before });
    for (const e of page.errors.slice(before)) allErrors.push({ ...e, route: r });
  }
  void loadCount;
  allWarnings = page.warnings;
  page.dom.window.close();
}

// ---------- report ----------
console.log('Smoke test of ' + file + (flag('fresh') ? ' (fresh page per route)' : ''));
console.log('');
const w1 = Math.max(...results.map((r) => r.route.length), 5);
console.log('route'.padEnd(w1 + 2) + 'view'.padEnd(12) + 'content'.padEnd(18) + 'errors');
let empty = 0;
for (const r of results) {
  const ok = r.chars > 0 && r.children > 0;
  if (!ok) empty++;
  const content = ok ? `${r.chars} chars` : 'EMPTY';
  console.log(r.route.padEnd(w1 + 2) + String(r.view || '-').padEnd(12) + content.padEnd(18) + r.errors + (r.note ? '   (' + r.note + ')' : ''));
}
if (allErrors.length) {
  console.log('\nErrors:');
  for (const e of allErrors) console.log(`  [${e.route || ''}] ${e.where}: ${e.msg}`);
}
if (allWarnings.length) {
  console.log('\nWarnings (not counted as errors):');
  for (const e of allWarnings.slice(0, 10)) console.log(`  ${e.where}: ${e.msg}`);
  if (allWarnings.length > 10) console.log(`  ... and ${allWarnings.length - 10} more`);
}
const failed = allErrors.length > 0 || empty > 0;
console.log(`\n${failed ? 'FAILED' : 'OK'}: ${results.length} routes, ${allErrors.length} error(s), ${empty} empty view(s), ${((Date.now() - t0) / 1000).toFixed(1)} s`);
process.exit(failed ? 1 : 0);
