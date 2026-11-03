#!/usr/bin/env node
// validate-findings.mjs: checks a findings.json against the OpenRoots rules.
// Usage: node validate-findings.mjs path/to/findings.json [--now 2026-11-03]
// Exit code 0: no errors (warnings may remain). Exit code 1: at least one error.
//
// It enforces the ground rules of the ancestor-research skill:
//   1. no paid-service sources, 2. every claim has a cited, excerpted source,
//   3. no presumed-living person in public claims, plus evidence and plausibility checks.

import fs from 'node:fs';

const FIELDS = new Set(['name', 'sex', 'birth.date', 'birth.place', 'baptism.date', 'baptism.place', 'marriage.date', 'marriage.place', 'death.date', 'death.place', 'burial.date', 'burial.place', 'parent.father', 'parent.mother', 'spouse', 'child', 'occupation', 'residence', 'note']);
const CONF = ['confirmed', 'probable', 'possible', 'unverified'];
const EVID = new Set(['direct', 'indirect', 'negative']);
const STYPE = new Set(['original', 'derivative', 'authored']);
const ITYPE = new Set(['primary', 'secondary', 'undetermined']);
const LINK_FIELDS = new Set(['parent.father', 'parent.mother', 'spouse', 'child']);
const BLOCKED = ['myheritage.', 'ancestry.', 'ancestrylibrary.', 'findmypast.', 'archion.', 'newspapers.com', 'newspaperarchive.com', 'genealogybank.com', 'fold3.com', '23andme.com', 'ancestrydna.'];

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const nowArg = args.includes('--now') ? args[args.indexOf('--now') + 1] : null;
if (!file) { console.error('Usage: node validate-findings.mjs findings.json [--now YYYY-MM-DD]'); process.exit(2); }

const errors = [], warnings = [];
const err = m => errors.push(m), warn = m => warnings.push(m);

let doc;
try { doc = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { console.error('Cannot read or parse ' + file + ': ' + e.message); process.exit(2); }

const now = nowArg ? new Date(nowArg) : new Date();
const thisYear = now.getFullYear();
const isoDay = /^\d{4}-\d{2}-\d{2}$/;

if (doc.schema !== 'openroots.findings/1') err('schema must be "openroots.findings/1"');
if (!doc.question || typeof doc.question !== 'string') err('question is required (one sentence)');
const subjects = Array.isArray(doc.subjects) ? doc.subjects : [];
const claims = Array.isArray(doc.claims) ? doc.claims : [];
const sources = Array.isArray(doc.sources) ? doc.sources : [];
if (!Array.isArray(doc.claims)) err('claims must be an array');
if (!Array.isArray(doc.sources)) err('sources must be an array');

// ---- sources
const srcById = new Map();
for (const s of sources) {
  const where = 'source ' + (s && s.id);
  if (!s || !s.id) { err('a source has no id'); continue; }
  if (srcById.has(s.id)) err(where + ': duplicate id');
  srcById.set(s.id, s);
  if (!s.citation) err(where + ': citation is required');
  if (!isoDay.test(s.retrieved || '')) err(where + ': retrieved must be YYYY-MM-DD');
  if (!STYPE.has(s.source_type)) err(where + ': source_type must be original, derivative or authored');
  if (!ITYPE.has(s.information_type)) err(where + ': information_type must be primary, secondary or undetermined');
  if (s.url) {
    let u;
    try { u = new URL(s.url); } catch { err(where + ': url is not a valid URL'); }
    if (u) {
      if (!/^https?:$/.test(u.protocol)) err(where + ': url must be http or https');
      const host = u.hostname.toLowerCase() + '/';
      if (BLOCKED.some(b => host.includes(b) || u.hostname.toLowerCase().includes(b.replace(/\.$/, '')))) err(where + ': paid service (' + u.hostname + '). Record it under leads, not as a source');
    }
  } else if (!s.supplied_by_user) err(where + ': url is required unless supplied_by_user is true');
  if (!s.supplied_by_user) {
    if (!s.excerpt || s.excerpt.trim().length < 10) err(where + ': excerpt (verbatim, at least 10 characters) is required');
  }
  if (s.excerpt && s.excerpt.length > 600) warn(where + ': excerpt is longer than 600 characters; shorten it');
  if (!s.repository) warn(where + ': repository is missing (needed to judge independence)');
}

// ---- subjects
const subj = new Map();
for (const s of subjects) {
  if (!s || !s.id) { err('a subject has no id'); continue; }
  if (subj.has(s.id)) err('subject ' + s.id + ': duplicate id');
  subj.set(s.id, s);
  if (!/^(p|tmp):\S+$/.test(s.id)) err('subject ' + s.id + ': id must look like p:12 or tmp:1');
  if (![true, false, 'unknown'].includes(s.deceased)) err('subject ' + s.id + ': deceased must be true, false or "unknown"');
}

// ---- claims
const claimIds = new Set();
const yearOf = v => { const m = /\b(\d{4})\b/.exec(String(v || '')); return m ? Number(m[1]) : null; };
const byKey = new Map();
for (const c of claims) {
  const w = 'claim ' + (c && c.id);
  if (!c || !c.id) { err('a claim has no id'); continue; }
  if (claimIds.has(c.id)) err(w + ': duplicate id');
  claimIds.add(c.id);
  if (!subj.has(c.subject)) err(w + ': subject ' + c.subject + ' is not listed under subjects');
  if (!FIELDS.has(c.field)) err(w + ': unknown field ' + c.field);
  if (c.value == null || String(c.value).trim() === '') err(w + ': value is empty');
  if (!CONF.includes(c.confidence)) err(w + ': confidence must be one of ' + CONF.join(', '));
  if (!EVID.has(c.evidence_type)) err(w + ': evidence_type must be direct, indirect or negative');
  if (LINK_FIELDS.has(c.field) && !subj.has(c.value)) err(w + ': value must be the id of a listed subject for field ' + c.field);

  const cited = Array.isArray(c.sources) ? c.sources : [];
  if (!cited.length) err(w + ': at least one source is required. Nothing without a source you opened');
  const srcs = [];
  for (const id of cited) { const s = srcById.get(id); if (!s) err(w + ': source ' + id + ' does not exist'); else srcs.push(s); }

  if (srcs.length) {
    const allAuthored = srcs.every(s => s.source_type === 'authored');
    if (allAuthored && c.confidence !== 'unverified') err(w + ': only authored sources (trees, compilations); confidence must be unverified');
    if (c.confidence === 'confirmed') {
      const strongOne = srcs.some(s => s.source_type === 'original' && s.information_type === 'primary') && c.evidence_type === 'direct';
      const repos = new Set(srcs.map(s => s.repository).filter(Boolean));
      const independent = srcs.length >= 2 && repos.size >= 2;
      if (!strongOne && !independent) err(w + ': confirmed needs one original source with primary information and direct evidence, or two sources from different repositories');
    }
    if (c.confidence === 'probable' && !(c.reasoning && c.reasoning.trim().length >= 20)) err(w + ': probable needs a written argument in reasoning');
    if (c.confidence === 'confirmed' && srcs.every(s => s.source_type === 'derivative') && srcs.length < 2) warn(w + ': confirmed on a single index or transcription; read the scan if one exists');
  }

  const key = c.subject + '|' + c.field;
  if (!byKey.has(key)) byKey.set(key, []);
  byKey.get(key).push(c);
}

// ---- conflicts
for (const k of Array.isArray(doc.conflicts) ? doc.conflicts : []) {
  for (const id of k.claims || []) if (!claimIds.has(id)) err('conflict refers to unknown claim ' + id);
  if (!k.resolution) err('a conflict has no resolution (write "unresolved" if it is)');
}
const MULTI = new Set(['name', 'note', 'occupation', 'residence', 'child', 'spouse']); // fields that may hold several values
for (const [key, list] of byKey) {
  if (MULTI.has(list[0].field)) continue;
  const vals = new Set(list.map(c => String(c.value)));
  if (vals.size > 1) {
    const covered = (doc.conflicts || []).some(k => (k.claims || []).filter(id => list.some(c => c.id === id)).length >= 2);
    if (!covered) warn('subject and field ' + key + ' have different values but no entry under conflicts');
  }
}

// ---- privacy: presumed living people must not appear in public claims
const hasDeath = new Set(claims.filter(c => c.field === 'death.date' || c.field === 'burial.date').map(c => c.subject));
const cutoff = thisYear - 100;
for (const c of claims) {
  if (c.public === false) continue;
  const s = subj.get(c.subject);
  if (!s) continue;
  if (s.deceased === false) { err('claim ' + c.id + ': subject ' + c.subject + ' is marked as living; set public to false'); continue; }
  if (s.deceased === true || hasDeath.has(c.subject)) continue; // shown deceased
  // Not shown deceased: only fine when the birth year is known and more than 100 years ago.
  const bornYear = yearOf((byKey.get(c.subject + '|birth.date') || [])[0]?.value);
  if (bornYear == null || bornYear >= cutoff) {
    err('claim ' + c.id + ': subject ' + c.subject + ' may be living (no death record, born ' + (bornYear ?? 'unknown') + '); set public to false, or set deceased to true with a source');
  }
}

// ---- plausibility between parents and children
const first = (id, f) => (byKey.get(id + '|' + f) || [])[0];
for (const c of claims) {
  if (c.field !== 'parent.father' && c.field !== 'parent.mother') continue;
  const cb = yearOf(first(c.subject, 'birth.date')?.value), pb = yearOf(first(c.value, 'birth.date')?.value);
  if (cb == null || pb == null) continue;
  const age = cb - pb, lo = 15, hi = c.field === 'parent.father' ? 70 : 50;
  const w = 'claim ' + c.id;
  if (age < 0) err(w + ': the child (' + cb + ') is born before the parent (' + pb + ')');
  else if (age < lo) warn(w + ': parent would be only ' + age + ' at the birth');
  else if (age > hi) warn(w + ': parent would be ' + age + ' at the birth');
  const pd = yearOf(first(c.value, 'death.date')?.value);
  if (pd != null && c.field === 'parent.mother' && cb > pd) err(w + ': the child is born after the mother died (' + pd + ')');
  if (pd != null && c.field === 'parent.father' && cb > pd + 1) err(w + ': the child is born more than a year after the father died (' + pd + ')');
}

// ---- negative searches
for (const n of Array.isArray(doc.negative_searches) ? doc.negative_searches : []) {
  if (!n.source || !n.query) warn('a negative search lacks source or query');
  if (!n.expected_because) warn('negative search on ' + (n.source || '?') + ' has no expected_because; say why a hit was expected');
}

// ---- report
const total = claims.length;
console.log(`${file}: ${total} claims, ${sources.length} sources, ${subjects.length} subjects`);
for (const m of errors) console.log('ERROR   ' + m);
for (const m of warnings) console.log('WARNING ' + m);
console.log(errors.length ? `FAILED: ${errors.length} error(s), ${warnings.length} warning(s)` : `OK: 0 errors, ${warnings.length} warning(s)`);
process.exit(errors.length ? 1 : 0);
