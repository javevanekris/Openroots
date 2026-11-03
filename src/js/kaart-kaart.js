// kaart/kaart.js 
// ui/kaart/kaart.js: the origins map, ported from version 43 (phase 3).
// The logic (regions as rings, dots per place, zooming, dragging and pinching, search, filters, place sheet,
// person mode, labels with offsets and leader lines) is unchanged; only the presentation is new: design tokens,
// chips, bottom sheet, right-hand panel of 400 px. All numbers come from kern.B and kern.PL. The only entry point
// is window.kern; the SVG and the panel are built on the first mount.
// Routes: #kaart, #kaart/nr-<n> (person mode), #kaart/<place> (place sheet), #kaart/lijn-<4..7> (filter on grandparent).
(function () {
  'use strict';
  const K = window.kern;
  if (!K || !K.B || !K.PL || !K.registreer) return;
  const B = K.B, PL = K.PL, esc = K.esc;

  /* ---------- fixed data ---------- */
  const KL = [0, 4, 5, 6, 7];   // 0 = the owner and parents (No. 1–3): they belong to more than one grandparent
  const KL4 = [4, 5, 6, 7];     // the four grandparents: only these have a filter button
  // config: line labels come from kern.CFG.lineLabels (keys "4".."7"); missing labels are built from the names in P.
  const cfgLabel = k => { const L = K.CFG && K.CFG.lineLabels, v = L && L[k]; return typeof v === 'string' ? v.trim() : ''; };
  const LKORT = new Proxy({}, { get: (_, k) => (+k === 0 ? 'Owner' : cfgLabel(k) || String(nmP(+k)).split(' ')[0]) });
  const LNM = new Proxy({}, { get: (_, k) => (+k === 0 ? 'Owner and parents' : cfgLabel(k) || nmP(+k)) });
  const LVOL = new Proxy({}, { get: (_, k) => (+k === 0 ? 'owner and parents' : cfgLabel(k) || nmP(+k)) });
  const SRT = [['geboren', 'Born or baptised', 'Born'], ['getrouwd', 'Married', 'Married'], ['overleden', 'Died or buried', 'Died'], ['akte', 'Named in a record', 'Record'], ['woonde', 'Mentioned in a note', 'Note'], ['achternaam', 'Place in the surname', 'Surname']];
  const HARD = { geboren: 1, getrouwd: 1, overleden: 1, akte: 1 };
  const SYM = { geboren: '°', getrouwd: '⚭', overleden: '†' };
  const WOORD = { geboren: 'born', getrouwd: 'married', overleden: 'died' };
  const RN = Object.keys(B.reg || {}); // i18n: empty data guard, B.reg may be missing
  const RKORT = {}; // config: optional short names for long region names (key: region name, value: short name)
  const bl = n => 32 - Math.clz32(n);
  const f1 = v => (Math.round(v * 10) / 10).toString();
  const vrw = n => (n === 1 ? '1 ancestor' : n + ' ancestors');
  const plw = n => (n === 1 ? '1 place' : n + ' places'); // i18n: English plural for places
  const nmP = n => { const p = K.P.get(n); return (p && p[0]) || ('No. ' + n); };
  // Projection of the plane that B uses. B.proj = {lon0, lat0, lat1, s}: left edge, top edge, the parallel for the width, and units per degree.
  // Without B.proj the plane is the one of the Netherlands that the first data used.
  const PJ = Object.assign({ lon0: 3.3, lat0: 53.6, lat1: 52.2, s: 180 }, (B && B.proj) || {});
  const C0 = Math.cos(PJ.lat1 * Math.PI / 180);
  const pr = (lon, lat) => [(lon - PJ.lon0) * C0 * PJ.s, (PJ.lat0 - lat) * PJ.s];
  const NS = 'http://www.w3.org/2000/svg';
  const mqR = matchMedia('(prefers-reduced-motion: reduce)');
  const mqH = matchMedia('(hover:hover) and (pointer:fine)');
  const mqL = matchMedia('(min-width:1180px)');
  const mqT = matchMedia('(min-width:760px)');
  const smal = () => !mqL.matches;          // < 1180 px: sheets instead of the right-hand panel
  const telefoon = () => !mqT.matches;      // < 760 px
  const grof = () => !mqH.matches;          // touch instead of mouse
  const tikWoord = () => (grof() ? 'tap' : 'click');

  /* ---------- data: built once, only when needed ---------- */
  let D = null;
  function data() {
    if (D) return D;
    const PLS = Object.keys(PL).map(n => { const o = PL[n], b = B.pl[n]; return { n, o, x: b.x, y: b.y, prov: b.prov, kort: b.kort, gem: b.gem, reg: b.reg, land: b.land || null, vs: !!b.vs, L: o.p, a: o.a || [], tot: o.p.length, n_: 0, c: { 0: 0, 4: 0, 5: 0, 6: 0, 7: 0 }, vorm: 'vol', y0: null, y1: null }; });
    const PBN = new Map(PLS.map(p => [p.n, p]));
    const PERS = new Map(), LIJN = new Map();
    PLS.forEach(p => p.L.forEach(l => { let a = PERS.get(l[0]); if (!a) PERS.set(l[0], a = []); a.push({ p, s: l[2], l: l[1] }); LIJN.set(l[0], l[1]); }));
    const REGS = RN.map(name => { const ps = PLS.filter(p => p.reg === name); let sx = 0, sy = 0, sw = 0; ps.forEach(p => { sx += p.x * p.tot; sy += p.y * p.tot; sw += p.tot; }); return { name, ps, wx: sx / sw, wy: sy / sw, n: 0, c: { 0: 0, 4: 0, 5: 0, 6: 0, 7: 0 }, y0: null, y1: null, vis: [] }; });
    const BUITEN = PLS.filter(p => !p.reg);
    D = { PLS, PBN, PERS, LIJN, REGS, BUITEN };
    return D;
  }
  // The places of one person, by year; nr = sequence number on the map (0 = no year).
  function persPlaatsen(n) {
    const L = data().PERS.get(n) || [];
    const it = L.map(x => { const js = Object.values(x.s).filter(Boolean); return { p: x.p, s: x.s, l: x.l, j: js.length ? Math.min(...js) : null }; });
    it.sort((a, b) => (a.j == null) - (b.j == null) || (a.j || 0) - (b.j || 0) || a.p.n.localeCompare(b.p.n, 'nl'));
    let nr = 0; it.forEach(i => { i.nr = i.j != null ? ++nr : 0; });
    return it;
  }
  // "° 1902 · ⚭ 1925 · † 1968 · record 1902 · note" as v43 showed it for a person.
  function evtRegel(s, vis) {
    const ks = vis || Object.keys(s), o = [];
    ['geboren', 'getrouwd', 'overleden'].forEach(k => { if (ks.indexOf(k) >= 0) o.push(SYM[k] + (s[k] ? ' ' + s[k] : '')); });
    if (ks.indexOf('akte') >= 0) o.push('record' + (s.akte ? ' ' + s.akte : ''));
    if (ks.indexOf('woonde') >= 0) o.push('note');
    if (ks.indexOf('achternaam') >= 0) o.push('surname');
    return o;
  }
  // In words, for the rows of the place sheet: "Married 1946, died 2011 in Exampleville".
  function vermeldingTekst(s, ks, plaats) {
    const w = [];
    ['geboren', 'getrouwd', 'overleden'].forEach(k => { if (ks.indexOf(k) >= 0) w.push(WOORD[k] + (s[k] ? ' ' + s[k] : '')); });
    if (ks.indexOf('akte') >= 0) w.push('record' + (s.akte ? ' ' + s.akte : ''));
    let t = w.join(', ');
    if (t) t = t.charAt(0).toUpperCase() + t.slice(1) + ' in ' + plaats;
    const extra = [];
    if (ks.indexOf('woonde') >= 0) extra.push(t ? 'named in a note' : 'Named in a note');
    if (ks.indexOf('achternaam') >= 0) extra.push(t || extra.length ? 'the surname points here' : 'The surname points here');
    return [t].concat(extra).filter(Boolean).join(' · ');
  }
  let wilPlaats = null; // place that must already be chosen for #kaart/nr-<n> (from a chip in the person card)

  /* ---------- section of the person card: "On the map" (or "Places" if the fixed section is still there) ---------- */
  let vasteSectie = null; // null = not checked yet; true = persoon.js already adds an "On the map" itself
  function sectieTitel() { return vasteSectie ? 'Places' : 'On the map'; }
  function sectieGeldt(n) { return (n >= 4 && n <= 7) || data().PERS.has(n); }
  function sectieRender(n) {
    const d = document.createElement('div'); d.className = 'km-op';
    if (n >= 4 && n <= 7 && !data().PERS.has(n)) {
      d.innerHTML = `<p class="km-op-tekst">All ancestors in this line (${esc(LVOL[n])}) on one map.</p><p><a class="knop" href="#kaart/lijn-${n}">Show this side on the map</a></p>`;
    } else {
      const it = persPlaatsen(n), hard = [], woon = [], ach = [];
      it.forEach(i => { const ks = Object.keys(i.s); if (ks.some(k => HARD[k])) hard.push(i); else if (ks.indexOf('woonde') >= 0) woon.push(i); else ach.push(i); });
      const chip = i => {
        const o = [];
        ['geboren', 'getrouwd', 'overleden', 'akte'].forEach(k => { if (k in i.s) o.push([k === 'akte' ? 'akte' : SYM[k], i.s[k]]); });
        const eerste = o[0], rest = o.slice(1).map(x => x[0] + (x[1] ? ' ' + x[1] : '')).join(' · ');
        return `<a class="km-op-chip" href="#kaart/nr-${n}" data-km-plaats="${esc(i.p.n)}">${esc(eerste[0])} ${esc(i.p.kort)}${eerste[1] ? ' ' + eerste[1] : ''}${rest ? ' · ' + esc(rest) : ''}</a>`;
      };
      const lijst = a => a.map(i => `<a href="#kaart/nr-${n}" data-km-plaats="${esc(i.p.n)}">${esc(i.p.kort)}</a>`).join(', ');
      let h = '';
      if (hard.length) h += `<div class="km-op-chips">${hard.map(chip).join('')}</div>`;
      if (woon.length) h += `<p class="km-op-tekst">Named in a note: ${lijst(woon)}</p>`;
      if (ach.length) h += `<p class="km-op-tekst">The surname points to ${lijst(ach)}</p>`;
      h += `<p><a class="knop" href="#kaart/nr-${n}">Show on the map</a>${n >= 4 && n <= 7 ? ` <a class="knop" href="#kaart/lijn-${n}">Show the whole line: ${esc(LVOL[n])}</a>` : ''}</p>`;
      d.innerHTML = h;
    }
    d.addEventListener('click', e => { const a = e.target.closest('a[data-km-plaats]'); if (a) wilPlaats = a.dataset.kmPlaats; });
    // After the map is built (same task), check whether persoon.js already added a fixed "On the map" section.
    queueMicrotask(() => {
      const vast = !!document.querySelector('#persoon-inhoud .sectie[data-sectie="kaart"]');
      if (vast !== vasteSectie) {
        vasteSectie = vast;
        const t = document.querySelector('#persoon-inhoud .sectie[data-sectie="plaatsen"] .sectie-titel');
        if (t) t.firstChild.textContent = sectieTitel() + (t.querySelector('.sectie-aantal') ? ' ' : '');
      }
    });
    return d;
  }
  if (K.secties) K.secties.voeg({ id: 'plaatsen', volgorde: 90, titel: () => sectieTitel(), aantal: n => (n >= 8 ? persPlaatsen(n).length : null), geldt: sectieGeldt, render: sectieRender });

  /* ---------- state of the view (exists only after the first mount) ---------- */
  const S = { lijn: 0, srt: '', gen: 0, sel: null, hov: null, pers: null, psel: null, pcam: null, zone: 'nl', sort: 'n', meer: false, open: {}, toon: {}, blad: null };
  let TOT = 0;
  let wortel = null, podium = null, svg = null, geo = null, scr = null, gWL = null, gBase = null, gAgg = null, gLead = null, gDR = null, gDO = null, gPM = null, gPMlead = null, gHL = null, gLbl = null;
  let paneel = null, inh = null, ovz = null, blad = null, bladInhoud = null, bladSub = null, kaartje = null, banier = null, tip = null, chipsRij = null, cg = null, selS = null, selG = null, zoekveld = null, zoekLijst = null, gebiedRij = null, leeg = null, hintEl = null, filterKnop = null;
  let W = 0, H = 0, kMin = 1; const kMax = 12;
  const V = { k: 1, tx: 0, ty: 0 }, base = { k: -1, tx: 0, ty: 0 };
  let agg = true, klaar = false, gebouwd = false, hashOK = false, zetBezig = false, uitgesteld = false, actiefNu = false;
  let DOTS = [], DBN = new Map(), RINGS = [], PMS = [], PUNT = [], WLS = [];
  const el = (t, a) => { const e = document.createElementNS(NS, t); if (a) for (const k in a) e.setAttribute(k, a[k]); return e; };

  function lv(l, skip) {
    if (skip !== 'lijn' && S.lijn && l[1] !== S.lijn) return null;
    if (skip !== 'gen' && S.gen) { const g = bl(l[0]); if (S.gen >= 13 ? g < 13 : g !== S.gen) return null; }
    const ks = Object.keys(l[2]);
    if (skip !== 'srt' && S.srt) return ks.indexOf(S.srt) >= 0 ? [S.srt] : null;
    return ks;
  }
  function bereken() {
    const { PLS, REGS } = data(), all = new Set();
    for (const p of PLS) {
      let n = 0, hard = 0, woon = 0, y0 = 1e4, y1 = 0; const c = { 0: 0, 4: 0, 5: 0, 6: 0, 7: 0 };
      for (const l of p.L) {
        const ks = lv(l); if (!ks) continue; n++; c[l[1]]++; all.add(l[0]);
        for (const k of ks) { if (HARD[k]) hard = 1; else if (k === 'woonde') woon = 1; const j = l[2][k]; if (j) { if (j < y0) y0 = j; if (j > y1) y1 = j; } }
      }
      p.n_ = n; p.c = c; p.vorm = hard ? 'vol' : woon ? 'open' : 'stip'; p.y0 = y0 < 1e4 ? y0 : null; p.y1 = y1 || null;
    }
    for (const r of REGS) {
      const ks = new Map(); let y0 = 1e4, y1 = 0;
      for (const p of r.ps) { for (const l of p.L) if (lv(l)) ks.set(l[0], l[1]); if (p.n_) { if (p.y0 && p.y0 < y0) y0 = p.y0; if (p.y1 && p.y1 > y1) y1 = p.y1; } }
      const c = { 0: 0, 4: 0, 5: 0, 6: 0, 7: 0 }; ks.forEach(v => c[v]++);
      r.n = ks.size; r.c = c; r.y0 = y0 < 1e4 ? y0 : null; r.y1 = y1 || null; r.vis = r.ps.filter(p => p.n_);
    }
    TOT = all.size;
  }
  function tellingen() {
    const li = { 0: new Set(), 4: new Set(), 5: new Set(), 6: new Set(), 7: new Set() }, sr = {}, ge = {};
    SRT.forEach(s => { sr[s[0]] = new Set(); }); for (let g = 1; g <= 13; g++) ge[g] = new Set();
    for (const p of data().PLS) for (const l of p.L) {
      if (lv(l, 'lijn')) li[l[1]].add(l[0]);
      const ks = lv(l, 'srt'); if (ks) for (const k of Object.keys(l[2])) sr[k] && sr[k].add(l[0]);
      if (lv(l, 'gen')) ge[Math.min(bl(l[0]), 13)].add(l[0]);
    }
    return { li, sr, ge };
  }

  /* ---------- building the DOM (once) ---------- */
  const ICO_KAART = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>';
  const ICO_TERUG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>';
  const ICO_X = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  const ICO_ZOEK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
  const ICO_PIJL = '<svg class="km-pijl" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  const legendaHtml = () => `<p><svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="6" class="km-lg-vol"/></svg>From a record or the life details</p>
<p><svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="5.4" class="km-lg-open"/></svg>Only named in a note</p>
<p><svg width="16" height="16" aria-hidden="true"><circle cx="8" cy="8" r="5.4" class="km-lg-open" stroke-dasharray="2.2 1.6"/></svg>Only the surname points here</p>
<p class="km-lg-sub">Size: number of ancestors. Colour: via which grandparent.</p>
<div class="km-schaal" aria-hidden="true"><svg width="122" height="8"><path d="" fill="none"/></svg><span></span></div>`;
  const overHtml = () => `<details class="km-over"><summary>About this map${ICO_PIJL}</summary><ul>
<li>The places come from the birth, marriage and death details, from the records, from the notes on each person and from surnames that point to a place.</li>
<li>Each place name was looked up in a gazetteer. Old names are listed under the present-day place. Places that are not in the gazetteer, such as hamlets and places abroad, were looked up elsewhere and checked by hand. See docs/map-data.md.</li>
<li>An open edge means the place is only named in a note. Check it in the person card.</li>
<li>A dotted edge means only the surname points to that place. That says where the family name comes from.</li>
<li>Each ancestor counts once per place. Someone who appears in two places is shown at both.</li>
<li>A place is known for ${B.tot.plaats} of the ${B.tot.alle} ancestors. The other ${B.tot.alle - B.tot.plaats} are not on the map yet.</li>
<li>The owner, their parents and grandparents are not on the map. The map starts with the eight great-grandparents.</li>
<li>‘Around 1743’ for a generation is the middle known birth or baptism year in that generation.</li>
<li>The regions are boxes on the map for zooming in quickly.</li>
<li>${B.verschoven && B.verschoven.length ? `Dots moved slightly so that they fall on land: ${esc(B.verschoven.length > 1 ? B.verschoven.slice(0, -1).join(', ') + ' and ' + B.verschoven[B.verschoven.length - 1] : B.verschoven[0])}.` : ''}</li>
<li>Map outlines and place positions: see the credits in docs/map-data.md.</li>
</ul></details>`;

  function bouw(e) {
    wortel = e; wortel.classList.add('km-wortel');
    const { REGS, BUITEN } = data();
    const sam = `Regions: ${REGS.map(r => `${r.name}, ${vrw(r.ps.reduce((a, p) => a + p.tot, 0))} in ${plw(r.ps.length)}`).join('; ')}. Also ${plw(BUITEN.length)} outside the regions.`;
    wortel.innerHTML = `<div class="km">
<div class="km-podium" id="km-podium">
<svg class="km-svg" id="km-svg" tabindex="0" role="application" aria-roledescription="map" aria-label="Map with the places of the ancestors. Arrow keys pan, plus and minus zoom, 0 shows all places." aria-describedby="km-sam" xmlns="http://www.w3.org/2000/svg">
<defs><path id="km-landp" fill-rule="evenodd" vector-effect="non-scaling-stroke"/><path id="km-nbp" vector-effect="non-scaling-stroke"/></defs>
<g id="km-geo" class="km-geo"><use href="#km-nbp" class="km-nb"/><use href="#km-nbp" class="km-nbl"/><path id="km-lg" class="km-lg"/><use href="#km-landp" class="km-land"/><path id="km-enc" class="km-enc"/><path id="km-bin" class="km-bin"/><use href="#km-landp" class="km-kust"/></g>
<g id="km-scr"><g id="km-wl" class="km-wl"></g><g id="km-base" class="km-fade"><g id="km-agg" class="km-fade"></g><g id="km-lead" class="km-lead"></g><g id="km-dr" class="km-fade"></g><g id="km-do"></g></g><g id="km-pm"></g><g id="km-hl" class="km-hl"></g><g id="km-lbl" class="km-lbl"></g></g>
</svg>
<div class="km-boven"><div class="km-gebieden" id="km-gebieden" role="group" aria-label="Region"></div></div>
<div class="km-zoom"><button type="button" class="km-kaartknop" id="km-zin" aria-label="Zoom in">+</button><button type="button" class="km-kaartknop" id="km-zuit" aria-label="Zoom out">−</button><button type="button" class="km-kaartknop" id="km-zhuis" aria-label="Whole map">${ICO_KAART}</button></div>
<div class="km-banier" id="km-banier" role="status" hidden></div>
<div class="km-legenda" id="km-legenda" aria-label="How to read the map">${legendaHtml()}</div>
<div class="km-knoppen" id="km-knoppen"><button type="button" class="knop" id="km-filterknop" aria-expanded="false">Search and filters<span class="km-badge" hidden></span></button><button type="button" class="knop" id="km-legendaknop" aria-expanded="false">How to read the map</button></div>
<p class="km-bron">Map data: see docs/map-data.md</p>
<div class="km-leeg" id="km-leeg" hidden><p>No places for this choice.</p><button type="button" class="knop" data-km-wis>Clear filters</button></div>
<p class="km-hint" id="km-hint" aria-hidden="true"></p>
<div class="km-tip" id="km-tip" role="tooltip" hidden></div>
<div class="km-kaartje" id="km-kaartje" hidden></div>
<p class="onzichtbaar" id="km-sam">${esc(sam)}</p>
</div>
<div class="km-chips" id="km-chips" role="group" aria-label="Via which grandparent"></div>
<aside class="km-paneel" id="km-paneel" aria-label="Places and filters"></aside>
<div class="km-blad" id="km-blad" role="dialog" aria-label="Place" tabindex="-1" hidden><div class="persoon-greep" id="km-greep" aria-hidden="true"></div><div class="km-blad-kop"><span class="km-blad-sub bijtekst" id="km-blad-sub"></span><button type="button" class="knop knop-rond" id="km-blad-sluit">${ICO_X}Close</button></div><div class="km-blad-inhoud" id="km-blad-inhoud"></div></div>
</div>`;
    const $ = id => wortel.querySelector('#' + id);
    podium = $('km-podium'); svg = $('km-svg'); geo = $('km-geo'); scr = $('km-scr'); gWL = $('km-wl'); gBase = $('km-base'); gAgg = $('km-agg'); gLead = $('km-lead'); gDR = $('km-dr'); gDO = $('km-do'); gPM = $('km-pm'); gHL = $('km-hl'); gLbl = $('km-lbl');
    paneel = $('km-paneel'); blad = $('km-blad'); bladInhoud = $('km-blad-inhoud'); bladSub = $('km-blad-sub'); kaartje = $('km-kaartje'); banier = $('km-banier'); tip = $('km-tip'); chipsRij = $('km-chips'); gebiedRij = $('km-gebieden'); leeg = $('km-leeg'); hintEl = $('km-hint'); filterKnop = $('km-filterknop');
    gPMlead = el('g', { class: 'km-lead' }); gPM.appendChild(gPMlead);
    // The overview (explanation, search, filters, count, regions, abroad, all places, about): one element that sits in the
    // right-hand panel on a laptop and in the "Search and filters" sheet on phone and tablet.
    ovz = document.createElement('div'); ovz.className = 'km-ovz';
    ovz.innerHTML = `<h1 class="km-titel naam">Where did the ancestors come from?</h1>
<p class="km-intro bijtekst">Each dot is a place from the life of an ancestor. The bigger the dot, the more ancestors. The colour shows via which grandparent they are related to the owner.</p>
<div class="km-zoek"><label for="km-q" class="onzichtbaar">Search for a place or an ancestor</label><span class="km-zoek-icoon" aria-hidden="true">${ICO_ZOEK}</span><input id="km-q" type="search" autocomplete="off" spellcheck="false" placeholder="Search for a place or an ancestor" role="combobox" aria-expanded="false" aria-controls="km-qr" aria-autocomplete="list"><div class="km-qr" id="km-qr" role="listbox" aria-label="Search results" hidden></div></div>
<div class="km-filters" id="km-filters"><p class="km-kopje" id="km-cgl">Via which grandparent</p><div class="km-cg" id="km-cg" role="group" aria-labelledby="km-cgl"></div><p class="km-alle4" id="km-alle4" hidden><button type="button" class="knop-stil" data-km-lijn="0">Show all four</button></p>
<div class="km-sel2"><label><span>Mention</span><select id="km-srt"></select></label><label><span>Generation</span><select id="km-gen"></select></label></div>
<p class="km-wis" id="km-wis" hidden><button type="button" class="knop" data-km-wis>Clear filters</button></p></div>
<div class="km-inh" id="km-inh"></div>
${overHtml()}`;
    inh = ovz.querySelector('#km-inh'); cg = ovz.querySelector('#km-cg'); selS = ovz.querySelector('#km-srt'); selG = ovz.querySelector('#km-gen'); zoekveld = ovz.querySelector('#km-q'); zoekLijst = ovz.querySelector('#km-qr');
    paneel.appendChild(ovz);
    // Region chips (top left).
    gebiedRij.innerHTML = `<button type="button" class="km-chip" data-km-zone="nl" aria-pressed="true">All places</button>` + RN.map(r => `<button type="button" class="km-chip" data-km-zone="${esc(r)}" aria-pressed="false">${esc(RKORT[r] || r)}</button>`).join('') + `<a class="km-chip km-terugchip" href="#kaart" data-geen-router hidden>${ICO_TERUG}Whole map</a><span class="km-chip km-zonenaam" aria-current="true" hidden></span>`;
    // Geography.
    $('km-landp').setAttribute('d', B.land); $('km-nbp').setAttribute('d', B.nb);
    $('km-enc').setAttribute('d', B.enc); $('km-lg').setAttribute('d', B.lg || ''); $('km-bin').setAttribute('d', B.bin);
    WLS = (B.lbl || []).map(l => { const t = el('text', { class: l.s === 'l' ? 'km-ll' : 'km-wt' }); t.textContent = l.t; if (l.s === 'w') t.style.fontSize = l.f + 'px'; gWL.appendChild(t); return { l, el: t, w: 0, h: 0 }; });
    const { PLS, REGS: R2 } = data();
    DOTS = PLS.map(p => ({ t: 'p', p, wx: p.x, wy: p.y, r: 0, dx: 0, dy: 0, ax: 0, ay: 0, sx: 0, sy: 0, el: null, vis: false }));
    DBN = new Map(DOTS.map(s => [s.p.n, s]));
    RINGS = R2.map(r => ({ t: 'r', g: r, wx: r.wx, wy: r.wy, r: 0, dx: 0, dy: 0, ax: 0, ay: 0, sx: 0, sy: 0, el: null, vis: false }));
    DOTS.forEach(s => { const g = el('g', { class: 'km-m', role: 'button', tabindex: '0' }); const i = el('g', { class: 'km-mi' }); g.appendChild(i); (s.p.reg ? gDR : gDO).appendChild(g); s.el = g; g.dataset.p = s.p.n; });
    PUNT = []; // v43 drew a small dot per place around each ring; the ring already counts them and they made the map busy (review round 2, K7)
    RINGS.forEach(s => { const g = el('g', { class: 'km-m km-ring', role: 'button', tabindex: '0' }); const i = el('g', { class: 'km-mi' }); g.appendChild(i); gAgg.appendChild(g); s.el = g; g.dataset.r = s.g.name; });
    gebouwd = true;
  }

  /* ---------- drawing dots and rings ---------- */
  const RING_R = 28; // region rings have a fixed size (mock-up); dots scale with the count
  const straal = n => 3.5 + 1.5 * Math.sqrt(n);
  function hoeken(c, n) {
    const it = KL.filter(k => c[k]).map(k => [k, c[k] / n * 360]);
    if (it.length < 2) return it.map(x => [x[0], 0, 360]);
    const need = it.reduce((a, x) => a + (x[1] < 8 ? 8 - x[1] : 0), 0), bs = it.reduce((a, x) => a + (x[1] >= 8 ? x[1] : 0), 0);
    it.forEach(x => { x[1] = x[1] < 8 ? 8 : x[1] - need * x[1] / bs; });
    let a = 0; return it.map(([k, w]) => { const r = [k, a, a + w]; a += w; return r; });
  }
  const pt = (r, d) => { const a = (d - 90) * Math.PI / 180; return [r * Math.cos(a), r * Math.sin(a)]; };
  function wedge(r, a0, a1) { const p0 = pt(r, a0), p1 = pt(r, a1); return `M0 0L${f1(p0[0])} ${f1(p0[1])}A${f1(r)} ${f1(r)} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f1(p1[0])} ${f1(p1[1])}Z`; }
  function boog(r, a0, a1) { const p0 = pt(r, a0), p1 = pt(r, a1); return `M${f1(p0[0])} ${f1(p0[1])}A${f1(r)} ${f1(r)} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${f1(p1[0])} ${f1(p1[1])}`; }
  // A dot: full (filled, thin ink edge), open (paper with a coloured edge) or dotted (dotted edge). Large dots and rings
  // get a paper disc with coloured arcs and the count in the middle.
  function taart(c, n, r, vorm, ring) {
    const hk = hoeken(c, n); let h = '';
    if (ring || r >= 16) {
      const rb = r * 0.84, w = Math.max(3, r * 0.32), da = vorm === 'stip' ? ' stroke-dasharray="3 2"' : '';
      h += `<circle r="${f1(r)}" class="km-schijf"/>`;
      if (hk.length === 1) h += `<circle r="${f1(rb)}" class="km-boog km-l${hk[0][0]}" stroke-width="${f1(w)}"${da}/>`;
      else h += hk.map(([k, a0, a1]) => `<path d="${boog(rb, a0, a1)}" class="km-boog km-l${k}" stroke-width="${f1(w)}"${da}/>`).join('');
      h += `<circle r="${f1(r * 0.68)}" class="km-kern"/><text class="km-rnum" font-size="${ring ? 15 : Math.max(11, Math.min(15, Math.round(r * 0.55)))}">${n}</text>`;
    } else if (vorm === 'vol') {
      if (hk.length === 1) h += `<circle r="${f1(r)}" class="km-vul km-l${hk[0][0]}"/>`;
      else h += hk.map(([k, a0, a1]) => `<path d="${wedge(r, a0, a1)}" class="km-wig km-l${k}"/>`).join('') + `<circle r="${f1(r)}" class="km-inktrand"/>`;
    } else {
      const rr = r - 1, da = vorm === 'stip' ? ' stroke-dasharray="2.2 1.8"' : '';
      h += `<circle r="${f1(r)}" class="km-kern"/>`;
      if (hk.length === 1) h += `<circle r="${f1(rr)}" class="km-rand km-l${hk[0][0]}"${da}/>`;
      else h += hk.map(([k, a0, a1]) => `<path d="${boog(rr, a0, a1)}" class="km-rand km-l${k}"${da}/>`).join('');
    }
    return h;
  }
  const lijnTekst = c => KL.filter(k => c[k]).sort((a, b) => c[b] - c[a]).map(k => LNM[k] + ' ' + c[k]).join(', ');
  function tekenSym(s, n, c, vorm, ring, anim) {
    const r = n ? (ring ? RING_R : straal(n)) : 0, inner = s.el.firstChild, r0 = s.r;
    s.vis = !!n;
    if (!n) {
      if (anim && r0 && !mqR.matches) { inner.style.transform = 'scale(0)'; clearTimeout(s.to); s.to = setTimeout(() => { if (!s.vis) s.el.style.display = 'none'; }, 210); }
      else s.el.style.display = 'none';
      s.el.setAttribute('tabindex', '-1'); s.r = 0; return;
    }
    clearTimeout(s.to); s.el.style.display = ''; s.el.setAttribute('tabindex', '0');
    inner.innerHTML = taart(c, n, r, vorm, ring);
    s.el.dataset.vorm = ring ? 'ring' : vorm;
    s.el.setAttribute('aria-label', (ring ? s.g.name : s.p.n) + ': ' + vrw(n) + '. ' + lijnTekst(c) + (ring ? '. Zoom in' : ''));
    if (anim && r0 !== r && !mqR.matches) { inner.style.transition = 'none'; inner.style.transform = `scale(${r0 ? r0 / r : 0})`; inner.getBoundingClientRect(); inner.style.transition = ''; inner.style.transform = ''; }
    else inner.style.transform = '';
    s.r = r;
  }
  function teken(anim) {
    DOTS.forEach(s => tekenSym(s, s.p.n_, s.p.c, s.p.vorm, false, anim));
    RINGS.forEach(s => tekenSym(s, s.g.n, s.g.c, 'vol', true, anim));
    PUNT.forEach(q => { q.el.style.display = q.p.n_ ? '' : 'none'; });
    // small over large
    [gDR, gDO].forEach(g => { const a = [...g.children].sort((x, y) => DBN.get(y.dataset.p).r - DBN.get(x.dataset.p).r); a.forEach(e => g.appendChild(e)); });
  }

  /* ---------- camera ---------- */
  function meet() {
    const r = podium.getBoundingClientRect(); W = r.width; H = r.height;
    const nl = B.box || B.nl, pad = telefoon() ? 10 : 16;
    kMin = Math.min((W - 2 * pad) / (nl[2] - nl[0]), (H - 2 * pad) / (nl[3] - nl[1]));
    if (!(kMin > 0)) kMin = .5;
    const h = huisCam(); if (h.k > 0 && h.k < kMin) kMin = h.k;
  }
  // Start view: all places in view, clear of the chips at the top and the key or buttons at the bottom. On the phone the
  // main area fills the stage (B.nl, 10 px margin); places outside it can be reached by panning or zooming out.
  function huisCam() {
    const tel = telefoon(), nl = tel ? B.nl : (B.box || B.nl), c = { cx: (nl[0] + nl[2]) / 2, cy: (nl[1] + nl[3]) / 2, k: kMin }, rand = tel ? 10 : 16;
    if (!W) return c;
    const sr = podium.getBoundingClientRect();
    const rect = e => (e && e.offsetParent && !e.hidden ? e.getBoundingClientRect() : null);
    const gr = rect(gebiedRij), kr = rect(smal() ? wortel.querySelector('#km-knoppen') : wortel.querySelector('#km-legenda'));
    return pasIn(nl, { l: rand, r: rand, t: gr ? gr.bottom - sr.top + 8 : rand, b: kr ? sr.bottom - kr.top + 8 : rand });
  }
  const cl = k => Math.max(kMin, Math.min(kMax, k));
  function clamp() {
    V.k = cl(V.k); const nl = B.box || B.nl;
    const ax = (lo, hi, size, t) => { const vw = size / V.k, m = .4 * Math.min(hi - lo, vw); const tmin = -V.k * (hi - m), tmax = size - V.k * (lo + m); return Math.min(tmax, Math.max(tmin, t)); };
    V.tx = ax(nl[0], nl[2], W, V.tx); V.ty = ax(nl[1], nl[3], H, V.ty);
  }
  const cam = () => ({ cx: (W / 2 - V.tx) / V.k, cy: (H / 2 - V.ty) / V.k, k: V.k });
  function setCam(c) { V.k = c.k; V.tx = W / 2 - c.cx * c.k; V.ty = H / 2 - c.cy * c.k; }
  function doel(c) { const s = { k: V.k, tx: V.tx, ty: V.ty }; setCam({ cx: c.cx, cy: c.cy, k: cl(c.k) }); clamp(); const r = cam(); V.k = s.k; V.tx = s.tx; V.ty = s.ty; return r; }
  let flyId = 0, raf = 0;
  function stopFly() { if (flyId) { cancelAnimationFrame(flyId); flyId = 0; } }
  function vlieg(c, dur) {
    stopFly(); const to = doel(c), fr = cam();
    if (mqR.matches || dur === 0 || !W) { setCam(to); frame(true); settleNu(true); return; }
    const t0 = performance.now(), Dd = dur || 450, l0 = Math.log(fr.k), l1 = Math.log(to.k);
    const step = now => {
      const t = Math.min(1, (now - t0) / Dd), e = t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setCam({ cx: fr.cx + (to.cx - fr.cx) * e, cy: fr.cy + (to.cy - fr.cy) * e, k: Math.exp(l0 + (l1 - l0) * e) }); frame(true);
      if (t < 1) flyId = requestAnimationFrame(step); else { flyId = 0; settleNu(true); }
    };
    flyId = requestAnimationFrame(step);
  }
  function pasIn(box, pad, maxK) {
    const bw = Math.max(box[2] - box[0], 1e-3), bh = Math.max(box[3] - box[1], 1e-3);
    let k = Math.min((W - pad.l - pad.r) / bw, (H - pad.t - pad.b) / bh); if (maxK) k = Math.min(k, maxK);
    const sx = (pad.l + W - pad.r) / 2, sy = (pad.t + H - pad.b) / 2;
    return { cx: (box[0] + box[2]) / 2 + (W / 2 - sx) / k, cy: (box[1] + box[3]) / 2 + (H / 2 - sy) / k, k };
  }
  function zoneUit() { if (S.zone) { S.zone = null; segZet(); } }
  function zoneVan(p) { const z = p && p.reg ? p.reg : null; if (S.zone !== z) { S.zone = z; segZet(); } }
  function thuis(dur) { S.zone = 'nl'; segZet(); vlieg(huisCam(), dur); }
  function zone(z) {
    if (z === 'nl') { thuis(); return; }
    const b = B.reg[z]; if (!b) return;
    const p0 = pr(b[2], b[1]), p1 = pr(b[3], b[0]);
    const w = p1[0] - p0[0], h = p1[1] - p0[1], box = [p0[0] - .06 * w, p0[1] - .06 * h, p1[0] + .06 * w, p1[1] + .06 * h];
    // on a narrow screen a box ends up just below the ring limit: zoom in a little further so the dots are visible
    const k = Math.max(Math.min(W / (box[2] - box[0]), H / (box[3] - box[1]), 10), 3.6);
    S.zone = z; segZet(); vlieg({ cx: (box[0] + box[2]) / 2, cy: (box[1] + box[3]) / 2, k });
  }
  function segZet() {
    const ingezoomd = smal() && S.zone && S.zone !== 'nl';
    gebiedRij.querySelectorAll('button[data-km-zone]').forEach(b => { b.setAttribute('aria-pressed', String(b.dataset.kmZone === S.zone)); b.hidden = !!ingezoomd; });
    const t = gebiedRij.querySelector('.km-terugchip'), z = gebiedRij.querySelector('.km-zonenaam');
    t.hidden = !ingezoomd; z.hidden = !ingezoomd; if (ingezoomd) z.textContent = RKORT[S.zone] || S.zone;
  }
  function zelf() { if (S.zone) { S.zone = null; segZet(); } hintUit(); }
  function zoomOp(x, y, f, anim) {
    const wx = (x - V.tx) / V.k, wy = (y - V.ty) / V.k, k = cl(V.k * f);
    if (anim) { vlieg({ cx: wx + (W / 2 - x) / k, cy: wy + (H / 2 - y) / k, k }); return; }
    V.k = k; V.tx = x - wx * k; V.ty = y - wy * k; clamp(); req();
  }
  function req() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; frame(); }); }

  /* ---------- drawing per frame ---------- */
  let zoomed = false, stT = 0;
  function frame(sync) {
    if (raf && sync) { cancelAnimationFrame(raf); raf = 0; }
    geo.setAttribute('transform', `translate(${V.tx.toFixed(2)} ${V.ty.toFixed(2)}) scale(${V.k.toFixed(5)})`);
    if (V.k !== base.k) { plaats(); gLbl.classList.add('km-zoomt'); zoomed = true; modus(); schaal(); }
    else scr.setAttribute('transform', `translate(${(V.tx - base.tx).toFixed(2)} ${(V.ty - base.ty).toFixed(2)})`);
    tipUit();
    clearTimeout(stT); stT = setTimeout(settle, 120);
  }
  function plaats() {
    base.k = V.k; base.tx = V.tx; base.ty = V.ty; scr.removeAttribute('transform');
    const zet = s => { s.ax = s.wx * V.k + V.tx; s.ay = s.wy * V.k + V.ty; s.sx = s.ax + s.dx; s.sy = s.ay + s.dy; s.el.setAttribute('transform', `translate(${s.sx.toFixed(1)} ${s.sy.toFixed(1)})`); };
    DOTS.forEach(zet); RINGS.forEach(zet); PMS.forEach(zet);
    PUNT.forEach(q => { q.el.setAttribute('cx', (q.p.x * V.k + V.tx).toFixed(1)); q.el.setAttribute('cy', (q.p.y * V.k + V.ty).toFixed(1)); });
    const wlUit = telefoon() && V.k < 3.5, ringen = V.k < 3.5 ? RINGS.filter(s => s.vis) : [];
    // A water label that touches a ring drops out, just like a label that crosses the edge.
    const raaktRing = w => ringen.some(s => rc([w.x - w.w / 2, w.y - w.as, w.x + w.w / 2, w.y + w.de], s.sx, s.sy, s.r + 2));
    WLS.forEach(w => { w.x = w.l.x * V.k + V.tx; w.y = w.l.y * V.k + V.ty; w.el.setAttribute('x', w.x.toFixed(1)); w.el.setAttribute('y', w.y.toFixed(1)); w.uit = (w.l.hid && wlUit) || (w.w > 0 && (w.x - w.w / 2 < 2 || w.x + w.w / 2 > W - 2 || w.y - w.as < 2 || w.y + w.de > H - 2 || raaktRing(w))); w.el.style.display = w.uit ? 'none' : ''; });
    leiders(); hl();
  }
  function modus() {
    const a = V.k < 3.5;
    if (a !== agg) agg = a;
    gAgg.classList.toggle('km-uit', !agg); gDR.classList.toggle('km-uit', agg);
  }
  function actief() {
    const a = [];
    for (const s of DOTS) { if (!s.vis) continue; if (agg && s.p.reg) continue; a.push(s); }
    if (agg) for (const s of RINGS) if (s.vis) a.push(s);
    return a;
  }
  // Colliding symbols move aside a little (v43); a leader line then points to the real position.
  function botsing(list) {
    const n = list.length;
    list.forEach(s => { s.dx = 0; s.dy = 0; s.ax = s.wx * V.k + V.tx; s.ay = s.wy * V.k + V.ty; });
    for (let it = 0; it < 80; it++) {
      if (it) { for (const s of list) { s.dx *= .96; s.dy *= .96; const L = Math.hypot(s.dx, s.dy), cap = 1.2 * s.r + 6; if (L > cap) { s.dx *= cap / L; s.dy *= cap / L; } } }
      let moved = false;
      for (let i = 0; i < n; i++) {
        const a = list[i];
        for (let j = i + 1; j < n; j++) {
          const b = list[j], m = a.r + b.r + 1.5;
          let dx = (b.ax + b.dx) - (a.ax + a.dx), dy = (b.ay + b.dy) - (a.ay + a.dy);
          if (dx >= m || dx <= -m || dy >= m || dy <= -m) continue;
          let d = Math.hypot(dx, dy); if (d >= m) continue;
          if (d < 1e-6) { const g = ((i * 37 + j * 61) % 360) * Math.PI / 180; dx = Math.cos(g); dy = Math.sin(g); d = 1; }
          const o = m - d, wa = b.r / (a.r + b.r), wb = 1 - wa, ux = dx / d, uy = dy / d;
          a.dx -= ux * o * wa; a.dy -= uy * o * wa; b.dx += ux * o * wb; b.dy += uy * o * wb; moved = true;
        }
      }
      if (!moved) break;
    }
  }
  function leiders() {
    let h = '';
    const list = S.pers ? PMS : actief();
    for (const s of list) { if (Math.hypot(s.dx, s.dy) > 3) h += `<line x1="${f1(s.ax)}" y1="${f1(s.ay)}" x2="${f1(s.sx)}" y2="${f1(s.sy)}"/><circle cx="${f1(s.ax)}" cy="${f1(s.ay)}" r="1.4"/>`; }
    gLead.innerHTML = S.pers ? '' : h;
    if (S.pers) gPMlead.innerHTML = h;
  }
  function settle() {
    clearTimeout(stT); stT = 0; if (!klaar || !actiefNu) return;
    if (zoomed) {
      DOTS.forEach(s => { s.dx = 0; s.dy = 0; }); RINGS.forEach(s => { s.dx = 0; s.dy = 0; });
      botsing(actief());
      if (S.pers) { PMS.forEach(s => { s.dx = 0; s.dy = 0; }); botsing(PMS); }
      base.k = -1;
    }
    frameRebase();
    labels();
    gLbl.classList.remove('km-zoomt'); zoomed = false;
  }
  function frameRebase() { base.k = -1; geo.setAttribute('transform', `translate(${V.tx.toFixed(2)} ${V.ty.toFixed(2)}) scale(${V.k.toFixed(5)})`); plaats(); modus(); schaal(); }
  function settleNu(z) { if (z) zoomed = true; settle(); }
  function schaal() {
    const pk = V.k / B.km; let best = null;
    for (const km of [1, 2, 5, 10, 20, 50]) { const L = km * pk; if (L >= 60 && L <= 120) { best = [km, L]; break; } }
    if (!best) { let bd = 1e9; for (const km of [1, 2, 5, 10, 20, 50]) { const L = km * pk, d = Math.abs(L - 90); if (d < bd) { bd = d; best = [km, L]; } } }
    const L = Math.round(best[1]);
    wortel.querySelectorAll('.km-schaal').forEach(sv => { const s = sv.firstChild; s.setAttribute('width', L + 2); s.firstChild.setAttribute('d', `M.5 2V7H${L + .5}V2`); sv.lastChild.textContent = best[0] + ' km'; });
  }

  /* ---------- labels ---------- */
  const CV = document.createElement('canvas').getContext('2d');
  const LT = '"Atkinson Hyperlegible Next","Segoe UI",system-ui,-apple-system,sans-serif', LN = 'Spectral,Georgia,"Times New Roman",serif';
  const FN = { n: `600 13px ${LT}`, c: `400 12px ${LT}`, rn: `600 14px ${LN}`, rs: `400 12px ${LT}` };
  const MC = new Map();
  function mw(font, t) { const k = font + '|' + t; let v = MC.get(k); if (v == null) { CV.font = font; v = CV.measureText(t).width; MC.set(k, v); } return v; }
  let MT = {};
  function metrics() {
    MC.clear();
    const m = f => { CV.font = f; const x = CV.measureText('Hgéj'); const sz = parseFloat(f.match(/(\d+)px/)[1]); return [x.fontBoundingBoxAscent || sz * .95, x.fontBoundingBoxDescent || sz * .26]; };
    MT = { n: m(FN.n), rn: m(FN.rn), rs: m(FN.rs) };
    WLS.forEach(w => { const st = getComputedStyle(w.el); const f = `${st.fontStyle} ${st.fontWeight} ${st.fontSize} ${st.fontFamily}`; CV.font = f; const x = CV.measureText(w.l.t); const ls = w.l.s === 'l' ? w.l.t.length * parseFloat(st.fontSize) * .16 : 0; w.w = x.width + ls; w.as = x.fontBoundingBoxAscent || parseFloat(st.fontSize) * .95; w.de = x.fontBoundingBoxDescent || parseFloat(st.fontSize) * .26; });
  }
  function overlays() {
    const sr = podium.getBoundingClientRect(), o = [];
    const add = e => { if (!e || e.hidden) return; const r = e.getBoundingClientRect(); if (!r.width || !r.height) return; const cs = getComputedStyle(e); if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return; o.push([r.left - sr.left - 4, r.top - sr.top - 4, r.right - sr.left + 4, r.bottom - sr.top + 4]); };
    podium.querySelectorAll('.km-gebieden,.km-zoom,.km-legenda,.km-knoppen,.km-bron,.km-banier,.km-leeg,.km-kaartje').forEach(add);
    return o;
  }
  const rr = (a, b) => a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1];
  function rc(b, x, y, r) { const cx = Math.max(b[0], Math.min(x, b[2])), cy = Math.max(b[1], Math.min(y, b[3])); return (cx - x) * (cx - x) + (cy - y) * (cy - y) < r * r; }
  // Far from every region: then a place with a single ancestor also gets a label (abroad, remote areas).
  const verWeg = p => data().REGS.every(r => Math.hypot(p.x - r.wx, p.y - r.wy) > 90);
  function labelMag(s, selS, hovS) {
    if (s === selS || s === hovS || s.t !== 'p') return true;
    return agg ? (s.p.n_ >= 2 || verWeg(s.p)) : s.p.n_ >= 7;
  }
  let LBOX = [];
  function labels() {
    let h = ''; LBOX = [];
    const ob = overlays(), plaatst = [], circ = [];
    const vis = s => s.sx > -40 && s.sx < W + 40 && s.sy > -40 && s.sy < H + 40;
    WLS.forEach(w => { if (w.uit || w.x < 0 || w.x > W || w.y < 0 || w.y > H) return; plaatst.push([w.x - w.w / 2 - 2, w.y - w.as, w.x + w.w / 2 + 2, w.y + w.de]); });
    const lijst = S.pers ? PMS : actief();
    lijst.forEach(s => { if (vis(s)) circ.push([s.sx, s.sy, s.r]); });
    const selS = S.sel ? symVoor(S.sel) : null, hovS = S.hov && S.hov.vis !== false ? S.hov : null;
    const order = lijst.filter(s => vis(s) && labelMag(s, selS, hovS));
    const pri = s => (s === selS ? 0 : s === hovS ? 1 : s.t === 'r' ? 2 : 3), num = s => (s.t === 'r' ? s.g.n : s.t === 'pm' ? (100 - (s.nr || 99)) : s.p.n_);
    order.sort((a, b) => pri(a) - pri(b) || num(b) - num(a));
    for (const s of order) {
      let w, hh, as, txt;
      if (s.t === 'r') {
        const nm = telefoon() && RKORT[s.g.name] ? RKORT[s.g.name] : s.g.name, sub = plw(s.g.vis.length) + (grof() ? '' : ' · click to zoom in');
        w = Math.max(mw(FN.rn, nm), mw(FN.rs, sub)) + 1; as = MT.rn[0]; hh = as + 14 + MT.rs[1]; txt = [nm, sub];
      } else if (s.t === 'pm') { const t = s.p.kort + (s.j ? ' ' + s.j : ''); w = mw(FN.n, t) + 1; as = MT.n[0]; hh = as + MT.n[1]; txt = [t]; }
      else { const metN = s.r < 16; w = mw(FN.n, s.p.kort) + (metN ? 3 + mw(FN.c, '0'.repeat(String(s.p.n_).length)) : 0) + 1; as = MT.n[0]; hh = as + MT.n[1]; txt = [s.p.kort, metN ? s.p.n_ : null]; }
      const r = s === selS ? s.r + 5.5 : s.r, d = r + 3, dd = r * .7 + 3, x = s.sx, y = s.sy;
      const kand = [[x + d, y - hh / 2], [x - d - w, y - hh / 2], [x + dd, y - dd - hh], [x - dd - w, y - dd - hh], [x + dd, y + dd], [x - dd - w, y + dd], [x - w / 2, y - d - hh], [x - w / 2, y + d]];
      for (const [bx, by] of kand) {
        const b = [bx, by, bx + w, by + hh];
        if (b[0] < 4 || b[1] < 4 || b[2] > W - 4 || b[3] > H - 4) continue;
        if (circ.some(c => rc(b, c[0], c[1], c[2] + 1))) continue;
        if (plaatst.some(q => rr(b, q)) || ob.some(q => rr(b, q))) continue;
        plaatst.push(b); LBOX.push(b);
        if (s.t === 'r') h += `<text class="km-tr" x="${f1(bx)}" y="${f1(by + as)}"><tspan>${esc(txt[0])}</tspan><tspan class="km-trs" x="${f1(bx)}" dy="14">${esc(txt[1])}</tspan></text>`;
        else if (s.t === 'pm') h += `<text class="km-t" x="${f1(bx)}" y="${f1(by + as)}">${esc(txt[0])}</text>`;
        else h += `<text class="km-t" data-p="${esc(s.p.n)}" x="${f1(bx)}" y="${f1(by + as)}">${esc(txt[0])}${txt[1] != null ? `<tspan class="km-tn" dx="3">${txt[1]}</tspan>` : ''}</text>`;
        break;
      }
    }
    gLbl.innerHTML = h;
  }

  /* ---------- selection and pointing ---------- */
  function symVoor(name) {
    if (!name) return null;
    if (S.pers) return PMS.find(s => s.p.n === name) || null;
    const s = DBN.get(name); if (!s || !s.vis) return null; if (agg && s.p.reg) return null; return s;
  }
  function hl() {
    let h = ''; const sel = symVoor(S.sel), hov = S.hov;
    if (sel) h += `<circle cx="${f1(sel.sx)}" cy="${f1(sel.sy)}" r="${f1(sel.r + 4)}" stroke-width="2"/>`;
    if (hov && hov !== sel && (hov.vis || hov.t === 'pm')) h += `<circle cx="${f1(hov.sx)}" cy="${f1(hov.sy)}" r="${f1(hov.r + 1.5)}" stroke-width="1.5"/>`;
    gHL.innerHTML = h;
  }
  function zetHover(s) { if (S.hov === s) return; S.hov = s; hl(); if (klaar && !zoomed) labels(); }
  function hit(px, py, touch) {
    const ox = V.tx - base.tx, oy = V.ty - base.ty, list = S.pers ? PMS : actief(); let best = null, bd = 1e9;
    for (const s of list) { const d = Math.hypot(s.sx + ox - px, s.sy + oy - py), lim = touch ? Math.max(22, s.r) : s.r + 2; if (d <= lim) { const sc = touch ? d : d - s.r; if (sc < bd) { bd = sc; best = s; } } }
    return best;
  }
  function tipToon(s, px, py) {
    if (!mqH.matches || !s) { tipUit(); return; }
    let h = '';
    if (s.t === 'pm') { const it = persPlaatsen(S.pers).find(i => i.p === s.p); h = `<b class="naam">${esc(s.p.n)}</b><div class="bijtekst">${esc(evtRegel(it.s).join(' · ') || 'named')}</div><em>Click to choose the place</em>`; }
    else {
      const g = s.t === 'r' ? s.g : s.p, n = s.t === 'r' ? g.n : g.n_;
      h = `<b class="naam">${esc(s.t === 'r' ? g.name : g.n)}</b><div class="bijtekst">${vrw(n)}${s.t === 'r' ? ' · ' + plw(g.vis.length) : ''}</div>` + KL.filter(k => g.c[k]).map(k => `<div class="km-tl2"><i class="km-sw km-l${k}"></i>${LNM[k]}<span class="getal">${g.c[k]}</span></div>`).join('') + `<em>${s.t === 'r' ? 'Click to zoom in' : 'Click for the names'}</em>`;
    }
    tip.innerHTML = h; tip.hidden = false;
    const tw = tip.offsetWidth, th = tip.offsetHeight; let x = px + 14, y = py + 14; if (x + tw > W - 6) x = px - tw - 14; if (y + th > H - 6) y = py - th - 14;
    tip.style.left = Math.max(6, x) + 'px'; tip.style.top = Math.max(6, y) + 'px';
  }
  function tipUit() { if (tip) tip.hidden = true; }
  function kiesSym(s, touch) {
    if (s.t === 'r') { zone(s.g.name); return; }
    if (s.t === 'pm') { S.sel = s.p.n; render(); hl(); labels(); zetHash(); if (smal()) naarBoven(s); return; }
    kiesPlaats(s.p.n, { fly: touch && smal() ? 'tel' : 'dot' });
  }
  function kiesPlaats(name, opt) {
    opt = opt || {}; S.sel = name;
    render(); hl();
    if (name && opt.fly) {
      const s = DBN.get(name), p = data().PBN.get(name);
      if (opt.fly === 'row' || opt.fly === 'dot') {
        const ox = V.tx - base.tx, oy = V.ty - base.ty, sx = s.sx + ox, sy = s.sy + oy, uit = !s.vis || sx < 0 || sy < 0 || sx > W || sy > H || (agg && p.reg);
        if (opt.fly === 'row' || uit || V.k < 6) { const k = Math.max(V.k, 6), onder = smal() ? bladH() : 0, rechts = bladB(); zoneUit(); vlieg({ cx: p.x + rechts / 2 / k, cy: p.y + onder / 2 / k, k }); }
        else if (klaar) labels();
      } else if (opt.fly === 'tel') naarBoven(s);
      zoneVan(p);
    } else if (klaar && !zoomed) labels();
    zetHash();
  }
  // How much of the stage the sheet covers at the bottom (phone); on the tablet the sheet is on the right and covers nothing at the bottom.
  function bladH() {
    if (!telefoon()) return !kaartje.hidden ? kaartje.offsetHeight : 0;
    if (!blad.hidden) { const pr_ = podium.getBoundingClientRect(); return Math.max(0, pr_.bottom - (window.innerHeight - blad.offsetHeight)); }
    if (!kaartje.hidden) return kaartje.offsetHeight;
    return Math.round(H * .45);
  }
  // How much of the stage the sheet covers on the right (tablet: side panel of 430 px).
  function bladB() { return (telefoon() || !smal()) ? 0 : Math.min(430, W); }
  function naarBoven(s) {
    const ox = V.tx - base.tx, oy = V.ty - base.ty, sy = s.sy + oy, sx = s.sx + ox, vrij = H - bladH(), vrijB = W - bladB(), top = Math.max(60, vrij - 12);
    if (sy > top - s.r || sy < 40 || sx < 20 || sx > vrijB - 20) { const c = cam(); zoneUit(); vlieg({ cx: c.cx + (sx - .5 * vrijB) / V.k, cy: c.cy + (sy - .5 * vrij) / V.k, k: V.k }, 350); }
    else if (klaar) labels();
  }
  function leegTik() { if (smal() && !S.pers && S.sel) kiesPlaats(null); }

  /* ---------- person mode: one ancestor with all their places ---------- */
  function persoon(n, plaatsNaam) {
    if (!data().PERS.has(n)) return;
    if (!S.pers) { S.psel = S.sel; S.pcam = cam(); }
    S.pers = n; S.sel = plaatsNaam || null;
    const it = persPlaatsen(n); gPM.querySelectorAll('.km-m').forEach(e => e.remove());
    PMS = it.map(i => {
      const g = el('g', { class: 'km-m km-pmk', role: 'button', tabindex: '0', 'aria-label': `${i.p.n}${i.j ? ' ' + i.j : ''}` }); const l = i.l;
      g.innerHTML = i.nr ? `<circle r="9" class="km-pm-vol km-l${l}"/><text class="km-num">${i.nr}</text>` : `<circle r="6" class="km-pm-open km-l${l}"/>`;
      gPM.appendChild(g); return { t: 'pm', p: i.p, nr: i.nr, j: i.j, wx: i.p.x, wy: i.p.y, r: i.nr ? 9 : 7, dx: 0, dy: 0, ax: 0, ay: 0, sx: 0, sy: 0, el: g, vis: true };
    });
    gBase.classList.add('km-dim');
    const xs = it.map(i => i.p.x), ys = it.map(i => i.p.y);
    render(); hintUit(); meet();
    const sr = podium.getBoundingClientRect(), bn = banier.getBoundingClientRect();
    const pad = { l: 60, r: Math.max(60, bladB() + 28), t: Math.max(60, bn.height ? bn.bottom - sr.top + 28 : 0), b: smal() ? Math.max(60, bladH() + 28) : 60 };
    laatstePad = { ...pad, W, H };
    const c = pasIn([Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], pad, 8);
    zoneUit(); zoomed = true; vlieg(c); zetHash();
  }
  function eindPersoon() {
    if (!S.pers) return;
    S.pers = null; S.sel = S.psel; S.psel = null; PMS.forEach(s => s.el.remove()); PMS = []; gPMlead.innerHTML = '';
    gBase.classList.remove('km-dim');
    render(); zoomed = true;
    if (S.pcam) { vlieg(S.pcam); S.pcam = null; } else settleNu(true);
    zetHash();
  }

  /* ---------- content: overview, place sheet, person sheet, small card ---------- */
  const staaf = (c, n, h) => `<span class="km-staaf" style="height:${h}px" aria-hidden="true">` + KL.filter(k => c[k]).map(k => `<i class="km-l${k}" style="flex:${c[k]}" title="${esc(LVOL[k].charAt(0).toUpperCase() + LVOL[k].slice(1))}: ${c[k]}"></i>`).join('') + `</span>`;
  const jr = o => (o.y0 ? ` · ${o.y0}${o.y1 && o.y1 !== o.y0 ? '–' + o.y1 : ''}` : '');
  const jrKomma = o => (o.y0 ? `, ${o.y0}${o.y1 && o.y1 !== o.y0 ? '–' + o.y1 : ''}` : '');
  const plaatsRij = p => `<li><button type="button" class="km-rijknop" data-km-p="${esc(p.n)}" data-km-hp="${esc(p.n)}"><span class="km-rijnaam">${esc(p.n)}${p.land ? ` <span class="bijtekst">(${esc(p.land)})</span>` : ''}</span>${staaf(p.c, p.n_, 6)}<span class="getal bijtekst km-rijaantal">${p.n_}</span></button></li>`;
  function htmlOverzicht() {
    const { PLS, REGS, BUITEN } = data(), vis = PLS.filter(p => p.n_);
    if (!vis.length) return `<p class="km-telling">No places for this choice.</p><p><button type="button" class="knop" data-km-wis>Clear filters</button></p>`;
    let h = `<p class="km-telling"><span class="getal">${B.tot.plaats}</span> of the ${B.tot.alle} ancestors have a place.</p>`;
    const RV = REGS.filter(r => r.n), TAL = ['', 'One region', 'Two regions', 'Three regions'];
    if (RV.length) h += `<p class="km-kopje">${TAL[RV.length] || RV.length + ' regions'}</p>` + RV.map(r => `<button type="button" class="km-gebied" data-km-reg="${esc(r.name)}" data-km-hr="${esc(r.name)}"><span class="km-gebied-naam naam">${esc(r.name)}</span><span class="km-gebied-sub bijtekst">${plw(r.vis.length)} · ${vrw(r.n)}${jr(r)}</span>${staaf(r.c, r.n, 8)}</button>`).join('');
    const bu = BUITEN.filter(p => p.n_).sort((a, b) => b.n_ - a.n_ || a.n.localeCompare(b.n, 'nl'));
    const bl_ = bu.filter(p => p.land), bn = bu.filter(p => !p.land);
    if (bl_.length) h += `<p class="km-kopje">Abroad</p><ul class="km-lijst">${bl_.map(plaatsRij).join('')}</ul>`;
    if (bn.length) h += `<p class="km-kopje">Outside these regions</p><ul class="km-lijst">${bn.map(plaatsRij).join('')}</ul>`;
    const rows = vis.slice().sort(S.sort === 'n' ? (a, b) => b.n_ - a.n_ || a.n.localeCompare(b.n, 'nl') : (a, b) => a.n.localeCompare(b.n, 'nl'));
    const toon = S.meer ? rows : rows.slice(0, 12);
    h += `<div class="km-alle-kop"><p class="km-kopje">All places</p><div class="schakel" role="group" aria-label="Order"><button type="button" data-km-sort="n" aria-pressed="${S.sort === 'n'}">Most</button><button type="button" data-km-sort="az" aria-pressed="${S.sort === 'az'}">A–Z</button></div></div><ul class="km-lijst">${toon.map(plaatsRij).join('')}</ul>`;
    if (!S.meer && rows.length > 12) h += `<p class="km-meer"><button type="button" class="knop" data-km-meer>Show all ${rows.length} places</button></p>`;
    return h;
  }
  function gebeurdeZin(p) {
    const t = { geboren: 0, getrouwd: 0, overleden: 0, akte: 0, woonde: 0, achternaam: 0 };
    for (const l of p.L) { const ks = lv(l); if (!ks) continue; ks.forEach(k => { if (k in t) t[k]++; }); }
    const d = [];
    if (t.geboren) d.push(`${t.geboren} born`); if (t.getrouwd) d.push(`${t.getrouwd} married`); if (t.overleden) d.push(`${t.overleden} died`);
    if (t.akte) d.push(`${t.akte} with a record from ${p.n}`); if (t.woonde) d.push(`${t.woonde} named in a note`); if (t.achternaam) d.push(`for ${t.achternaam} the surname points here`);
    return d.length ? d.join(', ').replace(/^./, c => c.toUpperCase()) + '.' : '';
  }
  const rij = (n, p, ks) => {
    const vl = K.status(n), nb = vl.includes('nietbevestigd');
    return `<li><a class="rij" href="#persoon/${n}" data-n="${n}" data-status="${vl.join(' ')}"><span class="rij-nr getal" style="color:${K.lijnKleur(n)}">${n}</span><span><span class="rij-naam${nb ? ' naam-nb' : ''}">${esc(nmP(n))}</span><span class="rij-meta">${esc(vermeldingTekst(p ? p.s : {}, ks, p ? p.n : ''))}</span></span><span class="status">${vl.map(v => K.statusIcoon(v, 18)).join('')}</span></a></li>`;
  };
  // The place sheet: name, province and region, count and years, bar per grandparent with the counts in text, what happened,
  // and the ancestors with what ties them to the place, grouped per grandparent (v43), 25 per group.
  function htmlPlaats(p, terug) {
    let h = terug ? `<p class="km-terug"><button type="button" class="knop-stil" data-km-back>${ICO_TERUG}Overview</button></p>` : '';
    const waar = [p.gem && p.gem !== p.kort && p.gem !== p.n ? 'municipality ' + p.gem : null, p.prov, p.reg].filter(Boolean).join(' · ');
    const al = p.a.length ? `<p class="km-sub bijtekst">Also in the sources: ${esc(p.a.length > 1 ? p.a.slice(0, -1).join(', ') + ' and ' + p.a[p.a.length - 1] : p.a[0])}</p>` : '';
    h += `<p class="km-sub bijtekst km-waar">${esc(waar)}</p><h1 class="km-h naam">${esc(p.n)}</h1>${al}`;
    if (!p.n_) return h + `<p class="km-aantal bijtekst">${esc(p.n)} is outside the filters.</p><p><button type="button" class="knop" data-km-wis>Clear filters</button></p>`;
    // config: the line names in the legend below come from kern.CFG.lineLabels (or the names in P) through LNM.
    const ks = KL.filter(k => p.c[k]).sort((a, b) => p.c[b] - p.c[a]);
    h += `<p class="km-aantal bijtekst"><span class="getal">${p.n_}</span> ${p.n_ === 1 ? 'ancestor' : 'ancestors'}${jrKomma(p)}</p>${staaf(p.c, p.n_, 10)}<p class="km-leg bijtekst">` + ks.map(k => `<span><i class="km-sw km-l${k}"></i>${p.c[k]} ${k ? 'via ' + LNM[k] : 'owner or parents'}</span>`).join('') + `</p>`;
    const zin = gebeurdeZin(p); if (zin) h += `<p class="km-zin bijtekst">${esc(zin)}</p>`;
    h += `<div class="km-groepkop"><h2>Ancestors in ${esc(p.n)}</h2><a href="#register/${encodeURIComponent(p.n)}">All ${p.n_} in the Register</a></div>`;
    for (const k of ks) {
      const key = p.n + '|' + k, open = S.open[key] !== false;
      const rijen = p.L.filter(l => l[1] === k).map(l => ({ l, ks: lv(l) })).filter(x => x.ks).sort((a, b) => bl(a.l[0]) - bl(b.l[0]) || a.l[0] - b.l[0]);
      h += `<div class="km-grp">`;
      if (ks.length > 1) h += `<button type="button" class="km-gh" data-km-grp="${esc(key)}" aria-expanded="${open}"><i class="km-sw km-l${k}"></i>${k ? esc(LNM[k]) : 'Owner and parents'}<b class="getal">${rijen.length}</b>${ICO_PIJL}</button>`;
      if (open) {
        const toon = S.toon[key] ? rijen : rijen.slice(0, 25);
        h += `<ul class="rijen km-rijen">${toon.map(({ l, ks: k2 }) => rij(l[0], { s: l[2], n: p.n }, k2)).join('')}</ul>`;
        if (rijen.length > toon.length) h += `<p class="km-meer"><button type="button" class="knop" data-km-toon="${esc(key)}">Show ${rijen.length - toon.length} more</button></p>`;
      }
      h += `</div>`;
    }
    return h;
  }
  function geboorteJaar(n) { const l = K.leven(n); const g = l.geboren; if (!g || g.jaar == null) return ''; return (g.soort === 'gedoopt' ? 'baptised ' : '° ') + K.jaarTekst(g); }
  function htmlPersoon(n, terug) {
    const { LIJN, PERS } = data(), l = LIJN.get(n), it = persPlaatsen(n), gj = geboorteJaar(n);
    let h = terug ? `<p class="km-terug"><button type="button" class="knop-stil" data-km-eind>${ICO_TERUG}All places</button></p>` : '';
    h += `<p class="km-sub bijtekst km-waar"><i class="km-sw km-l${l}"></i>${l ? 'Ancestor in line: ' + esc(LVOL[l]) : esc(n === 1 ? 'The owner' : n === 2 ? 'Father of the owner' : 'Mother of the owner')}</p><h1 class="km-h naam">${esc(nmP(n))}</h1><p class="km-sub bijtekst">No. ${n} · generation ${K.romein(bl(n))}${gj ? ' · ' + esc(gj) : ''}</p>`;
    h += `<p class="km-knopstrook"><a class="knop" href="#persoon/${n}">Person card</a><a class="knop" href="#boom/${n}">In the tree</a></p>`;
    h += `<p class="km-kopje">Places</p><ul class="km-lijst km-pl">` + it.map(i => `<li><button type="button" class="km-pr${S.sel === i.p.n ? ' km-act' : ''}" data-km-pp="${esc(i.p.n)}" data-km-hp="${esc(i.p.n)}" aria-pressed="${S.sel === i.p.n}"><b class="km-pn km-l${i.l}${i.nr ? '' : ' km-hol'}">${i.nr || ''}</b><span>${esc(i.p.n)}${evtRegel(i.s).length ? ' <span class="bijtekst">· ' + esc(evtRegel(i.s).join(' · ')) + '</span>' : ''}</span></button></li>`).join('') + `</ul>`;
    const keten = []; let m = n; while (m >= 8) { keten.push(m); if (m < 16) break; m = m >> 1; }
    const rest = []; let q = keten.length ? keten[keten.length - 1] >> 1 : n >> 1; while (q >= 1) { rest.push(q); q = q >> 1; }
    if (keten.length > 1 || rest.length) {
      h += `<p class="km-kopje">Line to the owner</p><ul class="km-lijst km-keten">` + keten.map(k => { const e = persPlaatsen(k)[0]; return PERS.has(k) ? `<li><button type="button" class="km-lr" data-km-pers="${k}"><span class="getal" style="color:${K.lijnKleur(k)}">${k}</span><span>${esc(nmP(k))}${e ? ' <span class="bijtekst">· ' + esc(e.p.n) + '</span>' : ''}</span></button></li>` : `<li><span class="km-lr km-tx"><span class="getal">${k}</span><span>${esc(nmP(k))}</span></span></li>`; }).join('') +
        rest.map(k => `<li><span class="km-lr km-tx"><span class="getal">${k}</span><span>${esc(nmP(k))}</span></span></li>`).join('') + `</ul>`;
    }
    return h;
  }
  function htmlKaartjePersoon(n) {
    const it = persPlaatsen(n);
    return `<div class="km-ch"><span class="km-cn naam">${esc(nmP(n))}</span><button type="button" class="knop-icoon" data-km-eind aria-label="Stop">${ICO_X}</button></div><p class="km-cs bijtekst">No. ${n} · ${plw(it.length)} · the numbers follow the years</p><p class="km-knopstrook"><button type="button" class="knop" data-km-pblad>Places</button><a class="knop" href="#persoon/${n}">Person card</a></p>`;
  }

  /* ---------- filters and render ---------- */
  function filters() {
    const T = tellingen();
    const chip = (k, lang) => { const on = S.lijn === k, any = !!S.lijn, n = T.li[k].size; return `<button type="button" class="km-chip km-lijnchip${on ? ' aan' : ''}${any && !on ? ' uit' : ''}" aria-pressed="${on}" data-km-lijn="${k}" aria-label="${esc(LVOL[k])}, ${vrw(n)}"><i class="km-sw km-l${k}"></i>${lang ? LNM[k] : LKORT[k]}${lang ? `<span class="getal bijtekst">${n}</span>` : ''}</button>`; };
    const fa = document.activeElement, fid = fa && fa.dataset ? fa.dataset.kmLijn : null, inRow = fa && chipsRij.contains(fa);
    cg.innerHTML = KL4.map(k => chip(k, true)).join('');
    chipsRij.innerHTML = KL4.map(k => chip(k, false)).join('');
    if (fid) { const t = (inRow ? chipsRij : cg).querySelector(`[data-km-lijn="${fid}"]`); if (t) t.focus(); }
    ovz.querySelector('#km-alle4').hidden = !S.lijn;
    selS.innerHTML = `<option value="">All mentions</option>` + SRT.map(s => `<option value="${s[0]}">${s[1]} (${T.sr[s[0]].size})</option>`).join(''); selS.value = S.srt;
    let go = `<option value="0">All generations</option>`;
    for (let g = 4; g <= 13; g++) { const n = T.ge[g].size, j = B.genjaar[g]; const nm = `${K.romein(g)}${g === 13 ? ' and older' : ''} · ${K.generatieNaam(g)}${j ? ' · around ' + j : ''}`; go += `<option value="${g}">${esc(nm)} (${n})</option>`; }
    selG.innerHTML = go; selG.value = String(S.gen);
    const aantal = (S.lijn ? 1 : 0) + (S.srt ? 1 : 0) + (S.gen ? 1 : 0);
    ovz.querySelector('#km-wis').hidden = !aantal;
    const badge = filterKnop.querySelector('.km-badge'); badge.hidden = !aantal; badge.textContent = aantal;
    filterKnop.setAttribute('aria-label', aantal ? `Search and filters, ${aantal} ${aantal === 1 ? 'filter' : 'filters'} active` : 'Search and filters');
  }
  let inhType = '';
  function render() {
    filters();
    const m = smal(); let typ, h;
    if (!m && S.pers) { typ = 'v' + S.pers; h = htmlPersoon(S.pers, true); }
    else if (!m && S.sel) { typ = 'p' + S.sel; h = htmlPlaats(data().PBN.get(S.sel), true); }
    else { typ = 'o'; h = htmlOverzicht(); }
    const st = paneel.scrollTop; inh.innerHTML = h;
    if (!m && typ !== inhType) paneel.scrollTop = Math.min(st, Math.max(0, inh.offsetTop - 16));
    inhType = typ;
    if (m) {
      // Phone and tablet: a small card for person mode, the sheet for a place.
      if (S.pers && !S.sel) { kaartje.innerHTML = htmlKaartjePersoon(S.pers); kaartje.hidden = false; } else { kaartje.hidden = true; kaartje.innerHTML = ''; }
      if (S.sel) bladOpen('plaats'); else if (S.blad === 'plaats') bladDicht();
      else if (S.blad === 'persoon') { if (S.pers) bladVul(); else bladDicht(); }
      else if (S.blad === 'overzicht') bladVul();
    } else { kaartje.hidden = true; kaartje.innerHTML = ''; if (S.blad) bladDicht(); }
    gebiedRij.parentNode.hidden = m && !!S.pers;
    if (S.pers && !m) { banier.innerHTML = `<div><b>Places of ${esc(nmP(S.pers))} (No. ${S.pers})</b><small class="bijtekst">The numbers follow the years.</small></div><button type="button" class="knop-icoon" data-km-eind aria-label="Stop">${ICO_X}</button>`; banier.hidden = false; }
    else { banier.hidden = true; banier.innerHTML = ''; }
    leeg.hidden = TOT !== 0;
  }

  /* ---------- the sheet (phone: bottom sheet, tablet: side panel) ---------- */
  let bladFocus = null;
  function bladVul() {
    const m = S.blad; if (!m) return;
    if (m === 'overzicht') { if (ovz.parentNode !== bladInhoud) { bladInhoud.innerHTML = ''; bladInhoud.appendChild(ovz); } bladSub.textContent = 'Search and filters'; blad.setAttribute('aria-label', 'Search and filters'); return; }
    if (ovz.parentNode === bladInhoud) paneel.appendChild(ovz);
    if (m === 'legenda') { bladInhoud.innerHTML = `<h1 class="km-h naam km-h-klein">How to read the map</h1><div class="km-lees">${legendaHtml()}</div><p class="km-kopje">The colours</p><ul class="km-lijst km-kleuren">${KL.map(k => `<li><i class="km-sw km-l${k}"></i>${esc(LVOL[k].charAt(0).toUpperCase() + LVOL[k].slice(1))}</li>`).join('')}</ul>`; bladSub.textContent = 'Key'; blad.setAttribute('aria-label', 'How to read the map'); schaal(); return; }
    if (m === 'persoon' && S.pers) { bladInhoud.innerHTML = htmlPersoon(S.pers, false); bladSub.textContent = 'Places of one ancestor'; blad.setAttribute('aria-label', 'Places of ' + nmP(S.pers)); return; }
    if (m === 'plaats' && S.sel) { const p = data().PBN.get(S.sel); const st = bladInhoud.scrollTop; bladInhoud.innerHTML = htmlPlaats(p, false); bladInhoud.scrollTop = st; const w = bladInhoud.querySelector('.km-waar'); bladSub.textContent = w ? w.textContent : ''; if (w) w.remove(); blad.setAttribute('aria-label', p.n); }
  }
  function bladOpen(m) {
    const was = S.blad; S.blad = m; bladVul();
    blad.classList.toggle('km-blad-plaats', m === 'plaats');
    if (blad.hidden || was !== m) { bladInhoud.scrollTop = 0; }
    balk();
    if (blad.hidden) { bladFocus = document.activeElement; blad.hidden = false; if (!mqR.matches) { blad.classList.add('schuift'); blad.getBoundingClientRect(); blad.classList.remove('schuift'); } }
    if (was !== m) blad.focus({ preventScroll: true });
    filterKnop.setAttribute('aria-expanded', String(m === 'overzicht'));
    wortel.querySelector('#km-legendaknop').setAttribute('aria-expanded', String(m === 'legenda'));
  }
  // Phone: an open sheet lies over the bottom bar (kaart.css); the bar then also leaves the tab order (visibility), so that
  // focus never lands on a tab under the sheet. Only while the map is the active view.
  function balk() { const aan = !!S.blad && actiefNu; wortel.classList.toggle('km-blad-open', aan); document.documentElement.classList.toggle('km-blad-open', aan); }
  function bladDicht() {
    if (!S.blad) return;
    const hadFocus = blad.contains(document.activeElement);
    S.blad = null; blad.hidden = true; balk();
    if (ovz.parentNode === bladInhoud) paneel.appendChild(ovz);
    bladInhoud.innerHTML = '';
    filterKnop.setAttribute('aria-expanded', 'false'); wortel.querySelector('#km-legendaknop').setAttribute('aria-expanded', 'false');
    if (hadFocus && bladFocus && bladFocus.focus && document.contains(bladFocus)) bladFocus.focus({ preventScroll: true });
    bladFocus = null;
  }

  /* ---------- applying filters ---------- */
  function filterNu() { bereken(); teken(true); render(); if (klaar) { zoomed = true; settle(); } zetHash(); }
  function wis() { S.lijn = 0; S.srt = ''; S.gen = 0; filterNu(); }

  /* ---------- clicks in the panel, sheets and overlays ---------- */
  function bindKlikken() {
    wortel.addEventListener('click', e => {
      const t = e.target.closest('[data-km-p],[data-km-pp],[data-km-reg],[data-km-zone],[data-km-back],[data-km-wis],[data-km-lijn],[data-km-sort],[data-km-meer],[data-km-grp],[data-km-toon],[data-km-eind],[data-km-pers],[data-km-pblad],.km-terugchip,#km-blad-sluit,#km-filterknop,#km-legendaknop,#km-zin,#km-zuit,#km-zhuis');
      if (!t || !wortel.contains(t)) return; const d = t.dataset; hintUit();
      if (t.id === 'km-zin') { zelf(); const c = cam(); vlieg({ cx: c.cx, cy: c.cy, k: V.k * 1.6 }); return; }
      if (t.id === 'km-zuit') { zelf(); const c = cam(); vlieg({ cx: c.cx, cy: c.cy, k: V.k / 1.6 }); return; }
      if (t.id === 'km-zhuis') { thuis(); return; }
      if (t.id === 'km-blad-sluit') { if (S.blad === 'plaats') kiesPlaats(null); else bladDicht(); return; }
      if (t.id === 'km-filterknop') { if (S.blad === 'overzicht') bladDicht(); else bladOpen('overzicht'); return; }
      if (t.id === 'km-legendaknop') { if (S.blad === 'legenda') bladDicht(); else bladOpen('legenda'); return; }
      if (t.classList.contains('km-terugchip')) { e.preventDefault(); thuis(); return; }
      if (d.kmP != null) { if (smal()) bladDicht(); if (S.pers) eindPersoon(); kiesPlaats(d.kmP, { fly: 'row' }); return; }
      if (d.kmPp != null) { S.sel = d.kmPp; render(); const s = symVoor(d.kmPp); if (s) { const k = Math.max(V.k, 6); zoneUit(); vlieg({ cx: s.wx + bladB() / 2 / k, cy: s.wy + (smal() ? bladH() : 0) / 2 / k, k: k }); } zetHash(); return; }
      if (d.kmReg != null) { if (smal()) bladDicht(); zone(d.kmReg); return; }
      if (d.kmZone != null) { zone(d.kmZone); return; }
      if (d.kmBack != null) { kiesPlaats(null); return; }
      if (d.kmWis != null) { wis(); return; }
      if (d.kmLijn != null) { const k = +d.kmLijn; S.lijn = (k === 0 || S.lijn === k) ? 0 : k; filterNu(); return; }
      if (d.kmSort != null) { S.sort = d.kmSort; render(); return; }
      if (d.kmMeer != null) { S.meer = true; render(); return; }
      if (d.kmGrp != null) { S.open[d.kmGrp] = S.open[d.kmGrp] === false; render(); return; }
      if (d.kmToon != null) { S.toon[d.kmToon] = true; render(); return; }
      if (d.kmEind != null) { if (smal()) bladDicht(); eindPersoon(); return; }
      if (d.kmPers != null) { if (smal()) bladDicht(); persoon(+d.kmPers); return; }
      if (d.kmPblad != null) { bladOpen('persoon'); return; }
    });
    wortel.addEventListener('pointerover', e => {
      if (e.pointerType !== 'mouse') return; const t = e.target.closest('[data-km-hp],[data-km-hr]');
      if (!t) return;
      if (t.dataset.kmHr != null) { const r = RINGS.find(s => s.g.name === t.dataset.kmHr); zetHover(agg && r && r.vis ? r : null); }
      else zetHover(symVoor(t.dataset.kmHp));
    });
    wortel.addEventListener('pointerout', e => { const t = e.target.closest('[data-km-hp],[data-km-hr]'); if (t && !t.contains(e.relatedTarget)) zetHover(null); });
    selS.addEventListener('change', () => { S.srt = selS.value; filterNu(); });
    selG.addEventListener('change', () => { S.gen = +selG.value; filterNu(); });
    // Drag handle on the phone: dragging down closes the sheet.
    const greep = wortel.querySelector('#km-greep'); let start = null;
    greep.addEventListener('pointerdown', e => { if (!telefoon()) return; start = e.clientY; try { greep.setPointerCapture(e.pointerId); } catch (x) { /* */ } });
    greep.addEventListener('pointermove', e => { if (start == null) return; const dy = Math.max(0, e.clientY - start); blad.style.transform = dy ? `translateY(${dy}px)` : ''; });
    const klaarGreep = e => { if (start == null) return; const dy = e.clientY - start; start = null; blad.style.transform = ''; if (dy > 120) { if (S.blad === 'plaats') kiesPlaats(null); else bladDicht(); } };
    greep.addEventListener('pointerup', klaarGreep); greep.addEventListener('pointercancel', () => { start = null; blad.style.transform = ''; });
    // Keyboard on the symbols themselves.
    svg.addEventListener('keydown', e => {
      const g = e.target.closest && e.target.closest('g.km-m'); if (!g || g === svg) return;
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault(); const s = g.dataset.r ? RINGS.find(x => x.g.name === g.dataset.r) : g.dataset.p ? (S.pers ? PMS.find(x => x.p.n === g.dataset.p) : DBN.get(g.dataset.p)) : PMS.find(x => x.el === g);
      if (s) kiesSym(s, false);
    });
    svg.addEventListener('focusin', e => { const g = e.target.closest && e.target.closest('g.km-m'); if (!g) return; const s = g.dataset.r ? RINGS.find(x => x.g.name === g.dataset.r) : (S.pers ? PMS.find(x => x.el === g) : DBN.get(g.dataset.p)); if (s) zetHover(s); });
    svg.addEventListener('focusout', e => { if (e.target.closest && e.target.closest('g.km-m')) zetHover(null); });
  }

  /* ---------- pointing, dragging, pinching (v43: pointer events; touchmove only with two fingers) ---------- */
  function bindAanraken() {
    const PT = new Map(); let G = null, laatste = { t: 0, x: 0, y: 0 };
    const loc = e => { const r = podium.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    svg.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      stopFly(); hintUit();
      try { svg.setPointerCapture(e.pointerId); } catch (_) { /* */ }
      const p = loc(e); PT.set(e.pointerId, p);
      if (PT.size === 1) G = { m: 'tik', x0: p.x, y0: p.y, tx: V.tx, ty: V.ty, touch: e.pointerType !== 'mouse' };
      else if (PT.size === 2) { const [a, b] = [...PT.values()]; G = { m: 'knijp', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: V.k, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, tx: V.tx, ty: V.ty }; zelf(); tipUit(); }
    });
    svg.addEventListener('pointermove', e => {
      const p = loc(e);
      if (!PT.has(e.pointerId)) { if (e.pointerType === 'mouse' && !flyId) { const s = hit(p.x, p.y, false); zetHover(s); svg.classList.toggle('km-hand', !!s); if (s) tipToon(s, p.x, p.y); else tipUit(); } return; }
      PT.set(e.pointerId, p); if (!G) return;
      if (G.m === 'tik' || G.m === 'sleep') {
        const dx = p.x - G.x0, dy = p.y - G.y0;
        if (G.m === 'tik' && Math.hypot(dx, dy) > 4) { G.m = 'sleep'; svg.classList.add('km-sleep'); zelf(); zetHover(null); tipUit(); }
        if (G.m === 'sleep') { V.tx = G.tx + dx; V.ty = G.ty + dy; clamp(); req(); }
      } else if (G.m === 'knijp' && PT.size >= 2) {
        const [a, b] = [...PT.values()], d = Math.hypot(a.x - b.x, a.y - b.y) || 1, cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2, k = cl(G.k0 * d / G.d0), wx = (G.cx - G.tx) / G.k0, wy = (G.cy - G.ty) / G.k0;
        V.k = k; V.tx = cx - wx * k; V.ty = cy - wy * k; clamp(); req();
      }
    });
    function los(e) {
      if (!PT.has(e.pointerId)) return;
      const p = PT.get(e.pointerId); PT.delete(e.pointerId);
      if (G && G.m === 'tik' && e.type === 'pointerup' && PT.size === 0) tik(p.x, p.y, G.touch);
      if (PT.size === 1 && G && G.m === 'knijp') { const q = [...PT.values()][0]; G = { m: 'sleep', x0: q.x, y0: q.y, tx: V.tx, ty: V.ty }; }
      else if (PT.size === 0) { G = null; svg.classList.remove('km-sleep'); }
    }
    svg.addEventListener('pointerup', los); svg.addEventListener('pointercancel', los);
    svg.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && !PT.size) { zetHover(null); tipUit(); svg.classList.remove('km-hand'); } });
    function tik(x, y, touch) {
      const nu = performance.now();
      if (nu - laatste.t < 320 && Math.hypot(x - laatste.x, y - laatste.y) < 24) { laatste.t = 0; zelf(); zoomOp(x, y, 2, true); return; }
      laatste = { t: nu, x, y };
      const s = hit(x, y, touch);
      if (s) kiesSym(s, touch); else leegTik(touch);
    }
    svg.addEventListener('wheel', e => {
      e.preventDefault(); stopFly(); zelf(); tipUit();
      const p = loc(e); let dy = e.deltaY; if (e.deltaMode === 1) dy *= 16; else if (e.deltaMode === 2) dy *= H;
      zoomOp(p.x, p.y, Math.exp(-dy * (e.ctrlKey ? .01 : .0015)), false);
    }, { passive: false });
    // Only with two fingers does the stage listen to touchmove (against pinch-zooming the page); one finger stays with the browser.
    const knijpBeweeg = e => { if (e.touches.length >= 2) e.preventDefault(); };
    const knijpStop = () => podium.removeEventListener('touchmove', knijpBeweeg);
    podium.addEventListener('touchstart', e => { if (e.touches.length >= 2) podium.addEventListener('touchmove', knijpBeweeg, { passive: false }); }, { passive: true });
    podium.addEventListener('touchend', e => { if (e.touches.length < 2) knijpStop(); }, { passive: true });
    podium.addEventListener('touchcancel', knijpStop, { passive: true });
    podium.addEventListener('gesturestart', e => e.preventDefault());
    podium.addEventListener('gesturechange', e => e.preventDefault());
    svg.addEventListener('keydown', e => {
      if (e.target !== svg) return;
      const k = e.key; let ok = true;
      if (k === 'ArrowLeft') V.tx += 80; else if (k === 'ArrowRight') V.tx -= 80; else if (k === 'ArrowUp') V.ty += 80; else if (k === 'ArrowDown') V.ty -= 80;
      else if (k === '+' || k === '=') { const c = cam(); vlieg({ cx: c.cx, cy: c.cy, k: V.k * 1.6 }); ok = 'z'; }
      else if (k === '-' || k === '_') { const c = cam(); vlieg({ cx: c.cx, cy: c.cy, k: V.k / 1.6 }); ok = 'z'; }
      else if (k === '0') { thuis(); e.preventDefault(); return; }
      else ok = false;
      if (ok) { e.preventDefault(); zelf(); if (ok === true) { stopFly(); clamp(); req(); } }
    });
    // Escape: first the sheet or the search list, then person mode, then the chosen place. The person card goes first (kern).
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape' || !actiefNu || K.persoonOpen()) return;
      if (e.target === zoekveld && !zoekLijst.hidden) return;
      if (S.blad) { e.preventDefault(); if (S.blad === 'plaats') kiesPlaats(null); else bladDicht(); return; }
      if (S.pers) { e.preventDefault(); eindPersoon(); return; }
      if (S.sel) { e.preventDefault(); kiesPlaats(null); }
    }, true);
  }

  /* ---------- searching for a place or an ancestor ---------- */
  function bindZoeken() {
    const q = zoekveld, qr = zoekLijst; let QR = [], qi = -1, IXP = null, IXV = null;
    const norm = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’`]/g, "'");
    const index = () => { if (IXP) return; const { PLS, PERS } = data(); IXP = PLS.map(p => ({ p, k: [norm(p.n), norm(p.kort)], a: p.a.map(a => [a, norm(a)]) })); IXV = [...PERS.keys()].sort((a, b) => a - b).map(n => ({ n, k: norm(nmP(n)) })); };
    function qDicht() { qr.hidden = true; qr.innerHTML = ''; q.setAttribute('aria-expanded', 'false'); q.removeAttribute('aria-activedescendant'); qi = -1; }
    function zoek() {
      index(); const v = norm(q.value.trim()); QR = []; qi = -1;
      if (v.length < 2) { qDicht(); return; }
      const pl = [], vo = [];
      for (const it of IXP) {
        if (it.k.some(k => k.includes(v))) pl.push({ t: 'p', p: it.p, lb: it.p.n, sc: it.k.some(k => k.startsWith(v)) ? 0 : 1 });
        else { const a = it.a.find(x => x[1].includes(v)); if (a) pl.push({ t: 'p', p: it.p, lb: a[0] + ' → ' + it.p.n, sc: a[1].startsWith(v) ? 0 : 1 }); }
      }
      pl.sort((a, b) => a.sc - b.sc || b.p.tot - a.p.tot || a.p.n.localeCompare(b.p.n, 'nl'));
      // i18n: "no 5", "no. 5" and "nr 5" all find person No. 5 (v is already lower case)
      const m = v.match(/^(?:(?:no|nr)\.?\s*)?(\d+)$/);
      if (m) { const n = +m[1]; if (data().PERS.has(n)) vo.push({ t: 'v', n, sc: -1 }); }
      else for (const it of IXV) { const i = it.k.indexOf(v); if (i >= 0) vo.push({ t: 'v', n: it.n, sc: i === 0 ? 0 : /\s/.test(it.k[i - 1]) ? 1 : 2 }); }
      vo.sort((a, b) => a.sc - b.sc || a.n - b.n);
      let np = Math.min(pl.length, 8), nv = Math.min(vo.length, 8);
      if (np + nv > 8) { if (np >= 4 && nv >= 4) { np = 4; nv = 4; } else if (np < 4) nv = 8 - np; else np = 8 - nv; }
      QR = [...pl.slice(0, np), ...vo.slice(0, nv)];
      let h = '';
      if (!QR.length) h = `<div class="km-qn bijtekst">Nothing found.</div>`;
      else {
        if (np) h += `<div role="group" aria-label="Places"><p class="km-kopje" aria-hidden="true">Places</p>` + pl.slice(0, np).map((r, i) => `<div role="option" id="km-qo${i}" aria-selected="false" data-i="${i}">${esc(r.lb)}<span class="bijtekst">${vrw(r.p.tot)}</span></div>`).join('') + `</div>`;
        if (nv) h += `<div role="group" aria-label="Ancestors"><p class="km-kopje" aria-hidden="true">Ancestors</p>` + vo.slice(0, nv).map((r, j) => { const i = np + j; return `<div role="option" id="km-qo${i}" aria-selected="false" data-i="${i}">${esc(nmP(r.n))}<span class="bijtekst">No. ${r.n}</span></div>`; }).join('') + `</div>`;
      }
      qr.innerHTML = h; qr.hidden = false; q.setAttribute('aria-expanded', 'true');
    }
    function qAct(i) { qi = i; qr.querySelectorAll('[role=option]').forEach(o => o.setAttribute('aria-selected', String(+o.dataset.i === i))); const o = qr.querySelector('#km-qo' + i); if (o) { q.setAttribute('aria-activedescendant', o.id); o.scrollIntoView({ block: 'nearest' }); } }
    function qKies(r) {
      if (!r) return; q.value = ''; qDicht(); if (smal()) bladDicht();
      if (r.t === 'p') { if (S.pers) eindPersoon(); kiesPlaats(r.p.n, { fly: 'row' }); } else persoon(r.n);
    }
    q.addEventListener('input', zoek);
    q.addEventListener('keydown', e => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (qr.hidden) zoek(); if (QR.length) qAct(Math.min(QR.length - 1, qi + 1)); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (QR.length) qAct(Math.max(0, qi - 1)); }
      else if (e.key === 'Enter') { if (QR.length) { e.preventDefault(); qKies(QR[qi >= 0 ? qi : 0]); } }
      else if (e.key === 'Escape') { if (!qr.hidden) { e.preventDefault(); e.stopPropagation(); qDicht(); } }
    });
    qr.addEventListener('pointerdown', e => { const o = e.target.closest('[role=option]'); if (!o) return; e.preventDefault(); qKies(QR[+o.dataset.i]); });
    q.addEventListener('blur', () => setTimeout(qDicht, 150));
  }

  /* ---------- routes and hash ---------- */
  function hashVanStaat() {
    if (S.pers) return '#kaart/nr-' + S.pers;
    if (S.sel) return '#kaart/' + encodeURIComponent(S.sel);
    if (S.lijn) return '#kaart/lijn-' + S.lijn;
    return '#kaart';
  }
  // The hash moves along (replaceState via kern.vervang, so kern knows the main route). If the person card is open, we wait.
  function zetHash() {
    if (!hashOK || !actiefNu) return;
    const h = hashVanStaat();
    if (K.persoonOpen() || K.hoofdRoute().weergave !== 'kaart') { uitgesteld = true; return; }
    if (location.hash === h) return;
    zetBezig = true; try { K.vervang(h); } finally { zetBezig = false; }
  }
  function toepas(params) {
    if (zetBezig) return;
    if (uitgesteld) { uitgesteld = false; zetHash(); return; }
    let gewenst = '#kaart';
    if (params.n != null) gewenst = '#kaart/nr-' + params.n; else if (params.plaats) gewenst = /^lijn-[4-7]$/.test(params.plaats) ? '#kaart/' + params.plaats : '#kaart/' + encodeURIComponent(params.plaats);
    if (gewenst === hashVanStaat() && !wilPlaats) return;
    if (params.n != null) {
      if (data().PERS.has(params.n)) { const pl = wilPlaats && data().PBN.has(wilPlaats) ? wilPlaats : null; wilPlaats = null; persoon(params.n, pl); if (pl && smal()) bladOpen('plaats'); return; }
      wilPlaats = null; zetHash(); return;
    }
    wilPlaats = null;
    const lijnM = params.plaats && params.plaats.match(/^lijn-([4-7])$/);
    if (lijnM) { if (S.pers) eindPersoon(); S.sel = null; S.lijn = +lijnM[1]; filterNu(); thuis(); return; }
    if (params.plaats) {
      if (data().PBN.has(params.plaats)) { if (S.pers) eindPersoon(); kiesPlaats(params.plaats, { fly: 'row' }); return; }
      zetHash(); return; // unknown place: put the hash back to the state of the map
    }
    if (S.pers) eindPersoon();
    if (S.sel) kiesPlaats(null);
    if (S.lijn) { S.lijn = 0; filterNu(); }
    if (S.zone !== 'nl') thuis();
    zetHash();
  }

  /* ---------- start ---------- */
  let hintT = 0, laatstePad = null;
  function hint() {
    let gezien = false; try { gezien = localStorage.getItem('km-hint') === '1'; } catch (e) { /* */ }
    if (gezien) return;
    hintEl.textContent = grof() ? 'Drag to pan. Pinch to zoom.' : 'Drag to pan. Scroll to zoom.'; hintEl.classList.add('aan');
    hintT = setTimeout(hintUit, 4000); try { localStorage.setItem('km-hint', '1'); } catch (e) { /* */ }
  }
  function hintUit() { clearTimeout(hintT); if (hintEl) hintEl.classList.remove('aan'); }
  function start(params) {
    bereken(); bindKlikken(); bindAanraken(); bindZoeken();
    render(); // first the chips and the panel, then measure: the chip row also decides how tall the stage is
    metrics(); meet(); teken(false);
    setCam(huisCam()); clamp();
    klaar = true; zoomed = true; frame(true); settle();
    hashOK = true; toepas(params); hint();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { metrics(); if (actiefNu && klaar) labels(); });
    if (window.ResizeObserver) new ResizeObserver(() => { if (!klaar || !actiefNu) return; const c = cam(); meet(); if (!W) return; setCam(c); clamp(); zoomed = true; frame(true); settle(); }).observe(podium);
    const mqC = () => { if (!klaar) return; if (!smal() && S.blad) bladDicht(); segZet(); render(); if (actiefNu) { zoomed = true; settle(); } };
    if (mqL.addEventListener) mqL.addEventListener('change', mqC); else if (mqL.addListener) mqL.addListener(mqC);
    // For tests (like v43's window.__km): the state and the camera, read-only.
    window.__km = { S, V, get W() { return W; }, get H() { return H; }, get klaar() { return klaar; }, get agg() { return agg; }, get PMS() { return PMS; }, cam, kMin: () => kMin, DOTS, RINGS, laatstePad: () => laatstePad };
  }

  K.registreer('kaart', {
    monteer(e, params) {
      actiefNu = true;
      // i18n: empty data guard, with no map outline or no places show a short message and build nothing
      if (!gebouwd) {
        if (!B.land || !B.pl || !Object.keys(PL).length) { e.innerHTML = '<p class="bijtekst">No map data yet. See docs/map-data.md.</p>'; return; }
        bouw(e);
      }
      start(params || {});
    },
    bijwerk(params) {
      actiefNu = true;
      if (!gebouwd) return; // i18n: empty data guard, nothing was built
      if (!W || !H) { const c = cam(); meet(); if (W) { setCam(c); clamp(); zoomed = true; frame(true); settle(); } }
      toepas(params || {}); balk();
    },
    verlaat() { actiefNu = false; if (!gebouwd) return; /* i18n: empty data guard */ stopFly(); tipUit(); hintUit(); if (S.blad && S.blad !== 'plaats') bladDicht(); balk(); },
  });
})();

