// kinderen/kinderen.js 
// ui/kinderen/kinderen.js: the "Children" section on the person card (since version 46).
// Reads kern.KIND: children per couple, stored under the number of the father (or of the only known parent).
// A child who is in the ancestor chart links to their person card. All data goes through K.esc.
(function () {
  const K = window.kern;
  if (!K || !K.secties || !K.KIND) return;

  // For a woman (odd number) the family is stored under her husband's number; without a known husband, under her own.
  const gezinVan = n => (n % 2 === 1 && K.KIND.has(n - 1) ? K.KIND.get(n - 1) : K.KIND.get(n)) || null;
  const gezin = n => { const g = gezinVan(n); return g ? (Array.isArray(g) ? g : g.k) : null; };
  const nietGezocht = n => { const g = gezinVan(n); return g && !Array.isArray(g) ? g.z || null : null; };

  // "° 04-05-1879, Exampleville" -> "born 04-05-1879, Exampleville"; age "(0)" -> "(not yet one year old)"
  function leesbaar(t) {
    if (!t) return '';
    // i18n: the data strings use English abbreviations: "c." (circa), "bur." (buried), "(12)" or "(12 years)" for an age.
    let s = t.replace(/^° c\. (\d{4})$/, 'born c. $1, calculated from the age in a record')
      .replace(/^° /, 'born ').replace(/^~ /, 'baptised ').replace(/^† /, 'died ').replace(/^bur\. /, 'buried ');
    s = s.replace(/\((\d+)(?: years?)?\)$/, (m, x) => (+x === 0 ? '(not yet one year old)' : `(${x} ${+x === 1 ? 'year' : 'years'})`)); // i18n: singular "year"
    return s;
  }

  function render(n) {
    const lijst = gezin(n);
    if (!lijst || !lijst.length) return null;
    const esc = K.esc;
    const vb = lijst.filter(k => k.vb).length, jong = lijst.filter(k => k.o).length;
    const z = nietGezocht(n), alleenLijn = lijst.every(k => k.kw && !(k.a && k.a.length));
    let h;
    if (z === 'levend') {
      h = '<p class="kd-intro">Children from this generation may still be alive and their records are not yet public. So only the child in the ancestor chart is listed.</p>';
    } else if (z) {
      h = '<p class="kd-intro">Records not searched yet: no year is known for these parents, and a search without a period mostly returns people with the same name from other centuries. Only the child in the ancestor chart is listed.</p>';
    } else if (alleenLijn) {
      h = '<p class="kd-intro">No record on Open Archives names these parents with a child, not even this one. For this time and place the baptism books are often not preserved (online). Only the child in the ancestor chart is listed.</p>';
    } else {
      h = `<p class="kd-intro">At least ${lijst.length} ${lijst.length === 1 ? 'child' : 'children'} found in the records`;
      h += vb ? `, ${vb} of them with reservation` : '';
      h += jong ? `. ${jong === 1 ? 'One child died' : jong + ' children died'} young.` : '.';
      h += '</p>';
    }
    h += '<ol class="kd-lijst">';
    lijst.forEach((k, i) => {
      const naam = k.kw
        ? `<a class="kd-naam" href="#persoon/${k.kw}" data-n="${k.kw}">${esc(k.n)}</a> <span class="kd-kw">No. <span class="getal" style="color:${K.lijnKleur(k.kw)}">${k.kw}</span>${k.kw2 ? ` and <a href="#persoon/${k.kw2}" class="getal" style="color:${K.lijnKleur(k.kw2)}">${k.kw2}</a>` : ''} in the ancestor chart</span>`
        : `<span class="kd-naam">${esc(k.n)}</span>`;
      h += `<li class="kd"><span class="kd-i getal">${i + 1}</span><div class="kd-tekst">${naam}`;
      if (k.g) h += `<span class="kd-meta">${esc(leesbaar(k.g))}</span>`;
      if (k.o) h += `<span class="kd-meta"><span class="ctx-tag">died young</span> ${esc(leesbaar(k.o))}</span>`;
      if (k.vb) h += `<span class="kd-meta"><span class="ctx-vb">with reservation</span></span><span class="ctx-vbr">${esc(k.vb.charAt(0).toUpperCase() + k.vb.slice(1))}.</span>`;
      if (k.nt) h += `<span class="ctx-vbr">${esc(k.nt)}</span>`;
      if (k.a && k.a.length) h += `<span class="kd-akten">${k.a.map(([l, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(l)}</a>`).join(' · ')}</span>`;
      h += '</div></li>';
    });
    h += '</ol>';
    if (!z && !alleenLijn) h += '<p class="ctx-src">Searched in the records on Open Archives: births and baptisms, deaths and marriages that name these parents. ' +
      'Not every record can be found online, so there may have been more children. A birth year with "c." is calculated from an age in a record. ' +
      'Children born less than 100 years ago are not listed: those records are not yet public and those people may still be alive.</p>';
    const d = document.createElement('div'); d.className = 'ctx kd-blok'; d.innerHTML = h;
    return d;
  }

  K.secties.voeg({
    id: 'kinderen',
    volgorde: 5,
    titel: 'Children',
    aantal: n => (gezin(n) || []).length || null,
    geldt: n => !!gezin(n),
    render,
  });
})();

