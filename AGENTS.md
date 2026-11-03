# Instructions for AI agents

This repository is a template for a family ancestor chart. It holds **no real data**. If you are
asked to work on a family chart, you will usually work on a copy that lives outside this repository
or in a folder that git ignores.

## Hard rules

1. **Never commit personal data.** No names, dates, places, photos or notes about real people in
   this repository, in issues, in pull requests, in test data or in commit messages. The demo data
   in `examples/demo/` is fictional and must stay fictional.
2. **Never include living people** in anything that is published. Treat anyone born in the last 100
   years without a death record as living.
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
