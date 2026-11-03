// weergaven/contact/contact.js
// ui/weergaven/contact/contact.js: contact (route #contact).
// Who to write to, what help is welcome and what is useful to send along. The address and text come from kern.CFG.contact.
(function () {
  'use strict';
  const K = window.kern, esc = K.esc; // config: esc is needed for the configured email and text
  // config: contact details come from kern.CFG.contact (docs/config.md), not from the code
  const CT = () => (K.CFG && K.CFG.contact) || {};
  const link = (onderwerp, tekst) => `<a href="mailto:${esc(CT().email)}?subject=${encodeURIComponent(onderwerp)}">${tekst}</a>`;
  function bouw(el) {
    const ct = CT(), onderwerp = (K.CFG && K.CFG.title) || 'Ancestor chart';
    // config: with neither an email nor a text, show one line instead of a blank page
    if (!ct.email && !ct.text) {
      el.innerHTML = '<div class="ct-kop"><h1 class="kop-serif ct-titel">Contact</h1><p class="bijtekst ct-sub">No contact details have been set up for this ancestor chart.</p></div>';
      return;
    }
    el.innerHTML =
      '<div class="ct-kop"><h1 class="kop-serif ct-titel">Contact</h1><p class="bijtekst ct-sub">Contact details for this ancestor chart.</p></div>' +
      (ct.email ? `<div class="ct-kaart"><p class="ct-label">Email</p><p class="ct-mail">${link(onderwerp, esc(ct.email))}</p></div>` : '') +
      (ct.text ? `<p class="ct-p">${esc(ct.text)}</p>` : '') +
      '<h2 class="kop-serif ct-h2">Do you know more?</h2>' +
      '<p class="ct-p">Every addition is welcome, even a small one:</p>' +
      '<ul class="ct-lijst">' +
      '<li>a photo of someone, of a house or of a grave;</li>' +
      '<li>a story that is told in the family;</li>' +
      '<li>a record, a memorial card or a newspaper notice;</li>' +
      '<li>a mistake you notice: a wrong date, name or place.</li>' +
      '</ul>' +
      '<h2 class="kop-serif ct-h2">What is useful to send along</h2>' +
      '<ul class="ct-lijst">' +
      '<li>The <b>Ahnentafel number</b> of the person (the number before the name). Then it is clear at once who it is about.</li>' +
      '<li>Where it comes from: a record, a book, a website or a family story. Even "grandmother always said so" is good to know.</li>' +
      '</ul>' +
      '<p class="ct-p bijtekst">Where a record and a story contradict each other, this ancestor chart follows the record. A story without a record goes in with reservation. No archive research is done on people who are still alive.</p>' +
      (ct.email ? `<p class="ct-p">${link(onderwerp + ': addition', 'Send an email with an addition')}</p>` : '');
  }
  let wortel = null;
  K.registreer('contact', {
    monteer(el) { wortel = el; bouw(el); },
    bijwerk() { if (wortel && !wortel.childElementCount) bouw(wortel); },
  });
})();
