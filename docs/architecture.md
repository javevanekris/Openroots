# How OpenRoots is built

OpenRoots is plain HTML, CSS and JavaScript with no framework and no runtime dependencies. A small
Node script glues the pieces into one file, and that file is the whole app.

## The pipeline

```
index.template.html  ─┐
src/css/*.css         ├─ build.mjs ──►  dist/index.html   (one file, works offline)
src/js/*.js           │
your data/*.json     ─┘
```

`node build.mjs` reads `src/manifest.json`, which lists the CSS files, the JS files and the data blocks
in the order they load. It then replaces three placeholders in `index.template.html`:

| Placeholder | Becomes |
|---|---|
| `{{css}}` | all CSS files, joined, inside `<style id="ui-css">` |
| `{{data}}` | one line `const NAME=<json>;` per data block, inside `<script id="data">` |
| `{{js}}` | all JS files, joined, inside `<script id="ui-js">` |

The blocks `NEW`, `VB`, `NB` and `OB` are written as `new Set([...])`. A missing data file is an error, so the
default `data/` folder holds an empty file for every block. Options: `--data <folder>` and `--out <file>`.

## Data flow

1. The data blocks become global constants in the page (see [data-format.md](data-format.md)).
2. `src/js/kern.js` runs first. It copies the globals into `window.kern`, turns the objects into `Map`s and
   `Set`s keyed by Ahnentafel number, and offers the rules everyone shares.
3. Each other module registers itself with `kern` when it loads.
4. When the page has loaded, `kern.start()` reads the URL hash, mounts the matching view and listens for changes.

Nothing is fetched at runtime and nothing is written back. The data never leaves the page.

## The core, `kern.js`

| Part | What it does |
|---|---|
| `kern.P`, `M`, `SRC`, `NOTE`, `AKTE`, ... | the data blocks as `Map`s keyed by number; `VB`, `NB`, `OB`, `NEW` as `Set`s |
| `kern.CFG` | the settings from `CFG.json`, with defaults (see [config.md](config.md)) |
| `kern.generatie(n)`, `kern.kind(n)`, `kern.ouders(n)` | Ahnentafel arithmetic: father of `n` is `2n`, mother `2n+1`, child is `floor(n/2)` |
| `kern.status(n)` | the status of a person: `akte` (confirmed by a record), `onderbouwd` (supported), `voorbehoud` (with reservation), `nietbevestigd` (unconfirmed) |
| `kern.leven(n)` | parses the life-course strings of `P` (born, baptised, died, buried, married, origin) into dates and places |
| `kern.relatie(n)` | the relation to the owner in words, such as "great-grandmother of Alex" |
| `kern.ga(hash)`, `kern.openPersoon(n)` | the router on the URL hash |
| `kern.registreer(name, {monteer})` | how a view registers itself |
| `kern.secties.voeg({id, render, volgorde, geldt})` | how a block is added to the person card |
| `kern.esc(text)` | HTML escaping. Every piece of data that reaches the page goes through it |

## Statuses

A person has a status from the data, never from code:

- Confirmed by a record: the person has entries in `AKTE`, or is in `CFG.confirmedByOwner`, and is in none of the other sets.
- Supported: the number is in `OB`.
- With reservation: the number is in `VB`.
- Unconfirmed: the number is in `NB`.
- A person can be in `VB` and `NB` at once. With none of these and no record, the status is "No record".

The agent skill uses `confirmed`, `probable`, `possible` and `unverified`. They map onto the four statuses in
`skills/ancestor-research/SKILL.md`, step 12.

## The views

Each view is one JS file, one CSS file and one route.

| Route | Files | What it shows |
|---|---|---|
| `#boom`, `#boom/<n>` | `weergaven-boom-boom` | the tree: a pedigree diagram, portrait on phones, landscape on larger screens |
| `#persoon/<n>` | `weergaven-persoon-persoon`, `context-context`, `kinderen-kinderen` | the person card: life, sources, story, family, children, context |
| `#overzicht` | `weergaven-overzicht-overzicht`, `-telling` | generations as bars, by grandparent line and certainty |
| `#kaart` | `kaart-kaart` | the map of where ancestors came from (see [map-data.md](map-data.md)) |
| `#register`, `#register/<term>` | `weergaven-register-register` | everyone in Ahnentafel order, with search and filters |
| `#voortgang` | `weergaven-voortgang-voortgang` | progress in figures, open ends and what is attached |
| `#uitleg` | in `index.template.html` | the Guide. It also opens on its own when the chart has no people |
| `#updates` | `weergaven-updates-updates` | what was found or improved, one entry per day |
| `#contact` | `weergaven-contact-contact` | who to write to, from `CFG.contact` |

All numbers on Overview and Progress come from one function, `kern.telling()`
(`weergaven-overzicht-telling.js`). It counts everything in one pass and caches the result.

## Adding a view

1. Add `src/js/weergaven-<name>-<name>.js` and, if it needs styling, a CSS file. Add both to `src/manifest.json`.
2. In the JS file call `kern.registreer('<name>', { monteer(el, params) { ... } })`.
3. Add a link to the navigation in `index.template.html`, with `href="#<name>"`.
4. Take every figure from `kern`, escape every piece of data with `kern.esc`, and respect
   `prefers-reduced-motion` and the rules in [CONTRIBUTING.md](../CONTRIBUTING.md).

## Adding a block to the person card

Call `kern.secties.voeg({ id, render(n) { return html; }, geldt(n) { return true; }, volgorde: 50 })`.
`render` receives the Ahnentafel number and returns HTML. `geldt` says whether the block applies to that person.
`kinderen-kinderen.js` is a small example.

## Source letters

The Guide in `index.template.html` lists the source codes (`A`, `B`, ...) in an `<ol>` inside `#panel`.
`kern.BRON` reads that list at start. Edit the list to match the codes you use in `SRC.json`.

## Checking your work

```bash
node build.mjs --data examples/demo --out dist/demo.html
node tools/smoke.mjs dist/demo.html      # needs jsdom, see CONTRIBUTING.md
node build.mjs && node tools/smoke.mjs dist/index.html   # the empty chart must work too
```

`tools/smoke.mjs` visits every route in a simulated browser and fails on any error or empty view.
It cannot judge layout, so look at the demo in a real browser as well.

## Names in the code

The interface text is English. Many identifiers are still Dutch, from the first version. The ones you meet most:

| Dutch | English | Dutch | English |
|---|---|---|---|
| `boom` | tree | `weergave`, `weergaven` | view, views |
| `kaart` | map | `monteer` | mount |
| `overzicht` | overview | `registreer` | register (a view) |
| `voortgang` | progress | `secties` | person card sections |
| `uitleg` | guide | `persoon` | person |
| `kinderen` | children | `kern` | core |
| `akte` | record (civil or church) | `onderbouwd` | supported |
| `voorbehoud` | reservation | `nietbevestigd` | unconfirmed |

[glossary.md](glossary.md) has the full list. Renaming them is a planned cleanup, best done in a pull request of its own.
