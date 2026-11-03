# Privacy: living people and sharing

A family chart is personal data. The user's own chart may hold the whole family, living
relatives included, with everything you found about them. The care is in where that data goes.

## Living people in the chart

A person is **presumed living** unless a death record or a reliable source shows otherwise,
or they were born more than 100 years ago. For someone born within the last 100 years with a
recorded death, treat anyone who could be a surviving spouse, child or sibling as living.

- You may research presumed-living people in free and open sources and add what you find to
  the user's chart.
- Mark them: set `deceased` to `false`, or to `"unknown"` when you cannot tell.
- List them in the report under "Living people in this chart", so the user knows who is in it.
- Do not try to reach or profile them. Never look up phone numbers, e-mail addresses, social
  media profiles or current home addresses.

## Before a chart is shared

The chart is one file. Whoever has the file or the link can read all of it. Before the user
shares or publishes a chart:

- Tell them which presumed-living people are in it.
- Never publish details of a living minor.
- Photos of living people need their consent.
- If the chart goes beyond close family, suggest a copy of the data folder without the living
  people, built on its own.

## Special categories

For any person, living or dead, handle these with extra care:

- **Crime, collaboration, political or religious membership, medical conditions,
  adoption, paternity, sexuality, abuse:** include a claim only if a document states it
  directly, and word it as what the document says ("the register states ...") rather
  than as a verdict ("he was ..."). Separate what the record says from what it may
  suggest, in two clearly labelled sentences.
- **Descendants of the person:** a claim about a long-dead ancestor can still affect living
  descendants. Do not add commentary about inherited traits or character.
- **DNA results:** never in a public repository.

## Sources you must not use

Anything from a login-protected service, a leaked database or a private message.

## This template repository is public

Real people never go into this repository: not in data, comments, file names, commit
messages, test data or screenshots. A user's own chart lives in folders that `.gitignore`
lists. Before every commit here:

1. Run `node scripts/validate-findings.mjs` on any example file you changed.
2. Search the diff for real names and for years in the last 100 years, and check each hit.
3. Keep the demo data fictional.
4. Make sure every photo and scan is public domain or has a licence you can cite.

## When someone asks for removal

Remove the data from the working tree at once, and tell the maintainer that history keeps a
copy until it is rewritten.
