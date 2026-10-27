# Device and Inspector legibility

Device captions scale independently of sprites. The network model, viewport,
saved coordinates, artwork files, Handle positions and cable geometry are unchanged.

## Typography

| Element | Previous CSS size | Current CSS size |
| --- | --- | --- |
| Device name | 12.5 px | 14 px, weight 650 |
| Canvas IPv4 / DHCP / missing-address state | 12 px | 13 px |
| Canvas interface name | 10 px | 11 px |
| Inspector IPv4 inputs/selects | 13 px effective | 14 px |
| DHCP pool heading/range and service text | 12 px | 13 px |
| Inspector field labels | 13 px effective | 13 px |
| xterm default preference | 14 px | unchanged; user configurable |

Tokens are in `src/themes.css`: `--canvas-name-font-size`,
`--canvas-network-font-size`, `--canvas-interface-font-size`,
`--inspector-font-size` and `--inspector-input-font-size`. Targeted rules live in
`src/styles.css`; toolbar and terminal typography are not globally increased.

## Zoom and layout

`networkLabelScale()` in `src/canvasNetwork.ts` uses
`clamp(1, zoom ** -0.9, 1.85)`. `DeviceLabels.tsx` applies it to the entire
name/network caption so lines cannot collide with each other. At browser 100%:

| Flow zoom | Previous name / IPv4 size | Current name / IPv4 size |
| --- | --- | --- |
| 0.5 | 6.25 / 8.49 px | 12.95 / 12.03 px |
| 0.75 | 9.38 / 10.39 px | 13.60 / 12.63 px |
| 1 | 12.5 / 12 px | 14 / 13 px |
| 1.25 | 15.63 / 15 px | 17.5 / 16.25 px |

The browser's own zoom remains independent and multiplies physical text size.
There is no Fit View, setViewport or device repositioning in the caption code.
Compensation is intentionally capped: at extreme zoom-out it does not make
captions arbitrarily large.

`deviceLabelLayout()` restricts caption width using neighboring caption bands
and actual measured node sizes. Short bridge names reserve less space than
multi-address captions. Tight groups can ellipsize text; full names/network
information remain available through existing title tooltips and accessible
copy-IP buttons. It does not reposition nodes or globally avoid cable crossings.

The invisible caption spacer retains the old 12.5 px font line metrics and 13 px
IP slot. This is deliberate layout compatibility: replacing it with a fixed
integer height shifted Handles fractionally at 125% browser zoom. New visual
text is absolutely positioned over that original footprint.

## Validation and reusable review

```powershell
node scripts/test-legibility.mjs before
# Apply a visual change, then compare against that local baseline:
node scripts/test-legibility.mjs after
node node_modules/vitest/vitest.mjs run src/canvasNetwork.test.ts src/workspace/viewport.test.ts
```

The runner reuses the existing native Chromium harness, disposable profile,
isolated IndexedDB and test-only viewport probe. `before` captures the current
baseline; run it before editing, not to regenerate historical screenshots.
Artifacts are ignored under `.playwright-mcp/reviews/raw/legibility-before/`
and `legibility-after/`. Publish selected images with the existing Visual Review
generator, which preserves earlier reviews in `archive/`.

The matrix covers small (9 nodes) and large (25 nodes, 20 PCs) networks, 700/1440
physical pixels, Graphite Dark/Classic Light, Flow 0.5/0.75/1/1.25, native browser
100/125/150% and Inspector open/closed. Additional cases cover IPv4/DHCP forms
and tightly spaced captions. It compares exact viewport, node positions,
sprite/hitbox rectangles and checks text collisions and external overflow.
The after comparison requires the locally recorded before measurements.
