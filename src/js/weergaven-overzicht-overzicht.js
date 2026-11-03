// weergaven/overzicht/overzicht.js
// ui/weergaven/overzicht/overzicht.js: the full overview (route #overzicht).
// At the top four grandparent cards (linking to #boom/<4..7>), below them one row per generation with a bar: colour shows via which
// grandparent, fill shows how certain (solid, hatched, outlined, grey). All figures come from kern.telling(); bars are CSS,
// and the figures also appear as text (aria-label and title), so colour is never the only carrier.
(function () {
  'use strict';
  const K = window.kern, esc = K.esc;
  const getal = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const NAAM = K.STATUSNAAM;
  const lijnNaam = l => (l ? 'via ' + K.LIJNEN[l].kort : 'Owner and parents');
  const meervoud = (n, een, meer) => (n === 1 ? een : meer);
  // Soft hyphens in the generation name ("Great-great-grand­parents"), so a long name in a narrow column
  // wraps instead of being cut off. On the phone (nowrap) they do nothing.
  // The Roman numeral already says which generation it is, so "(generation 22)" after the name of 22 and above is dropped here.
  // i18n: the suffix and the word list below are English now (they were Dutch).
  const afbreekbaar = naam => esc(naam.replace(/ \(generation \d+\)$/, '')).replace(/(?<=.)(parents|ancestors|grand|great)/g, '­$1');

  function kaart(l, T) {
    const L = T.perLijn[l], open = L.openEinden.beide;
    return `<li><a class="ov-kaart" href="#boom/${l}" data-n="${l}" data-status="">` +
      `<span class="ov-kaart-kop"><span class="getal ov-kaart-nr" style="color:var(--lijn-${l})">${l}</span><span class="naam ov-kaart-naam">${esc(L.naam)}</span></span>` +
      `<span class="ov-kaart-regel"><b>${getal(L.totaal)}</b> ${L.totaal === 1 ? 'ancestor' : 'ancestors'}, up to generation ${K.romein(L.hoogsteGeneratie)}</span>` +
      `<span class="ov-kaart-regel">${getal(open)} ${meervoud(open, 'open end', 'open ends')}</span></a></li>`;
  }

  function legenda() {
    const item = (cls, tekst) => `<span class="ov-legenda-item"><span class="ov-vlak ${cls}" aria-hidden="true"></span>${esc(tekst)}</span>`;
    return `<p class="ov-legenda" aria-label="Legend of the bars">` +
      item('ov-vlak-akte', NAAM.akte) + item('ov-vlak-onderbouwd', NAAM.onderbouwd) + item('ov-vlak-voorbehoud', NAAM.voorbehoud) + item('ov-vlak-nietbevestigd', NAAM.nietbevestigd) +
      `<span class="ov-legenda-item">Colour: via which grandparent</span></p>`;
  }

  // The bar of one generation: width relative to the largest generation, segments per line and certainty (each counted once).
  // A 1 px seam only between two lines (ov-seg-lijn). A "with reservation" piece narrower than 6 px gets
  // a soft fill instead of an outline (ov-seg-smal, see smal() below): such a tiny box would otherwise read as a loose block.
  function staaf(G, max) {
    if (!G.gevonden) return '';
    let vorige = null;
    const segs = G.segmenten.map(s => {
      const kleur = s.lijn ? `var(--lijn-${s.lijn})` : 'var(--inkt-2)';
      const naam = NAAM[s.status] || 'No record';
      const kl = vorige !== null && vorige !== s.lijn ? ' ov-seg-lijn' : '';
      vorige = s.lijn;
      return `<span class="ov-seg${kl}" data-lijn="${s.lijn || ''}" data-status="${s.status}" style="--k:${kleur};flex-grow:${s.aantal}" title="${esc(naam)}, ${esc(lijnNaam(s.lijn))}: ${s.aantal}"></span>`;
    });
    const perLijn = new Map();
    for (const s of G.segmenten) {
      const k = s.lijn || 0;
      if (!perLijn.has(k)) perLijn.set(k, []);
      perLijn.get(k).push(`${s.aantal} ${(NAAM[s.status] || 'no record').toLowerCase()}`);
    }
    const label = Array.from(perLijn, ([l, d]) => `${l ? 'via ' + K.LIJNEN[l].kort : 'Owner and parents'}: ${d.join(', ')}`).join('; ');
    const breedte = (G.gevonden / max * 100).toFixed(2);
    return `<span class="ov-staaf" role="img" aria-label="${esc(label)}" style="width:${breedte}%">${segs.join('')}</span>`;
  }

  function rij(G, max) {
    const open = G.openEinden.beide;
    return `<li><a class="ov-rij" href="#register" data-generatie="${G.g}">` +
      `<span class="ov-gen"><span class="getal ov-romein">${G.romein}</span><span class="ov-gen-naam">${afbreekbaar(G.naam)}</span></span>` +
      `<span class="ov-aantal getal">${getal(G.gevonden)}<span class="ov-van"> of ${getal(G.mogelijk)}</span></span>` +
      `<span class="ov-staaf-cel">${staaf(G, max)}</span>` +
      `<span class="ov-open getal">${getal(open)}<span class="onzichtbaar"> ${meervoud(open, 'open end', 'open ends')}</span></span>` +
      `</a></li>`;
  }

  function basisrij(T) {
    let gevonden = 0, mogelijk = 0, open = 0;
    for (let g = 1; g <= 3 && g <= T.generaties; g++) { gevonden += T.perGeneratie[g].gevonden; mogelijk += T.perGeneratie[g].mogelijk; open += T.perGeneratie[g].openEinden.beide; }
    return `<li><div class="ov-rij ov-rij-basis">` +
      `<span class="ov-gen"><span class="getal ov-romein">I–III</span><span class="ov-gen-naam">Owner, parents, grandparents</span></span>` +
      `<span class="ov-aantal getal">${gevonden}<span class="ov-van"> of ${mogelijk}</span></span>` +
      `<span class="ov-staaf-cel"></span>` +
      `<span class="ov-open getal">${open}<span class="onzichtbaar"> ${meervoud(open, 'open end', 'open ends')}</span></span>` +
      `</div></li>`;
  }

  function bouw(el) {
    const T = K.telling();
    // i18n: empty-data guard; with no ancestors there is no generation to take a maximum from
    if (!T.totaal) { el.innerHTML = '<div class="ov-kop"><h1 class="naam ov-titel">Overview</h1><p class="bijtekst ov-sub">No ancestors yet. Add people to the data files to see the overview.</p></div>'; return; }
    const max = T.perGeneratie[T.grootsteGeneratie].gevonden || 1;
    const rijen = [];
    for (let g = 4; g <= T.generaties; g++) rijen.push(rij(T.perGeneratie[g], max));
    el.innerHTML =
      `<div class="ov-kop"><h1 class="naam ov-titel">Overview</h1>` +
      `<p class="bijtekst ov-sub">${getal(T.totaal)} ${T.totaal === 1 ? 'ancestor' : 'ancestors'} in ${T.generaties} ${T.generaties === 1 ? 'generation' : 'generations'}, via four grandparents.<span class="ov-sub-meer"> Click a generation for the register, or a grandparent for the tree.</span></p></div>` +
      `<ul class="ov-kaarten" aria-label="By grandparent">${[4, 5, 6, 7].map(l => kaart(l, T)).join('')}</ul>` +
      legenda() +
      `<section class="ov-generaties" aria-label="By generation">` +
      `<div class="ov-koprij"><span>Generation</span><span>Found</span><span>Via which grandparent, how certain</span><span>Open ends</span></div>` +
      `<ol class="ov-rijen">${basisrij(T)}${rijen.join('')}</ol></section>`;
  }

  // At the real width: only when the view is visible (when hidden everything is 0 px wide).
  function smal() {
    if (!wortel || !wortel.offsetWidth) return;
    wortel.querySelectorAll('.ov-seg[data-status="voorbehoud"]').forEach(s => s.classList.toggle('ov-seg-smal', s.getBoundingClientRect().width < 6));
  }
  let wortel = null;
  K.registreer('overzicht', {
    monteer(el) { wortel = el; bouw(el); smal(); if (window.ResizeObserver) new ResizeObserver(smal).observe(el); },
    bijwerk() { if (wortel && !wortel.childElementCount) bouw(wortel); smal(); },
  });
})();

