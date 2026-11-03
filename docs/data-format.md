# Data format

The chart is built from 21 JSON files in one folder (`node build.mjs --data <folder>`). Each file becomes one `const NAME=<json>;`. A complete fictional example is in `examples/demo/`. Block names and tokens are still Dutch in this version (`levend`, `geboren`, `akte`, `woonde` ...). Keep them exactly.

## Numbering (Ahnentafel)

Person 1 is the owner. The father of person n is 2n, the mother is 2n+1. Even numbers are men, odd numbers are women. A couple is the pair (2k, 2k+1). Generation g holds numbers 2^(g-1) to 2^g - 1. A key may be missing: that is an "open end". All keys in JSON are strings of the number (`"12"`).

## Date strings in P, M, KIND

Format: `° 10-12-1960, Place`. Symbols: `°` born, `~` baptised, `†` died, `⚰` buried, `⚭` married, `≈` estimated. Words also accepted: `bapt.`, `baptised`, `bur.`, `buried`, `died`, `originally from X`, `lived X`.
Dates: `DD-MM-YYYY`, `MM-YYYY`, `YYYY`, `March 1884`, `14/17-03-1712` (two possible days). Qualifiers: `about`, `c.`, `circa`, `before`, `after`, `between 1850 and 1852`, `probably`, `presumably`, `possibly`, `candidate`, `?`. The place is the first capitalised part without digits, after the date and a comma. Anything not understood is shown as typed.

## Blocks

| Block | Key | Value | Used by |
|---|---|---|---|
| `CFG` | none | object, see `config.md` | titles, contact, confirmed numbers |
| `P` | number | `[name, born, died, occupation]`; only the name is required | everywhere |
| `M` | number of the father (even) | `"⚭ 12-06-1982, Place"`; also `marriage banns`, `2nd marriage`, `with Name`, or `⚭ (1) ...; (2) ...` | person card |
| `SRC` | number | source codes joined by ` · `, for example `"A · B?"`. `?` = link to this person uncertain | person card, "Records and sources" |
| `NEW` | array of numbers | people added in the latest update (loaded; no view uses it yet) | none |
| `NOTE` | number | research note, text | person card |
| `AKTE` | number | `[[label, url], ...]`; a label with a date sorts by date; a label starting with `[tag]` is shown as an internal tag | person card, evidence |
| `VB`, `NB`, `OB` | arrays of numbers | status sets, see below | status everywhere |
| `SIG` | number | `[text, source label, url]` physical description | person card |
| `KRANT` | number | `[[label, url], ...]` newspaper notices | person card |
| `VERHAAL` | number | story, text | person card |
| `EST` | number | `"≈ 1760 – ≈ 1825"` (two years); used only when no year is in P | life span |
| `FOTO` | number | `[[data URI or URL, caption], ...]` | person card |
| `GEN` | array | index = generation; `"Generation 4 · Great-grandparents"`; only the part after ` · ` is used | generation names |
| `C` | object | context, see below. `null` switches it off | person card sections |
| `B`, `PL` | objects | map, see `map-data.md`. `null` or empty = no map | Map view |
| `KIND` | number of the father | array of children, or `{k:[...], z:"levend"}` | person card "Children" |
| `UPD` | array | `{d:"YYYY-MM-DD"|null, v:"version", t:"title", p:["point", ...]}`, newest first | Updates view |

Text is plain text (it is escaped). Empty or missing blocks are allowed: use `{}` or `[]`, and the view shows an empty state.

### Source codes (SRC)
Each code is one or two capital letters. They are explained in the lists `<li>A · description</li>` in the Guide of `index.template.html` (inside `#panel`). Edit that list to match your codes.

### Status
Shown with a shape and a label, never by colour alone.
- Confirmed by a record (`akte`): the person has entries in `AKTE`, or is listed in `CFG.confirmedByOwner`, and is in none of `VB`, `NB`, `OB`.
- Supported: number is in `OB`.
- With reservation: number is in `VB`.
- Unconfirmed: number is in `NB`.
A person can be in `VB` and `NB` both. No record, no set, not confirmed by the owner: "No record".

### KIND
Child: `{n: name, g: "° date, place", kw: own number, kw2: second number (pedigree collapse), o: "† date, place (2)" for died young, vb: reason for reservation, nt: note, a: [[label, url]]}`. `z: "levend"` says the children may be alive; any other `z` text means "not searched yet". If every child has `kw` and no `a`, a "none found" text shows.

### C (context)
Needed only for the extra sections on cards of No. 8 and up. Provide all ten parts, or set `C` to `null`.
- `T`: timeline `[from, to|null, title, text, kind, tags[], sourceUrls[], reservation|null, group]`. kind: `oorlog` (war), `ramp` (disaster), `uitvinding` (invention), `dagelijks leven` (daily life), `ziekte` (outbreak). Tag `NL` means nationwide; other tags are place names, sub-regions (`ST`) or regions (`RT`).
- `B`: occupations `[term, aliases[], description, sourceUrls[], reservation|null, [[regional text, tags[]], ...]]`, matched on the occupation in `P`.
- `K`: money by number `[[what, year, "today's value", method, comparison, urls[], reservation|null]]`.
- `PS`: per number `{a: addresses [[year, address, place, urls[], reservation|null, streets[]]], s: [text, urls, reservation], w: [true|false|null, text, urls, reservation] (could he/she write), x: [[text, urls, reservation]]}`.
- `PL`: place `[aliases[], municipality, subRegionTags[], regionTags[]]`.
- `WP`: per number `[[place, weak(0|1), [["g"|"h"|"o", year], ...]]]` (g born, h married, o died). Places must exist in `C.PL`.
- `LR`: per number, year of the last record.
- `ST`, `RT`: lists of the sub-region and region tags. `GM`: group name to maximum shown per group.

### UPD, GEN, CFG
See the table. Without a `d`, put the period before a colon in `t`: `"Between 1 and 4 October: ..."`.

## Netherlands-specific
The tokens above are Dutch. `C` tags use `NL`. The map projection is fixed (see `map-data.md`). Opening records on `openarchieven.nl` are counted separately in the evidence line.

## Filling in your chart in 10 steps
1. Copy `examples/demo/` to a new folder.
2. Empty all blocks (`{}` or `[]`) and edit `CFG.json`.
3. Put yourself in `P` as No. 1, then your parents as 2 and 3.
4. Add each generation: father 2n, mother 2n+1.
5. Add `M`, and the source codes in `SRC` plus the Guide list.
6. Add record links in `AKTE`.
7. Put uncertain people in `VB`, `OB` or `NB` and explain in `NOTE`.
8. Add stories, photos, children (`KIND`) and updates.
9. Set `C`, `B`, `PL` to `null` if you have no map or context data.
10. Run `node build.mjs --data <folder>` then `node tools/smoke.mjs dist/index.html`.

## Privacy
Do not put living people in a public repository. Leave out names, dates and places of anyone who may be alive, or keep that data private.
