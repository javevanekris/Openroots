// context/context.js
// ui/context/context.js: the context for a person, carried over from the original version (phase 1).
// Per person: what happened during their life (timeline, nationwide and in their own region, with outbreaks of disease),
// what the occupation involved, the addresses, the physical description and writing ability from the archive, amounts in
// today's money and loose archive finds. The choice of items (years, places, window, fits, words, age, timeline,
// occupation, addresses, description, writing, money, extra) is exactly that of the original; only the presentation is new:
// one section of the person card per part via kern.secties.voeg(...), without headings of its own.
// Only window.kern as entry point. The data is in kern.C: T (timeline), B (occupations), PS (per person: addresses a,
// physical description s, writing w, extra x), K (amounts), WP (places per person), PL (places), LR (last record),
// ST (regions), RT (provinces/regions), GM (maximum per event group).
(function () {
  'use strict';
  const K = window.kern;
  if (!K || !K.C || !K.secties) return;
  const C = K.C, esc = K.esc;
  // i18n: empty-data guard, every block of the context data may be missing
  C.T = C.T || []; C.B = C.B || []; C.K = C.K || {}; C.PS = C.PS || {}; C.WP = C.WP || {}; C.PL = C.PL || {}; C.LR = C.LR || {}; C.GM = C.GM || {};
  /* Presentation of text from the data, as in the original: "no 96" becomes "No. 96" and a non-breaking space follows a euro sign. */
  const E = s => esc(String(s == null ? '' : s).replace(/\bno (\d)/gi, 'No. $1').replace(/€ (?=\d)/g, '€ '));
  const ST = new Set(C.ST || []), RT = new Set(C.RT || []);
  const HOST = { 'openarchieven.nl': 'Open Archives', 'canonvannederland.nl': 'Canon of the Netherlands', 'nl.wikipedia.org': 'Wikipedia', 'en.wikipedia.org': 'Wikipedia', 'dbnl.org': 'DBNL', 'iisg.amsterdam': 'IISG', 'hdl.handle.net': 'IISG data', 'opendata.cbs.nl': 'CBS', 'resolver.kb.nl': 'Delpher', 'delpher.nl': 'Delpher', 'velehanden.nl': 'VeleHanden', 'rivm.nl': 'RIVM', 'cbs.nl': 'CBS' }; // config: regional archive hosts removed (they named the owner's regions); unknown hosts fall back to the hostname
  function lbl(u) { try { const h = new URL(u).hostname.replace(/^www\./, ''); return HOST[h] || h; } catch (e) { return 'source'; } }
  function bron(us, pre) {
    us = (us || []).filter((u, i, a) => u && a.indexOf(u) === i);
    if (!us.length) return '';
    const L = us.map(lbl), cnt = {}, nr = {};
    L.forEach(l => { cnt[l] = (cnt[l] || 0) + 1; });
    return `<div class="ctx-src">${pre == null ? 'Source' : pre}: ${us.map((u, i) => { const l = L[i]; const t = cnt[l] > 1 ? l + ' ' + (nr[l] = (nr[l] || 0) + 1) : l; return `<a href="${E(u)}" target="_blank" rel="noopener">${E(t)}</a>`; }).join(' · ')}</div>`;
  }
  const VB = r => (r == null ? '' : ` <span class="ctx-vb"${r ? ` title="${E(r)}"` : ''}>with reservation</span>`);
  const VBR = r => (r ? `<p class="ctx-vbr">With reservation: ${E(r)}</p>` : '');
  /* First sentence on its own, the rest behind "Read more". */
  function zin1(t) { const m = String(t || '').match(/^(.{20,}?[.!?])\s+(?=[A-Z0-9'"‘(])/); return m ? [m[1], t.slice(m[0].length)] : [t, '']; }
  const LEES = binnen => (binnen ? `<details class="ctx-lees"><summary>Read more</summary><div class="ctx-lees-inhoud">${binnen}</div></details>` : '');
  const PIJL = '<svg class="ctx-pijl" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  const ZIEKTE = '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M6 3.5v5M3.5 6h5" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
  const KT = (window.matchMedia && matchMedia('(pointer:coarse)').matches) ? 'Tap' : 'Click';

  /* ---------- years of life (original) ---------- */
  const APX = /ca\.?\s|ca\d|\bc\.\s|±|≈|presum|before|<|>|\?|candidate|unknown|about|around|\bafter\b|between|\bor\b|\d\/\d/i; // i18n: English words for the Dutch ones
  function y4(s) { const m = String(s || '').match(/\d{4}/); return m ? +m[0] : null; }
  function jaren(n) {
    const d = K.P.get(n) || []; let b = null, dd = null, ba = false, da = false, dn = false, dv = false;
    const S = [d[1], d[2]].filter(s => typeof s === 'string' && y4(s) != null).map(s => s.trim());
    const DOOD = /^(†|⚰|bur|died)/i; // i18n: English death/burial words
    S.forEach(t => { if (DOOD.test(t) && dd == null) { dd = y4(t); da = APX.test(t); dn = /\bafter\b/i.test(t); dv = /before/i.test(t); } }); // i18n: after/before
    S.forEach(t => {
      if (DOOD.test(t)) return; let y = y4(t);
      if (b == null) {
        /* two possible dates ('~ 1737 or ~ 1742', 'ca. 1788/1789'): take the last */
        const alt = /\bor\b|\d\/\d/.test(t) ? (t.match(/\d{4}/g) || []).map(Number).filter(z => dd == null || z <= dd) : [];
        if (alt.length > 1) { y = Math.max(...alt); b = y; ba = true; }
        else { b = y; ba = APX.test(t.split(String(y))[0]) || /^\s*(ca|c\.|<|±)/i.test(t); }
        const m = t.match(/\d{4}.*?(?:\s-\s*[<>]?\s*|<\s*|died\.?\D*?)(\d{4})/); if (m && dd == null && +m[1] > y + 15) { dd = +m[1]; da = true; }
      } else if (dd == null) { dd = y; da = APX.test(t); dn = /\bafter\b/i.test(t); dv = /before/i.test(t); }
    });
    let geschat = '';
    const est = K.EST.get(n);
    if ((b == null || dd == null) && est) { const e = String(est).match(/(\d{4})\D+(\d{4})/); if (e) { if (b == null) { b = +e[1]; ba = true; } if (dd == null) { dd = +e[2]; da = true; dv = false; dn = false; geschat = 'est'; } else geschat = 'est'; } }
    if (b == null && dd == null) return null;
    if (b == null) { b = dd - 60; ba = true; geschat = geschat || 'b'; }
    if (dd == null) { dd = b + 60; da = true; geschat = geschat || 'd'; }
    if (dd < b) dd = b;
    const lr = Math.max(b, C.LR[n] || b);
    /* after the last record it is not certain whether someone was still alive: death year estimated or 'before X' */
    return { b, d: dd, ba, da, dn, dv, geschat, lr, twijfel: geschat === 'd' || dv };
  }

  /* ---------- places, each with a period (original) ---------- */
  function plekken(n, J) {
    let k = n, via = 0; while (k >= 8 && !(C.WP[k] && C.WP[k].length) && via < 2) { k = k >> 1; via++; }
    if (k < 8 || !C.WP[k]) return { pl: [], via: 0, k: n };
    /* places of a child or grandchild always count weakly and for the whole life */
    const pl = C.WP[k].filter(e => C.PL[e[0]]).map(e => ({ p: e[0], z: via ? true : !!e[1], ev: via ? [] : e[2] }));
    if (J) venster(pl, J); else pl.forEach(o => { o.van = -1e4; o.tot = 1e4; });
    return { pl, via, k };
  }
  function venster(pl, J) {
    const B = J.b, D = J.d;
    pl.forEach(o => {
      o.ys = o.ev.map(e => e[1]).filter(y => y != null && y >= B - 1 && y <= D + 1).map(y => Math.max(B, Math.min(D, y)));
      o.lo = o.ys.length ? Math.min(...o.ys) : null; o.hi = o.ys.length ? Math.max(...o.ys) : null;
      o.geb = o.ev.some(e => e[0] === 'g' && e[1] <= B + 1); o.dood = o.ev.length > 0 && o.ev.every(e => e[0] === 'o');
    });
    const dat = pl.filter(o => o.lo != null);
    if (!dat.length) { pl.forEach(o => { o.van = B; o.tot = D; }); return; }
    /* the birthplace counts from birth; without a birthplace the earliest place */
    if (dat.some(o => o.geb)) dat.forEach(o => { if (o.geb) o.lo = B; }); else dat.reduce((a, c) => (c.lo < a.lo ? c : a)).lo = B;
    /* a place with only the death: from the last move or the marriage elsewhere */
    dat.forEach(o => { if (!o.dood || o.geb) return; let s = null; dat.forEach(q => { if (q !== o) q.ys.forEach(y => { if (y < o.hi && (s == null || y > s)) s = y; }); }); o.lo = s == null ? B : s; });
    /* each place runs until the first mention of another place */
    dat.forEach(o => { let nx = null; dat.forEach(q => { if (q !== o && (q.lo > o.hi || (q.lo === o.hi && q.lo > o.lo)) && (nx == null || q.lo < nx)) nx = q.lo; }); o.van = o.lo; o.tot = nx == null ? D : nx; });
    /* a place without a year: not in the years around the birthplace */
    const gp = dat.filter(o => o.lo === B).sort((a, c) => a.tot - c.tot)[0]; const st = gp && gp.tot < D ? gp.tot : B;
    pl.forEach(o => { if (o.lo == null) { o.van = st; o.tot = D; } });
  }
  const RANK = { P: 5, G: 4, W: 3, S: 2, R: 1 };
  function past(tags, PLK, v, t) {
    let best = null; const pl = PLK.pl.filter(o => o.van <= t && o.tot >= v);
    tags.forEach(tg => {
      if (tg === 'NL') return; const tl = tg.toLowerCase(); let l = null;
      pl.forEach(o => {
        const x = C.PL[o.p]; let m = null;
        if (ST.has(tg)) { if (!o.z && x[2].indexOf(tg) >= 0) m = 'S'; }
        else if (RT.has(tg)) { if (!o.z && x[3].indexOf(tg) >= 0) m = 'R'; }
        else if (x[0].some(a => a.toLowerCase() === tl)) m = o.z ? 'W' : 'P';
        else if (!o.z && x[1] && x[1].toLowerCase() === tl) m = 'G';
        if (m && (!l || RANK[m] > RANK[l])) l = m;
      });
      if (l && (!best || RANK[l] > RANK[best.l])) best = { l, t: tg };
    });
    const spec = tags.some(t => t !== 'NL' && !RT.has(t)), sub = tags.some(t => ST.has(t)), plek = tags.some(t => t !== 'NL' && !RT.has(t) && !ST.has(t));
    if (best && best.l === 'R' && sub) best = null;
    if (!best) return tags.indexOf('NL') >= 0 ? { l: 'NL', t: 'nationwide', spec } : null;
    best.spec = spec; best.plek = plek; return best;
  }

  /* ---------- timeline (original) ---------- */
  const SOORT = { oorlog: 1.5, ramp: 1.5, uitvinding: 1, 'dagelijks leven': 1 };
  function woorden(t) { return new Set(t.toLowerCase().replace(/cattle plague/g, 'rinderpest').replace(/[^a-zà-ÿ ]/g, ' ').split(/\s+/).filter(w => w.length >= 7)); }
  function leeftijd(v, t, J, hij) {
    const a = v - J.b, o = J.ba ? 'about ' : '', zn = hij === 'he' ? 'his' : 'her';
    if (v < J.b) { if (t >= J.d) return `${zn} whole life`; const e = t - J.b; return e <= 0 ? `just before ${zn} birth` : `until ${hij} was ${o}${e}`; }
    if (a === 0) {
      if (t - v > 1) return t >= J.d ? `${zn} whole life` : `from ${zn} birth until ${hij} was ${o}${t - J.b}`;
      return J.ba ? `around ${zn} birth` : `in the year of ${zn} birth`;
    }
    if (t - v > 1) return t > J.d ? `from when ${hij} was ${o}${a}` : `aged ${o}${a} to ${t - J.b}`;
    return `when ${hij} was ${o}${a}`;
  }
  /* Narrow (phone, side panel): 6 lines visible, otherwise 8. The card is never wider than 520 px, so in practice 6. */
  function kaartBreedte() { const el = document.getElementById('persoon-inhoud'); return (el && el.clientWidth) || 390; }
  function tijdlijn(n, J, PLK, hij) {
    const kand = [], L = Math.max(1, J.d - J.b);
    C.T.forEach((x, i) => {
      const v = x[0], t = x[1] || x[0]; if (t < J.b || v > J.d) return; const m = past(x[5], PLK, v, t); if (!m) return;
      const z = x[4] === 'ziekte'; let s;
      if (m.l === 'P') s = 6; else if (m.l === 'G') s = 4.5; else if (m.l === 'W') s = 3; else if (m.l === 'S') s = m.plek ? 2.5 : 4.5; else if (m.l === 'R') s = m.spec ? 1.5 : 3; else s = 2;
      if (z) s += m.l === 'NL' ? 1 : 2; s += SOORT[x[4]] || .3;
      const sp = t - v; if (sp > 40) s -= 1.5; if (sp > 100) s -= 1; if (v >= J.b) s += 1; if (v - J.b >= 15) s += .3; if (x[7] != null) s -= .5;
      /* the more of the life a background period covers, the lower it ranks */
      const dek = (Math.min(t, J.d) - Math.max(v, J.b)) / L; if (sp > 25 && dek > .5) s -= 2 * dek;
      /* life stage at the start: youth, middle, old age; what began before birth does not count */
      const fase = v < J.b ? -1 : Math.min(2, Math.floor((v - J.b) / L * 3));
      kand.push({ i, x, m, z, s, v, t, g: x[8] || '', lang: sp > 100 || (v < J.b && t >= J.d && sp > 25), fase, w: woorden(x[2]) });
    });
    if (!kand.length) return null;
    const bySc = (a, b) => b.s - a.s || a.v - b.v; kand.sort(bySc);
    const dub = (a, b) => Math.abs(a.v - b.v) <= 2 && [...a.w].some(w => b.w.has(w));
    /* may k be added? no duplicate, at most 3 diseases, 1 per event, 2 per (nearly) the same year, 1 long period */
    const mag = (lst, k) => {
      if (lst.some(o => dub(o, k)) || (k.z && lst.filter(o => o.z).length >= 3)
        || (k.g && lst.filter(o => o.g === k.g).length >= (C.GM[k.g] || 1)) || (k.lang && lst.some(o => o.lang))) return false;
      const al = lst.concat([k]); return al.every(o => al.filter(q => Math.abs(q.v - o.v) <= 1).length <= 2);
    };
    const TOPN = kaartBreedte() < 520 ? 6 : 8;
    const top = [], rest = [];
    kand.forEach(k => { if (top.length < TOPN && mag(top, k)) top.push(k); else rest.push(k); });
    if (top.length >= TOPN) {
      const eis = [[k => k.m.l === 'NL' && !k.z, 2], [k => k.z, 1]];
      if (J.d - J.b >= 20) [0, 1, 2].forEach(f => eis.push([k => k.fase === f, 1]));
      const ruil = (ok, min) => {
        let gelukt = true;
        while (gelukt && top.filter(ok).length < min) {
          gelukt = false;
          for (const k of rest.filter(ok)) {
            for (let j = top.length - 1; j >= 0 && !gelukt; j--) {
              const o = top[j]; if (ok(o)) continue;
              const nt = top.slice(0, j).concat(top.slice(j + 1)); if (!mag(nt, k)) continue; nt.push(k);
              if (eis.some(([f, m]) => top.filter(f).length >= m && nt.filter(f).length < m)) continue;
              top.length = 0; nt.sort(bySc).forEach(q => top.push(q)); rest.splice(rest.indexOf(k), 1); rest.push(o); gelukt = true;
            }
            if (gelukt) break;
          }
        }
      };
      eis.forEach(([f, m]) => ruil(f, m));
    }
    top.sort((a, b) => a.v - b.v || a.t - b.t); rest.sort((a, b) => a.v - b.v || a.t - b.t);
    const nogLeefde = J.twijfel ? ` (if ${hij} was still alive then)` : '';
    const item = k => {
      const x = k.x, yr = x[1] && x[1] !== x[0] ? `${x[0]}–${x[1]}` : `${x[0]}`;
      const tag = k.m.l === 'NL' ? '<span class="ctx-tag">nationwide</span>' : `<span class="ctx-tag r">${E(k.m.t)}</span>`;
      const lft = leeftijd(k.v, k.t, J, hij) + (k.v > J.lr && k.v > J.b ? nogLeefde : '');
      return `<li${k.z ? ' class="z"' : ''}><details><summary><span class="ctx-y getal">${yr}</span><span class="ctx-t">${E(x[2])} <span class="ctx-age">${E(lft)}</span>${k.z ? ` <span class="ctx-tag z">${ZIEKTE}outbreak</span>` : ''} ${tag}${VB(x[7])}</span>${PIJL}</summary><div class="ctx-tx"><p>${E(x[3])}</p>${VBR(x[7])}${bron(x[6])}</div></details></li>`;
    };
    const zn = hij === 'he' ? 'his' : 'her';
    const life = (J.ba ? 'about ' : '') + J.b + (J.ba || J.da ? ' to ' : '–') + (J.da ? 'about ' : '') + J.d;
    let uitleg = '';
    if (J.geschat === 'est') uitleg = ` (estimated, no record gives ${zn} birth or death year)`;
    else if (J.geschat === 'b' && J.dn) uitleg = ` (${zn} birth year and death year are unknown; ${hij} was still alive in ${J.d}, the list runs from 60 years earlier to ${J.d})`;
    else if (J.geschat === 'b' && J.dv) uitleg = ` (${zn} birth year is unknown and ${hij} died before ${J.d}; the list starts 60 years earlier)`;
    else if (J.geschat === 'b' && J.da) uitleg = ` (${zn} birth year is unknown and ${zn} death year is not known exactly; the list starts 60 years before ${J.d})`;
    else if (J.geschat === 'b') uitleg = ` (${zn} birth year is unknown; the list starts 60 years before ${zn} death)`;
    else if (J.geschat === 'd') uitleg = ` (${zn} death year is unknown; the list runs to 60 years after ${zn} birth)`;
    else if (J.dn) uitleg = ` (${zn} death year is unknown; ${hij} was still alive in ${J.d}, the list runs to ${J.d})`;
    const pn = [...new Set(PLK.pl.map(o => o.p))];
    let waar = '';
    if (pn.length) {
      const s = pn.slice(0, 4).join(', ') + (pn.length > 4 ? ` and ${pn.length - 4} others` : '');
      waar = PLK.via ? ` · Region: ${E(s)} (places of ${PLK.via === 1 ? (n % 2 ? 'her' : 'his') + ' child' : 'a grandchild'} ${E((K.P.get(PLK.k) || [''])[0])}; no place is listed for ${hij === 'he' ? 'him' : 'her'} personally)` : ` · Nationwide and in the region around ${E(s)}`;
    } else waar = ' · Nationwide only: no place of residence is listed';
    const zt = top.some(k => k.z) || rest.some(k => k.z);
    const leefNoot = J.twijfel && top.concat(rest).some(k => k.v > J.lr && k.v > J.b) ? ` After ${J.lr} it is not certain whether ${hij} was still alive.` : '';
    const html = `<p class="ctx-sub">${E(life)}${E(uitleg)}${waar}.${E(leefNoot)}${zt ? ' Disease outbreaks are marked with the word ‘outbreak’.' : ''} ${KT} a line for more.</p><ol class="ctx-tl">${top.map(item).join('')}</ol>${rest.length ? `<details class="ctx-more"><summary>More from this period (${rest.length})</summary><ol class="ctx-tl">${rest.map(item).join('')}</ol></details>` : ''}`;
    return { top, rest, html };
  }

  /* ---------- occupation (original) ---------- */
  function rx(a) { return new RegExp('(^|[^a-zà-ÿ])' + a.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-zà-ÿ])'); }
  function beroep(n, PLK, J) {
    const job = (K.P.get(n) || [])[3] || '';
    if (!job || typeof job !== 'string') return [];
    const j = job.toLowerCase(); let hits = [];
    C.B.forEach(b => {
      const ms = [b[0]].concat(b[1]).map((a, ai) => ({ a, pos: j.search(rx(a)), term: ai === 0 })).filter(m => m.pos >= 0);
      if (!ms.length) return;
      ms.sort((x, y) => (y.term - x.term) || (x.pos - y.pos) || (y.a.length - x.a.length));
      hits.push(Object.assign({ b }, ms[0]));
    });
    /* the same word for two occupations: the exact term beats an alias */
    hits = hits.filter(h => !hits.some(o => o !== h && o.a.toLowerCase() === h.a.toLowerCase() && o.term && !h.term));
    hits.sort((x, y) => x.pos - y.pos);
    const v = J ? J.b : -1e4, t = J ? J.d : 1e4;
    return hits.slice(0, 3).map(h => {
      const b = h.b, term = b[0].toLowerCase(), al = h.a.toLowerCase();
      const kaart = al.indexOf(term) < 0 ? ` <span class="ctx-op">(on the card: ${E(al)})</span>` : '';
      const streek = (b[5] || []).filter(r => { const m = past(r[1], PLK, v, t); return m && m.l !== 'NL'; }).map(r => r[0]);
      const tekst = [b[2]].concat(streek).join(' '); const [eerst, rest] = zin1(tekst);
      const src = b[3].length ? bron(b[3]) : (b[4] ? '' : '<div class="ctx-src">No source found: this is the ordinary meaning of the word.</div>');
      const binnen = (rest ? `<p>${E(rest)}</p>` : '') + VBR(b[4]);
      return { term, html: `<div class="ctx-beroep"><h3 class="ctx-term naam">${E(b[0])}${kaart}${VB(b[4])}</h3><p>${E(eerst)}</p>${LEES(binnen)}${src}</div>` };
    });
  }

  /* ---------- personal data: addresses, physical description, writing, money, extra (original) ---------- */
  function gmaps(q, pl) { return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(q + ', ' + pl); }
  function adressen(r) {
    if (!r.a || !r.a.length) return null;
    const a = r.a.slice().sort((x, y) => (y4(x[0]) || 0) - (y4(y[0]) || 0)); let kaart = false;
    const li = x => {
      const [jr, ad, pl, lk, v, st] = x;
      /* A note in brackets at the end goes on a line of its own as secondary text; the text itself does not change. */
      const m = String(ad).match(/^(.*?\S)\s+(\([^()]*\))$/);
      const hoofd = m ? E(m[1]) : E(ad), bijd = m ? E(m[2]) : '';
      const metPl = pl && ad.toLowerCase().indexOf(pl.toLowerCase()) < 0 ? E(pl) : '';
      const bij = [bijd, metPl].filter(Boolean).join(' · ');
      const mp = (st || []).map(s => { kaart = true; return `<a class="ctx-map" href="${E(gmaps(s, pl))}" target="_blank" rel="noopener">View ${st.length > 1 ? E(s) : 'this place'} on the map (current location)</a>`; }).join('');
      return `<li><span class="ctx-y getal">${E(jr)}</span><div class="ctx-adr-tekst"><span class="ctx-adres">${hoofd}${VB(v)}</span>${bij ? `<span class="ctx-adr-bij">${bij}</span>` : ''}${VBR(v)}${mp ? `<div class="ctx-maps">${mp}</div>` : ''}${bron(lk)}</div></li>`;
    };
    const NZ = 3, eerst = a.slice(0, NZ).map(li).join(''), meer = a.slice(NZ).map(li).join('');
    return { aantal: a.length, html: `<ul class="ctx-adr">${eerst}</ul>${meer ? `<details class="ctx-more"><summary>${a.length - NZ} more ${a.length - NZ > 1 ? 'addresses' : 'address'}</summary><ul class="ctx-adr">${meer}</ul></details>` : ''}${kaart ? '<p class="ctx-note">The map link searches for the street under its current name. The house may no longer exist, and street names and house numbers have sometimes changed.</p>' : ''}` };
  }
  /* The physical description from the context data is shown only for people without SIG; SIG is shown by the card itself in the fixed section. */
  function signalement(r, n) {
    if (!r.s || K.SIG.has(n)) return null; const [t, lk, v] = r.s;
    return `<p class="ctx-sig">${E(t)}${VB(v)}</p>${VBR(v)}${bron(lk)}`;
  }
  function schrijven(r) {
    if (!r.w) return null; const [kon, t, lk, v] = r.w;
    const ja = kon === true ? 'Yes.' : kon === false ? 'No.' : 'Not certain.';
    return `<p><b>${ja}</b> ${E(t)}${VB(v)}</p>${VBR(v)}${bron(lk)}`;
  }
  function geld(n) {
    const G = C.K[n]; if (!G || !G.length) return null;
    return { aantal: G.length, html: G.map(k => {
      const [bed, jr, eur, meth, verg, lk, v] = k;
      const binnen = (verg ? `<p>${E(verg)}</p>` : '') + VBR(v) + (meth ? `<p class="ctx-meth"><b>How this was calculated.</b> ${E(meth)}</p>` : '') + bron(lk);
      return `<div class="ctx-geld"><p><b>${E(bed)}</b> is worth ${E(eur)} today.${VB(v)}</p>${LEES(binnen)}</div>`;
    }).join('') };
  }
  function extra(r) {
    if (!r.x || !r.x.length) return null;
    return { aantal: r.x.length, html: `<ul class="ctx-x">${r.x.map(x => `<li>${E(x[0])}${VB(x[2])}${VBR(x[2])}${bron(x[1])}</li>`).join('')}</ul>` };
  }

  /* ---------- sections of the person card ---------- */
  /* One calculation per person: the card asks for render and count one after the other for the same n. */
  let cache = { n: null };
  function basis(n) {
    if (cache.n !== n) {
      const J = jaren(n);
      cache = { n, J, PLK: plekken(n, J), r: C.PS[n] || {}, hij: n % 2 === 0 ? 'he' : 'she', tl: undefined, br: undefined };
    }
    return cache;
  }
  function tl(n) { const b = basis(n); if (b.tl === undefined) b.tl = b.J ? tijdlijn(n, b.J, b.PLK, b.hij) : null; return b.tl; }
  function br(n) { const b = basis(n); if (b.br === undefined) b.br = beroep(n, b.PLK, b.J); return b.br; }
  const el = (cls, html) => { const d = document.createElement('div'); d.className = 'ctx ' + cls; d.innerHTML = html; return d; };
  const zn = n => (n % 2 === 0 ? 'his' : 'her');
  const geldt = n => n >= 8 && K.P.has(n);

  K.secties.voeg({ id: 'tijdlijn', volgorde: 10, geldt, titel: n => `What happened in ${zn(n)} life`,
    aantal: n => { const t = tl(n); return t ? t.top.length : null; },
    render: n => { const t = tl(n); return t ? el('ctx-tijdlijn', t.html) : null; } });
  K.secties.voeg({ id: 'beroep', volgorde: 20, geldt, titel: n => `What ${zn(n)} occupation involved`,
    aantal: n => { const h = br(n); return h.length > 1 ? h.length : null; },
    render: n => { const h = br(n); return h.length ? el('ctx-beroepen', h.map(x => x.html).join('')) : null; } });
  K.secties.voeg({ id: 'adressen', volgorde: 30, geldt, titel: 'Addresses',
    aantal: n => { const a = adressen(basis(n).r); return a ? a.aantal : null; },
    render: n => { const a = adressen(basis(n).r); return a ? el('ctx-adressen', a.html) : null; } });
  K.secties.voeg({ id: 'militieregister', volgorde: 34, geldt, titel: 'Physical description from the military register', aantal: null,
    render: n => { const h = signalement(basis(n).r, n); return h ? el('ctx-signalement', h) : null; } });
  K.secties.voeg({ id: 'schrijven', volgorde: 36, geldt, titel: n => `Could ${basis(n).hij} write?`, aantal: null,
    render: n => { const h = schrijven(basis(n).r); return h ? el('ctx-schrijven', h) : null; } });
  K.secties.voeg({ id: 'geld', volgorde: 40, geldt, titel: 'Money then and now',
    aantal: n => { const g = geld(n); return g ? g.aantal : null; },
    render: n => { const g = geld(n); return g ? el('ctx-geld-lijst', g.html) : null; } });
  K.secties.voeg({ id: 'archief', volgorde: 45, geldt, titel: 'More from the archives',
    aantal: n => { const x = extra(basis(n).r); return x ? x.aantal : null; },
    render: n => { const x = extra(basis(n).r); return x ? el('ctx-archief', x.html) : null; } });
})();

