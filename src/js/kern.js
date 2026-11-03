// kern.js
// ui/kern.js: the shared core of the interface. Data as Map/Set, calculation rules on Ahnentafel numbers,
// the life-course parser, one counting function, the router on the URL hash, registration of views and
// person card sections, the theme and the start. Everything later builders need is in ui/API.md.
'use strict';
(function () {
  const kern = {};
  window.kern = kern;

  /* ---------- Data: built once from the globals, the globals themselves stay untouched ---------- */
  const naarMap = o => { const m = new Map(); if (o) for (const k of Object.keys(o)) m.set(+k, o[k]); return m; };
  const g = naam => (typeof window[naam] !== 'undefined' ? window[naam] : null);
  // The declarations in <script id="data"> are const bindings; they are not on window but they are in the global scope.
  const D = {
    P: typeof P !== 'undefined' ? P : {}, M: typeof M !== 'undefined' ? M : {}, SRC: typeof SRC !== 'undefined' ? SRC : {},
    NOTE: typeof NOTE !== 'undefined' ? NOTE : {}, VERHAAL: typeof VERHAAL !== 'undefined' ? VERHAAL : {},
    AKTE: typeof AKTE !== 'undefined' ? AKTE : {}, KRANT: typeof KRANT !== 'undefined' ? KRANT : {},
    SIG: typeof SIG !== 'undefined' ? SIG : {}, FOTO: typeof FOTO !== 'undefined' ? FOTO : {}, EST: typeof EST !== 'undefined' ? EST : {},
    VB: typeof VB !== 'undefined' ? VB : [], NB: typeof NB !== 'undefined' ? NB : [], OB: typeof OB !== 'undefined' ? OB : [], NEW: typeof NEW !== 'undefined' ? NEW : [],
    GEN: typeof GEN !== 'undefined' ? GEN : [], C: typeof C !== 'undefined' ? C : null, B: typeof B !== 'undefined' ? B : null, PL: typeof PL !== 'undefined' ? PL : null,
    KIND: typeof KIND !== 'undefined' ? KIND : {}, UPD: typeof UPD !== 'undefined' ? UPD : [],
    CFG: typeof CFG !== 'undefined' ? CFG : null, // config: the optional configuration block (see docs/config.md)
  };
  void g;
  kern.P = naarMap(D.P); kern.M = naarMap(D.M); kern.SRC = naarMap(D.SRC); kern.NOTE = naarMap(D.NOTE);
  kern.VERHAAL = naarMap(D.VERHAAL); kern.AKTE = naarMap(D.AKTE); kern.KRANT = naarMap(D.KRANT);
  kern.SIG = naarMap(D.SIG); kern.FOTO = naarMap(D.FOTO); kern.EST = naarMap(D.EST);
  kern.VB = new Set(D.VB); kern.NB = new Set(D.NB); kern.OB = new Set(D.OB); kern.NEW = new Set(D.NEW);
  kern.GEN = Array.from(D.GEN); kern.C = D.C; kern.B = D.B; kern.PL = D.PL;
  kern.UPD = Array.from(D.UPD); // what was found per day, newest first
  kern.KIND = naarMap(D.KIND); // children per parent pair, under the number of the father
  kern.BRON = new Map(); // source letter -> description; filled in start() from #panel ol li
  // Who is on the map: every number that occurs in PL.
  kern.OPKAART = new Set();
  if (kern.PL) for (const pl of Object.keys(kern.PL)) (kern.PL[pl].p || []).forEach(x => kern.OPKAART.add(x[0]));

  /* ---------- Configuration (docs/config.md): CFG merged over the defaults ---------- */
  // config: kern.CFG always exists with every key present, even when the global CFG is missing or partial.
  const tekstWaarde = (v, standaard) => (typeof v === 'string' && v.trim() ? v.trim() : standaard);
  kern.CFG = (() => {
    const c = D.CFG && typeof D.CFG === 'object' ? D.CFG : {};
    const contact = c.contact && typeof c.contact === 'object' ? c.contact : {};
    const eerste = kern.P.get(1);
    const lijnLabels = c.lineLabels && typeof c.lineLabels === 'object' ? c.lineLabels : {};
    return {
      title: tekstWaarde(c.title, 'Ancestor chart'),
      owner: tekstWaarde(c.owner, eerste && eerste[0] ? String(eerste[0]) : ''),
      confirmedByOwner: Array.isArray(c.confirmedByOwner) ? c.confirmedByOwner.map(Number).filter(x => Number.isFinite(x)) : [],
      version: tekstWaarde(c.version, ''),
      tagline: tekstWaarde(c.tagline, ''),
      contact: { email: tekstWaarde(contact.email, ''), text: tekstWaarde(contact.text, '') },
      lineLabels: lijnLabels,
    };
  })();

  /* ---------- Fixed texts ---------- */
  // config: labels of the four grandparent lines: kern.CFG.lineLabels[n] if given, else derived from the names in P.
  kern.LIJNEN = {};
  for (const n of [4, 5, 6, 7]) {
    const p = kern.P.get(n), gegeven = tekstWaarde(kern.CFG.lineLabels[n], '');
    const rol = n % 2 === 0 ? 'grandfather' : 'grandmother', naam = p && p[0] ? String(p[0]) : '';
    kern.LIJNEN[n] = gegeven
      ? { kort: gegeven, lang: gegeven, label: gegeven }
      : { kort: naam ? rol + ' ' + naam.split(' ')[0] : rol + ' No. ' + n, lang: naam ? hoofdLetter(rol) + ' ' + naam : hoofdLetter(rol) + ' No. ' + n, label: null };
  }
  function hoofdLetter(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  kern.STATUSNAAM = { akte: 'Confirmed by a record', onderbouwd: 'Supported', voorbehoud: 'With reservation', nietbevestigd: 'Unconfirmed', geen: 'No record' };
  // One sentence per status, from the guide ("How certain is it?").
  kern.STATUSUITLEG = {
    onderbouwd: 'No record says it, but at least two independent sources say the same, or one sound source that itself points to original documents, and nothing contradicts it.',
    voorbehoud: 'There is only one source without references, or it is derived from a patronymic, a naming after a relative or the witnesses at a baptism.',
    nietbevestigd: 'The records that exist name no parents (often only “N.N.”), or the church book is not online.',
  };
  // i18n: English month names.
  const MAANDEN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  kern.MAANDEN = MAANDEN;

  /* ---------- Helpers ---------- */
  kern.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  kern.romein = g => {
    if (!(g > 0)) return '';
    const T = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let r = '', n = g; for (const [w, s] of T) while (n >= w) { r += s; n -= w; } return r;
  };

  /* ---------- Calculation rules on Ahnentafel numbers ---------- */
  kern.generatie = n => 32 - Math.clz32(n);
  kern.kind = n => (n > 1 ? Math.floor(n / 2) : null);
  kern.partner = n => (n > 1 ? n ^ 1 : null);
  // [father, mother]; whoever is not in P is null, so the caller can see which one is missing.
  kern.ouders = n => [kern.P.has(2 * n) ? 2 * n : null, kern.P.has(2 * n + 1) ? 2 * n + 1 : null];
  kern.lijn = n => (n < 4 ? null : n >> (kern.generatie(n) - 3));
  kern.naamlijn = n => {
    if (n < 1) return null;
    // Neutral line tokens (the return value is not used elsewhere).
    if ((n & (n - 1)) === 0) return 'paternal';
    if (n % 3 === 0 && ((n / 3) & (n / 3 - 1)) === 0) return 'maternal';
    return null;
  };
  kern.lijnKleur = n => { const l = kern.lijn(n); return l ? `var(--lijn-${l})` : 'var(--inkt-2)'; };
  // config: the label of a grandparent line comes from CFG.lineLabels or the names in P; the owner comes from CFG.
  kern.lijnLabel = n => { const l = kern.lijn(n); return l ? (kern.LIJNEN[l].label || 'Line of ' + kern.LIJNEN[l].kort) : (kern.CFG.owner ? kern.CFG.owner + ' and parents' : 'The owner and parents'); };

  // Generation names: from GEN ("Generation 7 · Great-grandparents"), beyond that the English pattern below.
  const hoofd = s => s.charAt(0).toUpperCase() + s.slice(1);
  // i18n: English fallback: Parents, Grandparents, Great-grandparents, Great-great-grandparents, Great-great-great-grandparents,
  // then the compact form "4x great-grandparents" (readable up to generation 25 and beyond).
  const generatieFallback = g => {
    if (g === 2) return 'parents';
    if (g === 3) return 'grandparents';
    const keer = g - 3;
    return keer <= 3 ? 'great-'.repeat(keer) + 'grandparents' : keer + 'x great-grandparents';
  };
  kern.generatieNaam = g => {
    if (!(g >= 1)) return '';
    if (g === 1) return kern.CFG.owner || 'The owner'; // config: the owner instead of a hard-coded name
    const uitGen = kern.GEN[g];
    if (uitGen) { const d = uitGen.split(' · '); return d[1] || uitGen; }
    return hoofd(generatieFallback(g)) + ' (generation ' + g + ')';
  };
  kern.relatie = n => {
    if (!(n >= 1)) return '';
    if (n === 1) return kern.CFG.owner || 'The owner'; // config: the owner instead of a hard-coded name
    const g = kern.generatie(n), naam = kern.generatieNaam(g);
    const enk = naam.replace(/ \(generation \d+\)$/, '').toLowerCase().replace(/parents$/, n % 2 === 0 ? 'father' : 'mother');
    return enk + ' of ' + (kern.CFG.owner || 'the owner') + (kern.GEN[g] ? '' : ' (generation ' + g + ')');
  };

  /* ---------- Status ---------- */
  // Confirmed by the owner personally (only for close family, for example No. 1–7). Counts as a tick,
  // but the person card says it is not a record (persoon.js, bewijs()).
  // config: the numbers come from CFG.confirmedByOwner instead of a source letter in SRC.
  kern.familieBevestigd = n => kern.CFG.confirmedByOwner.includes(n);
  kern.vlaggen = n => ({
    akte: (kern.AKTE.has(n) || kern.familieBevestigd(n)) && !kern.VB.has(n) && !kern.NB.has(n) && !kern.OB.has(n),
    onderbouwd: kern.OB.has(n),
    voorbehoud: kern.VB.has(n),
    nietbevestigd: kern.NB.has(n),
  });
  kern.status = n => { const v = kern.vlaggen(n); return ['akte', 'onderbouwd', 'voorbehoud', 'nietbevestigd'].filter(k => v[k]); };
  kern.statusNaam = vlag => kern.STATUSNAAM[vlag] || '';
  // Shape per status, in ink colour (currentColor). maat is the size in px for the tick and the circle; the diamond is smaller.
  kern.statusIcoon = (vlag, maat) => {
    const m = maat || 18, naam = kern.esc(kern.STATUSNAAM[vlag] || '');
    if (vlag === 'akte') return `<svg role="img" aria-label="${naam}" width="${m}" height="${m}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 12.5 9.5 17.5 19.5 6.5"/></svg>`;
    if (vlag === 'onderbouwd') return `<svg role="img" aria-label="${naam}" width="${Math.round(m * 0.72)}" height="${Math.round(m * 0.72)}" viewBox="0 0 24 24"><path d="M12 2 22 12 12 22 2 12z" fill="currentColor"/></svg>`;
    if (vlag === 'voorbehoud') return `<svg role="img" aria-label="${naam}" width="${m}" height="${m}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-dasharray="3.2 3"><circle cx="12" cy="12" r="8"/></svg>`;
    if (vlag === 'nietbevestigd') return `<span class="status-nb" role="img" aria-label="${naam}">Abc</span>`;
    return '';
  };

  /* ---------- Life-course parser ---------- */
  // i18n: English month abbreviations (keys are the first three letters, lower case).
  const MAAND_AFK = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
  const RE_DATUM = /(\d{1,2})(?:\/(\d{1,2}))?-(\d{1,2})-(\d{4})/; // day, optionally a second day ("14/17-03-1712"), month, year
  const RE_MAANDJAAR = /\b(\d{1,2})-(\d{4})\b/;
  // i18n: English month names, full or abbreviated ("March 1884", "Mar. 1884").
  const RE_MAANDNAAM = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{4})\b/i;
  const RE_JAARBEREIK = /\b(\d{4})\s*[-–\/]\s*(\d{4})\b/;
  const RE_JAAR = /\b(1[2-9]\d\d|20\d\d)\b/;
  // i18n: English qualifier words.
  const RE_KWALIFICATIE = /^(probably|presumably|possibly|candidate|about|ca\.?|c\.|circa)$/i;
  // i18n: English words that start a place without a capital letter.
  const GEO_WOORD = /^(barony|lordship|municipality|parish|manor|polder|near|under|by)\s/i;

  function leegDatum() { return { jaar: null, maand: null, dag: null, dagAlt: null, tot: null, ca: false, voor: false, na: false, onzeker: false, kwalificatie: null, plaats: null, rest: '', ruw: true }; }

  // Extracts the date, the qualifier and the place from a piece of text (without symbol). Whatever is not interpreted goes to rest.
  // opties.plaatsNaKomma: only a part after a comma counts as a place (for marriages, where a name can follow the date).
  function ontleedDatum(tekst, opties) {
    const d = leegDatum(), o = opties || {};
    let t = ' ' + String(tekst || '').trim() + ' ';
    // Remarks in brackets stay in one piece and go to rest.
    const opm = [];
    t = t.replace(/\([^)]*\)?/g, (m, i, heel) => { opm.push({ tekst: m.trim(), voor: heel.slice(0, i).trim() }); return ' '; });
    const neem = (re, f) => { const m = t.match(re); if (m) { f(m); t = t.replace(m[0], ' '); return true; } return false; };
    const bereik = (van, tot) => { const a = ontleedDatum(van), b = ontleedDatum(tot); d.jaar = a.jaar; d.maand = a.maand; d.dag = a.dag; d.tot = b.jaar; d.tussen = { van: a, tot: b }; };
    // i18n: English date words: "between 1850 and 1852", "after 1850, before 1852", "about/circa/c.", "before", "after".
    neem(/\bbetween\s+(.+?)\s+and\s+([^\s,;]+)/i, m => bereik(m[1], m[2]));
    if (d.jaar == null) neem(/\bafter\s+([^\s,;]+),?\s+before\s+([^\s,;]+)/i, m => bereik(m[1], m[2]));
    neem(/\b(about|ca\.?|circa|c\.|around|approximately)\s+(?=\S)/i, () => { d.ca = true; });
    neem(/[±≈]\s*/, () => { d.ca = true; });
    neem(/\bbefore\s+(?=\S)/i, () => { d.voor = true; });
    neem(/<\s*(?=\d)/, () => { d.voor = true; });
    neem(/\bafter\s+(?=\d)/i, () => { d.na = true; });
    neem(/>\s*(?=\d)/, () => { d.na = true; });
    neem(/\b(probably|presumably|candidate|possibly)\b\s*/i, m => { d.onzeker = true; d.kwalificatie = m[1].toLowerCase(); }); // i18n: the word itself is kept and shown literally on the card
    if (/\?/.test(t)) { d.onzeker = true; t = t.replace(/\?/g, ' '); }
    if (d.jaar == null) {
      if (neem(RE_DATUM, m => { d.dag = +m[1]; d.dagAlt = m[2] ? +m[2] : null; d.maand = +m[3] - 1; d.jaar = +m[4]; })) { /* day-month-year, optionally day/day */ }
      else if (neem(RE_MAANDNAAM, m => { d.maand = MAAND_AFK[m[1].slice(0, 3).toLowerCase()]; d.jaar = +m[2]; })) { /* month name year */ }
      else if (neem(RE_MAANDJAAR, m => { d.maand = +m[1] - 1; d.jaar = +m[2]; })) { /* mm-yyyy */ }
      else if (neem(RE_JAARBEREIK, m => { d.jaar = +m[1]; d.tot = +m[2]; })) { /* yyyy-yyyy */ }
      else if (neem(RE_JAAR, m => { d.jaar = +m[1]; })) { /* yyyy */ }
    }
    if (d.maand != null && (d.maand < 0 || d.maand > 11)) d.maand = null;
    // Place: the first piece that starts with a capital letter (or 's-, 't, barony …) and has no digit.
    const delen = t.split(/([,;])/);
    for (let i = 0; i < delen.length; i += 2) {
      const s = delen[i].trim(); if (!s) continue;
      if (o.plaatsNaKomma && i === 0) continue;
      if (/\d/.test(s) || /^(NN|N\.N\.)$/.test(s)) continue;
      if (/^(['’]s-|['’]t\s|[A-ZÀ-Ý])/.test(s) || GEO_WOORD.test(s)) { d.plaats = s; delen[i] = ' '; break; }
    }
    t = delen.join('');
    // A short addition in brackets right after the place belongs to the place: "Exampleville (Belgium)".
    if (d.plaats) {
      // i18n: English remark words that do not belong to the place (DTB and BS are abbreviations of Dutch record series).
      const i = opm.findIndex(x => x.voor.endsWith(d.plaats) && !/\d/.test(x.tekst) && x.tekst.split(/\s+/).length <= 3 && !/^\((DTB|BS|genealogy|own statement|assumption|estimate|record)\)$/i.test(x.tekst));
      if (i >= 0) { d.plaats += ' ' + opm[i].tekst; opm.splice(i, 1); }
    }
    d.rest = [t.replace(/\s+/g, ' ').replace(/^[\s,;:.]+|[\s,;:.]+$/g, '').trim(), ...opm.map(x => x.tekst)].filter(Boolean).join(' ');
    d.ruw = d.jaar == null;
    return d;
  }

  // Splits a field of P into event segments at the symbol (°, ~, †, ⚰, ⚭, bur., bapt., died, originally from, lived),
  // but not inside brackets.
  // i18n: English event words instead of the Dutch ones; the kinds on the right are tokens and stay as they are.
  const RE_SYMBOOL = /(°|~|†|⚰|⚭|\bbur\.|\bburied\b|\bbapt\.|\bbaptised\b|\bbaptized\b|\bdied\b|\boriginally from\b|\blived\b)/g;
  const SOORT = { '°': 'geboren', '~': 'gedoopt', '†': 'overleden', '⚰': 'begraven', '⚭': 'huwelijk', 'bur.': 'begraven', 'buried': 'begraven', 'bapt.': 'gedoopt', 'baptised': 'gedoopt', 'baptized': 'gedoopt', 'died': 'overleden', 'originally from': 'herkomst', 'lived': 'woonde' };
  // Display words for the event kinds (the kinds themselves are tokens used by other files).
  const SOORT_TEKST = { geboren: 'born', gedoopt: 'baptised', overleden: 'died', begraven: 'buried' };
  const RE_KWAL_STAART = /(^\s*|[,;]\s*)(probably|presumably|possibly|candidate)\s*$/i;
  const GEBEURTENIS = ['geboren', 'gedoopt', 'overleden', 'begraven'];
  function segmenten(veld, standaard) {
    const uit = []; if (!veld) return uit;
    let laatste = 0, soort = standaard, sym = null, m;
    RE_SYMBOOL.lastIndex = 0;
    while ((m = RE_SYMBOOL.exec(veld))) {
      const voor = veld.slice(0, m.index);
      if ((voor.match(/\(/g) || []).length > (voor.match(/\)/g) || []).length) continue; // inside brackets
      uit.push({ soort, sym, tekst: veld.slice(laatste, m.index) });
      soort = SOORT[m[1]]; sym = m[1]; laatste = m.index + m[0].length;
    }
    uit.push({ soort, sym, tekst: veld.slice(laatste) });
    // A qualifier right before a symbol belongs to that symbol: "probably ~ 23-06-1739" and "† probably buried …"
    // are about the baptism and the burial respectively, not about the segment before.
    for (let i = 0; i + 1 < uit.length; i++) {
      const k = uit[i].tekst.match(RE_KWAL_STAART);
      if (k) { uit[i].tekst = uit[i].tekst.slice(0, k.index + k[1].length); uit[i + 1].tekst = k[2] + ' ' + uit[i + 1].tekst; }
    }
    // "° originally from Exampleville": an origin right after an empty symbol is that event itself, literal and without a date.
    // The origin segment also stays, so that leven(n).herkomst is filled.
    for (let i = 1; i < uit.length; i++) {
      const h = uit[i], v = uit[i - 1];
      if ((h.soort === 'herkomst' || h.soort === 'woonde') && v.sym && !v.tekst.trim() && GEBEURTENIS.includes(v.soort)) { v.tekst = h.sym + ' ' + h.tekst.trim(); v.letterlijk = true; }
    }
    return uit.map(s => ({ soort: s.soort, sym: s.sym, letterlijk: !!s.letterlijk, tekst: s.tekst.trim().replace(/^[,;:\s]+|[,;:\s]+$/g, '') })).filter(s => s.tekst);
  }
  const SYM = { gedoopt: '~ ', begraven: '⚰ ', huwelijk: '⚭ ', geboren: '° ', overleden: '† ' };
  // Picks the main event per kind (the first one with a year) and returns other events with a year separately.
  function kiesGebeurtenis(segs, soorten) {
    const kand = segs.filter(s => soorten.includes(s.soort));
    if (!kand.length) return { hoofd: null, overige: [] };
    // A literal segment ("° originally from Exampleville, Sampletown") is not parsed: everything is in rest.
    const ontleed = kand.map(s => ({ ...(s.letterlijk ? { ...leegDatum(), rest: s.tekst } : ontleedDatum(s.tekst)), soort: s.soort, tekst: s.tekst, letterlijk: s.letterlijk }));
    const hoofd = ontleed.find(o => o.jaar != null) || ontleed[0];
    const overige = [], rest = [];
    const metKwal = (o, t) => (o.kwalificatie ? o.kwalificatie + ' ' : '') + t; // the qualifier word of a separate segment stays with its text
    for (const o of ontleed) {
      if (o === hoofd) continue;
      // A segment with only a qualifier ("probably", "c.", "?") says something about the main event.
      const alleenKwal = o.jaar == null && !o.plaats && (RE_KWALIFICATIE.test(o.rest) || (!o.rest && (o.onzeker || o.ca || o.voor || o.na)));
      if (alleenKwal) {
        if (/^(ca\.?|c\.|circa|about)$/i.test(o.rest) || o.ca) hoofd.ca = true; // i18n: English qualifier words
        else if (o.rest) { hoofd.onzeker = true; if (!hoofd.kwalificatie) hoofd.kwalificatie = o.rest.toLowerCase(); else rest.push(o.rest); }
        if (o.onzeker) hoofd.onzeker = true;
        if (o.kwalificatie) { if (!hoofd.kwalificatie) hoofd.kwalificatie = o.kwalificatie; else if (hoofd.kwalificatie !== o.kwalificatie) rest.push(o.kwalificatie); }
        if (o.voor) hoofd.voor = true; if (o.na) hoofd.na = true;
        continue;
      }
      if (o.jaar != null && o.soort !== hoofd.soort) { overige.push(o); continue; } // e.g. baptism next to birth: its own row
      if (o.jaar != null) { rest.push(SYM[o.soort] + o.tekst); continue; } // alternative ("~ a or ~ b"), literal
      if (o.plaats && !hoofd.plaats && o.soort === hoofd.soort && !o.kwalificatie) { hoofd.plaats = o.plaats; if (o.rest) rest.push(o.rest); continue; }
      // i18n: the kind is shown as an English word (SOORT_TEKST) instead of the Dutch token.
      if (o.plaats) { rest.push(metKwal(o, (SOORT_TEKST[o.soort] || o.soort) + ' in ' + o.plaats + (o.rest ? ' ' + o.rest : ''))); continue; }
      if (o.rest) rest.push((SOORT_TEKST[o.soort] || o.soort) + ': ' + metKwal(o, o.rest));
      else if (o.kwalificatie) rest.push((SOORT_TEKST[o.soort] || o.soort) + ': ' + o.kwalificatie);
      if (o.onzeker && !o.kwalificatie) hoofd.onzeker = true;
    }
    if (rest.length) hoofd.rest = [hoofd.rest, ...rest].filter(Boolean).join(/\bor$/.test(hoofd.rest) ? ' ' : ' · '); // i18n: "of" -> "or"
    return { hoofd, overige };
  }
  const kaal = s => String(s || '').replace(/^[°~†⚰]\s*/, '').trim();

  const levenCache = new Map();
  kern.leven = n => {
    if (levenCache.has(n)) return levenCache.get(n);
    const p = kern.P.get(n) || [];
    const [, v1, v2, beroep] = p;
    const segs = segmenten(v1, 'geboren').concat(segmenten(v2, 'overleden'));
    // Field 1 without a symbol is a lifespan for the oldest generations: "1514 - >1563", "ca 1510 <1560" (bound of the death).
    for (const s of segs) {
      if (s.soort !== 'geboren') continue;
      const m = s.tekst.match(/^(.*?\d{4})\s*-?\s*([<>]\s*\d{4}.*)$/);
      if (m) { s.tekst = m[1]; segs.push({ soort: 'overleden', tekst: m[2] }); }
    }
    const geb = kiesGebeurtenis(segs, ['geboren', 'gedoopt']);
    const ovl = kiesGebeurtenis(segs, ['overleden', 'begraven']);
    const herkomst = segs.find(s => s.soort === 'herkomst' || s.soort === 'woonde');
    const herkomstTekst = herkomst ? herkomst.sym + ' ' + herkomst.tekst : null; // "originally from Exampleville", "lived Sampletown": with the verb
    const draagt = ev => !!(ev && ev.letterlijk && ev.rest === herkomstTekst);
    const herkomstBij = draagt(geb.hoofd) ? 'geboren' : draagt(ovl.hoofd) ? 'overleden' : null;
    const losseHuw = segs.filter(s => s.soort === 'huwelijk').map(s => '⚭ ' + s.tekst);
    if (losseHuw.length && geb.hoofd) geb.hoofd.rest = [geb.hoofd.rest, ...losseHuw].filter(Boolean).join(' · ');
    // Marriage from M (of the pair n/n+1).
    const mk = n % 2 === 0 ? n : n - 1;
    let huwelijk = null;
    const mt = n > 1 ? kern.M.get(mk) : null;
    if (mt) {
      let t = mt.replace(/^⚭\s*/, '').trim();
      const pn = kern.partner(n), partner = kern.P.has(pn) ? kern.P.get(pn)[0] : null;
      const meervoudig = /(^|[\s;])\(?\d\)\s/.test(t) || /(^|[\s;])\(?\d\)$/.test(t);
      if (meervoudig) {
        const j = t.match(RE_JAAR);
        huwelijk = { ...leegDatum(), soort: 'getrouwd', tekst: mt, meervoudig: true, jaarHint: j ? +j[1] : null, rest: t, partnerNr: pn, partner, ruw: true };
      } else {
        // i18n: English words: "marriage banns", "2nd marriage", "with <partner>".
        const soort = /\b(?:marriage )?banns\b/i.test(t) ? 'ondertrouw' : 'getrouwd';
        let voorvoegsel = null;
        t = t.replace(/\b(?:marriage )?banns\s*/i, '').replace(/^(\d+(?:st|nd|rd|th) marriage)\s*/i, (m, x) => { voorvoegsel = x; return ''; });
        let partnerTekst = null;
        t = t.replace(/\bwith\s+([^,;]+)/i, (m, naam) => { partnerTekst = naam.trim(); return ' '; });
        huwelijk = { ...ontleedDatum(t, { plaatsNaKomma: true }), soort, tekst: mt, partnerNr: pn, partner };
        const eigen = p[0] || '';
        const bekend = s => !!s && (eigen.includes(s) || (partner && partner.includes(s)));
        if (partnerTekst && !bekend(partnerTekst)) huwelijk.rest = [partnerTekst, huwelijk.rest].filter(Boolean).join(' · ');
        if (bekend(huwelijk.rest)) huwelijk.rest = '';
        if (voorvoegsel) huwelijk.rest = [voorvoegsel, huwelijk.rest].filter(Boolean).join(' · '); // "2nd marriage" is not lost
        huwelijk.ruw = huwelijk.jaar == null;
      }
    }
    const est = kern.EST.get(n);
    let schatting = null;
    if (est) { const m = est.match(/(\d{4}).*?(\d{4})/); schatting = { van: m ? +m[1] : null, tot: m ? +m[2] : null, tekst: est }; }
    const uit = {
      geboren: geb.hoofd,
      overleden: ovl.hoofd,
      huwelijk,
      overige: geb.overige.concat(ovl.overige), // extra events with a year (baptism next to birth, burial next to death)
      beroep: beroep || null,
      schatting,
      herkomst: herkomstTekst,
      herkomstBij, // 'geboren' | 'overleden' | null: that event already has the origin as rest ("° originally from …"); then do not show it again
      ruwTekst: [kaal(v1), kaal(v2)].filter(Boolean).join(' · ') || null,
      // ruw: there is text for birth or death, but no year can be extracted anywhere.
      ruw: !!((v1 || v2) && !(geb.hoofd && geb.hoofd.jaar != null) && !(ovl.hoofd && ovl.hoofd.jaar != null)),
    };
    levenCache.set(n, uit);
    return uit;
  };

  // "on 12 October 1835", "in March 1884", "around 1846", "before 1719", "after 1846", "between 1745 and 1760"; zonderJaar leaves out the year.
  const dagTekst = ev => String(ev.dag) + (ev.dagAlt != null ? '/' + ev.dagAlt : ''); // "14/17" stays "14/17"
  kern.wanneer = (ev, zonderJaar) => {
    if (!ev || ev.jaar == null) return '';
    const jaar = zonderJaar ? '' : ' ' + ev.jaar;
    if (ev.tussen) {
      const f = x => (x.dag != null ? `${dagTekst(x)} ${MAANDEN[x.maand]} ${x.jaar}` : x.maand != null ? `${MAANDEN[x.maand]} ${x.jaar}` : String(x.jaar));
      return `between ${f(ev.tussen.van)} and ${f(ev.tussen.tot)}`;
    }
    // "before c. 1575": before/after and c. go together; c. alone becomes "around".
    const kw = [ev.voor ? 'before' : ev.na ? 'after' : '', ev.ca ? (ev.voor || ev.na ? 'c.' : 'around') : ''].filter(Boolean).join(' ');
    if (ev.tot != null && ev.dag == null) return `${kw || 'in'} ${ev.jaar}/${ev.tot}`;
    if (ev.dag != null) return `${kw ? kw + ' ' : 'on '}${dagTekst(ev)} ${MAANDEN[ev.maand]}${jaar}`;
    if (ev.maand != null) return `${kw ? kw + ' ' : 'in '}${MAANDEN[ev.maand]}${jaar}`;
    if (kw) return `${kw} ${ev.jaar}`;
    return zonderJaar ? '' : `in ${ev.jaar}`;
  };

  // Years as in the mockup: "1845–1913", "b. c. 1846", "bapt. 1799", "d. before 1861", "≈ 1725 – ≈ 1785". A range becomes "1762/1765".
  const kwal = ev => (ev.voor ? 'before ' : ev.na ? 'after ' : '') + (ev.ca ? 'c. ' : '') + ev.jaar + (ev.tot != null && ev.tot !== ev.jaar ? '/' + ev.tot : '');
  kern.jaarTekst = ev => (ev && ev.jaar != null ? String(ev.jaar) + (ev.tot != null && ev.tot !== ev.jaar ? '/' + ev.tot : '') : '');
  kern.jaren = n => {
    const l = kern.leven(n);
    const b = l.geboren && l.geboren.jaar != null ? l.geboren : null;
    const d = l.overleden && l.overleden.jaar != null ? l.overleden : null;
    if (b && d) return `${kwal(b)}–${kwal(d)}`;
    if (b) return (b.soort === 'gedoopt' ? 'bapt. ' : 'b. ') + kwal(b);
    if (d) return (d.soort === 'begraven' ? 'bur. ' : 'd. ') + kwal(d);
    if (l.schatting) return l.schatting.tekst;
    return '';
  };
  kern.plaats = n => {
    const l = kern.leven(n);
    const h = l.herkomst ? l.herkomst.replace(/^.*?(?=[A-ZÀ-Ý'’])/, '').replace(/\s*\(.*$/, '').trim() : null;
    return (l.geboren && l.geboren.plaats) || (l.overleden && l.overleden.plaats) || (l.huwelijk && l.huwelijk.plaats) || h || null;
  };
  kern.leeftijd = n => {
    const l = kern.leven(n), b = l.geboren, d = l.overleden;
    if (!b || !d || b.dag == null || d.dag == null || b.ca || d.ca || b.voor || d.voor || b.na || d.na || b.tussen || d.tussen) return null;
    let j = d.jaar - b.jaar;
    if (d.maand < b.maand || (d.maand === b.maand && d.dag < b.dag)) j--;
    return j >= 0 && j < 120 ? j : null;
  };

  /* ---------- One counting function ---------- */
  kern.tel = () => {
    const uit = { wat: 'All ancestors in the ancestor chart', totaal: kern.P.size, perLijn: { 4: 0, 5: 0, 6: 0, 7: 0, anders: 0 }, perStatus: { akte: 0, onderbouwd: 0, voorbehoud: 0, nietbevestigd: 0, geen: 0 } };
    for (const n of kern.P.keys()) {
      const l = kern.lijn(n); uit.perLijn[l || 'anders']++;
      const s = kern.status(n); if (!s.length) uit.perStatus.geen++; s.forEach(k => uit.perStatus[k]++);
    }
    return uit;
  };

  /* ---------- Router ---------- */
  const weergaven = new Map(); // name -> {def, el, gemonteerd}
  let hoofdRoute = { weergave: 'boom', params: {} };
  let huidig = null;
  let persoonOpen = false;
  const HOOFD = ['boom', 'overzicht', 'kaart', 'register', 'voortgang', 'uitleg', 'updates', 'contact'];

  // config: the Contact view only exists when the configuration gives an email or a text.
  const contactVerborgen = () => !kern.CFG.contact.email && !kern.CFG.contact.text;
  kern.ontleed = hash => {
    let h = String(hash || '').replace(/^#/, '');
    try { h = decodeURIComponent(h); } catch (e) { /* leave as it is */ }
    const i = h.indexOf('/'); const kop = i < 0 ? h : h.slice(0, i); const rest = i < 0 ? '' : h.slice(i + 1);
    switch (kop) {
      case 'boom': return { weergave: 'boom', params: /^\d+$/.test(rest) ? { n: +rest } : {} };
      case 'persoon': return /^\d+$/.test(rest) && +rest >= 1 ? { weergave: 'persoon', params: { n: +rest } } : { weergave: 'boom', params: {} };
      case 'register': return { weergave: 'register', params: rest ? { zoek: rest } : {} };
      case 'kaart':
        if (!rest) return { weergave: 'kaart', params: {} };
        if (/^nr-\d+$/.test(rest)) return { weergave: 'kaart', params: { n: +rest.slice(3) } };
        return { weergave: 'kaart', params: { plaats: rest } };
      case 'contact': if (contactVerborgen()) return { weergave: 'uitleg', params: {} }; // config: hidden Contact lands on the Guide
      // falls through
      case 'overzicht': case 'voortgang': case 'uitleg': case 'updates': return { weergave: kop, params: {} };
      default: return { weergave: 'boom', params: {} };
    }
  };
  kern.hash = r => {
    const p = r.params || {};
    if (r.weergave === 'persoon') return '#persoon/' + p.n;
    if (r.weergave === 'kaart') return p.n != null ? '#kaart/nr-' + p.n : p.plaats ? '#kaart/' + encodeURIComponent(p.plaats) : '#kaart';
    if (r.weergave === 'register') return p.zoek ? '#register/' + encodeURIComponent(p.zoek) : '#register';
    if (r.weergave === 'boom' && p.n != null) return '#boom/' + p.n;
    return '#' + r.weergave;
  };
  kern.route = () => (huidig ? { weergave: huidig.weergave, params: { ...huidig.params } } : kern.ontleed(location.hash));
  kern.hoofdRoute = () => ({ weergave: hoofdRoute.weergave, params: { ...hoofdRoute.params } });

  const hoofdEl = () => document.getElementById('hoofd');
  function elementVoor(naam) {
    const bestaand = hoofdEl().querySelector(`.weergave[data-weergave="${naam}"]`);
    if (bestaand) return bestaand;
    const s = document.createElement('section');
    s.className = 'weergave weergave-' + naam; s.dataset.weergave = naam; s.hidden = true;
    hoofdEl().appendChild(s);
    return s;
  }
  function komtNog(naam) {
    const el = elementVoor(naam);
    const label = { boom: 'Tree', overzicht: 'Overview', kaart: 'Map', register: 'Register', voortgang: 'Progress', uitleg: 'Guide' }[naam] || naam;
    if (!el.childElementCount) el.innerHTML = `<div class="komt-nog"><p class="naam">This view is not ready yet</p><p>The “${kern.esc(label)}” view is built in a later phase.</p></div>`;
    return el;
  }
  function toonHoofd(r) {
    const vorige = hoofdRoute;
    if (vorige.weergave !== r.weergave) {
      const w = weergaven.get(vorige.weergave);
      if (w && w.gemonteerd && w.def.verlaat) { try { w.def.verlaat(); } catch (e) { console.error(e); } }
      const velE = hoofdEl().querySelector(`.weergave[data-weergave="${vorige.weergave}"]`); if (velE) velE.hidden = true;
    }
    const w = weergaven.get(r.weergave);
    const el = w ? elementVoor(r.weergave) : komtNog(r.weergave);
    el.hidden = false;
    if (w) {
      if (!w.gemonteerd) { w.gemonteerd = true; w.el = el; try { w.def.monteer(el, r.params); } catch (e) { console.error(e); } }
      else if (w.def.bijwerk) { try { w.def.bijwerk(r.params); } catch (e) { console.error(e); } }
    }
    hoofdRoute = r;
    document.querySelectorAll('[data-weergave]').forEach(a => {
      if (!a.matches('a,button')) return;
      if (a.dataset.weergave === r.weergave) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    const meerKnop = document.getElementById('meer-knop'), viaMeer = ['voortgang', 'uitleg', 'updates', 'contact'].includes(r.weergave);
    if (meerKnop) meerKnop.classList.toggle('tab-actief', viaMeer);
    // Phone: Progress and Guide sit behind More; the header shows the way back ("‹ More"), as in the phone mockup.
    const terug = document.getElementById('kop-terug'), titel = document.querySelector('.kop-titel');
    if (terug && titel) { terug.hidden = !viaMeer; titel.hidden = viaMeer; }
    if (vorige.weergave !== r.weergave) window.scrollTo(0, 0);
  }
  function toonPersoon(params) {
    const w = weergaven.get('persoon');
    if (!w) return;
    const el = document.getElementById('persoon');
    try {
      if (!w.gemonteerd) { w.gemonteerd = true; w.el = el; w.def.monteer(el, params); }
      else if (w.def.bijwerk) w.def.bijwerk(params);
    } catch (e) { console.error(e); }
    persoonOpen = true;
  }
  function sluitPersoonWeergave() {
    if (!persoonOpen) return;
    const w = weergaven.get('persoon');
    if (w && w.gemonteerd && w.def.verlaat) { try { w.def.verlaat(); } catch (e) { console.error(e); } }
    persoonOpen = false;
  }
  function toon(r) {
    if (r.weergave === 'persoon') {
      if (!huidig) toonHoofd(hoofdRoute); // loaded directly on #persoon/n: the default view underneath
      toonPersoon(r.params);
    } else {
      sluitPersoonWeergave();
      toonHoofd(r);
    }
    huidig = r;
    document.dispatchEvent(new CustomEvent('kern:route', { detail: kern.route() }));
  }
  const stapel = () => (history.state && typeof history.state.stapel === 'number' ? history.state.stapel : 0);
  const normaliseer = h => (String(h || '').startsWith('#') ? h : '#' + h);
  kern.ga = hash => {
    const h = normaliseer(hash);
    const r = kern.ontleed(h);
    if (location.hash === h) { toon(r); return; }
    const st = r.weergave === 'persoon' ? (huidig && huidig.weergave === 'persoon' ? stapel() + 1 : 1) : 0;
    try { history.pushState({ stapel: st }, '', h); } catch (e) { location.hash = h; return; }
    toon(r);
  };
  kern.vervang = hash => {
    const h = normaliseer(hash);
    try { history.replaceState({ stapel: 0 }, '', h); } catch (e) { location.hash = h; return; }
    toon(kern.ontleed(h));
  };
  kern.openPersoon = n => kern.ga('#persoon/' + n);
  window.openP = n => kern.openPersoon(n);
  // Closes the card: back through the stack of opened cards if they came via the router, otherwise to the main view.
  kern.sluitPersoon = () => {
    if (!huidig || huidig.weergave !== 'persoon') return;
    const s = stapel();
    if (s > 0 && history.length > s) history.go(-s);
    else kern.vervang(kern.hash(hoofdRoute));
  };
  kern.persoonOpen = () => persoonOpen;

  kern.registreer = (naam, def) => {
    if (!def || typeof def.monteer !== 'function') throw new Error('kern.registreer: monteer(el, params) is missing for ' + naam);
    weergaven.set(naam, { def, el: null, gemonteerd: false });
    // If the route is already active (registration after the start), show it at once.
    if (huidig && (huidig.weergave === naam || (naam === 'persoon' && huidig.weergave === 'persoon'))) toon(huidig);
    else if (huidig && hoofdRoute.weergave === naam && naam !== 'persoon') { toonHoofd(hoofdRoute); }
  };
  kern.weergaven = () => Array.from(weergaven.keys());
  kern.HOOFD = HOOFD;

  /* ---------- Sections of the person card ---------- */
  const secties = [];
  kern.secties = {
    voeg(s) {
      if (!s || !s.id || typeof s.render !== 'function') throw new Error('kern.secties.voeg: id and render(n) are required');
      const i = secties.findIndex(x => x.id === s.id); if (i >= 0) secties.splice(i, 1);
      secties.push({ volgorde: 50, openOpLaptop: true, ...s });
    },
    lijst(n) { return secties.filter(s => !s.geldt || s.geldt(n)).slice().sort((a, b) => a.volgorde - b.volgorde); },
    heeft(id) { return secties.some(s => s.id === id); }, // is a section with this id registered (regardless of geldt)?
  };

  /* ---------- Theme ---------- */
  const THEMA_SLEUTEL = 'kw-thema';
  let themaKeuze = 'auto';
  kern.thema = k => {
    if (k === undefined) return themaKeuze;
    if (!['licht', 'donker', 'auto'].includes(k)) k = 'auto';
    themaKeuze = k;
    const html = document.documentElement;
    if (k === 'licht') html.setAttribute('data-theme', 'light');
    else if (k === 'donker') html.setAttribute('data-theme', 'dark');
    else html.removeAttribute('data-theme');
    try { if (k === 'auto') localStorage.removeItem(THEMA_SLEUTEL); else localStorage.setItem(THEMA_SLEUTEL, k); } catch (e) { /* it also works without storage */ }
    document.querySelectorAll('button[data-thema]').forEach(b => {
      const aan = b.dataset.thema === k ? 'true' : 'false';
      if (b.getAttribute('role') === 'radio') { b.setAttribute('aria-checked', aan); b.tabIndex = aan === 'true' ? 0 : -1; } else b.setAttribute('aria-pressed', aan);
    });
    return k;
  };
  const THEMAS = ['licht', 'donker', 'auto'];
  function themaSchakel(variant) {
    const d = document.createElement('div'); d.className = 'thema-blok';
    const label = { licht: ['Light', 'Light'], donker: ['Dark', 'Dark'], auto: ['Auto', 'Automatic'] };
    if (variant === 'meer') {
      // The More sheet as in the mockup: heading "Theme", radio buttons and a help sentence.
      d.innerHTML = `<p class="thema-kopje" id="thema-kopje-meer">Theme</p><div class="thema-radio" role="radiogroup" aria-labelledby="thema-kopje-meer">${THEMAS.map(k => `<button type="button" role="radio" data-thema="${k}" aria-checked="${themaKeuze === k}" tabindex="${themaKeuze === k ? 0 : -1}">${label[k][1]}</button>`).join('')}</div><p class="thema-hulp">Automatic follows the setting of your device.</p>`;
      d.addEventListener('keydown', e => {
        const b = e.target.closest('button[data-thema]'); if (!b) return;
        const stap = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key]; if (!stap) return;
        e.preventDefault();
        const k = THEMAS[(THEMAS.indexOf(b.dataset.thema) + stap + THEMAS.length) % THEMAS.length];
        kern.thema(k); const nb = d.querySelector(`button[data-thema="${k}"]`); if (nb) nb.focus();
      });
    } else {
      d.innerHTML = `<span class="thema-label">Appearance</span><div class="schakel thema-schakel" role="group" aria-label="Light or dark">${THEMAS.map(k => `<button type="button" data-thema="${k}" aria-pressed="${themaKeuze === k}"><span class="thema-kort">${label[k][0]}</span><span class="thema-lang">${label[k][1]}</span></button>`).join('')}</div>`;
    }
    d.addEventListener('click', e => { const b = e.target.closest('button[data-thema]'); if (b) kern.thema(b.dataset.thema); });
    return d;
  }
  kern.isLaptop = () => window.matchMedia('(min-width: 1180px)').matches;
  kern.isTelefoon = () => !window.matchMedia('(min-width: 760px)').matches;

  /* ---------- Shell: More sheet, version line, counts ---------- */
  let meerOpen = false, meerVorigeFocus = null, schermTimer = 0;
  const ACHTER_BLAD = ['spring', 'kop', 'hoofd', 'onderbalk', 'zijbalk'];
  function zetInert(ids, aan) { for (const id of ids) { const el = document.getElementById(id); if (!el) continue; if (aan) el.setAttribute('inert', ''); else el.removeAttribute('inert'); } }

  /* ---------- Sliding sheets in and out (person card, More sheet) ---------- */
  // An element with [hidden] has no layout, so there is nothing to animate: first make it visible at the start position
  // (.schuift), force a reflow, then remove the class. Out: set the class and hide only after the movement.
  const schuifLoop = new WeakMap(); // el -> { id, uit }: a running slide-out that can still be cancelled
  function schuifStop(el) {
    const l = schuifLoop.get(el); if (!l) return;
    clearTimeout(l.id); el.removeEventListener('transitionend', l.uit); schuifLoop.delete(el);
    el.removeAttribute('inert'); el.style.transitionDuration = '';
  }
  kern.schuif = (el, aan, opt) => {
    const o = opt || {};
    schuifStop(el);
    if (aan) {
      const was = el.hidden; el.hidden = false; el.style.transform = '';
      if (was && !o.direct) { el.classList.add('schuift'); el.getBoundingClientRect(); }
      el.classList.remove('schuift');
      return;
    }
    const klaar = () => { schuifStop(el); el.hidden = true; el.classList.remove('schuift'); el.style.transform = ''; el.style.transitionDuration = ''; if (o.klaar) o.klaar(); };
    if (el.hidden || o.direct) { klaar(); return; }
    el.setAttribute('inert', ''); // nothing can be tapped while it slides out
    if (o.duur) el.style.transitionDuration = o.duur + 'ms';
    el.style.transform = ''; el.classList.add('schuift');
    const uit = e => { if (e.target === el) klaar(); };
    el.addEventListener('transitionend', uit);
    schuifLoop.set(el, { id: setTimeout(klaar, 450), uit }); // safety net: no transitionend (tab in the background)
  };
  function zetScherm(aan) {
    const s = document.getElementById('scherm');
    if (s) {
      clearTimeout(schermTimer);
      if (aan) { const was = s.hidden; s.hidden = false; if (was) { s.classList.add('schuift'); s.getBoundingClientRect(); } s.classList.remove('schuift'); }
      else if (!s.hidden) { s.classList.add('schuift'); schermTimer = setTimeout(() => { s.hidden = true; s.classList.remove('schuift'); }, 260); }
    }
    document.documentElement.classList.toggle('blad-open', aan);
    zetInert(ACHTER_BLAD, aan); // Tab stays inside the sheet; screen readers see only the sheet (so aria-modal is correct too)
  }
  kern.meer = aan => {
    const m = document.getElementById('meer'), k = document.getElementById('meer-knop');
    if (!m) return;
    meerOpen = aan === undefined ? !meerOpen : !!aan;
    kern.schuif(m, meerOpen, { direct: !kern.isTelefoon() }); k.setAttribute('aria-expanded', String(meerOpen));
    zetScherm(meerOpen || persoonOpen && !kern.isLaptop());
    zetInert(['persoon'], meerOpen);
    if (meerOpen) { meerVorigeFocus = document.activeElement; m.focus({ preventScroll: true }); }
    else if (meerVorigeFocus && meerVorigeFocus.focus) { meerVorigeFocus.focus({ preventScroll: true }); meerVorigeFocus = null; }
  };
  kern.scherm = zetScherm;
  function verplaatsVersie() {
    const p = document.querySelector('p.versie'); if (!p) return;
    const doel = document.getElementById(kern.isTelefoon() ? 'versie-plek-meer' : 'versie-plek-zijbalk');
    if (doel && p.parentNode !== doel) doel.appendChild(p);
  }
  function vulTellingen() {
    const t = kern.tel();
    const lijnen = document.getElementById('tel-lijnen'), status = document.getElementById('tel-status');
    if (lijnen) lijnen.innerHTML = [4, 5, 6, 7].map(l => `<div class="tel-rij" data-lijn="${l}"><span class="tel-nr getal" style="color:var(--lijn-${l})">${l}</span><span>${kern.esc(kern.LIJNEN[l].lang)}</span><span class="tel-aantal">${t.perLijn[l]}</span></div>`).join('');
    // i18n: English text with a singular form for exactly one ancestor.
    const bv = document.getElementById('meer-bij-voortgang'); if (bv) bv.textContent = `${t.totaal} ${t.totaal === 1 ? 'ancestor' : 'ancestors'}, ${t.perStatus.akte} confirmed by a record`;
    if (status) status.innerHTML = ['akte', 'onderbouwd', 'voorbehoud', 'nietbevestigd'].map(k => `<div class="tel-rij tel-rij-status" data-status="${k}"><span class="status">${kern.statusIcoon(k, 18)}</span><span>${kern.STATUSNAAM[k]}</span><span class="tel-aantal">${t.perStatus[k]}</span></div>`).join('');
  }
  function leesBronnen() {
    document.querySelectorAll('#panel ol li').forEach(li => {
      const m = li.textContent.match(/^\s*([A-Z]{1,2})\s·\s(.*)$/s);
      if (m) kern.BRON.set(m[1], m[2].trim());
    });
  }

  // config: titles, version line and Contact entries come from kern.CFG (textContent only, never innerHTML).
  function pasConfigToe() {
    const c = kern.CFG;
    const titel = c.owner ? c.title + ' of ' + c.owner : c.title;
    document.title = titel;
    document.querySelectorAll('.kop-titel, .zijbalk-titel').forEach(el => { el.textContent = titel; });
    const versie = [c.version, c.tagline].filter(Boolean).join(' · ');
    document.querySelectorAll('p.versie').forEach(p => {
      if (versie) { p.textContent = versie; p.hidden = false; p.style.display = ''; } else { p.textContent = ''; p.hidden = true; p.style.display = 'none'; }
    });
    if (contactVerborgen()) {
      document.querySelectorAll('[data-weergave="contact"]').forEach(a => {
        if (!a.matches('a,button')) return;
        a.hidden = true; a.style.display = 'none';
        const li = a.parentElement; // a list item that holds only this entry goes too
        if (li && li.tagName === 'LI' && li.children.length === 1) { li.hidden = true; li.style.display = 'none'; }
      });
    }
  }

  /* ---------- Start ---------- */
  let gestart = false;
  kern.start = () => {
    if (gestart) return; gestart = true;
    try { const k = localStorage.getItem(THEMA_SLEUTEL); if (k) themaKeuze = k; } catch (e) { /* */ }
    kern.thema(themaKeuze);
    pasConfigToe(); // config
    leesBronnen();
    vulTellingen();
    const tz = document.getElementById('thema-zijbalk'), tm = document.getElementById('thema-meer');
    if (tz) tz.appendChild(themaSchakel());
    if (tm) tm.appendChild(themaSchakel('meer'));
    verplaatsVersie();
    const mq = window.matchMedia('(min-width: 760px)');
    (mq.addEventListener ? mq.addEventListener('change', verplaatsVersie) : mq.addListener(verplaatsVersie));
    const mqL = window.matchMedia('(min-width: 1180px)'), herzie = () => { if (persoonOpen && !meerOpen) zetScherm(!kern.isLaptop()); const p = document.getElementById('persoon'); if (p && persoonOpen) p.setAttribute('aria-modal', kern.isLaptop() ? 'false' : 'true'); };
    (mqL.addEventListener ? mqL.addEventListener('change', herzie) : mqL.addListener(herzie));
    // More sheet
    const meerKnop = document.getElementById('meer-knop'), meerSluit = document.getElementById('meer-sluit');
    if (meerKnop) meerKnop.addEventListener('click', () => kern.meer());
    if (meerSluit) meerSluit.addEventListener('click', () => kern.meer(false));
    const kopTerug = document.getElementById('kop-terug');
    if (kopTerug) kopTerug.addEventListener('click', () => kern.meer(true));
    const scherm = document.getElementById('scherm');
    if (scherm) scherm.addEventListener('click', () => { if (meerOpen) kern.meer(false); else if (persoonOpen) kern.sluitPersoon(); });
    // Search field in the sidebar: to the register with the search term.
    const zoek = document.getElementById('zoek');
    if (zoek) zoek.addEventListener('submit', e => { e.preventDefault(); const q = document.getElementById('zoek-q').value.trim(); kern.ga(q ? '#register/' + encodeURIComponent(q) : '#register'); });
    // All internal links go through the router, so the stack is right and the back button works.
    document.addEventListener('click', e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest('a[href^="#"]');
      if (!a || a.hasAttribute('data-geen-router') || a.target === '_blank') return;
      const h = a.getAttribute('href');
      if (h === '#' || h === '#hoofd') return;
      e.preventDefault();
      if (meerOpen) kern.meer(false);
      kern.ga(h);
    });
    window.addEventListener('hashchange', () => toon(kern.ontleed(location.hash)));
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (meerOpen) { kern.meer(false); e.preventDefault(); }
      else if (persoonOpen) { kern.sluitPersoon(); e.preventDefault(); }
    });
    // config: an empty chart opens the Guide, and a hidden Contact view (direct visit to #contact) lands on the Guide too.
    const eerste = kern.ontleed(location.hash);
    if (kern.P.size === 0 && eerste.weergave !== 'uitleg') kern.vervang('#uitleg');
    else if (/^#?contact(\/|$)/.test(location.hash) && eerste.weergave === 'uitleg') kern.vervang('#uitleg');
    else toon(eerste);
    document.documentElement.classList.add('kern-klaar');
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', kern.start);
  else kern.start();
})();

