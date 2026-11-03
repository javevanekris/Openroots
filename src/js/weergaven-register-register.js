// weergaven/register/register.js
// ui/weergaven/register/register.js: the register. All ancestors as rows, by generation, in Ahnentafel order,
// with search by name, place and number and filters on grandparent line and certainty. Routes #register and #register/<search term>.
// Rows only enter the DOM when their block comes into view (IntersectionObserver); blocks that scroll far out of view are emptied again.
(function () {
  'use strict';
  const K = window.kern, esc = K.esc;
  const BLOK = 40;             // rows per lazily filled block (an even number, so two columns line up)
  const CAP = 200;             // results per batch when searching; then "Show more"
  const MARGE = '900px 0px';   // how far outside the view a block is already filled
  const LIJNEN = [4, 5, 6, 7];
  const STATUSSEN = ['akte', 'onderbouwd', 'voorbehoud', 'nietbevestigd'];
  const OPSLAG = 'kw-register-filters';
  const RIJ = 58, EXTRA_REGEL = 21; // estimate: row height including spacing, and what an extra name line adds

  const CHEVRON = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  const ZOEK = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/></svg>';
  const ZOEK_LEEG = '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5M8.5 11h5"/></svg>';
  const WIS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="m9 9 6 6M15 9l-6 6"/></svg>';

  const state = { term: '', lijnen: new Set(), statussen: new Set(), limiet: CAP, getekend: null, open: null };
  let wortel = null, lijstEl, railEl, statusRij, statusEl, wisEl, veld, zijVeld, chipLijn, chipStatus;
  let alle = null, index = null, maxG = 1, totaal = 0, telling = null, perGenTotaal = null;
  let blokken = [], io = null, spion = null, zichtbaar = new Set();

  /* ---------- Text and search ---------- */
  const nl = n => Number(n).toLocaleString('en-GB'); // i18n: English number formatting
  const q = s => '“' + s + '”';
  // Case, accents and some spelling variants do not count: ij = y, c = k (ck = k), æ = ae. (The ij/ck/c rules suit Dutch and are harmless for other languages: both sides are folded alike.)
  function normaliseer(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/æ/g, 'ae').replace(/œ/g, 'oe').replace(/ø/g, 'o').replace(/ß/g, 'ss')
      .replace(/ij/g, 'y').replace(/ck/g, 'k').replace(/c/g, 'k')
      .replace(/[^a-z0-9]+/g, ' ').trim();
  }
  // i18n: the optional prefix is the English short form "No." (was the Dutch "nr.")
  const nummerTerm = t => { const m = String(t || '').trim().match(/^(?:no\.?\s*)?(\d{1,7})$/i); return m ? m[1] : null; };

  function bouwAlle() {
    const nummers = Array.from(K.P.keys()).sort((a, b) => a - b);
    totaal = nummers.length; maxG = 1; perGenTotaal = new Map();
    alle = nummers.map(n => {
      const g = K.generatie(n); if (g > maxG) maxG = g;
      perGenTotaal.set(g, (perGenTotaal.get(g) || 0) + 1);
      return { n, g, lijn: K.lijn(n), naam: K.P.get(n)[0], vl: K.status(n) };
    });
  }
  function bouwIndex() {
    if (index) return index;
    index = alle.map(e => {
      const l = K.leven(e.n), plaatsen = [];
      const voeg = (label, plaats) => { if (plaats) plaatsen.push({ label, plaats, N: normaliseer(plaats) }); };
      const woord = ev => (ev.soort === 'gedoopt' ? 'baptised in' : ev.soort === 'begraven' ? 'buried in' : ev.soort === 'overleden' ? 'died in' : 'born in');
      if (l.geboren) voeg(woord(l.geboren), l.geboren.plaats);
      (l.overige || []).forEach(ev => voeg(woord(ev), ev.plaats));
      if (l.overleden) voeg(woord(l.overleden), l.overleden.plaats);
      if (l.huwelijk) voeg(l.huwelijk.soort === 'ondertrouw' ? 'marriage banns in' : 'married in', l.huwelijk.plaats);
      if (l.herkomst) voeg('from', l.herkomst);
      return Object.assign({}, e, { naamN: normaliseer(e.naam), plaatsen, hoofdPlaats: K.plaats(e.n) });
    });
    return index;
  }
  const filterActief = () => state.lijnen.size > 0 || state.statussen.size > 0;
  const past = e => (!state.lijnen.size || (e.lijn != null && state.lijnen.has(e.lijn))) && (!state.statussen.size || e.vl.some(v => state.statussen.has(v)));

  // Returns the hits in Ahnentafel order, each with an optional reason why (a place that is not already in the sub-line).
  function zoekLijst(term) {
    const t = String(term || '').trim();
    const num = nummerTerm(t);
    if (num) return alle.filter(e => past(e) && String(e.n).startsWith(num)).map(e => ({ e, waarom: null, exact: String(e.n) === num }));
    const tN = normaliseer(t);
    if (!tN) return t ? [] : alle.filter(past).map(e => ({ e, waarom: null, exact: false })); // only characters that fold away (emoji, punctuation): no hits instead of everyone
    const woorden = tN.split(' ');
    const uit = [];
    for (const e of bouwIndex()) {
      if (!past(e)) continue;
      const inNaam = woorden.every(w => e.naamN.includes(w));
      if (inNaam) { uit.push({ e, waarom: null, exact: e.naamN === tN }); continue; }
      const alles = e.naamN + ' | ' + e.plaatsen.map(p => p.N).join(' | ');
      if (!woorden.every(w => alles.includes(w))) continue;
      const rest = woorden.filter(w => !e.naamN.includes(w));
      const pl = e.plaatsen.find(p => rest.every(w => p.N.includes(w))) || e.plaatsen.find(p => rest.some(w => p.N.includes(w)));
      const waarom = pl && pl.plaats !== e.hoofdPlaats ? pl.label + ' ' + pl.plaats : null;
      uit.push({ e, waarom, exact: false });
    }
    return uit;
  }

  /* ---------- Rows ---------- */
  function rijHtml(t, metLijn) {
    const e = t.e, n = e.n, nb = e.vl.includes('nietbevestigd');
    const meta = [K.jaren(n), K.plaats(n)].filter(Boolean).join(', ');
    const bij = [meta];
    if (t.waarom) bij.push(t.waarom);
    if (metLijn && e.lijn) bij.push('via ' + K.LIJNEN[e.lijn].kort);
    const metaTekst = bij.filter(Boolean).join(' · ');
    const icoon = e.vl.map(v => K.statusIcoon(v, 18)).join('');
    return `<li><a class="rij" href="#persoon/${n}" data-n="${n}" data-status="${e.vl.join(' ')}"${t.exact ? ' aria-current="true"' : ''}>` +
      `<span class="rij-nr getal" style="color:${K.lijnKleur(n)}">${n}</span>` +
      `<span class="rij-tekst"><span class="rij-naam${nb ? ' naam-nb' : ''}">${esc(e.naam)}</span>${metaTekst ? `<span class="rij-meta">${esc(metaTekst)}</span>` : ''}</span>` +
      `<span class="status">${icoon}</span></a></li>`;
  }
  function kolommen() { return wortel && wortel.clientWidth >= 860 ? 2 : 1; } // same as @container (min-width:860px) in register.css
  function schatHoogte(items, kol) {
    const breedte = (lijstEl ? lijstEl.clientWidth : 390) / kol;
    const perRegel = Math.max(14, Math.floor((breedte - 156) / 8.6));
    let h = 0;
    for (let i = 0; i < items.length; i += kol) {
      let extra = 0;
      for (let j = i; j < i + kol && j < items.length; j++) if (items[j].e.naam.length > perRegel) extra = EXTRA_REGEL;
      h += RIJ + extra;
    }
    return Math.max(0, h - 2);
  }
  function vul(b) {
    if (b.gevuld) return;
    b.el.innerHTML = b.items.map(t => rijHtml(t, b.metLijn)).join('');
    b.el.style.minHeight = ''; b.el.removeAttribute('aria-busy');
    b.gevuld = true;
  }
  function leeg(b) {
    if (!b.gevuld) return;
    b.el.style.minHeight = b.el.offsetHeight + 'px';
    b.el.innerHTML = ''; b.el.setAttribute('aria-busy', 'true');
    b.gevuld = false;
  }
  function kijk(entries) {
    for (const en of entries) {
      const b = blokken[+en.target.dataset.blok]; if (!b) continue;
      if (en.isIntersecting) vul(b); else leeg(b);
    }
  }
  function spioneer(entries) {
    for (const en of entries) { const g = +en.target.dataset.g; if (en.isIntersecting) zichtbaar.add(g); else zichtbaar.delete(g); }
    if (!railEl) return;
    let huidig = null;
    for (const g of Array.from(zichtbaar).sort((a, b) => a - b)) { huidig = g; break; }
    railEl.querySelectorAll('button[data-g]').forEach(b => { if (+b.dataset.g === huidig) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); });
  }

  /* ---------- Building the list ---------- */
  function statusTekst(modus, aantal, getoond, term) {
    const delen = [];
    if (state.lijnen.size) delen.push('via ' + Array.from(state.lijnen).sort().map(l => K.LIJNEN[l].kort).join(' or '));
    if (state.statussen.size) delen.push(STATUSSEN.filter(s => state.statussen.has(s)).map(s => K.STATUSNAAM[s].toLowerCase()).join(' or '));
    const filt = delen.length ? ', ' + delen.join(', ') : '';
    if (modus === 'alles') return '';
    if (!aantal) return (term ? 'Nothing found for ' + q(term) : 'No ancestors') + filt;
    const wat = aantal === 1 ? 'ancestor' : 'ancestors';
    if (getoond < aantal) return `The first ${nl(getoond)} of ${nl(aantal)} ${wat} matching ${q(term)}${filt}`;
    return `${nl(aantal)} of ${nl(totaal)} ${wat}` + (term ? ' matching ' + q(term) : '') + filt;
  }
  function leegHtml(term) {
    const kaart = '#kaart/' + encodeURIComponent(term);
    const kort = term.length > 4 ? ` Try part of the name, for example ${q(esc(term.slice(0, 4)))}, or a place such as ${q('Exampleville')}.` : ` Try another spelling, or a place such as ${q('Exampleville')}.`;
    const filt = filterActief() ? ' Filters are also switched on.' : '';
    return `<div class="reg-leeg"><span class="reg-leeg-icoon" aria-hidden="true">${ZOEK_LEEG}</span>` +
      `<h2 class="naam">Nothing found for ${q(esc(term))}</h2>` +
      `<p>No ancestor, place or number with ${q(esc(term))} appears in the ancestor chart.${kort}${filt}</p>` +
      `<div class="reg-leeg-knoppen"><a class="knop reg-inkt" href="#register">Clear the search</a><a class="knop" href="${kaart}">Search the map</a>${filterActief() ? '<button type="button" class="knop reg-filters-uit">Switch the filters off</button>' : ''}</div></div>` +
      `<p class="reg-hint reg-hint-leeg">Search looks at names, places and Ahnentafel numbers, not at occupations or stories.</p>`;
  }
  function leegFilterHtml() {
    return `<div class="reg-leeg"><span class="reg-leeg-icoon" aria-hidden="true">${ZOEK_LEEG}</span><h2 class="naam">No ancestors with these filters</h2>` +
      `<p>No ancestor matches this combination of grandparent line and certainty.</p><div class="reg-leeg-knoppen"><button type="button" class="knop reg-inkt reg-filters-uit">Switch the filters off</button></div></div>`;
  }
  function hintHtml(term) {
    if (!term) return '';
    if (nummerTerm(term)) return `<p class="reg-hint">Searched by Ahnentafel number. You can also type a name or a place.</p>`;
    return `<p class="reg-hint">Searched in names, places and Ahnentafel numbers. You can also find a place on the <a href="#kaart/${encodeURIComponent(term)}">map</a>.</p>`;
  }

  function render(opties) {
    if (!wortel) return;
    const term = state.term.trim();
    const modus = term ? 'zoek' : filterActief() ? 'filter' : 'alles';
    const lijst = modus === 'alles' ? alle.map(e => ({ e, waarom: null, exact: false })) : zoekLijst(term);
    const aantal = lijst.length;
    const getoond = modus === 'zoek' && aantal > state.limiet ? lijst.slice(0, state.limiet) : lijst;
    const perGen = new Map();
    for (const t of getoond) { let a = perGen.get(t.e.g); if (!a) perGen.set(t.e.g, a = []); a.push(t); }

    // Release the old blocks.
    if (io) io.disconnect(); if (spion) spion.disconnect();
    blokken = []; zichtbaar = new Set();
    const kol = kolommen();
    let html = '';
    // i18n: empty-data guard, nothing to list
    if (!totaal) html = '<div class="reg-leeg"><h2 class="naam">No ancestors yet</h2><p>Add people to the data files to fill the register.</p></div>';
    else if (!aantal) html = modus === 'zoek' ? leegHtml(term) : leegFilterHtml();
    else {
      for (const [g, items] of perGen) {
        const id = 'reg-g' + g, tot = perGenTotaal.get(g) || 0;
        const van = modus === 'alles' ? `${nl(tot)} of ${nl(Math.pow(2, g - 1))}` : `${nl(items.length)} of ${nl(tot)}`;
        html += `<section class="reg-gen" data-g="${g}" aria-labelledby="${id}"><div class="groep-kop"><span class="getal">${K.romein(g)}</span><h2 id="${id}" tabindex="-1">${esc(K.generatieNaam(g))}</h2><span class="reg-van getal">${van}</span></div>`;
        for (let i = 0; i < items.length; i += BLOK) {
          const deel = items.slice(i, i + BLOK);
          const b = { el: null, items: deel, gevuld: false, metLijn: modus !== 'alles', g };
          blokken.push(b);
          html += `<ul class="rijen reg-blok" data-blok="${blokken.length - 1}" style="min-height:${schatHoogte(deel, kol)}px" aria-busy="true"></ul>`;
        }
        html += '</section>';
      }
      if (getoond.length < aantal) html += `<div class="reg-meer"><button type="button" class="knop" id="reg-meer">Show more <span class="bijtekst">(${nl(aantal - getoond.length)} more)</span></button></div>`;
      html += hintHtml(term);
    }
    lijstEl.innerHTML = html;
    lijstEl.querySelectorAll('.reg-blok').forEach(el => { blokken[+el.dataset.blok].el = el; });

    // The first rows at once, the rest as they come into view.
    let rijen = 0;
    for (const b of blokken) { if (rijen >= 24) break; vul(b); rijen += b.items.length; }
    io = new IntersectionObserver(kijk, { rootMargin: MARGE });
    blokken.forEach(b => io.observe(b.el));
    spion = new IntersectionObserver(spioneer, { rootMargin: '-20px 0px -70% 0px' }); // the band at the top decides which generation is 'current'
    lijstEl.querySelectorAll('.reg-gen').forEach(s => spion.observe(s));

    // Status, clear button, rail, chips.
    const tekst = statusTekst(modus, aantal, getoond.length, term);
    statusEl.textContent = tekst;
    // Nothing found: the card below already says so (with “Clear the search”); the status line stays for screen readers only.
    statusEl.classList.toggle('onzichtbaar', !aantal);
    statusRij.classList.toggle('reg-statusrij-leeg', !tekst);
    statusRij.classList.toggle('reg-statusrij-stil', !aantal);
    wisEl.hidden = !term || !aantal;
    wortel.querySelector('.reg-chip-lijn').classList.toggle('reg-chip-aan', state.lijnen.size > 0);
    wortel.querySelector('.reg-chip-status').classList.toggle('reg-chip-aan', state.statussen.size > 0);
    bijwerkRail(modus === 'alles' ? null : perGen);
    state.getekend = { term: state.term, limiet: state.limiet, lijnen: Array.from(state.lijnen).join(), statussen: Array.from(state.statussen).join() };

    if (opties && opties.focusNr != null) { // after "Show more": focus on the first new row, even if its block is still empty
      const b = blokken.find(x => x.items.some(t => t.e.n === opties.focusNr)); if (b) vul(b);
      const a = lijstEl.querySelector(`.rij[data-n="${opties.focusNr}"]`);
      if (a) a.focus();
    }
  }
  const moetTekenen = () => !state.getekend || state.getekend.term !== state.term || state.getekend.limiet !== state.limiet ||
    state.getekend.lijnen !== Array.from(state.lijnen).join() || state.getekend.statussen !== Array.from(state.statussen).join();

  /* ---------- Rail (generations) ---------- */
  function bouwRail() {
    let h = '';
    for (let g = 1; g <= maxG; g++) {
      h += `<button type="button" data-g="${g}" aria-label="Go to generation ${K.romein(g)}, ${esc(K.generatieNaam(g))}"><span class="getal">${K.romein(g)}</span><span class="reg-rail-aantal" aria-hidden="true">${perGenTotaal.get(g) || 0}</span></button>`;
    }
    railEl.innerHTML = h;
    railEl.addEventListener('click', e => { const b = e.target.closest('button[data-g]'); if (b && !b.disabled) spring(+b.dataset.g); });
  }
  function bijwerkRail(perGen) {
    railEl.querySelectorAll('button[data-g]').forEach(b => {
      const g = +b.dataset.g, n = perGen ? (perGen.get(g) || []).length : (perGenTotaal.get(g) || 0);
      b.querySelector('.reg-rail-aantal').textContent = n || '';
      b.disabled = !n;
      b.setAttribute('aria-label', `Go to generation ${K.romein(g)}, ${K.generatieNaam(g)}: ${n} ${n === 1 ? 'ancestor' : 'ancestors'}`);
    });
  }
  function spring(g) {
    const sec = lijstEl.querySelector(`.reg-gen[data-g="${g}"]`); if (!sec) return;
    const eerste = blokken.find(b => b.g === g); if (eerste) vul(eerste);
    const rustig = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    sec.scrollIntoView({ block: 'start', behavior: rustig ? 'auto' : 'smooth' });
    const kop = sec.querySelector('h2'); if (kop) kop.focus({ preventScroll: true });
  }

  /* ---------- Search field and route ---------- */
  function hashVoor(term) { return K.hash({ weergave: 'register', params: term ? { zoek: term } : {} }); }
  // One search is one step in the history: the first letter (or a search term from another view) calls
  // ga(), every later letter calls vervang(). So the back button goes back in one step, not letter by letter.
  function zetTerm(term) {
    const oud = state.term.trim(), nieuw = term.trim();
    state.term = term; state.limiet = CAP;
    const h = hashVoor(nieuw ? term : '');
    if (K.route().weergave !== 'register' || (!oud && nieuw)) K.ga(h); else K.vervang(h);
  }
  function zetVelden(term) { // only set when it really differs, otherwise the cursor jumps
    if (veld && veld.value.trim() !== term.trim()) veld.value = term;
    if (zijVeld && zijVeld.value.trim() !== term.trim()) zijVeld.value = term;
  }

  /* ---------- Filters ---------- */
  function leesFilters() {
    try {
      const o = JSON.parse(sessionStorage.getItem(OPSLAG) || 'null');
      if (o) { (o.l || []).forEach(l => { if (LIJNEN.includes(+l)) state.lijnen.add(+l); }); (o.s || []).forEach(s => { if (STATUSSEN.includes(s)) state.statussen.add(s); }); }
    } catch (e) { /* it works without storage too */ }
  }
  function bewaarFilters() {
    try { sessionStorage.setItem(OPSLAG, JSON.stringify({ l: Array.from(state.lijnen), s: Array.from(state.statussen) })); } catch (e) { /* */ }
  }
  function chipTekst() {
    const l = state.lijnen.size, s = state.statussen.size;
    chipLijn.querySelector('.reg-chip-tekst').textContent = !l ? 'All four lines' : l === 1 ? 'Via ' + K.LIJNEN[Array.from(state.lijnen)[0]].kort : `${l} of the 4 lines`;
    chipStatus.querySelector('.reg-chip-tekst').textContent = !s ? 'Any certainty' : s === 1 ? K.STATUSNAAM[Array.from(state.statussen)[0]] : `${s} of the 4 certainty levels`;
    wortel.querySelectorAll('.reg-optie[data-lijn]').forEach(b => b.setAttribute('aria-pressed', String(state.lijnen.has(+b.dataset.lijn))));
    wortel.querySelectorAll('.reg-optie[data-status]').forEach(b => b.setAttribute('aria-pressed', String(state.statussen.has(b.dataset.status))));
  }
  function filtersGewijzigd() { state.limiet = CAP; chipTekst(); bewaarFilters(); render(); }
  function toonKeuze(naam, aan) {
    const chip = wortel.querySelector('.reg-chip-' + naam), paneel = wortel.querySelector('#reg-keuze-' + naam);
    if (!chip || !paneel) return;
    const open = aan === undefined ? paneel.hidden : !!aan;
    if (open) { // never two at once
      ['lijn', 'status'].forEach(a => { if (a !== naam) toonKeuze(a, false); });
    }
    paneel.hidden = !open; chip.setAttribute('aria-expanded', String(open));
    state.open = open ? naam : null;
    if (open) { const eerste = paneel.querySelector('button'); if (eerste) eerste.focus(); }
  }
  function keuzeHtml() {
    const t = telling;
    const lijnen = LIJNEN.map(l => `<button type="button" class="reg-optie" data-lijn="${l}" aria-pressed="false"><span class="getal reg-optie-nr" style="color:var(--lijn-${l})">${l}</span><span>${esc(K.LIJNEN[l].lang)}</span><span class="reg-optie-aantal">${t.perLijn[l]}</span></button>`).join('');
    const statussen = STATUSSEN.map(s => `<button type="button" class="reg-optie" data-status="${s}" aria-pressed="false"><span class="status">${K.statusIcoon(s, 18)}</span><span>${K.STATUSNAAM[s]}</span><span class="reg-optie-aantal">${t.perStatus[s]}</span></button>`).join('');
    return `<div class="reg-filters">` +
      `<div class="reg-filter"><button type="button" class="reg-chip reg-chip-lijn" aria-expanded="false" aria-controls="reg-keuze-lijn"><span class="reg-chip-tekst">All four lines</span>${CHEVRON}</button>` +
      `<div class="reg-keuze" id="reg-keuze-lijn" role="group" aria-labelledby="reg-keuze-lijn-kop" hidden><p class="reg-keuze-kop" id="reg-keuze-lijn-kop">Via which grandparent</p>${lijnen}<button type="button" class="knop-stil reg-keuze-wis" data-wis="lijn">All four lines</button></div></div>` +
      `<div class="reg-filter"><button type="button" class="reg-chip reg-chip-status" aria-expanded="false" aria-controls="reg-keuze-status"><span class="reg-chip-tekst">Any certainty</span>${CHEVRON}</button>` +
      `<div class="reg-keuze" id="reg-keuze-status" role="group" aria-labelledby="reg-keuze-status-kop" hidden><p class="reg-keuze-kop" id="reg-keuze-status-kop">How certain</p>${statussen}<button type="button" class="knop-stil reg-keuze-wis" data-wis="status">Any certainty</button></div></div>` +
      `</div>`;
  }

  /* ---------- Mounting ---------- */
  function bouwFrame(el) {
    el.innerHTML = `<div class="reg-kop"><div class="reg-titel"><h1 class="naam">Register</h1><p class="bijtekst">${nl(totaal)} ${totaal === 1 ? 'ancestor' : 'ancestors'} in ${maxG} ${maxG === 1 ? 'generation' : 'generations'}, in Ahnentafel order</p></div>` +
      `<div class="reg-werkbalk"><form class="reg-zoek" role="search"><label for="reg-q" class="onzichtbaar">Search for an ancestor</label><span class="reg-zoek-icoon" aria-hidden="true">${ZOEK}</span>` +
      `<input id="reg-q" type="search" placeholder="Name, place or number" autocomplete="off" spellcheck="false" enterkeyhint="search"></form>${keuzeHtml()}</div></div>` +
      `<div class="reg-statusrij reg-statusrij-leeg" id="reg-statusrij"><p class="reg-status" id="reg-status" role="status" aria-live="polite"></p>` +
      `<a class="reg-wis" id="reg-wis" href="#register" hidden>${WIS}<span class="reg-wis-kort">Clear</span><span class="reg-wis-lang">Clear the search</span></a></div>` +
      `<div class="reg-lijf"><div class="reg-lijst" id="reg-lijst"></div><nav class="reg-rail" id="reg-rail" aria-label="Jump to a generation"></nav></div>`;
    lijstEl = el.querySelector('#reg-lijst'); railEl = el.querySelector('#reg-rail');
    statusRij = el.querySelector('#reg-statusrij'); statusEl = el.querySelector('#reg-status'); wisEl = el.querySelector('#reg-wis');
    veld = el.querySelector('#reg-q');
    chipLijn = el.querySelector('.reg-chip-lijn'); chipStatus = el.querySelector('.reg-chip-status');
  }
  function bind(el) {
    veld.addEventListener('input', () => zetTerm(veld.value));
    veld.closest('form').addEventListener('submit', e => {
      e.preventDefault();
      const num = nummerTerm(veld.value);
      if (num && K.P.has(+num)) { K.openPersoon(+num); return; }
      const eerste = lijstEl.querySelector('.rij'); if (eerste) eerste.focus();
    });

    el.addEventListener('click', e => {
      const chip = e.target.closest('.reg-chip');
      if (chip) { toonKeuze(chip.classList.contains('reg-chip-lijn') ? 'lijn' : 'status'); return; }
      const optie = e.target.closest('.reg-optie');
      if (optie) {
        if (optie.dataset.lijn) { const l = +optie.dataset.lijn; if (state.lijnen.has(l)) state.lijnen.delete(l); else state.lijnen.add(l); }
        else { const s = optie.dataset.status; if (state.statussen.has(s)) state.statussen.delete(s); else state.statussen.add(s); }
        filtersGewijzigd(); return;
      }
      const wis = e.target.closest('.reg-keuze-wis');
      if (wis) { (wis.dataset.wis === 'lijn' ? state.lijnen : state.statussen).clear(); filtersGewijzigd(); toonKeuze(wis.dataset.wis, false); wortel.querySelector('.reg-chip-' + wis.dataset.wis).focus(); return; }
      const uit = e.target.closest('.reg-filters-uit');
      if (uit) { state.lijnen.clear(); state.statussen.clear(); filtersGewijzigd(); veld.focus(); return; }
      const meer = e.target.closest('#reg-meer');
      if (meer) { const volgende = state.limiet; state.limiet += CAP; const lijst = zoekLijst(state.term); render({ focusNr: lijst[volgende] ? lijst[volgende].e.n : null }); return; }
      if (state.open && !e.target.closest('.reg-filter')) toonKeuze(state.open, false);
    });
    document.addEventListener('click', e => { if (state.open && wortel && !wortel.contains(e.target)) toonKeuze(state.open, false); });
    el.addEventListener('keydown', e => {
      if (e.key === 'Escape' && state.open) { const naam = state.open; toonKeuze(naam, false); wortel.querySelector('.reg-chip-' + naam).focus(); e.stopPropagation(); e.preventDefault(); }
    });
    el.addEventListener('focusout', e => {
      if (state.open && e.relatedTarget && !e.relatedTarget.closest('.reg-filter')) toonKeuze(state.open, false);
    });
  }

  // The search field in the sidebar (laptop) belongs to the register, even when the register is not mounted yet:
  // typing there takes you to #register/<term>. Bound at load time; the element is already in the DOM then.
  zijVeld = document.getElementById('zoek-q');
  if (zijVeld) zijVeld.addEventListener('input', () => zetTerm(zijVeld.value));

  K.registreer('register', {
    monteer(el, params) {
      wortel = el;
      bouwAlle(); telling = K.tel(); leesFilters();
      bouwFrame(el); bouwRail(); bind(el); chipTekst();
      state.term = (params && params.zoek) || '';
      zetVelden(state.term);
      render();
      // Build the search index early, as soon as the browser is idle.
      const idle = window.requestIdleCallback || (f => setTimeout(f, 300));
      idle(() => bouwIndex());
    },
    bijwerk(params) {
      const term = (params && params.zoek) || '';
      if (term !== state.term) { state.term = term; state.limiet = CAP; }
      zetVelden(state.term);
      if (moetTekenen()) render();
    },
    verlaat() {
      if (state.open) toonKeuze(state.open, false);
      if (zijVeld && zijVeld.value) zijVeld.value = ''; // the sidebar field belongs to the register; elsewhere it is empty
    },
  });
})();

