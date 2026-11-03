# Output format: `findings.json`

One file per research run, in `research/YYYY-MM-DD-slug/`. Plain JSON, UTF-8. The OpenRoots
app and the merge tools read this shape. `scripts/validate-findings.mjs` checks it.

```json
{
  "schema": "openroots.findings/1",
  "question": "Who were the parents of Anna Voorbeeld, born about 1851 in Voorbeeldstad?",
  "created": "2026-11-03",
  "researcher": "agent or person that did the work",
  "subjects": [
    { "id": "p:5", "ahnentafel": 5, "label": "Anna Voorbeeld", "deceased": true },
    { "id": "tmp:1", "ahnentafel": null, "label": "Possible father of Anna", "deceased": true }
  ],
  "claims": [
    {
      "id": "c1",
      "subject": "p:5",
      "field": "birth.date",
      "value": "1851-03-14",
      "confidence": "confirmed",
      "evidence_type": "direct",
      "sources": ["s1"],
      "reasoning": "The birth record gives the date and names both parents.",
      "public": true
    }
  ],
  "sources": [
    {
      "id": "s1",
      "citation": "Example Archive, civil registration births, Voorbeeldstad, record 123, 1851",
      "url": "https://example.org/records/123",
      "retrieved": "2026-11-03",
      "repository": "Example Archive",
      "excerpt": "Short verbatim excerpt of the record, a sentence or two.",
      "source_type": "original",
      "information_type": "primary",
      "supplied_by_user": false
    }
  ],
  "conflicts": [
    { "claims": ["c1", "c2"], "summary": "Two sources give different birth years.", "resolution": "Adopted c1: original record beats the later death index." }
  ],
  "negative_searches": [
    {
      "source": "Example Archive church books",
      "query": "Voorbeeld 1849-1853",
      "variants": ["Voorbeeld", "Voorbeelt"],
      "period": "1849-1853",
      "expected_because": "Church baptisms were recorded for the parish in these years.",
      "date": "2026-11-03"
    }
  ],
  "leads": [
    { "site": "Name of a paywalled or unreadable site", "note": "What it claims to hold", "url": "https://example.org/lead" }
  ]
}
```

## Fields

**subjects**: people the claims are about. `id` is `p:<ahnentafel number>` for people already in the
chart, or `tmp:<n>` for candidates not yet placed. `deceased` is `true`, `false` or `"unknown"`.
Treat `"unknown"` as living for privacy checks.

**claims.field**, one of:
`name`, `sex`, `birth.date`, `birth.place`, `baptism.date`, `baptism.place`,
`marriage.date`, `marriage.place`, `death.date`, `death.place`, `burial.date`, `burial.place`,
`parent.father`, `parent.mother`, `spouse`, `child`, `occupation`, `residence`, `note`.
For `parent.*`, `spouse` and `child`, `value` is another subject's `id`.
Dates are ISO (`1851-03-14`, `1851-03`, `1851`) or `about 1851`, `before 1851`, `after 1851`,
`between 1850 and 1852`.

**confidence**: `confirmed`, `probable`, `possible`, `unverified`. See `evidence.md`.

**evidence_type**: `direct`, `indirect`, `negative`.

**public**: `false` keeps the claim out of anything published. Use it for presumed-living people
and for private notes. Default is `true`.

**sources.source_type**: `original`, `derivative`, `authored`.
**sources.information_type**: `primary`, `secondary`, `undetermined`.
**sources.excerpt**: a short verbatim quote. Keep it under 600 characters. Quote OCR as OCR.
**sources.supplied_by_user**: `true` when the user pasted or exported the record from a service
you may not read yourself. Then `url` may be omitted, and `citation` must say where it came from.

## Merge rules (for the merger role)

- A new claim never overwrites a confirmed claim. It creates a conflict entry.
- Two claims for the same subject and field with equal values merge, with the union of sources.
- Confidence of a merged claim is the maximum justified by its sources under `evidence.md`.
  Never raise it because the same fact appears twice.
- `tmp:` subjects get an Ahnentafel number only when the link to a numbered person is
  `confirmed` or `probable`.
