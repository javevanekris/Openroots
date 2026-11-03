// weergaven/persoon/persoon.js
// ui/weergaven/persoon/persoon.js: the person card. Phone: bottom sheet; tablet: side panel over the content; laptop: right-hand panel.
// Route #persoon/<n>; opened via kern.openPersoon(n). The content for each person comes verbatim from the data; only the presentation is new.
(function () {
  const K = window.kern, esc = K.esc;
  const wortel = () => document.getElementById('persoon');
  const inhoud = () => document.getElementById('persoon-inhoud');
  let huidigN = null, vorigeFocus = null, vorigeN = null, gebonden = false;

  const CHEVRON = '<svg class="sectie-pijl" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  const man = n => n % 2 === 0 || n === 1;
  const hv = n => (man(n) ? 'him' : 'her');
  const zh = n => (man(n) ? 'His' : 'Her');
  const getal = (n, kleur) => `<span class="getal" style="color:${kleur}">${n}</span>`;
  const RE_JAAR = /\b(1[2-9]\d\d|20\d\d)\b/;
  const RE_DATUM = /\b(\d{1,2})-(\d{1,2})-(1[2-9]\d\d|20\d\d)\b/;

  /* ---------- Records: by date, the same URL only once ---------- */
  function datumSleutel(label) {
    const d = label.match(RE_DATUM); if (d) return +d[3] * 10000 + +d[2] * 100 + +d[1];
    const j = label.match(RE_JAAR); if (j) return +j[1] * 10000;
    return null;
  }
  function labelScore(label) {
    const s = RE_DATUM.test(label) ? 3 : RE_JAAR.test(label) ? 2 : 1;
    return s * 1000 + (label.startsWith('[') ? 0 : 500) + Math.min(label.length, 400);
  }
  function aktenVan(n) {
    const lijst = K.AKTE.get(n) || [];
    const perUrl = new Map();
    lijst.forEach(([label, url], i) => {
      const b = perUrl.get(url);
      if (!b || labelScore(label) > labelScore(b.label)) perUrl.set(url, { label, url, i: b ? b.i : i });
    });
    const uit = Array.from(perUrl.values()).map(a => ({ ...a, sleutel: datumSleutel(a.label) }));
    const met = uit.filter(a => a.sleutel != null).sort((a, b) => a.sleutel - b.sleutel || a.i - b.i);
    const zonder = uit.filter(a => a.sleutel == null).sort((a, b) => a.i - b.i);
    return met.concat(zonder);
  }
  const labelHtml = label => esc(label).replace(/^(\[[^\]]+\])\s*/, '<span class="intern">$1</span> ');
  const jaarVan = sleutel => (sleutel != null ? String(Math.floor(sleutel / 10000)) : '');

  /* ---------- Evidence strip ---------- */
  function bewijs(n) {
    const vl = K.status(n), akten = aktenVan(n);
    const oa = akten.filter(a => /openarchieven\.nl/.test(a.url)).length, anders = akten.length - oa;
    const telt = akten.length ? (oa && anders ? `${oa} ${oa === 1 ? 'record' : 'records'} in Open Archives and ${anders} other ${anders === 1 ? 'source names' : 'sources name'} ${hv(n)}.` : oa ? `${oa} ${oa === 1 ? 'record' : 'records'} in Open Archives ${oa === 1 ? 'names' : 'name'} ${hv(n)}.` : `${anders} ${anders === 1 ? 'source names' : 'sources name'} ${hv(n)}.`) : ''; // i18n: grammar, "1 record" / "N records" agreement
    if (!vl.length) {
      const fam = ((K.CFG && K.CFG.confirmedByOwner) || []).includes(n) ? ' The records of these generations are not yet public; the details come from the family itself.' : ''; // config: was n <= 7, now the numbers the owner confirms (CFG.confirmedByOwner)
      return `<div class="bewijs" data-status="geen"><span><b>No record.</b>${fam}${telt ? ' ' + telt : ''}</span></div>`;
    }
    return vl.map(v => {
      if (v === 'akte' && K.familieBevestigd(n)) {
        const extra = akten.length ? ' ' + telt : ' The records of this generation are not yet public.';
        return `<div class="bewijs" data-status="akte"><span class="status">${K.statusIcoon(v, 18)}</span><span><b>Confirmed by ${esc((K.CFG && K.CFG.owner) || 'the owner')}.</b> Immediate family.${extra}</span></div>`; // config: owner name from kern.CFG, was hard-coded
      }
      const uitleg = K.STATUSUITLEG[v] ? ' ' + K.STATUSUITLEG[v] : '';
      return `<div class="bewijs" data-status="${v}"><span class="status">${K.statusIcoon(v, 18)}</span><span><b>${K.STATUSNAAM[v]}.</b>${uitleg}${telt ? ' ' + telt : ''}</span></div>`;
    }).join('');
  }

  /* ---------- Life course ---------- */
  const hoofdletter = s => s.charAt(0).toUpperCase() + s.slice(1);
  // The qualifier from the source stays verbatim: an adverb before the verb ("Probably buried …"),
  // a noun after it ("Baptised … (candidate)"); a question mark in the source becomes "(uncertain)".
  function kop(soortWoord, ev) {
    if (ev.kwalificatie && /^(probably|presumably|possibly)$/.test(ev.kwalificatie)) return { kop: hoofdletter(ev.kwalificatie) + ' ' + soortWoord.toLowerCase(), staart: '' }; // i18n: English qualifier words
    if (ev.kwalificatie) return { kop: soortWoord, staart: ' (' + esc(ev.kwalificatie) + ')' };
    return { kop: soortWoord, staart: ev.onzeker ? ' (uncertain)' : '' };
  }
  function zin(soortWoord, ev, extra) {
    if (!ev) return '';
    const w = K.wanneer(ev, true), k = kop(soortWoord, ev);
    let z;
    if (ev.jaar == null) z = k.kop + (ev.plaats ? ' in ' + esc(ev.plaats) : '') + k.staart + (ev.rest ? (ev.plaats || k.staart ? ' · ' : ': ') + esc(ev.rest) : '');
    else {
      z = k.kop + (w ? ' ' + w : '') + (ev.plaats ? ' in ' + esc(ev.plaats) : '');
      // Only a year: that is already in the column before it. Then as in the design:
      // "Born, place unknown", or just the verb if something else follows.
      const kaal = !w && !ev.plaats;
      z += k.staart;
      if (extra) z += extra;
      if (ev.rest) z += ` <span class="rest">· ${esc(ev.rest)}</span>`;
      else if (kaal && !k.staart && !extra) z += ', place unknown';
    }
    return z;
  }
  const jaarTekst = ev => K.jaarTekst(ev);
  const WOORD = { geboren: 'Born', gedoopt: 'Baptised', overleden: 'Died', begraven: 'Buried' };
  function levensloop(n) {
    const l = K.leven(n), rijen = [];
    const sleutel = (ev, soort) => (ev.jaar != null ? ev.jaar : soort === 'geboren' ? -1e9 : soort === 'overleden' ? 1e9 : 0);
    if (l.geboren) rijen.push({ k: sleutel(l.geboren, 'geboren'), jaar: jaarTekst(l.geboren), dd: zin(WOORD[l.geboren.soort] || 'Born', l.geboren) });
    (l.overige || []).forEach(ev => rijen.push({ k: sleutel(ev, ev.soort === 'begraven' ? 'overleden' : 'geboren') + 0.5, jaar: jaarTekst(ev), dd: zin(WOORD[ev.soort] || ev.soort, ev) }));
    if (l.huwelijk) {
      const h = l.huwelijk, woord = h.soort === 'ondertrouw' ? 'Marriage banns' : 'Married';
      // Without a year the marriage comes after the birth (and before the death), not above it.
      const naGeboorte = l.geboren && l.geboren.jaar != null ? l.geboren.jaar + 0.5 : 0;
      if (h.meervoudig) {
        // "1) before 1716 Anna Example; 2) …": verbatim, with no year in the column and without the partner from P in front,
        // because the first year and the first name often belong to another spouse. The partner link is in the family card.
        rijen.push({ k: h.jaarHint ? h.jaarHint + 0.25 : naGeboorte, jaar: '', dd: `${woord} <span class="rest">· ${esc(h.rest)}</span>` });
      } else {
        const met = h.partner ? ` to <a href="#persoon/${h.partnerNr}" data-n="${h.partnerNr}">${esc(h.partner)}</a>` : '';
        rijen.push({ k: h.jaar != null ? sleutel(h, 'huwelijk') : naGeboorte, jaar: jaarTekst(h), dd: h.jaar == null ? `${woord}${met}${h.rest ? ` <span class="rest">· ${esc(h.rest)}</span>` : ''}` : zin(woord, h, met) });
      }
    }
    if (l.overleden) {
      const lt = K.leeftijd(n);
      rijen.push({ k: sleutel(l.overleden, 'overleden'), jaar: jaarTekst(l.overleden), dd: zin(WOORD[l.overleden.soort] || 'Died', l.overleden, lt != null ? `, aged ${lt}` : '') });
    }
    rijen.sort((a, b) => a.k - b.k);
    let html = rijen.map(r => `<div><dt class="getal">${r.jaar || '<span class="onzichtbaar">no year</span>'}</dt><dd>${r.dd}</dd></div>`).join('');
    const geenJaar = !(l.geboren && l.geboren.jaar != null) && !(l.overleden && l.overleden.jaar != null);
    // The estimate says something about the lifespan, not about evidence; "no record" does not belong here (some people do have records).
    if (geenJaar && l.schatting) html += `<div><dt class="getal"><span class="onzichtbaar">estimate</span></dt><dd>Estimate ${esc(l.schatting.tekst)}, calculated from partner, child and parents</dd></div>`;
    // "Originally from Exampleville", "Lived in Exampleville": verbatim, with the verb. Not when an event already carries it ("° originally from …").
    if (l.herkomst && !l.herkomstBij) html += `<div><dt class="getal"><span class="onzichtbaar">no year</span></dt><dd>${esc(hoofdletter(l.herkomst))}</dd></div>`;
    if (l.beroep) html += `<div><dt class="label">Occupation</dt><dd>${esc(l.beroep)}</dd></div>`;
    return html ? `<dl class="levensloop">${html}</dl>` : '';
  }

  /* ---------- Story ---------- */
  // No lookbehind: older Safari (< 16.4) would otherwise reject the whole bundled script.
  function zinnen(t) { return t.replace(/([.!?])\s+(?=[A-ZÀ-Ý“"‘(])/g, '$1\u0001').split('\u0001'); }
  function verhaal(n) {
    const v = K.VERHAAL.get(n); if (!v) return '';
    const z = zinnen(v);
    const kort = K.isTelefoon() && z.length > 3; // phone: three sentences, as in the design
    return `<h2 class="kaart-h2">${zh(n)} story</h2><p class="verhaal naam-serif" data-verhaal="${n}">${esc(kort ? z.slice(0, 3).join(' ') : v)}</p>${kort ? `<button type="button" class="knop-stil lees-verhaal" data-lees="${n}">Read the whole story</button>` : ''}`;
  }

  /* ---------- Family ---------- */
  const PERSOON_ICO = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>';
  function famKaart(label, m, kleurVan) {
    if (m == null) return '';
    if (!K.P.has(m)) return `<div class="fam-kaart fam-leeg" data-n="${m}"><span class="fam-label">${label}</span><span class="fam-naam">not yet found</span><span class="fam-meta">${getal(m, kleurVan(m))}</span></div>`;
    const vl = K.status(m);
    return `<a class="fam-kaart" href="#persoon/${m}" data-n="${m}" data-status="${vl.join(' ')}"><span class="fam-label">${label}</span><span class="fam-naam${vl.includes('nietbevestigd') ? ' naam-nb' : ''}">${esc(K.P.get(m)[0])}</span><span class="fam-meta">${getal(m, kleurVan(m))}&#160;&#160;${esc(K.jaren(m))}</span></a>`;
  }
  function familie(n) {
    const [v, m] = [2 * n, 2 * n + 1];
    const kleur = K.lijnKleur;
    // Both parents unknown: not two empty cards, but one quiet line after partner and child (as in the design).
    const beideOpen = !K.P.has(v) && !K.P.has(m);
    let h = beideOpen ? '' : famKaart('Father', v, kleur) + famKaart('Mother', m, kleur);
    if (n > 1) h += famKaart('Partner', K.partner(n), kleur) + famKaart('Child in this line', K.kind(n), kleur);
    if (beideOpen) h += `<div class="fam-kaart fam-leeg fam-ouders">${PERSOON_ICO}<span>Parents not yet found (No. ${v} and ${m}). Open end.</span></div>`;
    return `<h2 class="kaart-h2 kaart-h2-familie">Family</h2><div class="familie">${h}</div>`;
  }

  /* ---------- Sections ---------- */
  function sectieEl(id, titel, aantal, open, vul) {
    const s = document.createElement('section'); s.className = 'sectie'; s.dataset.sectie = id;
    const sid = 'sectie-' + id + '-' + huidigN;
    s.innerHTML = `<h2 class="sectie-kop"><button type="button" aria-expanded="${open ? 'true' : 'false'}" aria-controls="${sid}"><span class="sectie-titel">${esc(titel)}${aantal != null ? ` <span class="sectie-aantal">${aantal}</span>` : ''}</span>${CHEVRON}</button></h2><div class="sectie-inhoud" id="${sid}"${open ? '' : ' hidden'}></div>`;
    const doel = s.querySelector('.sectie-inhoud');
    let gevuld = false;
    const vulNu = () => { if (gevuld) return; gevuld = true; const r = vul(); if (typeof r === 'string') doel.innerHTML = r; else if (r) doel.appendChild(r); };
    if (open) vulNu();
    s.querySelector('button').addEventListener('click', e => {
      const b = e.currentTarget, uit = b.getAttribute('aria-expanded') === 'true';
      b.setAttribute('aria-expanded', String(!uit)); doel.hidden = uit;
      if (!uit) vulNu();
    });
    return s;
  }
  function fotos(n) {
    const f = K.FOTO.get(n); if (!f || !f.length) return null;
    return () => {
      const d = document.createElement('div'); d.className = 'fotos';
      f.forEach(([src, bijschrift]) => {
        const fig = document.createElement('figure');
        const img = document.createElement('img'); img.loading = 'lazy'; img.decoding = 'async'; img.alt = bijschrift || '';
        img.addEventListener('load', () => { if (img.naturalWidth && img.naturalWidth * 2 < d.clientWidth) img.style.width = img.naturalWidth * 2 + 'px'; }, { once: true });
        img.src = src;
        const cap = document.createElement('figcaption'); cap.textContent = bijschrift || '';
        fig.appendChild(img); fig.appendChild(cap); d.appendChild(fig);
      });
      return d;
    };
  }
  function secties(n) {
    const frag = document.createDocumentFragment(), open = !K.isTelefoon();
    for (const s of K.secties.lijst(n)) {
      let r = null; try { r = s.render(n); } catch (e) { console.error('section ' + s.id, e); }
      if (!r) continue;
      const aantal = typeof s.aantal === 'function' ? s.aantal(n) : s.aantal;
      frag.appendChild(sectieEl(s.id, typeof s.titel === 'function' ? s.titel(n) : s.titel, aantal, open && s.openOpLaptop !== false, () => r));
    }
    const f = fotos(n);
    if (f) frag.appendChild(sectieEl('fotos', 'Photos', K.FOTO.get(n).length, open, f));
    const sig = K.SIG.get(n);
    if (sig) frag.appendChild(sectieEl('signalement', 'Physical description from the military register', null, open, () => `<p class="sig">${esc(sig[0])}${sig[2] ? ` <a href="${esc(sig[2])}" target="_blank" rel="noopener">${esc(sig[1] || 'source')}</a>` : ''}</p>`));
    const krant = K.KRANT.get(n);
    if (krant && krant.length) {
      const gezien = new Set(), items = krant.filter(([, u]) => !gezien.has(u) && gezien.add(u));
      frag.appendChild(sectieEl('krant', 'Newspaper notices', items.length, open, () => `<ul class="bronlijst">${items.map(([l, u]) => `<li><span class="getal jaar">${jaarVan(datumSleutel(l))}</span><a href="${esc(u)}" target="_blank" rel="noopener">${labelHtml(l)}</a></li>`).join('')}</ul>`));
    }
    // Everyone has this section, including No. 1: with no source letters and no records it reads, as in the original, "Family report".
    const akten = aktenVan(n), src = K.SRC.get(n);
    {
      const letters = (src || '').split('·').map(x => x.trim()).filter(Boolean);
      const aantal = akten.length || (letters.length || null);
      frag.appendChild(sectieEl('akten', 'Records and sources', aantal, open, () => {
        let h = akten.length ? `<ul class="bronlijst">${akten.map(a => `<li><span class="getal jaar">${jaarVan(a.sleutel)}</span><a href="${esc(a.url)}" target="_blank" rel="noopener">${labelHtml(a.label)}</a></li>`).join('')}</ul>` : '';
        const bron = letters.length ? letters.map(x => { const vb = x.endsWith('?'), l = x.replace('?', ''); return `<li><b>${esc(l)}</b>${vb ? ' <span class="rest">(with reservation)</span>' : ''} · ${esc(K.BRON.get(l) || '')}</li>`; }).join('') : '<li>Family report</li>';
        h += `<p class="bron-kop">Sources</p><ul class="bronnen">${bron}</ul>`;
        return h;
      }));
    }
    const note = K.NOTE.get(n);
    if (note) frag.appendChild(sectieEl('notitie', 'Research note', null, open, () => `<p class="notitie">${esc(note)}</p>`));
    // "On the map" comes from the map module (section 'plaatsen', also "Show this side on the map" for No. 4 to 7 via #kaart/lijn-<n>).
    return frag;
  }

  /* ---------- Building the card ---------- */
  function kopregel(n) {
    const lijn = document.getElementById('persoon-lijn');
    lijn.innerHTML = `<span class="lijnvlak" style="--lijnkleur:${K.lijnKleur(n)}"></span>${esc(K.lijnLabel(n))}`;
  }
  function titel(n, naam, nb) {
    const g = K.generatie(n);
    const rel = n === 1 ? 'the owner' : K.relatie(n);
    const cijfers = String(n).length, nrKlas = cijfers >= 7 ? ' nr-zeer-lang' : cijfers >= 5 ? ' nr-lang' : '';
    return `<div class="persoon-titel"><span class="persoon-nr getal${nrKlas}" style="color:${K.lijnKleur(n)}">${n}</span><div><h1 id="persoon-naam" class="naam${nb ? ' naam-nb' : ''}">${esc(naam)}</h1><p class="bijtekst">Generation ${K.romein(g)}, ${esc(rel)}</p></div></div>`;
  }
  function render(n) {
    const w = wortel(), doel = inhoud();
    w.dataset.n = n;
    kopregel(n);
    const p = K.P.get(n);
    if (!p) {
      w.dataset.status = '';
      w.setAttribute('aria-label', 'Not yet found, No. ' + n);
      let h = titel(n, 'Not yet found', false);
      h += `<div class="bewijsstrook"><div class="bewijs" data-status="geen"><span><b>Open end.</b> ${n > 1 ? `This ancestor has not been found yet. The number is fixed: ${n % 2 === 0 ? 'father' : 'mother'} of No. ${K.kind(n)}.` : 'This chart has no data yet.'}</span></div></div>`; // i18n: empty-data guard, No. 1 has no child number
      h += `<h2 class="kaart-h2 kaart-h2-familie">Family</h2><div class="familie">${famKaart('Partner', K.partner(n), K.lijnKleur)}${famKaart('Child in this line', K.kind(n), K.lijnKleur)}</div>`;
      doel.innerHTML = h;
      return;
    }
    const vl = K.status(n);
    w.dataset.status = vl.join(' ');
    w.setAttribute('aria-label', 'Person card of ' + p[0]);
    let h = titel(n, p[0], vl.includes('nietbevestigd'));
    h += `<div class="bewijsstrook">${bewijs(n)}</div>`;
    h += levensloop(n);
    h += verhaal(n);
    h += familie(n);
    doel.innerHTML = h;
    const sec = document.createElement('div'); sec.className = 'secties'; sec.appendChild(secties(n));
    doel.appendChild(sec);
  }

  /* ---------- Opening, closing, behaviour ---------- */
  function open(n) {
    const w = wortel(), eerste = w.hidden || huidigN == null;
    if (eerste) { vorigeFocus = document.activeElement; vorigeN = vorigeFocus && vorigeFocus.closest ? (vorigeFocus.closest('[data-n]') || {}).dataset : null; vorigeN = vorigeN ? vorigeN.n : null; }
    huidigN = n;
    K.schuif(w, true, { direct: K.isLaptop() });
    w.setAttribute('aria-modal', K.isLaptop() ? 'false' : 'true');
    render(n);
    inhoud().scrollTop = 0;
    if (!K.isLaptop()) K.scherm(true);
    if (eerste || !K.isLaptop()) w.focus({ preventScroll: true });
  }
  function sluit() {
    const w = wortel();
    huidigN = null; delete w.dataset.n; delete w.dataset.status;
    K.scherm(false);
    K.schuif(w, false, { direct: K.isLaptop(), klaar: () => { if (huidigN == null) inhoud().innerHTML = ''; } });
    const terug = vorigeFocus, terugN = vorigeN; vorigeFocus = null; vorigeN = null;
    const herstel = () => {
      if (K.persoonOpen()) return; // meanwhile a new card has been opened
      let el = terug && terug.focus && document.contains(terug) && terug.offsetParent !== null ? terug : null;
      // The main view often rebuilds itself on closing; then look up the row by number.
      if (!el && terugN != null) el = document.querySelector(`#hoofd a.rij[data-n="${terugN}"], #hoofd a[data-n="${terugN}"], #hoofd [data-n="${terugN}"][tabindex]`);
      if (el && !el.closest('[inert]')) el.focus({ preventScroll: true });
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(herstel)); else setTimeout(herstel, 0);
  }
  function bind() {
    if (gebonden) return; gebonden = true;
    document.getElementById('persoon-sluit').addEventListener('click', () => K.sluitPersoon());
    inhoud().addEventListener('click', e => {
      const b = e.target.closest('button[data-lees]');
      if (b) { const n = +b.dataset.lees, p = inhoud().querySelector(`[data-verhaal="${n}"]`); if (p) p.textContent = K.VERHAAL.get(n) || ''; b.remove(); }
    });
    // Drag handle on the phone: dragging down closes the sheet.
    // The drag zone is the handle (28 px high, full width) plus the header; touch-action:none in the CSS keeps the browser's pan gesture away.
    const w = wortel();
    let start = null, id = null, sleept = false, tPrev = 0, yPrev = 0, snelheid = 0;
    const DREMPEL = 6, SLUIT_AFSTAND = 120, SLUIT_SNELHEID = 0.5; // px, px, px per ms
    // Dragging up is possible a little, with rising resistance (max 12 px); downwards the sheet follows the finger one to one.
    const demp = dy => (dy >= 0 ? dy : -12 * (1 - Math.exp(dy / 60)));
    const reset = () => { start = null; id = null; sleept = false; snelheid = 0; w.classList.remove('sleept'); };
    const beweeg = e => {
      if (start == null || e.pointerId !== id) return;
      const dy = e.clientY - start;
      if (!sleept) { // only after a few pixels: a tap on Close stays a tap
        if (Math.abs(dy) < DREMPEL) return;
        sleept = true; w.classList.add('sleept');
        try { e.currentTarget.setPointerCapture(e.pointerId); } catch (x) { /* */ }
      }
      const nu = performance.now(), dt = nu - tPrev;
      if (dt > 0) snelheid = 0.6 * snelheid + 0.4 * ((e.clientY - yPrev) / dt);
      tPrev = nu; yPrev = e.clientY;
      w.style.transform = `translateY(${demp(dy)}px)`;
    };
    const klaar = e => {
      if (start == null || e.pointerId !== id) return;
      const dy = e.clientY - start, was = sleept, v = performance.now() - tPrev > 80 ? 0 : snelheid; // held still = no flick
      reset();
      if (!was) return;
      if (dy > SLUIT_AFSTAND || (dy > 24 && v > SLUIT_SNELHEID)) { // far enough, or a flick
        const rest = Math.max(0, w.offsetHeight - dy), duur = v > 0 ? Math.min(220, Math.max(120, rest / v)) : 0;
        w.style.transitionDuration = duur ? duur + 'ms' : '';   // the finger's speed carries on into the closing motion
        K.sluitPersoon();
        setTimeout(() => { if (K.persoonOpen()) { w.style.transform = ''; w.style.transitionDuration = ''; } }, 600); // closing failed: back
      } else w.style.transform = ''; // spring back; the transition is on again now that .sleept is gone
    };
    const annuleer = e => { if (id !== e.pointerId) return; reset(); w.style.transform = ''; };
    for (const zone of [document.getElementById('persoon-greep'), w.querySelector('.persoon-kop')]) {
      if (!zone) continue;
      zone.addEventListener('pointerdown', e => {
        if (start != null || !K.isTelefoon() || e.button !== 0) return; // ignore a second finger
        start = yPrev = e.clientY; id = e.pointerId; tPrev = performance.now(); snelheid = 0;
      });
      zone.addEventListener('pointermove', beweeg); zone.addEventListener('pointerup', klaar);
      zone.addEventListener('pointercancel', annuleer); zone.addEventListener('lostpointercapture', annuleer);
    }
  }

  K.registreer('persoon', {
    monteer(el, params) { bind(); open(params.n); },
    bijwerk(params) { open(params.n); },
    verlaat() { sluit(); },
  });
})();

