// weergaven/voortgang/voortgang.js
// ui/weergaven/voortgang/voortgang.js: progress in figures (route #voortgang).
// One big number, then four blocks with CSS bars: via which grandparent, how certain, open ends and what is attached.
// All figures come from kern.telling(); nothing is hard-coded. The version line comes from the existing p.versie element.
(function () {
  'use strict';
  const K = window.kern, esc = K.esc;
  const getal = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
  const ICOON = {
    akten: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9.5 12h5M9.5 15.5h5"/></svg>',
    verhalen: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h11a1 1 0 0 1 1 1v15H7a2 2 0 0 1-2-2V5a1 1 0 0 1 1-1z"/><path d="M5 18a2 2 0 0 1 2-2h11M9 8h6M9 11h4"/></svg>',
    fotos: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="12" cy="12" r="3.5"/><path d="M8 5l1.5-2h5L16 5"/></svg>',
    kranten: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h9M8 12h12M4 18h7"/><circle cx="4" cy="6" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="4" cy="18" r="1"/></svg>',
    signalementen: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
    plaatsen: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/></svg>',
  };

  // One row: icon (or empty), label with bar, count on the right. The bar is decorative; the figure is in text.
  function rij(o) {
    const breedte = Math.max(0, Math.min(1, o.deel || 0)) * 100;
    return `<li class="vg-rij"><span class="vg-icoon status" aria-hidden="true">${o.icoon || ''}</span>` +
      `<span class="vg-midden"><span class="vg-label">${o.label}</span>` +
      `<span class="vg-spoor"><span class="vg-staaf" aria-hidden="true" style="width:${breedte.toFixed(1)}%${o.kleur ? ';background:' + o.kleur : ''}"></span></span></span>` +
      `<span class="vg-aantal getal">${getal(o.aantal)}</span></li>`;
  }
  const lijnLabel = (l, naam) => `<span class="getal" style="color:var(--lijn-${l})">${l}</span>&#160; ${esc(naam)}`;
  const blok = (id, titel, inhoud, cls) => `<section class="vg-blok${cls ? ' ' + cls : ''}" aria-labelledby="${id}"><h2 class="naam vg-h2" id="${id}">${titel}</h2>${inhoud}</section>`;
  const kaartje = (icoon, label, aantal) => `<li class="vg-kaart"><span class="vg-kaart-label">${ICOON[icoon]}${label}</span><span class="getal vg-kaart-getal">${getal(aantal)}</span></li>`;

  function bouw(el) {
    const T = K.telling();
    // i18n: empty-data guard; nothing to count
    if (!T.totaal) { el.innerHTML = '<div class="vg-kop"><h1 class="naam vg-titel">Progress</h1><p class="bijtekst vg-sub">No ancestors yet. Add people to the data files to see progress.</p></div>'; return; }
    const LIJNEN = [4, 5, 6, 7];
    const maxLijn = Math.max(...LIJNEN.map(l => T.perLijn[l].totaal), 1);
    const maxOpen = Math.max(...LIJNEN.map(l => T.openEinden.perLijn[l]), 1);

    const lijnen = `<ul class="vg-lijst">${LIJNEN.map(l => rij({ label: lijnLabel(l, T.perLijn[l].naam), aantal: T.perLijn[l].totaal, deel: T.perLijn[l].totaal / maxLijn, kleur: `var(--lijn-${l})` })).join('')}</ul>`;

    const zekerRij = (vlag, naam, aantal, icoon) => rij({ icoon, label: `${esc(naam)}<span class="vg-pct"> ${pct(aantal, T.totaal)}%</span>`, aantal, deel: aantal / T.totaal });
    const zeker = `<ul class="vg-lijst">` +
      ['akte', 'onderbouwd', 'voorbehoud', 'nietbevestigd'].map(v => zekerRij(v, K.STATUSNAAM[v], T.perStatus[v], K.statusIcoon(v, 18))).join('') +
      zekerRij('geen', 'Records not yet public', T.perStatus.geen, '') + `</ul>` +
      (T.overlapVbNb ? `<p class="vg-noot bijtekst">${T.overlapVbNb} ${T.overlapVbNb === 1 ? 'ancestor is' : 'ancestors are'} both with reservation and unconfirmed, and ${T.overlapVbNb === 1 ? 'counts' : 'count'} in both.</p>` : '');

    const open = `<p class="vg-zin"><b class="getal">${getal(T.openEinden.beide)}</b> ancestors whose parents are both still unknown, and <b class="getal">${getal(T.openEinden.een)}</b> with one parent missing.</p>` +
      `<ul class="vg-lijst">${LIJNEN.map(l => rij({ label: lijnLabel(l, 'via ' + T.perLijn[l].kort), aantal: T.openEinden.perLijn[l], deel: T.openEinden.perLijn[l] / maxOpen, kleur: `var(--lijn-${l})` })).join('')}</ul>`;

    const erbij = `<ul class="vg-kaarten">` +
      kaartje('akten', 'Record links', T.aktelinks.perPersoon) + kaartje('verhalen', 'Stories', T.verhalen) + kaartje('fotos', 'Photos and scans', T.fotos.totaal) +
      kaartje('kranten', 'Newspaper notices', T.kranten.totaal) + kaartje('signalementen', 'Physical descriptions', T.signalementen) + kaartje('plaatsen', 'Places on the map', T.plaatsen.plaatsen) + `</ul>`;

    const versieEl = document.querySelector('p.versie');
    const versie = versieEl ? versieEl.textContent.trim().replace(/\.$/, '') : '';
    const geen = T.perStatus.geen;
    const voet = (versie ? esc(versie) + '. ' : '') + 'All figures come from one count over the data of this version' +
      (geen ? `; the ${geen} without a status are people whose records are not yet public, such as the owner and close family.` : '.');

    el.innerHTML =
      `<div class="vg-kop"><h1 class="naam vg-titel">Progress</h1><p class="bijtekst vg-sub">How far the research has come, in figures</p></div>` +
      `<div class="vg-kolommen"><div class="vg-kolom">` +
      `<div class="vg-groot"><span class="getal vg-getal">${getal(T.totaal)}</span><p class="bijtekst">${T.totaal === 1 ? 'ancestor' : 'ancestors'} found, in ${T.generaties} ${T.generaties === 1 ? 'generation' : 'generations'}. A place is known for ${getal(T.plaatsen.metPlaats)} of the ${getal(T.plaatsen.vanTotaal)} ancestors from the great-grandparents on.</p></div>` +
      blok('vg-kop-lijnen', 'Via which grandparent', lijnen) +
      blok('vg-kop-zeker', 'How certain', zeker) +
      `</div><div class="vg-kolom">` +
      blok('vg-kop-open', 'Open ends', open, 'vg-blok-open') +
      blok('vg-kop-erbij', 'What is attached', erbij) +
      `</div></div>` +
      `<p class="vg-versie bijtekst">${voet}</p>`;
  }

  let wortel = null;
  K.registreer('voortgang', {
    monteer(el) { wortel = el; bouw(el); },
    bijwerk() { if (wortel && !wortel.childElementCount) bouw(wortel); },
  });
})();

