// weergaven/boom/boom.js 
// ui/weergaven/boom/boom.js: the Tree view (routes #boom and #boom/<n>) as a real pedigree diagram.
// Design: the design mock-ups for the Tree view.
// Phone (< 760 px): portrait. The trunk (the focus person) is at the bottom as a block with the "Person card" button; parents and
// grandparents are branches above it, with forks in between. Tablet and laptop: landscape, the trunk on the left, the branches to the right;
// four generations (tablet, and the laptop with the person card open) or five (laptop, 31 places). Each name sits on its
// own branch; the line under the name runs on until the hook to their parents.
// A name opens the person card (#persoon/<n>); the arrow at the end of an outer branch makes that person the new
// trunk (#boom/<n>). Places are calculated, not measured: landscape y = Y0 + (i + ½) · H / 2^d.
// At most 1 + 2 + 4 + 8 + 16 = 31 people are in the DOM per focus; never the whole tree. Only window.kern as entry point.
(function () {
  const K = window.kern, esc = K.esc;
  const MAX_N = 0x7fffffff;           // kern.generatie works with 32 bits; above that a number is no longer an Ahnentafel number
  const RICHTING_SLEUTEL = 'kw-boom-richting';
  const HINT_SLEUTEL = 'kw-boom-hint';
  let wortel = null, huidigN = null, gebouwd = '', omgekeerd = false, hintTonen = true, wachtOpMaat = 0;

  /* ---------- Iconen ---------- */
  const KAARTJE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M14 10h4M14 13.5h4M6 16.5h6"/></svg>';
  const pijl = (richting, maat) => {
    const d = { op: 'm6 14.5 6-6 6 6', rechts: 'm9.5 6 6 6-6 6', links: 'm14.5 6-6 6 6 6' }[richting];
    return `<svg width="${maat}" height="${maat}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
  };
  const HUIS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 11.5 12 5l8 6.5"/><path d="M6.5 10v9h11v-9"/></svg>';

  /* ---------- Namen ---------- */
  const TITEL = /^(mr|dr|ds|jhr|prof|mgr)\.?$/i;
  // "Anna B.C. (Robin) Example" → "Robin Example": only when before the brackets there are only given names (with a capital)
  // and there is one word between the brackets. "Anna of the Hill (Hillman)" and "Anna Exam(ple)" stay as they are.
  const kortNaam = naam => {
    const m = String(naam || '').match(/^((?:[A-ZÀ-Ý][^\s()]*\s+)+)\(([A-ZÀ-Ý][^\s()]*)\)\s+(.+)$/);
    return m ? m[2] + ' ' + m[3] : String(naam || '');
  };
  const roepnaam = naam => { const w = kortNaam(naam).split(/\s+/).filter(x => x && !TITEL.test(x)); return w[0] || String(naam || ''); };
  const hoofdletter = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

  /* ---------- Hulpjes op personen ---------- */
  const bestaat = n => K.P.has(n);
  const naamVan = n => (K.P.has(n) ? K.P.get(n)[0] : '');
  // config: the short name of the owner (person No. 1) comes from kern.CFG.owner, else from person No. 1 in P.
  const eigenaar = () => (K.CFG && K.CFG.owner ? roepnaam(K.CFG.owner) : '') || roepnaam(naamVan(1)) || 'No. 1';
  const roepVan = n => (n === 1 ? eigenaar() : roepnaam(naamVan(n)));
  const meta = n => [K.jaren(n), K.plaats(n)].filter(Boolean).join(', ');
  const relatie = n => (n === 1 ? 'Person No. 1' : hoofdletter(K.relatie(n))); // config: no owner name hard-coded
  const geldig = n => Number.isInteger(n) && n >= 1 && n <= MAX_N;
  const pad = n => { const uit = []; for (let k = n; k >= 1; k = Math.floor(k / 2)) uit.unshift(k); return uit; };
  const heeftOuders = k => bestaat(2 * k) || bestaat(2 * k + 1);
  // Icon without its own name: the name is already in the aria-label of the link or as text next to it.
  const icoonStil = (v, maat) => K.statusIcoon(v, maat).replace(/ role="img" aria-label="[^"]*"/, ' aria-hidden="true"');
  // Status shape on a branch: unconfirmed has no sign of its own (the name is already grey and italic).
  const vormen = (n, maat) => K.status(n).filter(v => v !== 'nietbevestigd').map(v => icoonStil(v, maat)).join('');
  const statusTekst = n => { const vl = K.status(n); return vl.length ? vl.map(v => K.STATUSNAAM[v]).join(', ') : K.STATUSNAAM.geen; };
  const r1 = v => Math.round(v * 10) / 10;
  // The trunk number gets smaller from five digits (× 0.74) and from seven (× 0.6), like nr-lang and nr-zeer-lang.
  const stamNrMaat = (n, groot) => (n < 1e4 ? groot : n < 1e6 ? Math.round(groot * 0.74) : Math.round(groot * 0.6));

  // Relation to the trunk: "father of Anna", "great-grandmother of Anna". Converts the place to the same place above
  // the owner and then uses kern.relatie, so the words are the same everywhere.
  function relatieTot(k, d, f) {
    const gelijk = (1 << d) + (k - f * (1 << d));
    // i18n: kern.relatie reads "<relation> of <owner>" in English.
    return hoofdletter(K.relatie(gelijk).replace(/ of .*$/, '')) + ' of ' + roepVan(f);
  }
  // Number of known ancestors above k, for the aria-label and title of the arrow. Counted once.
  let telling = null;
  function aantalVoorouders(k) {
    if (!telling) {
      telling = new Map();
      for (const m of K.P.keys()) for (let a = Math.floor(m / 2); a >= 1; a = Math.floor(a / 2)) telling.set(a, (telling.get(a) || 0) + 1);
    }
    return telling.get(k) || 0;
  }
  // niveaus[d] = the 2^d places d generations above the focus; null where the child is already missing (we do not show those places).
  function niveaus(f, diepte) {
    const uit = [[f]];
    for (let d = 1; d < diepte; d++) {
      const rij = [];
      for (const k of uit[d - 1]) { if (k != null && bestaat(k)) rij.push(2 * k, 2 * k + 1); else rij.push(null, null); }
      uit.push(rij);
    }
    return uit;
  }
  const naamTak = (k, d, f) => {
    const m = meta(k);
    return `${k} ${naamVan(k)}${m ? ', ' + m : ''}. ${statusTekst(k)}. ${relatieTot(k, d, f)}. Open the person card`;
  };
  const tipLabels = k => {
    const a = aantalVoorouders(k);
    return `aria-label="${esc(`Climb further: the ancestors of ${naamVan(k)} (${a} known)`)}" title="${esc(`Further: ${a} ancestors of ${roepVan(k)}`)}"`;
  };

  /* ---------- Breadcrumbs ---------- */
  function kruimelsVol(n, maxVol) {
    const lijst = pad(n);
    // Up to maxVol steps in full; above that owner › … › the last three (tablet four, laptop five).
    const tonen = lijst.length > maxVol ? [lijst[0], null].concat(lijst.slice(-3)) : lijst;
    const over = lijst.length - 4;
    const delen = tonen.map((k, i) => {
      if (k == null) return `<span class="kr-rest" title="Generations skipped: ${over}">…<span class="onzichtbaar"> ${over} ${over === 1 ? 'generation' : 'generations'} skipped</span></span>`;
      const t = k === 1 ? eigenaar() : bestaat(k) ? kortNaam(naamVan(k)) : 'No. ' + k;
      if (i === tonen.length - 1) return `<span class="kr-nu" aria-current="page">${esc(t)}</span>`;
      return `<a href="#boom/${k}">${esc(t)}</a>`;
    });
    return `<nav class="kruimels" aria-label="Line back to ${esc(eigenaar())}">${delen.join('<span class="kr-pijl" aria-hidden="true">›</span>')}</nav>`;
  }
  // Phone: the "⌂ owner" button is itself the first step, then at most the last three given names.
  function kruimelsTel(n) {
    if (n === 1) return `<nav class="kruimels" aria-label="Line back to ${esc(eigenaar())}"><span class="kr-nu" aria-current="page">${esc(eigenaar())}</span></nav>`;
    let rest = pad(n).slice(1);
    const delen = [];
    if (rest.length > 3) {
      const over = rest.length - 3;
      delen.push(`<span class="kr-rest" title="Generations skipped: ${over}">…<span class="onzichtbaar"> ${over} ${over === 1 ? 'generation' : 'generations'} skipped</span></span>`);
      rest = rest.slice(-3);
    }
    rest.forEach((k, i) => {
      const t = bestaat(k) ? roepnaam(naamVan(k)) : 'No. ' + k;
      delen.push(i === rest.length - 1 ? `<span class="kr-nu" aria-current="page">${esc(t)}</span>` : `<a href="#boom/${k}">${esc(t)}</a>`);
    });
    const p = '<span class="kr-pijl" aria-hidden="true">›</span>';
    return `<nav class="kruimels" aria-label="Line back to ${esc(eigenaar())}"><a class="knop kr-huis" href="#boom" aria-label="Back to ${esc(eigenaar())}">${HUIS}${esc(eigenaar())}</a>${p}${delen.join(p)}</nav>`;
  }
  function balkLiggend(n, maxVol) {
    return `<div class="boom-balk">${kruimelsVol(n, maxVol)}<div class="boom-knoppen"><button type="button" class="knop boom-knop" data-actie="home"${n === 1 ? ' disabled' : ''}>Back to ${esc(eigenaar())}</button><button type="button" class="knop boom-knop" data-actie="draai" aria-pressed="${omgekeerd}">Flip</button></div></div>`;
  }
  function hint(vorm) {
    if (!hintTonen) return '';
    if (vorm === 'staand') return `<p class="boom-hint">Tap a name for the person card; <span class="t">${pijl('op', 12)}</span> climbs further.</p>`;
    const werkwoord = K.isLaptop() ? 'Click' : 'Tap';
    return `<p class="boom-hint">${werkwoord} a name for the person card. Use <span class="t">${pijl(omgekeerd ? 'links' : 'rechts', 12)}</span> to climb further up the tree.</p>`;
  }

  /* ---------- The trunk ---------- */
  function stamStatus(n, maat) {
    const vl = K.status(n);
    return vl.length
      ? vl.map(v => `<span class="stam-st"><span class="status">${icoonStil(v, maat)}</span>${esc(K.STATUSNAAM[v])}</span>`).join('')
      : `<span class="bijtekst">${esc(K.STATUSNAAM.geen)}</span>`;
  }
  // The "Person card" button is the link; its ::after covers the whole block, so a tap on the name opens it too.
  const stamKnop = (n, vl) => `<a class="knop stam-knop" href="#persoon/${n}" data-n="${n}" data-status="${vl.join(' ')}" aria-label="Person card of ${esc(naamVan(n))}">${KAARTJE}Person card</a>`;
  const relRegel = n => `<span class="bijtekst"><span class="getal">${K.romein(K.generatie(n))}</span> · ${esc(relatie(n))}</span>`;

  /* ---------- Phone: portrait ---------- */
  // Sizes from the phone design mock-up, measured from the top of the canvas (which is 124 px below the top edge of the window).
  const ST = {
    tipY: 26, rij: { 1: 242, 2: 62 }, stang: { 0: 380, 1: 216 }, hoogte: 382, rand: 10, straal: 10,
    dikte: [2.6, 2.1, 1.7],
    gen: { 1: { tussen: 12, ic: 15 }, 2: { tussen: 4, ic: 14 } },
  };
  function staand(f, breedte) {
    const W = Math.max(breedte, 320), L = ST.rand, R = W - ST.rand;
    const nv = niveaus(f, 3);
    // Without grandparents (and so without arrows) everything moves up: no empty space above the parents.
    const dy = nv[2].some(k => k != null) ? 0 : -(ST.rij[1] - ST.rij[2]);
    const cx = (d, i) => L + (i + 0.5) * (R - L) / (1 << d);
    const rijY = d => ST.rij[d] + dy, stang = d => ST.stang[d] + dy;
    let takken = '', gens = '';
    // Trunk: a short piece of the trunk up to the fork to the parents; the rest of the trunk is .boom-stamlijn below the canvas.
    takken += `<path class="tak" stroke-width="${ST.dikte[0]}" d="M${r1(cx(0, 0))} ${r1(stang(0))}V${r1(ST.hoogte + dy + 1)}"/>`;
    for (let d = 0; d < 2; d++) {
      nv[d].forEach((k, i) => {
        if (k == null || !bestaat(k)) return;
        const x = cx(d, i), b = stang(d), oy = rijY(d + 1);
        if (d > 0) takken += `<path class="tak" stroke-width="${ST.dikte[d]}" d="M${r1(x)} ${r1(rijY(d) + 12)}V${r1(b)}"/>`;
        [[2 * k, -1], [2 * k + 1, 1]].forEach(([ouder, kant], j) => {
          const px = cx(d + 1, 2 * i + j), vol = bestaat(ouder);
          takken += `<path class="${vol ? 'tak' : 'tak-leeg'}" stroke-width="${vol ? ST.dikte[d + 1] : 1.3}" d="M${r1(x)} ${r1(b)}H${r1(px - kant * ST.straal)}Q${r1(px)} ${r1(b)} ${r1(px)} ${r1(b - ST.straal)}V${r1(oy + 12)}"/>`;
        });
      });
    }
    for (let d = 1; d <= 2; d++) {
      const g = ST.gen[d], bw = (R - L) / (1 << d) - g.tussen;
      let h = '';
      nv[d].forEach((k, i) => {
        if (k == null) return;
        const x = cx(d, i), y = rijY(d);
        const stijl = `left:${r1(x - bw / 2)}px;top:${r1(y)}px;width:${r1(bw)}px`;
        if (!bestaat(k)) {
          h += `<div class="v v-leeg" data-n="${k}" data-status="" style="${stijl}"><span class="v-kop"><span class="v-nr getal">${k}</span></span><span class="v-naam">${k % 2 === 0 ? 'Father' : 'Mother'} not found yet</span></div>`;
          return;
        }
        const vl = K.status(k), nb = vl.includes('nietbevestigd'), st = vormen(k, g.ic), j = K.jaren(k), p = K.plaats(k);
        h += `<a class="v" href="#persoon/${k}" data-n="${k}" data-status="${vl.join(' ')}" style="${stijl}" aria-label="${esc(naamTak(k, d, f))}">`
          + `<span class="v-kop"><span class="v-nr getal" style="color:${K.lijnKleur(k)}">${k}</span>${st ? `<span class="status">${st}</span>` : ''}</span>`
          + `<span class="v-naam naam${nb ? ' naam-nb' : ''}">${esc(naamVan(k))}</span>`
          + (j ? `<span class="v-meta v-jaren">${esc(j)}</span>` : '') + (p ? `<span class="v-meta v-plaats">${esc(p)}</span>` : '') + '</a>';
        // Climbing further: only on the outer row, and only if a parent of that person is known.
        if (d === 2 && heeftOuders(k)) {
          takken += `<path class="tak" stroke-width="${ST.dikte[2]}" d="M${r1(x)} ${r1(y + 12)}V${r1(ST.tipY + 15)}"/>`;
          h += `<a class="tip" href="#boom/${k}" style="left:${r1(x - 22)}px;top:${r1(ST.tipY - 22)}px" ${tipLabels(k)}><span>${pijl('op', 18)}</span></a>`;
        }
      });
      if (h) gens += `<div class="v-gen v-g${d}" role="group" aria-label="${esc(d === 1 ? 'Parents' : K.generatieNaam(d + 1))}">${h}</div>`;
    }
    const hoogte = ST.hoogte + dy;
    const vl = K.status(f), nb = vl.includes('nietbevestigd'), m = meta(f);
    const stam = `<div class="boom-voet"><div class="boom-stamlijn" aria-hidden="true"></div>`
      + `<div class="boom-stam stam-staat" data-n="${f}" data-status="${vl.join(' ')}" aria-current="true">`
      + `<span class="stam-nr getal" style="color:${K.lijnKleur(f)};font-size:${stamNrMaat(f, 44)}px">${f}</span>`
      + `<div class="stam-tekst"><h1 class="stam-naam naam${nb ? ' naam-nb' : ''}">${esc(naamVan(f))}</h1>`
      + (m ? `<p class="stam-meta">${esc(m)}</p>` : '')
      + `<p class="stam-regel">${stamStatus(f, 18)}${relRegel(f)}</p>${stamKnop(f, vl)}</div></div></div>`;
    const doek = `<div class="boom-vlak${W > breedte ? ' boom-schuift' : ''}"><div class="boom-doek" style="width:${W}px;height:${hoogte}px">`
      + `<svg class="boom-takken" width="${W}" height="${hoogte}" viewBox="0 0 ${W} ${hoogte}" aria-hidden="true" focusable="false">${takken}</svg>${gens}</div></div>`;
    return `<div class="boom-balk">${kruimelsTel(f)}</div>${hint('staand')}${stam}${doek}`;
  }

  /* ---------- Tablet and laptop: landscape ---------- */
  // Column widths, type sizes and line counts from the laptop and tablet design mock-ups (the designer's generator script).
  // A = height above the line (name lines + year lines + 6), B = the rest up to 44 px. kolom = width per generation.
  const LG = {
    vijf: {
      diepte: 5, x0: 2, kolom: [188, 196, 204, 220, 294], H: 738, Y0: 56, maxVol: 5, stamNr: 44, stamNaam: 22, stamLh: 26,
      gen: { 1: { nr: 20, naam: 17, lh: 21, regels: 4, meta: 13.5, mlh: 18, mregels: 2 },
        2: { nr: 18, naam: 16, lh: 20, regels: 3, meta: 13, mlh: 17, mregels: 2 },
        3: { nr: 17, naam: 15, lh: 19, regels: 3, meta: 12.5, mlh: 16, mregels: 1 },
        4: { nr: 16, naam: 14.5, lh: 18, regels: 1, meta: 12.5, mlh: 15, mregels: 1 } },
    },
    vier: {
      diepte: 4, x0: 0, kolom: [148, 152, 170, 194], H: 980, Y0: 56, maxVol: 4, stamNr: 40, stamNaam: 21, stamLh: 25,
      gen: { 1: { nr: 21, naam: 18, lh: 22, regels: 3, meta: 14, mlh: 19, mregels: 2 },
        2: { nr: 19, naam: 17, lh: 21, regels: 3, meta: 13.5, mlh: 18, mregels: 2 },
        3: { nr: 18, naam: 16, lh: 20, regels: 3, meta: 13, mlh: 17, mregels: 2 } },
    },
  };
  const LG_DIKTE = [2.6, 2.1, 1.75, 1.45, 1.2], HAAK = 9, TIP = 45, STAM_IN = 4, STAM_A = 156;
  const VIJF_VANAF = 960; // px available for the tree; below that, four generations
  // Which sizes: five generations if there is room; otherwise four with the tablet sizes. On the laptop (person card open,
  // about 730 px) the tree keeps the laptop height (738) with one line of years in the outer column: then it does not
  // jump in height when the card opens, and it fits on a 900 px screen.
  function kiesMaat(breedte) {
    if (breedte >= VIJF_VANAF) return { naam: 'vijf', ...LG.vijf };
    if (!K.isLaptop()) return { naam: 'vier', ...LG.vier };
    const gen = { ...LG.vier.gen, 3: { ...LG.vier.gen[3], mregels: 1 } };
    return { naam: 'vier', ...LG.vier, gen, H: LG.vijf.H };
  }
  // Column edges X[0..D]. At another width the columns scale along; the outermost keeps the most
  // (shrinks half as hard). They grow at most 15 % and shrink at most 25 %; if it still does not fit, the canvas scrolls.
  function kolomX(m, breedte) {
    const w = m.kolom.slice(), D = w.length, basis = m.x0 + w.reduce((a, b) => a + b, 0) + TIP;
    const delta = breedte - basis;
    if (delta < 0) {
      const gew = w.map((x, d) => x * (d === D - 1 ? 0.5 : 1)), som = gew.reduce((a, b) => a + b, 0);
      const s = Math.min(-delta / som, 0.25);
      for (let d = 0; d < D; d++) w[d] -= gew[d] * s;
    } else if (delta > 0) {
      const s = Math.min(delta / w.reduce((a, b) => a + b, 0), 0.15);
      for (let d = 0; d < D; d++) w[d] *= 1 + s;
    }
    const X = [m.x0];
    for (let d = 0; d < D; d++) X.push(X[d] + w[d]);
    return X;
  }
  // + 6 for the bottom margin and the row spacing (as in the mock-up), + 3 for the line itself and the baseline of the number:
  // so even a name with all its lines plus two lines of years fits without them touching.
  const hoogteA = g => g.regels * g.lh + g.mregels * g.mlh + 6 + 3;

  function liggend(f, m, breedte) {
    const D = m.diepte, nv = niveaus(f, D), X = kolomX(m, breedte);
    const Wd = Math.ceil(X[D] + TIP), H = m.H;
    // Y0: low enough that the top name in each column (with all its lines) stays below the column heading (heading 26 px high).
    let Y0 = m.Y0;
    for (let d = 1; d < D; d++) Y0 = Math.max(Y0, Math.ceil(hoogteA(m.gen[d]) + 1 - H / (2 << d) + 26));
    const Hd = Math.ceil(Y0 + H + 6);
    const yy = (d, i) => Y0 + (i + 0.5) * H / (1 << d);
    const sx = x => (omgekeerd ? Wd - x : x);                 // mirror a point
    const lx = (x0, w) => (omgekeerd ? Wd - x0 - w : x0);      // mirror the left edge of a box
    const g0 = K.generatie(f);
    let takken = '', koppen = '', gens = '';
    // Hooks: from the end of the child's branch to the branches of their parents, with a rounded corner.
    for (let d = 0; d < D - 1; d++) {
      nv[d].forEach((k, i) => {
        if (k == null || !bestaat(k)) return;
        const y = yy(d, i), bx = sx(X[d + 1]), r = omgekeerd ? -HAAK : HAAK;
        [[2 * k, -1], [2 * k + 1, 1]].forEach(([ouder, kant], j) => {
          const oy = yy(d + 1, 2 * i + j), vol = bestaat(ouder);
          takken += `<path class="${vol ? 'tak' : 'tak-leeg'}" stroke-width="${vol ? LG_DIKTE[d + 1] : 1.3}" d="M${r1(bx)} ${r1(y)}V${r1(oy - kant * HAAK)}Q${r1(bx)} ${r1(oy)} ${r1(bx + r)} ${r1(oy)}"/>`;
        });
      });
    }
    for (let d = 0; d < D; d++) {
      if (!nv[d].some(k => k != null)) continue;
      // Column heading: Roman numeral (absolute generation) and the name relative to the trunk.
      const label = d === 0 ? roepVan(f) : d === 1 ? 'Parents' : K.generatieNaam(d + 1);
      const kx = d === 0 ? lx(X[0] - STAM_IN, X[1] - X[0] + STAM_IN) + (omgekeerd ? 12 : STAM_IN) : lx(X[d] + HAAK, X[d + 1] - X[d] - HAAK) + (omgekeerd ? 12 : 4);
      koppen += `<div class="boom-kolomkop" style="left:${r1(kx)}px"><span class="getal">${K.romein(g0 + d)}</span><span>${esc(label)}</span></div>`;
      if (d === 0) continue;
      const g = m.gen[d], A = hoogteA(g), B = Math.max(2, 44 - A);
      const cijfers = Math.max(...nv[d].filter(k => k != null).map(k => String(k).length));
      const mal = '0'.repeat(cijfers);
      const x0 = X[d] + HAAK, x1 = X[d + 1], w = x1 - x0;
      // Long numbers in a narrow column: the number goes above the name, with one name line fewer (height A stays the same),
      // so the name does not shrink to a few letters per line or break in the middle of a word (a long surname such as
      // "Longfellowston" must stay whole). That happens when the number takes up more than a quarter of the width
      // (a digit is 0.5 em), or when the longest word of a name in this column (estimated at 0.55 em per letter) does not
      // fit next to the number and the status shape.
      const naast = w - 16 - cijfers * 0.5 * g.nr - 8 - 15 - 8;
      const langsteWoord = Math.max(0, ...nv[d].filter(k => k != null && bestaat(k)).map(k => Math.max(...naamVan(k).split(/\s+/).map(x => x.length))));
      const stapel = g.regels > 1 && (cijfers * 0.5 * g.nr > 0.25 * w || langsteWoord * 0.55 * g.naam > naast);
      let h = '';
      nv[d].forEach((k, i) => {
        if (k == null) return;
        const y = yy(d, i);
        const stijl = `left:${r1(lx(x0, w))}px;top:${r1(y - A + LG_DIKTE[d] / 2)}px;width:${r1(w)}px;height:${A + B}px`;
        const nr = kleur => `<span class="tk-nr getal"${kleur ? ` style="color:${kleur}"` : ''}><span class="tk-mal" aria-hidden="true">${mal}</span><span>${k}</span></span>`;
        if (!bestaat(k)) {
          h += `<div class="tk tk-leeg" data-n="${k}" data-status="" style="${stijl}"><span class="tk-boven" style="height:${A}px">${nr('')}<span class="tk-naam">${k % 2 === 0 ? 'Father' : 'Mother'} not found yet</span></span></div>`;
          return;
        }
        const vl = K.status(k), nb = vl.includes('nietbevestigd'), mt = meta(k);
        h += `<a class="tk" href="#persoon/${k}" data-n="${k}" data-status="${vl.join(' ')}" style="${stijl}" aria-label="${esc(naamTak(k, d, f))}">`
          + `<span class="tk-boven" style="height:${A}px">${nr(K.lijnKleur(k))}<span class="tk-naam naam${nb ? ' naam-nb' : ''}">${esc(naamVan(k))}</span>`
          + `<span class="status tk-st">${vormen(k, 15)}</span>${mt ? `<span class="tk-meta">${esc(mt)}</span>` : ''}</span></a>`;
        if (d === D - 1 && heeftOuders(k)) {
          h += `<a class="tip" href="#boom/${k}" style="left:${r1(lx(x1 + 1, 44))}px;top:${r1(y - 22 + LG_DIKTE[d] / 2)}px" ${tipLabels(k)}><span>${pijl(omgekeerd ? 'links' : 'rechts', 18)}</span></a>`;
        }
      });
      const vars = `--nr:${g.nr}px;--naam:${g.naam}px;--lh:${g.lh}px;--regels:${stapel ? g.regels - 1 : g.regels};--meta:${g.meta}px;--mlh:${g.mlh}px;--mregels:${g.mregels};--dikte:${LG_DIKTE[d]}px`;
      gens += `<div class="tk-gen${stapel ? ' tk-stapel' : ''}${g.regels === 1 ? ' naam-een' : ''}${g.mregels === 1 ? ' meta-een' : ''}" role="group" aria-label="${esc(label)}" style="${vars}">${h}</div>`;
    }
    // The trunk: large, on the thickest branch. Above the line number, name and years; below it status, relation and the button.
    const y = Y0 + H / 2, sw = X[1] - X[0] + STAM_IN;
    const vl = K.status(f), nb = vl.includes('nietbevestigd'), mt = meta(f);
    const stam = `<div class="boom-stam stam-ligt" data-n="${f}" data-status="${vl.join(' ')}" aria-current="true" style="left:${r1(lx(X[0] - STAM_IN, sw))}px;top:${r1(y - STAM_A + 1.3)}px;width:${r1(sw)}px">`
      + `<div class="stam-boven" style="height:${STAM_A}px"><span class="stam-nr getal" style="color:${K.lijnKleur(f)};font-size:${stamNrMaat(f, m.stamNr)}px">${f}</span>`
      + `<h1 class="stam-naam naam${nb ? ' naam-nb' : ''}" style="font-size:${m.stamNaam}px;line-height:${m.stamLh}px">${esc(naamVan(f))}</h1>`
      + (mt ? `<p class="stam-meta">${esc(mt)}</p>` : '') + '</div>'
      + `<div class="stam-onder"><p class="stam-regel">${stamStatus(f, 16)}</p><p class="stam-rel">${relRegel(f)}</p>${stamKnop(f, vl)}</div></div>`;
    return `<div class="boom-vlak${Wd > breedte ? ' boom-schuift' : ''}"><div class="boom-doek" style="width:${Wd}px;height:${Hd}px">`
      + `<svg class="boom-takken" width="${Wd}" height="${Hd}" viewBox="0 0 ${Wd} ${Hd}" aria-hidden="true" focusable="false">${takken}</svg>`
      + `<div class="boom-koppen" aria-hidden="true">${koppen}</div>${stam}${gens}</div></div>`;
  }

  /* ---------- Open end, or a link that is not valid ---------- */
  function nietGevonden(n, vorm) {
    const kind = K.kind(n), kindNaam = kind && bestaat(kind) ? naamVan(kind) : null;
    const wie = n % 2 === 0 ? 'father' : 'mother';
    const blok = `<section class="boom-focus-leeg" data-n="${n}" data-status="" aria-current="true">
<span class="boom-nr getal" style="color:${K.lijnKleur(n)};font-size:${stamNrMaat(n, 44)}px">${n}</span>
<div><h1 class="boom-naam naam naam-nb" tabindex="-1">Not found yet</h1>
<p class="boom-meta bijtekst">Open end: the ${wie} of ${kindNaam ? `<a href="#boom/${kind}">${esc(kindNaam)}</a> (No. ${kind})` : 'No. ' + kind} has not been found yet. The number is fixed; the person is not.</p></div>
</section>`;
    return (vorm === 'staand' ? `<div class="boom-balk">${kruimelsTel(n)}</div>` : balkLiggend(n, K.isLaptop() ? 5 : 4)) + blok;
  }
  function fout(tekst) {
    return `<div class="boom-fout" role="status"><p class="naam boom-fout-kop">This link is not valid</p><p class="bijtekst">${esc(tekst)}</p><p><a class="knop" href="#boom">Go to No. 1</a> <a class="knop" href="#register">Open the Register</a></p></div>`;
  }
  // d: empty-data guard. With no people at all there is no tree to draw.
  const leegStaat = () => '<div class="boom-fout" role="status"><p class="bijtekst">The chart is empty. See the Guide to add people.</p><p><a class="knop" href="#uitleg">Open the Guide</a></p></div>';

  /* ---------- Build ---------- */
  const vormNu = () => (K.isTelefoon() ? 'staand' : 'liggend');
  // Key of the layout: if it changes (width, shape, number of generations, direction), build again.
  function sleutel(n) {
    const b = wortel.clientWidth, vorm = vormNu();
    return [n, vorm, vorm === 'liggend' ? kiesMaat(b).naam + (K.isLaptop() ? 'L' : 'T') : '', b, omgekeerd, hintTonen].join('|');
  }
  function markeerOpen(n) {
    if (!wortel) return;
    wortel.querySelectorAll('.is-open').forEach(el => el.classList.remove('is-open'));
    if (n != null) wortel.querySelectorAll(`a.tk[data-n="${n}"], a.v[data-n="${n}"]`).forEach(el => el.classList.add('is-open'));
  }
  // Where the keyboard focus was, so that after a rebuild it returns to the same thing.
  function focusSelector(el) {
    if (!el || !wortel.contains(el)) return null;
    if (el.matches('[data-actie]')) return `[data-actie="${el.dataset.actie}"]`;
    if (el.matches('a.tip')) return `a.tip[href="${el.getAttribute('href')}"]`;
    if (el.matches('a[data-n]')) return `a[data-n="${el.dataset.n}"]`;
    if (el.matches('.kruimels a')) return `.kruimels a[href="${el.getAttribute('href')}"]`;
    return null;
  }
  function render(n, opties) {
    const o = opties || {};
    const hadFocus = wortel.contains(document.activeElement);
    const terugFocus = o.stil ? focusSelector(document.activeElement) : null;
    const wisselt = huidigN != null && n !== huidigN;
    const vorm = vormNu(), breedte = wortel.clientWidth;
    let klas = 'boom-' + vorm;
    let h;
    if (!K.P.size) h = leegStaat(); // d: empty-data guard
    else if (!geldig(n)) h = fout(`There is no ancestor with number ${n}. The chart has ${K.P.size} ancestors; numbers missing in between have not been found yet.`);
    else if (!bestaat(n)) h = nietGevonden(n, vorm);
    else if (vorm === 'staand') h = staand(n, breedte);
    else {
      const m = kiesMaat(breedte);
      klas += ' boom-' + m.naam + (K.isLaptop() ? ' boom-laptop' : ' boom-tablet') + (omgekeerd ? ' boom-omgekeerd' : '');
      h = balkLiggend(n, m.maxVol) + hint('liggend') + liggend(n, m, breedte);
    }
    wortel.className = wortel.className.split(/\s+/).filter(c => c && !/^boom-/.test(c)).concat(klas.split(' ')).join(' ');
    wortel.innerHTML = h;
    wortel.dataset.focus = n;
    huidigN = n;
    gebouwd = sleutel(n);
    const r = K.route();
    markeerOpen(r.weergave === 'persoon' ? r.params.n : null);
    if (wisselt && !o.stil) window.scrollTo(0, 0);
    let doel = null;
    if (terugFocus) doel = wortel.querySelector(terugFocus);
    else if (o.focusOp) doel = wortel.querySelector(o.focusOp);
    else if (hadFocus) doel = wortel.querySelector('.stam-knop, .boom-focus-leeg h1, .boom-fout a');
    if (doel) doel.focus({ preventScroll: true });
  }
  function nummerUit(params) { const n = params && params.n; return n == null ? 1 : n; }
  // After a size change (window, person card opened or closed on the laptop) build again, if needed.
  function herzie() {
    if (!wortel || wortel.hidden || huidigN == null) return;
    if (sleutel(huidigN) !== gebouwd) render(huidigN, { stil: true });
  }
  function hintGezien() {
    try { localStorage.setItem(HINT_SLEUTEL, 'gezien'); } catch (x) { /* without storage the guide text stays */ }
  }

  /* ---------- Behaviour ---------- */
  function bind(el) {
    el.addEventListener('click', e => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const knop = e.target.closest('button[data-actie]');
      if (knop) {
        if (knop.dataset.actie === 'home') K.ga('#boom');
        else if (knop.dataset.actie === 'draai') {
          omgekeerd = !omgekeerd;
          try { localStorage.setItem(RICHTING_SLEUTEL, omgekeerd ? 'ouders-links' : 'ouders-rechts'); } catch (x) { /* it works without storage too */ }
          render(huidigN, { stil: true, focusOp: '[data-actie="draai"]' });
        }
        return;
      }
      // Anyone who uses the tree has seen the guide text: it stays away on the next visit (not this time, or things would shift).
      if (e.target.closest('a.tk, a.v, a.tip, a.stam-knop')) hintGezien();
    });
    document.addEventListener('kern:route', e => {
      const r = e.detail || {};
      if (r.weergave !== 'persoon' && r.weergave !== 'boom') return;
      herzie();
      markeerOpen(r.weergave === 'persoon' ? r.params.n : null);
    });
    window.addEventListener('resize', () => {
      if (wachtOpMaat) return;
      wachtOpMaat = requestAnimationFrame(() => { wachtOpMaat = 0; herzie(); });
    });
  }

  /* ---------- Sidebar: the counts as entry points ---------- */
  // kern.start() fills #tel-lijnen and #tel-status with div.tel-rij. Those rows become real links here: the four lines to
  // #boom/4 … #boom/7, the certainty rows for now to #register (the Register will handle filtering later).
  function zijbalkLinks() {
    const maak = (el, href) => {
      if (el.tagName === 'A') { el.setAttribute('href', href); return; }
      const a = document.createElement('a');
      a.className = el.className; a.setAttribute('href', href);
      for (const k of Object.keys(el.dataset)) a.dataset[k] = el.dataset[k];
      a.innerHTML = el.innerHTML;
      el.replaceWith(a);
    };
    document.querySelectorAll('#tel-lijnen .tel-rij[data-lijn]').forEach(el => maak(el, '#boom/' + el.dataset.lijn));
    document.querySelectorAll('#tel-status .tel-rij[data-status]').forEach(el => maak(el, '#register'));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', zijbalkLinks); else zijbalkLinks();

  try { omgekeerd = localStorage.getItem(RICHTING_SLEUTEL) === 'ouders-links'; } catch (x) { omgekeerd = false; }
  try { hintTonen = localStorage.getItem(HINT_SLEUTEL) !== 'gezien'; } catch (x) { hintTonen = true; }

  K.registreer('boom', {
    monteer(el, params) { wortel = el; el.classList.add('boom'); bind(el); render(nummerUit(params)); },
    bijwerk(params) {
      const n = nummerUit(params);
      if (n === huidigN && wortel.childElementCount && sleutel(n) === gebouwd) { markeerOpen(null); return; }
      render(n);
    },
    verlaat() { /* the element stays hidden; nothing to hold on to */ },
  });
})();

