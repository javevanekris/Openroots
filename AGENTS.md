# Instructions for AI agents

This repository is a template for a family ancestor chart. It holds **no real data**. If you are
asked to work on a family chart, you will usually work on a copy that lives outside this repository
or in a folder that git ignores.

## Why this project exists

OpenRoots was made as a replacement for MyHeritage: a family tree that you own and keep, with no
subscription and no paywall. Keep that goal in mind in everything you build or research here.

- Anything a person needs to build, read and share a chart must work without an account and
  without payment.
- Where MyHeritage would show a paid record, look for the free route to the same information. If
  there is none, say so plainly and record the gap as a lead.
- OpenRoots is an independent project. It is not affiliated with or endorsed by MyHeritage.

## Hard rules

1. **Never commit personal data.** No names, dates, places, photos or notes about real people in
   this repository, in issues, in pull requests, in test data or in commit messages. The demo data
   in `examples/demo/` is fictional and must stay fictional.
2. **Living people are allowed in a user's own chart**, including what you found about them.
   Before the chart is shared or published, tell the user which presumed-living people are in it.
   Treat anyone born in the last 100 years without a death record as living.
3. **Free and open sources only.** Never log in to MyHeritage, Ancestry or any paid service, never
   use someone else's account, never scrape behind a paywall, never solve a CAPTCHA, never ignore
   robots.txt. A paywalled record is a lead, nothing more.
4. **No claim without a source you opened.** Cite it, quote a short excerpt, grade the evidence.
   Never fill a gap from memory or from a guess.

## What to read

- Researching ancestors: `skills/ancestor-research/SKILL.md`, then its `references/`.
- Changing the app: `README.md`, `docs/data-format.md`, `docs/glossary.md`, `CONTRIBUTING.md`.
- Filling a chart: `docs/data-format.md` and `docs/config.md`.

## Working on the app

- Sources are in `src/css/`, `src/js/` and `index.template.html`. The build is `node build.mjs`.
  Never edit `dist/`; it is generated.
- Run the checks before you finish: `node tools/smoke.mjs dist/demo.html` after building the demo.
- Interface text is English and follows `docs/glossary.md`. Identifiers are still Dutch for now.
  Do not rename them in a feature change. If you rename them, do it in a pull request of its own.

## Publishing a chart as a Claude artifact

Users can also keep their chart as a Claude artifact. If a user asks for that:

- Build `dist/index.html` from their data folder with `node build.mjs --data <folder>` and publish
  that file as it is. Do not retype or paste the page; it is too large and would change.
- Publish only when the user asks. An artifact starts private. Never share it or make it public
  on your own.
- Go through `docs/privacy.md` with the user first, and tell them which presumed-living people
  are in the chart. Anyone with the link can read all of it.
- To update the chart, rebuild and publish to the same artifact link, so the address stays the same.
