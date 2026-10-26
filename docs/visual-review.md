# Visual Review — PNGs ready to share

Open **`.playwright-mcp/reviews/`** to select images for ChatGPT. Its top level
contains only the current curated PNGs plus the two organization directories:

```text
reviews/
  01-graphite-elevated-1440.png
  02-graphite-accent-1440.png
  contact-sheet.png                  # optional
  archive/
    2026-10-25--graphite-interface-cards/
      01-...png                     # previous share selection
      review/                       # previous complete gallery/raw captures
      publication.json
  raw/
    current.json                    # generated publication metadata
    2026-10-25--current-subject/
      captures/                     # additional and intermediate captures
      index.html                    # optional full offline gallery
      review.json
      contact-sheet.html
      capture-contact-sheet.js
```

Everything under `.playwright-mcp/` is already ignored by Git. Application
code, tests, topology and dependencies are independent of this workflow.

## Normal workflow

1. Capture into `reviews/raw/<subject>-staging/` (or an existing ignored local
   capture directory). Preserve matching topology, positions, zoom and framing.
   Use names such as `interfaces--elevated--selected--1440x900.png`.
2. Describe the captures in a manifest using
   `scripts/visual-review-examples/graphite-interface-cards.json` as a template.
   Sources are project-relative PNG paths; include scene, variant, state and
   actual image width/height.
3. Run the existing generator:

```powershell
node scripts/visual-review.mjs scripts/visual-review-examples/graphite-interface-cards.json
```

Each run creates a fresh dated folder in `raw/`, archives the previous share
selection and its complete raw review under `archive/<date>--<subject>/`, then
publishes only the new selection in the root. Reusing a subject adds a numeric
folder suffix; previous iterations are never overwritten. Dates use Europe/Berlin.
Sources are copied, never deleted. PNG assets and share selections are
deduplicated by SHA-256; raw galleries retain every comparison entry.

The manifest's optional `share` array selects the root images:

```json
"share": [
  { "scene": "interfaces", "variant": "elevated", "state": "selected",
    "width": 1440, "height": 900, "name": "graphite-elevated-1440" },
  { "scene": "interfaces", "variant": "accent", "state": "selected",
    "width": 1440, "height": 900, "name": "graphite-accent-1440" }
]
```

Names are automatically numbered `01-`, `02-`, etc. Without `share`, the
generator selects one highest-resolution selected view per variant (or the
highest-resolution available view). Avoid publishing every intermediate state.

## Optional contact sheet

Only render one when a grouped comparison helps. Reuse the Playwright tool with
the `capture-contact-sheet.js` path printed by the generator as its `filename`.
The generated function needs no local Playwright dependency or Node imports.
After rendering, publish it alongside the current selection:

```powershell
node scripts/visual-review.mjs --publish .playwright-mcp/reviews/raw/<dated-review-folder>
```

Republishing the same review adds the optional sheet without archiving its own
images. Set `shareContactSheet: false` to keep the sheet only in raw. Existing
PNGs are never overwritten with different content. `--publish` also migrates a
legacy `reviews/<subject>/` directory into `raw/`, preserving its gallery/PNGs.

The existing `contactSheet` crop/layout configuration, offline gallery filters,
A/B views, enlargement and keyboard navigation remain available in raw.
Moving a review into archive preserves its relative gallery links. The capture
helper has local absolute paths and is intended only for its active raw folder.

## Completion report

Report **only the folder to open, the number of PNGs ready to share, and a short
implementation summary**. Count the optional contact sheet if it is in the
root. Do not make the user search the raw gallery to locate the share files.
Verify root contents, archive preservation and `git check-ignore`; no app build
or application test changes are needed for this workflow.
