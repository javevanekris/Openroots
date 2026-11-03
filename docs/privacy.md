# Privacy: before you share a chart

A family chart is personal data about real people, some of them alive. This template holds none.
Your own chart will. Decide what you share before you publish it, because a published page is
copied, cached and indexed, and cannot be taken back.

## Keep your data out of this repository

- Put your files in `my-data/`. It is listed in `.gitignore`.
- The built chart, `dist/index.html`, contains your data. It is ignored for the same reason.
- If you fork the repository, do not commit your data to your fork if it is public.
- Never paste real family data into an issue, a pull request or a chat with a tool you do not control.

## Living people

Your own chart may hold everyone, living relatives included, with everything you and your agents
found about them. That is fine in a file you keep yourself. Take care when you share it: whoever
has the file or the link can read all of it.

Before you share, check who is in it:

| Person | Before sharing |
|---|---|
| Died more than about 20 years ago, or born more than 100 years ago | Usually fine to share |
| Born in the last 100 years with no death record | Presume living. Share only with people you trust, or share a copy without them |
| A minor | Never publish details of a living minor |
| Yourself and your close family | Your choice, with their consent |

To share a chart without the living people, copy your data folder, remove them from the copy and
build that copy on its own.

## Sensitive facts

Crime, collaboration, political or religious membership, illness, adoption, paternity and abuse
need extra care, even for people who died long ago, because they affect living descendants.

- Include such a fact only if a document states it directly.
- Word it as what the document says ("the register records ..."), not as a verdict on the person.
- Keep what the record says apart from what it might suggest, and label both.

## Sharing options

- **A private file.** Send `dist/index.html` to family. It works offline. Anyone with the file has all the data in it.
- **A private link.** Host it where only invited people can read it.
- **A Claude artifact.** Claude Code can publish the built file as a page on claude.ai. It is private until you share the link. After that, everyone with the link can read all the data in it. See the README.
- **A public site.** Only with data you would be comfortable seeing in a search engine.

## Photos and documents

Photos and scans are in the data too. Publish only what you own or what is public domain or
openly licensed, and credit the source. Do not publish photos of living people without consent.

## When someone asks you to remove their data

Remove it from the working tree and rebuild at once. Git history keeps old copies until it is
rewritten, so tell them honestly how long a copy may remain.

## For AI agents

Agents working on your chart follow the same rules, written out in
`skills/ancestor-research/references/privacy.md`. They never log in to paid services and never
collect contact details of living people.
