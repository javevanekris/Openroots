#!/usr/bin/env node
// openarch.mjs: a small, polite client for the Open Archives API (Open Archieven).
// Free to use, no key. The API allows 4 requests per second per IP; this script keeps
// to about 3 per second, even across parallel processes, and retries with backoff.
//
// Usage:
//   node openarch.mjs search "Jansen 1880-1890" [--place Zwolle] [--birthplace Zwolle]
//        [--archive hua] [--sourcetype "BS Geboorte"] [--relation Child] [--country nl]
//        [--limit 20] [--start 0] [--lang en]
//   node openarch.mjs show <archive_code> <identifier> [--lang en]
//
// Search tips: the name field accepts a period ("Jansen 1880-1890") and two names joined
// with & ("Jan Jansen & Maria de Wit") to find a couple.
// Output is JSON on stdout. Errors go to stderr with exit code 1.
// Please keep the attribution: show the archive name and link back to the record URL.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = 'https://api.openarchieven.nl/1.1';
const UA = 'OpenRoots/0.1 (open-source genealogy research agent)';
const MIN_GAP_MS = 330;
// Open Archives holds about 99 percent Dutch records. A little Belgian, French and Surinamese data too.
const KNOWN_COUNTRIES = new Set(['nl', 'be', 'fr', 'sr']);
const STAMP = path.join(os.tmpdir(), 'openroots-openarch-last');

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Shared throttle: the last request time lives in a temp file, so parallel agents share it.
async function throttle() {
  for (;;) {
    let last = 0;
    try { last = Number(fs.readFileSync(STAMP, 'utf8')) || 0; } catch { /* first call */ }
    const wait = last + MIN_GAP_MS - Date.now();
    if (wait <= 0) break;
    await sleep(wait + Math.floor(Math.random() * 40));
  }
  try { fs.writeFileSync(STAMP, String(Date.now())); } catch { /* read-only tmp: in-process gap only */ }
}

async function getJson(url) {
  let lastErr;
  for (let attempt = 0; attempt < 4; attempt++) {
    await throttle();
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
      if (res.status === 429 || res.status >= 500) { lastErr = new Error('HTTP ' + res.status); await sleep(1000 * 2 ** attempt); continue; }
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return await res.json();
    } catch (e) {
      lastErr = e;
      if (/^HTTP 4/.test(String(e.message))) throw e;
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastErr;
}

const asArray = v => (v == null ? [] : Array.isArray(v) ? v : [v]);
// A2A fields nest as {a2a_X: {a2a_X: "value"}}. Dig down to the string.
function leaf(v) {
  while (v && typeof v === 'object') {
    const keys = Object.keys(v);
    if (!keys.length) return '';
    v = v[keys[keys.length - 1]];
  }
  return v == null ? '' : String(v);
}
const isoDate = d => {
  if (!d) return null;
  const { year, month, day } = d;
  if (!year) return null;
  const mm = month ? String(month).padStart(2, '0') : null;
  const dd = day ? String(day).padStart(2, '0') : null;
  return [year, mm, dd].filter(Boolean).join('-');
};

function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const k = a.slice(2); const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true'; opt[k] = v; }
    else pos.push(a);
  }
  return { pos, opt };
}

async function search(name, opt) {
  const q = new URLSearchParams({ name, lang: opt.lang || 'en', number_show: String(Math.min(Number(opt.limit) || 20, 100)), start: String(Number(opt.start) || 0) });
  if (opt.place) q.set('eventplace', opt.place);
  if (opt.birthplace) q.set('birthplace', opt.birthplace);
  if (opt.archive) q.set('archive_code', opt.archive);
  if (opt.sourcetype) q.set('sourcetype', opt.sourcetype);
  if (opt.relation) q.set('relationtype', opt.relation);
  if (opt.country) {
    q.set('country_code', opt.country);
    // Checked 2026-11-03: codes the index does not hold are silently ignored, so the search
    // runs unfiltered and looks like a huge hit count. Only these codes filter for real.
    if (!KNOWN_COUNTRIES.has(String(opt.country).toLowerCase())) {
      console.error(`openarch.mjs: warning: country code "${opt.country}" is not one Open Archives holds records for (nl, be, fr, sr); the API ignores it and the results are NOT limited to that country.`);
    }
  }
  const url = `${BASE}/records/search.json?${q}`;
  const j = await getJson(url);
  const r = j.response || {};
  return {
    source: 'Open Archives (openarchieven.nl)',
    retrieved: new Date().toISOString().slice(0, 10),
    request: url,
    found: r.number_found ?? 0,
    shown: (r.docs || []).length,
    results: (r.docs || []).map(d => ({
      name: d.personname,
      role: d.relationtype,
      event: d.eventtype,
      date: isoDate(d.eventdate),
      places: d.eventplace || [],
      source_type: d.sourcetype,
      archive: d.archive,
      archive_code: d.archive_code,
      identifier: d.identifier,
      url: d.url
    }))
  };
}

async function show(archive, identifier, opt) {
  const q = new URLSearchParams({ archive, identifier, lang: opt.lang || 'en' });
  const url = `${BASE}/records/show.json?${q}`;
  const j = await getJson(url);
  // API 1.1 returns {Person, Event, RelationEP, Source} with plain strings and "@pid".
  // API 1.0 returned the same data in an array with an "a2a_" prefix on every key. Read both.
  const rec = Array.isArray(j) ? (j[0] || {}) : (j || {});
  const g = (o, name) => (o == null ? undefined : (o[name] !== undefined ? o[name] : o['a2a_' + name]));
  const pidOf = p => (p && (p['@pid'] || p.pid)) || '';
  const rel = new Map(asArray(g(rec, 'RelationEP')).map(r => [leaf(g(r, 'PersonKeyRef')), leaf(g(r, 'RelationType'))]));
  const persons = asArray(g(rec, 'Person')).map(p => {
    const n = g(p, 'PersonName') || {};
    const name = [leaf(g(n, 'PersonNameFirstName')), leaf(g(n, 'PersonNamePrefixLastName')), leaf(g(n, 'PersonNameLastName'))].filter(Boolean).join(' ');
    return {
      pid: pidOf(p), name, role: rel.get(pidOf(p)) || null,
      sex: leaf(g(p, 'Gender')) || null,
      age: leaf(g(p, 'Age')) || null,
      born: leaf(g(g(p, 'BirthDate'), 'LiteralDate')) || null,
      born_place: leaf(g(g(p, 'BirthPlace'), 'Place')) || null,
      residence: leaf(g(g(p, 'Residence'), 'Place')) || null,
      occupation: leaf(g(p, 'Profession')) || null
    };
  });
  const ev = asArray(g(rec, 'Event'))[0] || {};
  const src = g(rec, 'Source') || {};
  return {
    source: 'Open Archives (openarchieven.nl)',
    retrieved: new Date().toISOString().slice(0, 10),
    request: url,
    record_url: `https://www.openarchieven.nl/${archive}:${identifier}/${opt.lang || 'en'}`,
    note: 'Event and role names come back in the archive\'s own language, usually Dutch (Geboorte = birth, Kind = child, Vader = father, Moeder = mother).',
    event: { type: leaf(g(ev, 'EventType')), date: leaf(g(g(ev, 'EventDate'), 'LiteralDate')) || leaf(g(g(ev, 'EventDate'), 'Year')), place: leaf(g(g(ev, 'EventPlace'), 'Place')) },
    source_type: leaf(g(src, 'SourceType')),
    source_date: leaf(g(g(src, 'SourceDate'), 'LiteralDate')),
    persons
  };
}

async function main() {
  const { pos, opt } = parseArgs(process.argv.slice(2));
  const [cmd, a, b] = pos;
  let out;
  if (cmd === 'search' && a) out = await search(a, opt);
  else if (cmd === 'show' && a && b) out = await show(a, b, opt);
  else {
    console.error('Usage:\n  node openarch.mjs search "<name [period]>" [--place X] [--birthplace X] [--archive code] [--sourcetype T] [--relation R] [--country nl] [--limit N] [--start N] [--lang en]\n  node openarch.mjs show <archive_code> <identifier> [--lang en]');
    process.exit(2);
  }
  console.log(JSON.stringify(out, null, 2));
}

main().catch(e => { console.error('openarch.mjs: ' + (e && e.message || e)); process.exit(1); });
