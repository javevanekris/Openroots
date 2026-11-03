#!/usr/bin/env node
// make-map.mjs: builds the base map of B.json from Natural Earth data (public domain).
//
//   node tools/make-map.mjs --geojson ne_10m_admin_0_map_units.geojson --main England \
//     --neighbours Wales,Scotland,Ireland,France --window -8,2.2,49.8,56 --scale 100 \
//     --out my-data/B.json
//
// Get the data from https://www.naturalearthdata.com/ ("Admin 0 - Map Units", 1:10m, GeoJSON), or
// https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
//
// What it writes into --out (an existing file is kept, only these keys change):
//   land, nb, enc, bin, lg, nl, box, proj, km   (bin is the outline of the main area, so its border with the neighbours shows)
// What it does not write: lbl, reg, pl, genjaar, tot, verschoven. See docs/map-data.md.
//
// Options
//   --geojson   Natural Earth GeoJSON file
//   --main      name of the main area (matches NAME, NAME_LONG or ADMIN, case-insensitive)
//   --neighbours  comma separated names of land drawn underneath, optional
//   --window    lonMin,lonMax,latMin,latMax: everything outside is cut off. Default: the main area plus 1 degree.
//   --scale     plane units per degree of latitude, default 100 (bigger = more detail, bigger file)
//   --tolerance simplification in plane units, default 0.8
//   --out       B.json to write, default: print to the screen
import fs from 'node:fs';

const arg = {};
for (let i = 2; i < process.argv.length; i += 2) arg[process.argv[i].replace(/^--/, '')] = process.argv[i + 1];
if (!arg.geojson || !arg.main) { console.error('Usage: node tools/make-map.mjs --geojson <file> --main <name> [--neighbours a,b] [--window lonMin,lonMax,latMin,latMax] [--scale 100] [--tolerance 0.8] [--out B.json]'); process.exit(1); }

const gj = JSON.parse(fs.readFileSync(arg.geojson, 'utf8'));
const S = +(arg.scale || 100), TOL = +(arg.tolerance || 0.8);
const names = f => [f.properties.NAME, f.properties.NAME_LONG, f.properties.ADMIN, f.properties.NAME_EN].filter(Boolean).map(s => s.toLowerCase());
const find = n => {
  const hits = gj.features.filter(f => names(f).includes(n.toLowerCase()));
  if (!hits.length) { console.error('Not found in the file: ' + n); process.exit(1); }
  return hits[0];
};
const rings = f => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates).map(p => p[0]); // outer rings only

const mainF = find(arg.main), nbF = (arg.neighbours ? arg.neighbours.split(',') : []).map(s => find(s.trim()));
let [lonMin, lonMax, latMin, latMax] = arg.window ? arg.window.split(',').map(Number) : (() => {
  const pts = rings(mainF).flat(); const lo = pts.map(p => p[0]), la = pts.map(p => p[1]);
  return [Math.min(...lo) - 1, Math.max(...lo) + 1, Math.min(...la) - 1, Math.max(...la) + 1];
})();

// ---- projection: the same family as the app (equirectangular with one standard parallel)
const lat1 = (latMin + latMax) / 2, C0 = Math.cos(lat1 * Math.PI / 180);
const proj = { lon0: lonMin, lat0: latMax, lat1: +lat1.toFixed(2), s: S };
const pr = (lon, lat) => [(lon - lonMin) * C0 * S, (latMax - lat) * S];

// ---- Sutherland-Hodgman clip against the window (in degrees)
function clip(ring) {
  const edges = [
    [p => p[0] >= lonMin, (a, b) => { const t = (lonMin - a[0]) / (b[0] - a[0]); return [lonMin, a[1] + t * (b[1] - a[1])]; }],
    [p => p[0] <= lonMax, (a, b) => { const t = (lonMax - a[0]) / (b[0] - a[0]); return [lonMax, a[1] + t * (b[1] - a[1])]; }],
    [p => p[1] >= latMin, (a, b) => { const t = (latMin - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), latMin]; }],
    [p => p[1] <= latMax, (a, b) => { const t = (latMax - a[1]) / (b[1] - a[1]); return [a[0] + t * (b[0] - a[0]), latMax]; }],
  ];
  let out = ring.slice(0, -1);
  for (const [inside, cut] of edges) {
    const inp = out; out = [];
    for (let i = 0; i < inp.length; i++) {
      const a = inp[i], b = inp[(i + 1) % inp.length];
      if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b));
    }
    if (!out.length) return [];
  }
  return out;
}

// ---- Douglas-Peucker on a closed ring
function dp(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Array(pts.length).fill(false); keep[0] = keep[pts.length - 1] = true;
  // A closed ring starts and ends on the same point, so first split at the point farthest from it.
  let far = 1, fd = -1; for (let i = 1; i < pts.length - 1; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
  keep[far] = true;
  const stack = [[0, far], [far, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop(); let max = 0, idx = -1;
    const [x1, y1] = pts[a], [x2, y2] = pts[b], dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-9;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dy * pts[i][0] - dx * pts[i][1] + x2 * y1 - y2 * x1) / len; if (d > max) { max = d; idx = i; } }
    if (max > tol) { keep[idx] = true; stack.push([a, idx], [idx, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
const area = pts => Math.abs(pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
const r1 = n => +n.toFixed(1);

function toPath(feats, minArea) {
  let d = '', all = [];
  for (const f of feats) for (const ring of rings(f)) {
    const c = clip(ring); if (c.length < 3) continue;
    let p = c.map(([lo, la]) => pr(lo, la));
    if (area(p) < minArea) continue;
    p = dp([...p, p[0]], TOL).slice(0, -1); if (p.length < 3) continue;
    all.push(...p);
    d += 'M' + p.map(([x, y]) => r1(x) + ' ' + r1(y)).join('L') + 'Z';
  }
  return { d, pts: all };
}

const main = toPath([mainF], 15), nb = toPath(nbF, 30);
const W = r1((lonMax - lonMin) * C0 * S), H = r1((latMax - latMin) * S);
const xs = main.pts.map(p => p[0]), ys = main.pts.map(p => p[1]);
const m = 10, nl = [Math.max(0, Math.floor(Math.min(...xs) - m)), Math.max(0, Math.floor(Math.min(...ys) - m)), Math.min(W, Math.ceil(Math.max(...xs) + m)), Math.min(H, Math.ceil(Math.max(...ys) + m))];

const base = { land: '', nb: '', enc: '', bin: '', lg: '', nl: [0, 0, 100, 100], box: [0, 0, 100, 100], lbl: [], pl: {}, reg: {}, genjaar: {}, tot: { alle: 0, plaats: 0 }, verschoven: [], km: 1 };
let B = base;
if (arg.out && fs.existsSync(arg.out)) { try { B = { ...base, ...JSON.parse(fs.readFileSync(arg.out, 'utf8')) }; } catch { /* start fresh */ } }
Object.assign(B, { land: main.d, nb: nb.d, enc: '', bin: main.d, lg: '', nl, box: [0, 0, W, H], proj, km: +(111.195 / S).toFixed(4) });

if (arg.out) { fs.writeFileSync(arg.out, JSON.stringify(B) + '\n'); console.log(`Wrote ${arg.out}: land ${(main.d.length / 1024).toFixed(1)} KB, neighbours ${(nb.d.length / 1024).toFixed(1)} KB, plane ${W} x ${H}, ${S} units per degree.`); }
else console.log(JSON.stringify({ land: main.d, nb: nb.d, nl, box: B.box, proj, km: B.km }));
console.log('proj = ' + JSON.stringify(proj) + ' (the app needs this to place region boxes; positions in B.pl use it too)');
