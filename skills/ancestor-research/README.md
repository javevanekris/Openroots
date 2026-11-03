# ancestor-research

An agent skill for OpenRoots. It teaches an AI agent to research ancestors in free and open
archives, to grade the evidence honestly, and to hand back cited findings that a person can
check and a program can merge.

It does not replace the records that only paid services hold. It never logs in to, scrapes or
shares accounts of MyHeritage, Ancestry, Findmypast or similar services. What it does is send
agents to the free sources that exist, record every search (including the empty ones), and
refuse to write a claim without a source it actually opened.

## Install

Copy this folder into the skills folder of your agent. For Claude Code, that is
`.claude/skills/ancestor-research/` in your project, or `~/.claude/skills/` for every project.
Other agents can read `SKILL.md` as plain instructions.

## What is in it

| File | Purpose |
|---|---|
| `SKILL.md` | The workflow, ground rules and sub-agent roles |
| `references/sources.md` | Where to look, tiered by evidence quality |
| `references/regions.md` | Free sources by country, and how to add yours |
| `references/evidence.md` | How to label and weigh sources, identity tests, conflicts |
| `references/data-schema.md` | The `findings.json` format |
| `references/privacy.md` | Who may appear in public output |
| `scripts/openarch.mjs` | Client for the Open Archives API (Node 18 or later, no dependencies) |
| `scripts/validate-findings.mjs` | Checks a `findings.json` for evidence, sources and privacy |
| `templates/` | Research log and an example `findings.json` |

## Quick start

```bash
# Search the Open Archives (mostly Dutch records; works from any country, no key)
node scripts/openarch.mjs search "Jansen 1880-1885" --limit 5

# Read one record in full
node scripts/openarch.mjs show <archive_code> <identifier>   # both come from a search result

# Check a research result before merging it
node scripts/validate-findings.mjs research/2026-11-03-example/findings.json
```

Then tell your agent, for example: "Use the ancestor-research skill to find the parents of
the person with Ahnentafel number 5."

## Limits worth knowing

- The Open Archives hold about 99 percent Dutch records. For other countries use the lists in
  `references/regions.md`.
- The API accepts a `country_code` filter but ignores codes it does not hold, so a search can
  look filtered when it is not. The script warns about this.
- Event and role names in record details come back in the archive's own language.
