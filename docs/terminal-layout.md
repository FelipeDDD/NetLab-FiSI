# Terminal panel distribution

`terminalPanels.ts` defines the visual limits: five columns and a 220px minimum
width. In Free panels, opening another session adds a normal tab to the last
column when all five columns exist. Group by type retains each session in its
device group's tabs. Sessions, buffers, commands and input remain owned by the
existing terminal registry. The existing tabs, navigation shortcuts and move
menus provide access to additional sessions. A tab can be split again once a
column is available; no path creates a sixth column.

Changing the number of columns (open, close, split, merge or device deletion)
equalizes only unlocked weights. Adding/closing/switching a tab within an
existing column does not redistribute it. Normal manual resizing remains in
effect until the next structural change or explicit distribution request.
**Terminal Settings > Layout > Gleichmäßig verteilen** calls the same helper.
It is disabled when fewer than two columns are unlocked.

The existing locks are per panel and protect fixed pixel widths against
automatic changes. Manual divider movement, including a divider beside a locked
panel, still intentionally updates that width. Equalization leaves all locked
widths intact and shares the remaining space between unlocked columns. If the
minimum widths or the locks exceed the available area, only the terminal region
scrolls horizontally. All-locked layouts may leave unused space; the dock height
is independent of this distribution.

Widths and locks continue to use the existing local preference system and are
remembered independently for Free panels and Group by type. Legacy tab layouts
with more than five columns keep their first five slots; remaining tabs fold
into the fifth slot without being discarded. Opening a topology still does not
automatically reopen terminal sessions, matching the existing behavior.

`TerminalDock` memoizes width allocation. It does not continuously rewrite
weights. The existing `ResizeObserver` / animation-frame coalescing and FitAddon
refit visible xterm hosts after their size changes. Hidden tabs refit when shown;
sessions are not recreated by distribution or tab changes. Console appearance,
network configuration and topology history are unchanged.

## Inspector / terminal stacking

The normal right-hand Inspector can extend over the terminal dock. Its top,
width and position stay in the existing layout; its scroll box uses the full
space below the header while the dock is expanded. The canvas keeps its grid
row and reserved Inspector width. The dock keeps the user-selected height,
columns and sessions. Switching the front panel changes only stacking order,
never panel dimensions or React Flow's viewport.

`App` owns a transient `panelPriority` value, initially `terminal`. Pointer
interaction or a real focus event inside either panel brings it
forward. Scrolling and hovering never change priority. Wheel events keep their
normal behavior even over the visible portion of a covered panel. The handlers
neither call `focus()` nor prevent the input event. `TerminalDock` reports its existing expanded height through
`onOverlapHeightChange`; the CSS variable `--terminal-overlap-height` extends
only the Inspector's shell. Closing/collapsing terminals reports zero. Nothing
is stored in the topology, workspace session or local preferences for priority.

The dock uses z-index 40; the Inspector uses 39 or 41. Its parent `.main` stays
outside a new stacking context. The dock's existing `display: contents` tab
movement wrapper stays intact, and CSS targets the actual dock through it.
No backdrop, transparent hit layer, portal, reparenting or draggable window is
introduced. Forms, Inspector scroll, xterm buffers and terminal selection stay
in their existing mounted components.

When the dock is in front, click the visible upper part of the Inspector.
When the Inspector is in front, the dock's upper resizing strip remains
reachable to its left, even with five horizontally scrolled columns. Clicking
that strip brings the dock forward; clicking a terminal then focuses typing.
Keyboard focus also raises the corresponding panel without moving focus away
from the chosen input or control. Normal controls still resize or collapse
the dock when explicitly used.

The same overlay works at 1440 and 700 px in both themes. Packet analysis keeps
its existing columns/rows/stack layout and scrolling as a simple fallback;
Inspector extension is disabled while Packets is open. Browser or user resizing
may change available geometry, but no focus transition invokes Fit View or
rewrites x/y/zoom. `WorkspaceViewport` is unchanged.

Real-browser validation is available through `node scripts/test-panel-stacking.mjs`.
The existing runner creates a disposable profile and database, injects the
test-only React Flow probe and mounts the production controller. Captures and
before/after viewport evidence are written to
`.playwright-mcp/reviews/raw/panel-stacking/`.

Validated on 2026-10-27 with Node 24: **395 targeted tests in eight files** and
**121 Chromium checks**, including 18 stacking scenarios, passed. The browser
recorded **225 exact before/after viewport comparisons**, using 160, 310 and
590 px dock heights, one/two/five columns and extra tabs, both themes and
700/1440 px. Router/Firewall scrolling, native Tab/Shift+Tab, xterm editing and
native copy, collapse/expand, Packets fallback, plan switching and F5 passed.
TypeScript, production build and `git diff --check` passed; the existing large
chunk warning remains. No dependency, user-browser data or persisted priority
was introduced. Eight PNGs show the two stacking orders across themes/widths.

Follow-up: wheel-triggered priority was removed with a single handler deletion.
Twenty-five relevant tests, TypeScript and `git diff --check` passed, along with
121 Chromium checks. Native wheel scrolling was verified in both the partially
covered Inspector and terminal, without changing priority or viewport; click
and keyboard focus retained their behavior. Labs was unchanged.
