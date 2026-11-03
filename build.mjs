#!/usr/bin/env node
// build.mjs: assembles the single-file app (dist/index.html) from the sources.
//
//   node build.mjs                      build with the demo data in data/
//   node build.mjs --data path/to/data  build with your own data folder
//   node build.mjs --out dist/my.html   choose the output file
//
// The sources are:
//   index.template.html   the page shell with {{css}}, {{data}} and {{js}} placeholders
//   src/css/*.css         styles, in the order listed in src/manifest.json
//   src/js/*.js           scripts, in the order listed in src/manifest.json
//   data/*.json           the family data, one file per block (see docs/data-format.md)
//
// No dependencies. Node 18 or later.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = k => (args.includes('--' + k) ? args[args.indexOf('--' + k) + 1] : null);
const dataDir = path.resolve(root, opt('data') || 'data');
const outFile = path.resolve(root, opt('out') || 'dist/index.html');

const read = (...p) => fs.readFileSync(path.join(...p), 'utf8');
const manifest = JSON.parse(read(root, 'src', 'manifest.json'));

const css = manifest.css.map(f => read(root, 'src', 'css', f)).join('');
const js = manifest.js.map(f => read(root, 'src', 'js', f)).join('');

// Data: one `const NAME=<json>;` line per block. Blocks listed under "sets" become `new Set([...])`.
const sets = new Set(manifest.sets || []);
const data = manifest.data.map(name => {
  const file = path.join(dataDir, name + '.json');
  if (!fs.existsSync(file)) throw new Error('Missing data file: ' + file);
  const raw = fs.readFileSync(file, 'utf8').trim();
  try { JSON.parse(raw); } catch (e) { throw new Error(name + '.json is not valid JSON: ' + e.message); }
  return sets.has(name) ? `const ${name}=new Set(${raw});\n` : `const ${name}=${raw};\n`;
}).join('');

const template = read(root, 'index.template.html');
for (const t of ['{{css}}', '{{data}}', '{{js}}']) {
  if (template.split(t).length !== 2) throw new Error('index.template.html must contain ' + t + ' exactly once');
}
// A replacer function avoids "$&"-style patterns in the data being interpreted.
const html = template.replace('{{css}}', () => css).replace('{{data}}', () => data).replace('{{js}}', () => js);

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html, 'utf8');
console.log(`Built ${path.relative(process.cwd(), outFile) || outFile} (${(html.length / 1024).toFixed(0)} KB) from ${manifest.css.length} css, ${manifest.js.length} js and ${manifest.data.length} data files.`);
