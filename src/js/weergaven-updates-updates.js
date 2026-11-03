// weergaven/updates/updates.js
// ui/weergaven/updates/updates.js: what was found or improved, one entry per day (route #updates).
// The content comes from kern.UPD (the UPD block, newest first): {d: "YYYY-MM-DD" or null, v: version, t: title, p: [points]}.
// At the top a pointer to Contact (#contact), shown only when contact details are configured.
(function () {
  'use strict';
  const K = window.kern, esc = K.esc;
  const datum = d => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d || '');
    return m ? `${+m[3]} ${K.MAANDEN[+m[2] - 1]} ${m[1]}` : 'Earlier';
  };
  function bouw(el) {
    const lijst = K.UPD || [];
    let h = '<div class="up-kop"><h1 class="kop-serif up-titel">Updates</h1><p class="bijtekst up-sub">What was added or improved each day in this ancestor chart.</p></div>';
    const ct = (K.CFG && K.CFG.contact) || {}; // config: the Contact view is hidden when no contact details are set, so skip the pointer then
    if (ct.email || ct.text) h += '<p class="up-contact"><b>Do you know more?</b> See <a href="#contact">Contact</a>.</p>';
    if (!lijst.length) h += '<p class="bijtekst">No updates yet.</p>';
    h += '<ol class="up-lijst">';
    for (const u of lijst) {
      // Without a fixed day the period is in the title before the colon ("Between 9 and 15 October: ...").
      let kop = datum(u.d), titel = u.t || '';
      if (!u.d && titel.includes(': ')) { kop = titel.slice(0, titel.indexOf(': ')); titel = titel.slice(titel.indexOf(': ') + 2); titel = titel.charAt(0).toUpperCase() + titel.slice(1); }
      h += `<li class="up-item"><h2 class="up-datum"><span class="kop-serif">${esc(kop)}</span>${u.v ? ` <span class="up-versie">version ${esc(u.v)}</span>` : ''}</h2>`;
      if (titel) h += `<p class="up-t">${esc(titel)}</p>`;
      if (u.p && u.p.length) h += '<ul class="up-punten">' + u.p.map(x => `<li>${esc(x)}</li>`).join('') + '</ul>';
      h += '</li>';
    }
    h += '</ol>';
    el.innerHTML = h;
  }
  let wortel = null;
  K.registreer('updates', {
    monteer(el) { wortel = el; bouw(el); },
    bijwerk() { if (wortel && !wortel.childElementCount) bouw(wortel); },
  });
})();

