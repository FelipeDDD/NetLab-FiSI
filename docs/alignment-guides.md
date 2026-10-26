# Smart alignment guides

`src/alignmentGuides.ts` implements optical horizontal alignment and geometric
center alignment on the vertical axis, using React Flow's measured node
dimensions. The threshold is `ALIGNMENT_TOLERANCE_PX` (8 screen
pixels), divided by the current zoom. Edges, backgrounds and grids do not
participate. Each axis chooses one stationary target; the current target stays
locked only while it remains inside the same tolerance. Guides span the two
alignment points rather than the viewport.

`getVisualAlignmentPoint` supplies the horizontal guide/snapping Y. Router,
Firewall, AP, Notebook and Smartphone reuse `cableAttachmentBox`'s established
chassis anchors. PC and Server use artwork-relative optical bands (75% and
66.5% of artwork height, plus the existing 6px top inset), matching their current
side cable entries without depending on label height. These two presets are
centralized in `OPTICAL_ARTWORK_Y`. Vertical guides still join geometric centers.
Switch keeps its previous center-based alignment; link-specific RJ45 slots,
front approaches and LEDs are untouched. Nodes without artwork/type information
fall back to measured centers. No cable geometry or network state is changed.

`src/components/useSmartAlignment.ts` starts a temporary session from node or
selection drag events. It corrects position changes before the existing store
receives them, including the final `dragging: false` change. Consequently the
existing movement history and autosave record the snapped position. A selection
receives one common translation, preserving all relative positions. Holding Alt
bypasses snapping and hides guides. Release, Escape, pointer cancellation and
window blur clear the temporary guides. New-device drops and keyboard movement
continue through their existing paths without alignment.

`AlignmentGuides.tsx` renders at most two non-interactive SVG lines in a
`ViewportPortal`. Styling is in `styles.css`; each theme supplies the semantic
`--ui-alignment-guide` token in `themes.css`. Line width and dash lengths remain
constant on screen through `vector-effect: non-scaling-stroke`.

The **Ausrichtungshilfen** checkbox is in the existing Settings content.
`src/alignmentPreferences.ts` persists an independent boolean under
`netlab:alignment-guides:v1`. Missing or invalid preferences default to enabled.
Topology exports and network state are unaffected.

Only flat, top-left-origin nodes with known dimensions participate, matching the
current canvas. Nested/group-origin nodes would need coordinate normalization
before extending this helper. Matching scans the moving and stationary anchors;
no per-node subscriptions, timers or spatial-index dependency are introduced.

Conceptual reference: [React Flow helper lines](https://reactflow.dev/examples/interaction/helper-lines).
The optical geometry and integration here are implemented locally.

Run the focused checks with:

```sh
node node_modules/vitest/vitest.mjs run src/alignmentGuides.test.ts src/alignmentPreferences.test.ts src/inspectorLayout.test.ts src/topologyEdits.test.ts src/topologyHistory.test.ts src/topologyShortcuts.test.ts src/cableEditing.test.ts src/cableInteraction.test.ts
node node_modules/typescript/bin/tsc --noEmit
git diff --check
```
