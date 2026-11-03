# Sources: where to look, and what each allows

Only free and open sources. Check each site's terms before a new kind of use, and record
the date you checked. When a site offers an official API or bulk download, use that instead
of reading pages. When it offers neither, read public search results at human pace.

**Never:** log in to a paid service, use another person's login, solve or bypass a CAPTCHA,
fetch pages a robots.txt forbids, or hammer a site. A paid site's hint is a lead only.

## Tier 1: original records with an open index

### Open Archives (Open Archieven), Netherlands and linked archives
- What: more than 300 million person mentions from civil registration, church books,
  population registers, notarial and other records, indexed by many Dutch and some
  Belgian, Surinamese and other archives. Each hit links to the holding archive and,
  where available, a scan.
- Access: free JSON API, no key. Throttled to 4 requests per second per IP.
  `https://api.openarchieven.nl/1.1/records/search.json?name=...`
  Use `scripts/openarch.mjs`; it handles throttling and normalising.
- Search tips: the `name` field accepts a period (`Jansen 1880-1890`) and two names joined
  by `&` (`Jan Jansen & Maria de Wit`) to find a couple. Filters: `eventplace`,
  `birthplace`, `archive_code`, `sourcetype`, `relationtype`, `country_code`.
- Records show the event as a whole (a birth lists child, father, mother). Use the `show`
  command to read all persons on one record.
- Allowed: API use within the rate limit. Show attribution and link back to the record.
- Coverage (checked 2026-11-03, one surname): Dutch records are about 99 percent of the index.
  Belgium, France and Suriname hold a few hundred to a few thousand hits each. Any other
  `country_code` is silently ignored and the search runs unfiltered, so a large hit count for
  "de" or "us" is not German or American data. Use `references/regions.md` for those countries.
- The API has no known geographic restriction: it is reachable from any country.

### Other open national and regional record sources
Verify the current terms on each before use.
- **Nationaal Archief (Netherlands):** inventories and some indexes, including the
  post-war special justice name list, open on its site.
- **Oorlogsbronnen.nl (Netherlands):** public database on persons and places in the war
  years, with source references.
- **Digitalarkivet (Norway):** free census and church book transcriptions and scans.
- **FreeBMD, FreeCEN (England and Wales):** free volunteer-made indexes of civil registration and
  census. Read public search results manually; they offer no general API.
- **irishgenealogy.ie and the National Archives of Ireland census site (Ireland):** free civil
  records and the 1901 and 1911 censuses.
- **Library and Archives Canada, Trove (Australia), Chronicling America (US Library of
  Congress):** free catalogues and newspapers; Trove and the Library of Congress publish APIs.
- **FamilySearch:** a free account unlocks indexed records and many scans, but access needs
  a login, and automated reading is limited by its terms. Do not log in as the user. Ask the
  user to run searches there and paste or export what they find, then cite it as supplied
  by the user.

## Tier 2: newspapers, books and print

- **Delpher (National Library of the Netherlands):** free full text of Dutch newspapers,
  books and magazines. Search by name and period; birth, marriage and death notices,
  anniversary notices and obituaries often give relationships. OCR is imperfect: read the
  scan when the OCR text is garbled, and quote the OCR text as OCR.
- **Internet Archive, HathiTrust, Google Books (public-domain items), Wikisource:** old family
  histories, local histories, directories and registers, with full text search.
- **Regional history and heritage sites,** local historical societies and parish pages. Check who
  wrote the text and what they cite.

## Tier 3: trees and compiled work by other people

Always `unverified` until a record backs it up. Use them to learn what to search, not as a source.

- **WikiTree** (free, volunteer-built, with a public API), **Wikidata** (notable people, open
  SPARQL endpoint), **Genealogie Online** and similar user-contributed Dutch trees, the free
  parts of **Geneanet**, **Find a Grave** and **BillionGraves** grave listings.
- Cite as "tree by [author or username], read [date]". Never copy their conclusions.

## Not allowed

MyHeritage, Ancestry, Findmypast, Archion and every other subscription service: no login,
no scraping, no shared accounts, no cached copies. If the user holds a subscription and
exports their own findings, treat the export like a user-supplied note.

## Choosing sources by period (Netherlands as an example)

| Period | Best records | Then |
|---|---|---|
| After 1811 | Civil registration (births, marriages, deaths) | Population registers, newspapers |
| 1700 to 1811 | Baptism, marriage and burial books | Notarial records, militia rolls |
| Before 1700 | Baptism, marriage and burial books where they survive | Court and property records, local histories |

Coverage differs by region and church. Dutch civil registration starts in 1811 for most of
the country, with gaps in some provinces. For other countries, find the equivalent start
dates before you search, and write them in the log.
