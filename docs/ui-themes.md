# UI themes

`src/themes.css` owns appearance tokens. `:root` is the Original theme; each
`data-ui-theme` block overrides only the roles it changes. `src/styles.css`
continues to own component layout and consumes these tokens. The existing
`--bg`, `--text`, `--accent` and category variables are compatibility aliases.

To add a theme:

1. Register its stable ID, label and `group` (`dark` or `light`) in `UI_THEMES`
   in `src/uiTheme.ts`. Settings groups light themes together for discoverability.
2. Add a matching `:root[data-ui-theme="ID"]` block in `src/themes.css`.
   Set surfaces, text, borders, accent, statuses and native `color-scheme` as
   appropriate. Unspecified roles inherit Original. Keep normal text at least
   4.5:1 against panel, raised and card surfaces.
3. Run the theme/Settings tests and check menus, forms, tooltips, Inspector and
   disabled/focus states in Chromium. The Settings selector updates itself.

`uiTheme.ts` reads/writes only `netlab:ui-theme:v1`. Invalid/missing preferences
fall back to Original. The root attribute also themes portals. Theme changes
do not reload React Flow or alter topology/history.

Available themes: Original (default), Graphite Dark, Slate Gray, Deep Teal and
Classic Light. The retired `midnight-blue` preference safely resolves to
Original, just like any unknown theme ID. Slate Gray uses a slightly darker
steel-blue accent (`#2b6582`) so small accent text stays readable on gray cards,
hover surfaces and selected packet rows.

Canvas background/image intensity/dots/animation remain in `canvasBackground.ts`;
layout preferences remain in their existing modules. The `--canvas-*` palette
keeps artwork labels, category identity, handles and selected cables readable
on both dark canvas backgrounds. Canvas packet protocol colors, LEDs, Wi-Fi
coverage and background animation colors intentionally retain their semantics.

The terminal renderer and custom terminal appearance retain their dark console
palette. Its surrounding Settings and dock controls use the UI theme; dark tab
headers retain light text. PNGs are unchanged.

## Shared buttons

`src/buttons.css` is loaded after component styles and owns button appearance
and interaction states; `styles.css` continues to own existing sizes and layout.
`--button-*` tokens live in `themes.css`. Most derive from semantic UI colors;
Graphite Dark overrides surfaces/borders for a restrained steel-blue finish.
Adjust `--button-sheen`, `--button-edge-light`, `--button-shadow` and
`--button-accent-shadow` to tune depth without changing geometry. There are no
animated effects, transforms or additional elements.

Use `.btn` (or `.ui-button` for a new standalone control) with these modifiers:

| Variant | Usage |
| --- | --- |
| `.btn--secondary` | Default surface; the modifier is optional |
| `.btn--primary` | Important action, currently simulation Run/Pause |
| `.btn--ghost` | Quiet action until hover/focus |
| `.btn--danger` | Destructive action; existing `.btn.danger` is an alias |
| `.btn--small` | Compact action |
| `.btn--icon` | 28px icon button; supply `aria-label` |
| `.btn--toolbar` | Single-line toolbar control; combine with any variant |

Existing `.mini-btn`, toolbar triggers, speed selector and terminal dock
controls reuse the system. Menu rows stay flat, with a subtle active edge.
Native `disabled`, `aria-pressed`, `aria-expanded`, `aria-selected` and
`:focus-visible` drive states. Prefer native `disabled`; `aria-disabled` alone
still requires the caller to prevent activation. Focus is inset so scrollable
panels do not clip it. Terminal tabs retain their per-device color indicator and
console logic. Device nodes, cables,
service toggles and simulation status colors are deliberately outside this system.

### Graphite illuminated finish

Graphite alone opts into the additional rules at the end of `buttons.css`:

- `--ui-edge-light`, `--ui-edge-wash` and `--ui-lit-edge-image` control the
  stationary 2px lower edge and its soft 20px radial wash. Selected tabs, open
  controls and primary actions receive this light; catalog cards show it only
  on hover/focus. Disabled controls and destructive buttons stay unlit.
- `--button-image` / `--button-highlight-image` are background layer lists
  (including positioning/sizing), used by the shared background shorthand.
  `--ui-catalog-*` controls card depth and `--ui-header-*` the metallic header.
- `--ui-terminal-*` controls only the header, tabs and close-button surfaces.
  Graphite reuses `--terminal-tab-color`, supplied by `terminalColor(kind,
  custom)` in `TerminalPanelView`. Active borders, lower light and focus use
  this device color; inactive tabs keep a neutral surface and the exact color
  on their dot. No additional color preference is introduced.

  Relative OKLCH color bounds the chrome light to `.70–.84` lightness and `.18`
  maximum chroma, retaining hue and readable neutral labels for black, white
  and saturated custom colors. `color-mix` provides a fallback. The
  `--ui-terminal-*-strength` tokens limit tint/wash; console tints still use
  `terminalBackground`/`terminalTint` and are unaffected.

The effects are CSS background layers and inset shadows, inside existing boxes.
They do not create hit targets, change dimensions or animate. Tab dragging/drop
markers remain intact. `.term-host`, xterm, terminal appearance preferences and
session code are untouched. To change the finish, adjust the Graphite tokens;
Original and Classic Light do not opt into these rules.

### Interface card comparison (temporary)

**B — Graphite Accent is the current base.** Open the app with
`?interfaceCards=elevated` to compare A, or `?interfaceCards=accent` for B.
Both remain available. The parameter sets only
`data-interface-cards` on the root, with no saved preference or Settings entry.

Both variants use `--ui-interface-*` surface, inset-border and shadow tokens.
B adds `--ui-interface-accent-image` only for `data-link-selected="true"`.
This attribute reflects existing canvas edge selection, independently of
hover; hovering a card never produces selected-state light. Cards with no link
cannot be selected as a link. Existing UP/DOWN status stripes/text and device
category colors remain separate. No new card click action is introduced.
The interface-only wash is limited to 9px with a faster fade and a 1px light
edge. Selected surfaces receive a 6% tint from the existing neighbor-category
color (`--interface-identity`); status stripes retain their UP/DOWN colors.

For immediate comparison on the same loaded topology, the root attribute can
also be changed between `elevated` and `accent` in Chromium DevTools. Neither
choice changes node positions, sessions, history or interface configuration.
Comparison screenshots use `graphite-cards-{elevated|accent}-{normal|hover|selected}-{700|1440}.png`
in the archived review. New visual output follows `docs/visual-review.md`.

### Shared readability

`--font-ui` prefers locally available Inter, then system UI / Segoe UI; no
webfont is downloaded. `--ui-font-size` (13px) and the targeted UI selectors in
`styles.css` increase control/label readability while technical/xterm fonts stay
independent. `--ui-placeholder` plus italic/normal weight distinguishes empty
inputs, especially in Slate Gray, from values with medium weight. Layout uses
`--catalog-width` to align the desktop brand with the existing catalog.

Canvas addresses stay plain IPv4. `canvasNetwork.ts` also provides the configured
interfaces for stacked labels, preferring the operational/main address and
marking stored entries. Interface names and small bars identify the rows;
tooltips retain prefixes and link state, and each address keeps its copy action.
The stack is positioned below the node without enlarging its connection box.
