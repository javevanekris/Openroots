# OpenRoots

A free, open-source ancestor chart (Ahnentafel) you can host anywhere, with an agent workflow
for researching your ancestors in free and open archives. No account, no subscription, no paywall.

OpenRoots is two things:

1. **A chart app.** One self-contained HTML file with a tree, a register, an overview, a map,
   a progress page and a person card for every ancestor. It shows how certain each fact is,
   in shapes and words rather than colour alone. It works on phones, tablets and laptops,
   in light and dark mode, and offline once opened.
2. **An agent skill, `ancestor-research`.** Instructions and tools that let an AI agent search
   free archives, cite what it finds, grade the evidence, and hand back results you can check.

This repository is a **template**. It contains no family data. You bring your own.

## What it replaces, and what it does not

OpenRoots is meant as a free alternative to the part of MyHeritage and Ancestry that people use
most: keeping a chart, seeing how sure each fact is, and finding records. It does this with free and
open sources, such as national and regional archives, open indexes, newspaper archives and
public-domain books.

It does **not** include their private collections, DNA matches or automatic record matching. It
never logs in to a paid service, never scrapes one and never works around a paywall. If the
best record is behind a paywall, the agent notes it as a lead and you decide what to do.

## Quick start

You need [Node.js](https://nodejs.org) 18 or later. There is nothing to install.

```bash
# Look at the fictional demo chart
node build.mjs --data examples/demo --out dist/demo.html
# then open dist/demo.html in your browser

# Start your own chart
cp -r data my-data            # my-data/ is ignored by git
# fill in my-data/*.json, see docs/data-format.md
node build.mjs --data my-data # writes dist/index.html
```

The default `data/` folder holds empty files. When you open a chart with no people, the app
shows its Guide with the steps to add your own.

Keep your own data **out of any public repository**. `my-data/` and `dist/` are listed in
`.gitignore` for that reason. Read [docs/privacy.md](docs/privacy.md) before you publish anything.

## Make it a Claude artifact

The built chart is one HTML file that needs nothing else, so it also works as a
[Claude](https://claude.ai) artifact: a page that Claude hosts for you and that stays private until
you share it.

1. Build your chart with your own data, as above. That gives you `dist/index.html`.
2. Open Claude Code, or the Code tab of the Claude desktop app, in this folder.
3. Ask: "Publish dist/index.html as an artifact." Claude uploads the file as it is and gives you
   a link to the page.
4. To update the chart later, change your data, build again and ask Claude to update the artifact.
   Give it the link, so the address stays the same.

Use Claude Code for this step. In a regular chat on claude.ai, Claude would have to write the whole
page out itself, and the app is usually too large for that.

Before you share the link, read [docs/privacy.md](docs/privacy.md). Anyone you share it with can
read every name, date and note in the chart.

## Documentation

| | |
|---|---|
| [docs/data-format.md](docs/data-format.md) | Every data file, field and token |
| [docs/config.md](docs/config.md) | Title, owner, contact and other settings |
| [docs/map-data.md](docs/map-data.md) | How the map works and what it needs |
| [docs/glossary.md](docs/glossary.md) | The words used in the interface |
| [docs/privacy.md](docs/privacy.md) | Living people, sensitive facts, and publishing safely |
| [skills/ancestor-research](skills/ancestor-research/README.md) | The agent skill |
| [AGENTS.md](AGENTS.md) | Start here if you are an AI agent |

## Using the agent skill

Copy `skills/ancestor-research/` into the skills folder of your agent. For Claude Code that is
`.claude/skills/` in your project. Then ask, for example: "Use the ancestor-research skill to find
the parents of person No. 5 in my chart." The agent writes a research log, a cited
`findings.json` and a one-page report, and checks them with the bundled validator.

The skill's helper script reads the free Open Archives API. That API holds mostly Dutch records, so
for other countries the skill points to the best free sources per country.

## Status and known limits

This is an early version. Parts of the code were first written in Dutch.

- The interface is English. Some internal names in the code, such as class names, routes and data
  tokens, are still Dutch. They work, and [docs/data-format.md](docs/data-format.md) lists them.
  Renaming them is a planned cleanup.
- The map and the historical context are built around the Netherlands. For other regions you supply
  your own map outline. See [docs/map-data.md](docs/map-data.md).
- The sample data is entirely fictional.

## Contributing

Bug reports, regional source lists, translations of the interface and cleanups of the Dutch
identifiers are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md). Never include real personal
data in an issue or a pull request.

## Licence

[MIT](LICENSE). Fonts (Atkinson Hyperlegible Next and Spectral) are loaded from Google Fonts under
the SIL Open Font Licence.
