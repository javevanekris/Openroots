# Configuration: `data/CFG.json`

Everything that names the owner or the project lives in one block, so the code has no
family-specific text. Every key is optional. Empty values fall back to the defaults below.

```json
{
  "title": "Ancestor chart",
  "owner": "",
  "confirmedByOwner": [],
  "version": "",
  "tagline": "",
  "contact": { "email": "", "text": "" },
  "lineLabels": {}
}
```

| Key | Type | Default | What it does |
|---|---|---|---|
| `title` | string | `"Ancestor chart"` | The title in the top bar, the sidebar and the browser tab. If `owner` is set the title reads `"<title> of <owner>"`. |
| `owner` | string | name of person No. 1 | Whose chart this is. Used in titles and in guide texts. |
| `confirmedByOwner` | array of numbers | `[]` | Ahnentafel numbers the owner confirms personally, for example the owner and their parents. These count as confirmed even without a record. |
| `version` | string | `""` | A free line under the title, for example `"Version 1 · May 2026"`. Hidden when empty. |
| `tagline` | string | `""` | A second free line, for example where the data was checked. Hidden when empty. |
| `contact.email` | string | `""` | Shown in the Contact view. When both `email` and `text` are empty the Contact view is hidden from the navigation. |
| `contact.text` | string | `""` | A short text for the Contact view, for example what help you are looking for. |
| `lineLabels` | object | `{}` | Optional labels for the four grandparent lines, keyed by `"4"`, `"5"`, `"6"`, `"7"`, for example `{"4": "Grandpa Edmund Example"}`. Missing labels are built from the names in `P`. |

The code reads this block as `kern.CFG`. It always exists, with defaults filled in.

## Empty chart

When `P` has no entries the app opens the Guide view, which explains how to fill in the data.
No view may fail on empty data. Each view shows a short empty state instead.
