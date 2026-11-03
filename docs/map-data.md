# Map data (`B.json` and `PL.json`)

The Map view needs both blocks. If `B` or `PL` is `null` or empty, the view shows "No map data yet".
The demo draws England from public-domain Natural Earth data, with invented villages at real positions.

## The quick way: make the base map with a script

```bash
# 1. Download "Admin 0 - Map Units" (1:10m, GeoJSON) from https://www.naturalearthdata.com/
#    or from https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
# 2. Build the outline for your country, here England with its neighbours:
node tools/make-map.mjs --geojson ne_10m_admin_0_map_units.geojson --main England \
  --neighbours Wales,Scotland,Ireland,France --window -8,2.2,49.8,56 --out my-data/B.json
```

The script fills `land`, `nb`, `enc`, `bin`, `lg`, `nl`, `box`, `proj` and `km`, and leaves the other keys alone.
`--window` is `lonMin,lonMax,latMin,latMax`: everything outside is cut off. `--scale` is the number of
plane units per degree (default 100). A bigger number gives more detail and a bigger file.

You still add the labels, regions and places yourself (see below). Ask an agent to do it.

## Projection

Positions live in a flat plane. `B.proj` says how latitude and longitude map onto it:

```
x = (lon - proj.lon0) * cos(proj.lat1) * proj.s
y = (proj.lat0 - lat) * proj.s
```

`lon0` is the left edge, `lat0` the top edge, `lat1` the parallel that sets the width, and `s` the units per degree.
The script writes `proj` for you. Region boxes in `B.reg` use it, and you use it to compute the `x` and `y` of every place in `B.pl`.
Without `proj` the app uses the plane of its first data, which fits the Netherlands.

## B (the base map)

| Key | Meaning |
|---|---|
| `land` | SVG path of the main land (even-odd fill) |
| `nb` | SVG path of neighbouring land, drawn under it |
| `enc` | SVG path of enclaves or lakes inside the land, may be `""` |
| `bin` | SVG path of inner borders (lines), may be `""`. The script uses the outline of the main land |
| `lg` | optional path drawn as a wide gap line, may be `""` |
| `nl` | `[x0, y0, x1, y1]` box of the main country (used on phones) |
| `box` | the same for the whole map including places abroad |
| `proj` | the projection, see above |
| `lbl` | labels `{t, x, y, s: "w"\|"l", f, hid}`: `w` water with font size `f`, `l` land. `hid: 1` hides it on phones when zoomed out |
| `reg` | zoom regions: name to `[latMin, latMax, lonMin, lonMax]` |
| `pl` | per place `{x, y, prov, kort, gem, reg, vs, land}`: position, province or county, short name, municipality or parish, region (omit for "outside regions"), `vs: 1` if the dot was moved onto land, `land` for a place abroad |
| `genjaar` | generation number to median birth year, for the filter |
| `tot` | `{alle, plaats}`: ancestors from No. 8 up, and how many have a place |
| `verschoven` | names of the places with `vs: 1` |
| `km` | kilometres per unit in the plane: `111.195 / proj.s` |

## PL (places)

Place name to `{lat, lon, w, a, p}`. `lat`, `lon` and `w` are informational. `a` lists other spellings.
`p` is `[[number, line, events], ...]`, where line is 4 to 7 (the grandparent line; 0 for Nos. 1 to 3) and events is
`{geboren, getrouwd, overleden, akte: year, woonde: null, achternaam: null}`. `woonde` means named in a note,
`achternaam` means only the surname points here. Every place in `PL` must exist in `B.pl`, or the view fails.

## What is still fixed in the app

- Four grandparent lines, numbered 4 to 7. That follows from the Ahnentafel numbering.
- The region names in `B.reg` must also appear in `C.RT` of the context data if you want the history events to match them.
