# Contributing

Thank you for helping. OpenRoots is small and plain on purpose: one build script, no framework,
no dependencies at runtime.

## The one rule that matters

**Never put real personal data in an issue, a pull request, a test, a screenshot or a commit
message.** Use fictional people, as `examples/demo/` does. If you are not sure whether
something is personal, it is.

## Ways to help

- **Regional sources.** Improve `skills/ancestor-research/references/regions.md` for your country:
  which archives are free, how civil registration works, name customs, calendar changes. Say how
  you checked each site and when.
- **Maps.** A script makes the base map from Natural Earth. Help to add region boxes, labels and places for more countries. See `docs/map-data.md`.
- **Translations.** The interface text is English. A way to add other languages is planned; open an
  issue before you start so the work fits together.
- **Cleanups.** The code still has Dutch identifiers. A rename is welcome as its own pull request,
  with a note of the old and new names and a passing smoke test.
- **Accessibility.** Keyboard use, screen readers, contrast and touch targets all matter here.
  The chart never uses colour alone to carry meaning. Keep it that way.

## How to work on the code

```bash
node build.mjs --data examples/demo --out dist/demo.html
node tools/smoke.mjs dist/demo.html     # needs: npm install jsdom
```

- Sources live in `src/css/`, `src/js/` and `index.template.html`. `dist/` is generated.
- Keep interface text in English and follow `docs/glossary.md`.
- Keep changes small. One idea per pull request.
- The app must work with empty data and with the demo data. Run both.
- Hover effects belong behind `@media (hover: hover) and (pointer: fine)`.
- Motion must respect `prefers-reduced-motion`.

## Pull request checklist

- [ ] No personal data anywhere in the diff, including comments and file names
- [ ] `node build.mjs` works with `data/` (empty) and with `examples/demo`
- [ ] The smoke test passes on the demo build
- [ ] Interface text is English and uses the glossary words
- [ ] Documentation updated if a data field, token or setting changed
