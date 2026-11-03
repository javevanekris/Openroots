// weergaven/overzicht/telling.js
// ui/weergaven/overzicht/telling.js: one count over all the data, for Overview and Progress.
// Puts kern.telling() on window.kern; kern.js itself stays unchanged. Everything comes from kern.P and the sets,
// in a single pass, and is cached: the data does not change during a session.
(function () {
  'use strict';
  const K = window.kern;
  const LIJNEN = [4, 5, 6, 7];
  const VLAGGEN = ['akte', 'onderbouwd', 'voorbehoud', 'nietbevestigd'];
  // Each person once: someone with reservation and unconfirmed counts as unconfirmed (that is how the tree shows them: grey).
  const HOOFDVOLGORDE = ['akte', 'onderbouwd', 'nietbevestigd', 'voorbehoud'];
  const leegStatus = () => ({ akte: 0, onderbouwd: 0, voorbehoud: 0, nietbevestigd: 0, geen: 0 });
  const leegLijn = () => ({ 4: 0, 5: 0, 6: 0, 7: 0, anders: 0 });

  function hoofdstatus(n) {
    const v = K.vlaggen(n);
    for (const s of HOOFDVOLGORDE) if (v[s]) return s;
    return 'geen';
  }

  let cache = null;
  K.telling = () => {
    if (cache) return cache;
    const P = K.P;
    let hoogste = 0;
    for (const n of P.keys()) hoogste = Math.max(hoogste, K.generatie(n));

    const perGeneratie = [null];
    for (let g = 1; g <= hoogste; g++) {
      perGeneratie[g] = {
        g, romein: K.romein(g), naam: K.generatieNaam(g), mogelijk: Math.pow(2, g - 1), gevonden: 0,
        perLijn: leegLijn(), perStatus: leegStatus(), perHoofdstatus: leegStatus(),
        segmenten: [], openEinden: { beide: 0, een: 0 },
      };
    }
    const perLijn = {};
    for (const l of LIJNEN) perLijn[l] = { lijn: l, naam: K.LIJNEN[l].lang, kort: K.LIJNEN[l].kort, totaal: 0, hoogsteGeneratie: 0, perStatus: leegStatus(), perHoofdstatus: leegStatus(), openEinden: { beide: 0, een: 0 } };
    perLijn.anders = { lijn: null, naam: 'Owner and parents', kort: 'Owner and parents', totaal: 0, hoogsteGeneratie: 0, perStatus: leegStatus(), perHoofdstatus: leegStatus(), openEinden: { beide: 0, een: 0 } };

    const perStatus = leegStatus(), perHoofdstatus = leegStatus();
    let overlapVbNb = 0;
    const openEinden = { beide: 0, een: 0, perLijn: leegLijn(), eenPerLijn: leegLijn(), nummers: [] };
    const segTel = new Map(); // "g|lijn|status" -> { aantal, eerste }

    for (const n of P.keys()) {
      const g = K.generatie(n), l = K.lijn(n) || 'anders';
      const G = perGeneratie[g], L = perLijn[l];
      G.gevonden++; G.perLijn[l]++;
      L.totaal++; if (g > L.hoogsteGeneratie) L.hoogsteGeneratie = g;

      const vl = K.status(n);
      if (!vl.length) { perStatus.geen++; G.perStatus.geen++; L.perStatus.geen++; }
      for (const s of vl) { perStatus[s]++; G.perStatus[s]++; L.perStatus[s]++; }
      if (K.VB.has(n) && K.NB.has(n)) overlapVbNb++;
      const h = hoofdstatus(n);
      perHoofdstatus[h]++; G.perHoofdstatus[h]++; L.perHoofdstatus[h]++;
      const sleutel = g + '|' + l + '|' + h;
      const seg = segTel.get(sleutel);
      if (seg) { seg.aantal++; if (n < seg.eerste) seg.eerste = n; } else segTel.set(sleutel, { g, lijn: l === 'anders' ? null : l, status: h, aantal: 1, eerste: n });

      const [vader, moeder] = K.ouders(n);
      const ontbreekt = (vader ? 0 : 1) + (moeder ? 0 : 1);
      if (ontbreekt === 2) { openEinden.beide++; openEinden.perLijn[l]++; openEinden.nummers.push(n); G.openEinden.beide++; L.openEinden.beide++; }
      else if (ontbreekt === 1) { openEinden.een++; openEinden.eenPerLijn[l]++; G.openEinden.een++; L.openEinden.een++; }
    }
    // Segments per generation: per line (4, 5, 6, 7, then the owner and parents), within the line by certainty.
    const lijnVolgorde = [4, 5, 6, 7, 'anders'], statusVolgorde = ['akte', 'onderbouwd', 'voorbehoud', 'nietbevestigd', 'geen'];
    for (let g = 1; g <= hoogste; g++) {
      for (const l of lijnVolgorde) for (const s of statusVolgorde) {
        const seg = segTel.get(g + '|' + l + '|' + s);
        if (seg) perGeneratie[g].segmenten.push(seg);
      }
    }
    let grootsteGeneratie = 1;
    for (let g = 2; g <= hoogste; g++) if (perGeneratie[g].gevonden > perGeneratie[grootsteGeneratie].gevonden) grootsteGeneratie = g;

    // What else is attached.
    const aktelinks = { totaal: 0, perPersoon: 0, uniek: 0, personen: 0 };
    const alleUrls = new Set();
    for (const lijst of K.AKTE.values()) {
      if (!lijst || !lijst.length) continue;
      aktelinks.personen++; aktelinks.totaal += lijst.length;
      const urls = new Set(lijst.map(a => a[1]));
      aktelinks.perPersoon += urls.size;
      urls.forEach(u => alleUrls.add(u));
    }
    aktelinks.uniek = alleUrls.size;
    const fotos = { totaal: 0, personen: 0 };
    for (const lijst of K.FOTO.values()) if (lijst && lijst.length) { fotos.personen++; fotos.totaal += lijst.length; }
    const kranten = { totaal: 0, personen: 0 };
    for (const lijst of K.KRANT.values()) if (lijst && lijst.length) { kranten.personen++; kranten.totaal += lijst.length; }

    // Places: PL is the map data (the people per place), B.tot the totals the map itself shows.
    let vanafOvergrootouders = 0;
    for (const n of P.keys()) if (n >= 8) vanafOvergrootouders++;
    const kaartTot = K.B && K.B.tot ? { alle: K.B.tot.alle, plaats: K.B.tot.plaats } : null;
    const plaatsen = {
      plaatsen: K.PL ? Object.keys(K.PL).length : 0,
      personenOpKaart: K.OPKAART.size,
      vanafOvergrootouders,
      kaart: kaartTot,
      // The sentence in Progress: the figures the map itself shows (B.tot), otherwise our own count.
      metPlaats: kaartTot ? kaartTot.plaats : K.OPKAART.size,
      vanTotaal: kaartTot ? kaartTot.alle : vanafOvergrootouders,
    };

    cache = {
      wat: 'All ' + P.size + ' ancestors in the ancestor chart, once per Ahnentafel number (where an ancestor appears under several numbers, they count under each number, as in the tree). '
        + 'Generation is the number of bits of the Ahnentafel number; possible is 2 to the power (generation − 1). '
        + 'Line is the grandparent (4–7) the number falls under; the grandparent counts in their own line, 1–3 are kept apart (“anders”). '
        + 'perStatus counts per flag like kern.vlaggen and kern.tel: someone with reservation and unconfirmed counts in both; “geen” is the people without a status (records not yet public). '
        + 'perHoofdstatus and the segments count everyone once: confirmed by a record, otherwise supported, otherwise unconfirmed, otherwise with reservation. '
        + 'Open end: both parents are missing from P; one parent: exactly one is missing. '
        + 'Aktelinks (record links): total is all lines in AKTE, perPersoon has no duplicate URLs for the same person (what the person card shows), uniek is over all people. '
        + 'Plaatsen (places): the number of places in PL, the people who appear in them (OPKAART) and the totals the map itself shows (B.tot).',
      totaal: P.size,
      generaties: hoogste,
      grootsteGeneratie,
      perGeneratie,
      perLijn,
      perStatus,
      perHoofdstatus,
      overlapVbNb,
      openEinden,
      plaatsen,
      aktelinks,
      verhalen: K.VERHAAL.size,
      notities: K.NOTE.size,
      fotos,
      kranten,
      signalementen: K.SIG.size,
    };
    return cache;
  };
})();

