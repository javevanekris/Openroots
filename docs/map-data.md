# Map data (`B.json` and `PL.json`)

The Map view needs both blocks. If `B` or `PL` is `null` or empty, the view shows "No map data yet". The demo has an invented region ("Greenmere") in `examples/demo/B.json`.

## Projection
Positions are in a flat plane, computed as `x = (lon - 3.3) * cos(52.2 deg) * 180` and `y = (53.6 - lat) * 180`. These constants are fixed in `src/js/kaart-kaart.js` (function `pr`). They are used for the region boxes in `B.reg`. Everything else (outlines, `B.pl` positions, labels) you must supply already in this plane. This is Netherlands-specific: for another country either use the same formula, or change the constants.

## B (the base map)
| Key | Meaning |
|---|---|
| `land` | SVG path of the main land (even-odd fill) |
| `nb` | SVG path of neighbouring land, drawn under it |
| `enc` | SVG path of enclaves or lakes inside the land |
| `bin` | SVG path of inner borders (lines) |
| `lg` | optional path drawn as a wide gap line; may be `""` |
| `nl` | `[x0, y0, x1, y1]` box of the main country (used on phones) |
| `box` | the same for the whole map including places abroad |
| `lbl` | labels `{t, x, y, s: "w"|"l", f}`; `w` water with font size `f`, `l` land |
| `reg` | zoom regions: name to `[latMin, latMax, lonMin, lonMax]` |
| `pl` | per place `{x, y, prov, kort, gem, reg, vs, land}`: position, province, short name, municipality, region (omit for "outside regions"), `vs: 1` if the dot was moved onto land, `land` for a place abroad |
| `genjaar` | generation number to median birth year, for the filter |
| `tot` | `{alle, plaats}`: ancestors from No. 8 up, and how many have a place |
| `verschoven` | names of the places with `vs: 1` |
| `km` | kilometres per unit in the plane (0.6177 with the projection above) |

## PL (places)
Place name to `{lat, lon, w, a, p}`. `lat`, `lon`, `w` are informational. `a` lists other spellings. `p` is `[[number, line, events], ...]` where line is 4 to 7 (the grandparent line; 0 for Nos. 1 to 3) and events is `{geboren, getrouwd, overleden, akte: year, woonde: null, achternaam: null}`. `woonde` means named in a note, `achternaam` means only the surname points here. Every place in `PL` must exist in `B.pl`, or the view fails.

## What you must supply for your own region
Outline paths, neighbours, the label list, region boxes, a position for every place, and the totals. Hard-coded Dutch bits: the projection, the label name `Markermeer` (hidden on phones), and four fixed grandparent lines.

A helper that builds the outline from Natural Earth public-domain data is planned. No date is promised.
