# Privacy: who can appear in output

Genealogy repositories are public, and search engines keep what they see. A mistake here
cannot be undone. When unsure, leave it out and ask.

## Who counts as living

A person is **presumed living** unless a death record or a reliable source shows otherwise,
or they were born more than 100 years ago. Presume living for anyone born within the last
100 years who has no recorded death. For someone born within the last 100 years with a
recorded death, treat anyone who could be a surviving spouse, child or sibling as living.

Presumed living people:
- do not appear in public output with a name, a date, a place or a relationship that could
  identify them;
- appear in the chart as "Living" with at most a generation marker, or as a private note
  that stays on the owner's machine;
- are never searched in sources that would require contacting or profiling them.

The owner of a private tree may keep their own data. Keep it in files listed in `.gitignore`.

## Special categories

For any person, living or dead, handle these with extra care:

- **Crime, collaboration, political or religious membership, medical conditions,
  adoption, paternity, sexuality, abuse:** include a claim only if a document states it
  directly, and word it as what the document says ("the register states ...") rather
  than as a verdict ("he was ..."). Separate what the record says from what it may
  suggest, in two clearly labelled sentences.
- **Descendants of the person:** a claim about a long-dead ancestor can still affect living
  descendants. Do not add commentary about inherited traits or character.
- **Minors:** never publish details of a living minor.
- **DNA results:** never in a public repository.

## Data you must not collect

- Contact details, home addresses, phone numbers or social media profiles of living people.
- Photos of living people.
- Anything from a login-protected service, a leaked database or a private message.

## Publishing checklist

Run before every commit to a public repository:

1. `node scripts/validate-findings.mjs` reports no privacy errors.
2. Search the diff for years in the last 100 years and check each hit.
3. No names of living relatives in comments, file names, commit messages, test data or screenshots.
4. Demo data is fictional. Real data lives only in files that `.gitignore` lists.
5. Every photo and scan is either public domain or has a licence you can cite.

## When someone asks for removal

Remove the data from the working tree at once, and tell the maintainer that history keeps a
copy until it is rewritten.
